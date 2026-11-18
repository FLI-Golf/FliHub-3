<script lang="ts">
	import { tick } from 'svelte';
	import {
		CircleAlert,
		Pencil,
		Plus,
		CalendarDays,
		Archive,
		ArchiveRestore,
		MapPin,
		Layers,
		SlidersHorizontal,
		Clock,
		CheckCircle2,
		CirclePlay,
		Settings2
	} from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	interface FliEvent {
		venueName?: string;
		venueAddress?: string;
		id: string;
		season: string | null;
		seasonName: string | null;
		name: string;
		startsAt: string | null;
		endsAt: string | null;
		status: 'planned' | 'active' | 'completed' | 'archived';
	}
	interface SeasonOption {
		id: string;
		name: string;
		startsOn?: string | null;
		endsOn?: string | null;
	}

	interface Props {
		events: FliEvent[];
		seasons: SeasonOption[];
		canManage: boolean;
		myRole: string;
		/** SvelteKit ActionData from the page's form actions (shape varies by action). */
		form: unknown;
	}

	let { events, seasons, canManage, myRole, form }: Props = $props();

	let editing = $state<FliEvent | null>(null);
	let newSeasonId = $state('');
	let newMultiDay = $state(false);
	let editMultiDay = $state(false);
	const newSeason = $derived(seasons.find((s) => s.id === newSeasonId));
	const editSeason = $derived(seasons.find((s) => s.id === editing?.season));

	function seasonMinimum(option: SeasonOption | undefined) {
		return option?.startsOn ? option.startsOn.slice(0, 10) + 'T00:00' : undefined;
	}
	function seasonMaximum(option: SeasonOption | undefined) {
		return option?.endsOn ? option.endsOn.slice(0, 10) + 'T23:59' : undefined;
	}
	function seasonDateHelp(option: SeasonOption | undefined) {
		if (!option) return 'Choose a date and time for this independent event.';
		return `Allowed dates: ${option.startsOn?.slice(0, 10) || 'no start limit'} to ${option.endsOn?.slice(0, 10) || 'no end limit'}.`;
	}

	const formRecord = $derived(
		form && typeof form === 'object' ? (form as Record<string, unknown>) : null
	);
	const message = $derived(
		formRecord && !('guidedEventSetup' in formRecord) && 'message' in formRecord
			? String(formRecord.message)
			: null
	);

	const statusStyle: Record<FliEvent['status'], string> = {
		planned: 'border-blue-300 bg-blue-50 text-blue-950',
		active: 'border-amber-300 bg-amber-50 text-amber-950',
		completed: 'border-emerald-300 bg-emerald-50 text-emerald-950',
		archived: 'border-slate-300 bg-slate-100 text-slate-700'
	};
	async function manageEvent(id: string) {
		const selector = document.getElementById('ops-event');
		if (!(selector instanceof HTMLSelectElement)) return;
		selector.value = id;
		selector.dispatchEvent(new Event('change', { bubbles: true }));
		await tick();
		const schedule = document.querySelector('#event-tee-times details');
		if (schedule instanceof HTMLDetailsElement) schedule.open = true;
		selector.scrollIntoView({ block: 'start', behavior: 'smooth' });
		selector.focus({ preventScroll: true });
	}

	/** PB dates ('YYYY-MM-DD HH:mm:ss.SSSZ') -> datetime-local input value. */
	function toInput(iso: string | null): string {
		return iso ? iso.replace(' ', 'T').slice(0, 16) : '';
	}
	function usesPlanningDates(item: FliEvent): boolean {
		const start = toInput(item.startsAt),
			end = toInput(item.endsAt);
		return start.endsWith('T00:00') && (!end || end.endsWith('T23:59') || end.endsWith('T00:00'));
	}
	function display(iso: string | null): string {
		return iso ? iso.slice(0, 16) : 'Not scheduled';
	}
</script>

<div class="flex flex-col gap-6">
	{#if message}
		<Alert.Root variant="destructive">
			<CircleAlert class="size-4" />
			<Alert.Title>Action failed</Alert.Title>
			<Alert.Description>{message}</Alert.Description>
		</Alert.Root>
	{/if}

	<Card.Root class="overflow-hidden border-2 border-slate-200 bg-slate-50 shadow-sm">
		<Card.Header class="border-b border-slate-200 bg-slate-100">
			<Card.Title class="flex items-center gap-2">
				<CalendarDays class="size-5" />
				Events
				<span
					class="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full border border-blue-300 bg-white px-2 text-sm font-bold text-blue-950"
				>
					{events.length}
				</span>
			</Card.Title>
			<Card.Description>
				An event belongs to one season or runs independently. Use the guided team-event setup above,
				or the existing planning and editing tools below.
			</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-4 pt-5 xl:grid-cols-2">
			{#if events.length === 0}
				<p class="text-sm text-muted-foreground">No events yet.</p>
			{/if}
			{#each events as event (event.id)}
				<div
					class="flex min-w-0 flex-col justify-between gap-4 rounded-xl border border-l-4 {event.status ===
					'archived'
						? 'border-slate-300 bg-slate-100'
						: 'border-slate-200 border-l-blue-500 bg-white'} p-5 text-slate-950 shadow-md"
				>
					<div class="flex flex-wrap items-center gap-3">
						<h3 class="w-full text-lg font-bold tracking-tight">{event.name}</h3>
						{#if event.seasonName}
							<Badge variant="outline" class="gap-1.5 border-slate-300 bg-slate-50 text-slate-700">
								<Layers class="size-3.5" aria-hidden="true" />{event.seasonName}
							</Badge>
						{:else}
							<Badge variant="secondary">
								<Layers class="mr-1 size-3.5" aria-hidden="true" />Independent
							</Badge>
						{/if}
						<Badge variant="outline" class="gap-1.5 capitalize {statusStyle[event.status]}">
							{#if event.status === 'completed'}<CheckCircle2
									class="size-3.5"
									aria-hidden="true"
								/>{:else if event.status === 'active'}<CirclePlay
									class="size-3.5"
									aria-hidden="true"
								/>{:else if event.status === 'archived'}<Archive
									class="size-3.5"
									aria-hidden="true"
								/>{:else}<CalendarDays class="size-3.5" aria-hidden="true" />{/if}
							{event.status}
						</Badge>
						{#if event.venueName || event.venueAddress}<div
								class="w-full rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm"
							>
								<span class="font-semibold">
									<MapPin class="mr-1 inline-block size-4" aria-hidden="true" />Venue: {event.venueName ||
										'Location'}
								</span>{#if event.venueAddress}<span class="mt-1 block whitespace-pre-wrap">
										{event.venueAddress}
									</span>{/if}
							</div>{/if}
						<div
							class="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
						>
							<CalendarDays
								class="mr-1 mb-1 inline-block size-4 text-blue-700"
								aria-hidden="true"
							/>
							{#if event.startsAt}
								{#if usesPlanningDates(event)}
									<span class="font-medium">
										Planning {event.endsAt ? 'dates' : 'date'}: {event.startsAt.slice(
											0,
											10
										)}{#if event.endsAt}
											→ {event.endsAt.slice(0, 10)}{/if} (UTC)
									</span>
									<p class="mt-1 text-xs">
										<Clock class="mr-1 inline-block size-3.5" aria-hidden="true" />Tee times are
										managed separately in the round schedules below.
									</p>
								{:else}
									<span>Starts {display(event.startsAt)} UTC</span>
									{#if event.endsAt}<span> · Ends {display(event.endsAt)} UTC</span>{/if}
								{/if}
							{:else}
								<span>Start date needed — use Edit to schedule this event.</span>
							{/if}
						</div>
					</div>
					<div class="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
						{#if event.status !== 'archived'}
							<Button
								type="button"
								class="min-h-11 bg-blue-700 text-white shadow-sm hover:bg-blue-800"
								onclick={() => manageEvent(event.id)}
							>
								<SlidersHorizontal class="mr-2 size-4" aria-hidden="true" />{canManage
									? 'Manage event'
									: 'View event'}
							</Button>
						{/if}
						{#if canManage}
							<div class="flex flex-wrap items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									onclick={() => {
										editing = { ...event };
										editMultiDay = Boolean(event.endsAt);
									}}
								>
									<Pencil class="mr-1 size-3.5" /> Edit
								</Button>
								{#if event.status === 'archived'}
									<form method="POST" action="?/unarchiveEvent">
										<input type="hidden" name="event" value={event.id} />
										<Button variant="outline" size="sm" type="submit">
											<ArchiveRestore class="mr-1 size-3.5" /> Restore
										</Button>
									</form>
								{:else}
									<form method="POST" action="?/archiveEvent">
										<input type="hidden" name="event" value={event.id} />
										<Button variant="outline" size="sm" type="submit">
											<Archive class="mr-1 size-3.5" /> Archive
										</Button>
									</form>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>

	{#if canManage}
		<details class="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4">
			<summary class="cursor-pointer font-medium">
				<Settings2 class="mr-2 inline-block size-4" aria-hidden="true" />Advanced event creation ·
				independent or date-time planning
			</summary>
			<p class="my-3 text-sm text-muted-foreground">
				For a new season-linked team event with rounds and groups, use the guided setup above. These
				existing controls create only the event record.
			</p>
			<Card.Root>
				<Card.Header>
					<Card.Title>Add an event</Card.Title>
					<Card.Description>
						Choose a season or leave it independent — either way the event stays inside this
						organization.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<form method="POST" action="?/createEvent" class="grid gap-3 sm:grid-cols-2">
						<div class="flex flex-col gap-1.5">
							<Label for="event-name">Event name</Label>
							<Input id="event-name" name="name" required maxlength={120} />
						</div>
						<div class="flex flex-col gap-1.5">
							<Label for="new-event-venueName">Venue name (optional)</Label><Input
								id="new-event-venueName"
								name="venueName"
								maxlength={120}
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<Label for="new-event-venueAddress">Venue address (optional)</Label><Input
								id="new-event-venueAddress"
								name="venueAddress"
								maxlength={500}
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<Label for="event-season">Season</Label>
							<select
								id="event-season"
								bind:value={newSeasonId}
								name="season"
								class="h-9 rounded-md border bg-background px-2 text-sm"
							>
								<option value="">Independent (no season)</option>
								{#each seasons as season (season.id)}
									<option value={season.id}>{season.name}</option>
								{/each}
							</select>
						</div>
						<div class="flex flex-col gap-1.5">
							<Label for="event-starts">Starts at (optional)</Label>
							<Input
								id="event-starts"
								name="startsAt"
								type="datetime-local"
								min={seasonMinimum(newSeason)}
								max={seasonMaximum(newSeason)}
								aria-describedby="event-date-help"
								required={newMultiDay}
							/>
							<p id="event-date-help" class="text-sm text-muted-foreground">
								{seasonDateHelp(newSeason)}
							</p>
						</div>

						<div class="flex flex-col gap-2">
							<label class="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									name="multiDay"
									value="yes"
									bind:checked={newMultiDay}
									aria-controls="event-end-fields"
									aria-expanded={newMultiDay}
								/>
								Multi-day event
							</label>
							{#if newMultiDay}
								<div id="event-end-fields" class="flex flex-col gap-1.5">
									<Label for="event-ends">Ends at</Label>
									<Input
										id="event-ends"
										name="endsAt"
										type="datetime-local"
										required
										min={seasonMinimum(newSeason)}
										max={seasonMaximum(newSeason)}
										aria-describedby="event-end-help"
									/>
									<p id="event-end-help" class="text-sm text-muted-foreground">
										Choose an end after the start. {seasonDateHelp(newSeason)}
									</p>
								</div>
							{/if}
						</div>

						<div class="flex items-end">
							<Button type="submit">
								<Plus class="mr-1 size-4" /> Add event
							</Button>
						</div>
					</form>
				</Card.Content>
			</Card.Root>
		</details>
	{:else}
		<p class="text-sm text-muted-foreground">
			Your role ({myRole}) can view events but not manage them.
		</p>
	{/if}
</div>

<Dialog.Root open={editing !== null} onOpenChange={(open) => !open && (editing = null)}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Edit event</Dialog.Title>
			<Dialog.Description>
				Move the event between a season and independent operation, or reschedule it.
			</Dialog.Description>
		</Dialog.Header>
		{#if editing}
			<form method="POST" action="?/updateEvent" class="flex flex-col gap-3">
				<input type="hidden" name="event" value={editing.id} />
				<div class="flex flex-col gap-1.5">
					<Label for="edit-event-name">Event name</Label>
					<Input id="edit-event-name" name="name" required maxlength={120} value={editing.name} />
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="edit-event-venueName">Venue name (optional)</Label><Input
						id="edit-event-venueName"
						name="venueName"
						maxlength={120}
						value={editing.venueName ?? ''}
					/>
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="edit-event-venueAddress">Venue address (optional)</Label><Input
						id="edit-event-venueAddress"
						name="venueAddress"
						maxlength={500}
						value={editing.venueAddress ?? ''}
					/>
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="edit-event-season">Season</Label>
					<select
						id="edit-event-season"
						bind:value={editing.season}
						name="season"
						class="h-9 rounded-md border bg-background px-2 text-sm"
					>
						<option value="">Independent (no season)</option>
						{#each seasons as season (season.id)}
							<option value={season.id}>
								{season.name}
							</option>
						{/each}
					</select>
				</div>
				<div class="grid gap-3 sm:grid-cols-2">
					<div class="flex flex-col gap-1.5">
						<Label for="edit-event-starts">Starts at</Label>
						<Input
							id="edit-event-starts"
							name="startsAt"
							type="datetime-local"
							value={toInput(editing.startsAt)}
							min={seasonMinimum(editSeason)}
							max={seasonMaximum(editSeason)}
							aria-describedby="edit-event-date-help"
							required={editMultiDay}
						/>
						<p id="edit-event-date-help" class="text-sm text-muted-foreground">
							{seasonDateHelp(editSeason)}
						</p>
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="edit-event-status">Status</Label>
						<select
							id="edit-event-status"
							name="status"
							class="h-9 rounded-md border bg-background px-2 text-sm"
						>
							{#each ['planned', 'active', 'completed'] as s (s)}
								<option value={s} selected={editing.status === s}>{s}</option>
							{/each}
						</select>
					</div>
				</div>

				<div class="flex flex-col gap-2">
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							name="multiDay"
							value="yes"
							bind:checked={editMultiDay}
							aria-controls="edit-event-end-fields"
							aria-expanded={editMultiDay}
						/>
						Multi-day event
					</label>
					{#if editMultiDay}
						<div id="edit-event-end-fields" class="flex flex-col gap-1.5">
							<Label for="edit-event-ends">Ends at</Label>
							<Input
								id="edit-event-ends"
								name="endsAt"
								type="datetime-local"
								required
								min={seasonMinimum(editSeason)}
								max={seasonMaximum(editSeason)}
								value={toInput(editing.endsAt)}
								aria-describedby="edit-event-end-help"
							/>
							<p id="edit-event-end-help" class="text-sm text-muted-foreground">
								Choose an end after the start. {seasonDateHelp(editSeason)}
							</p>
						</div>
					{/if}
				</div>

				<Dialog.Footer>
					<Button type="submit">Save changes</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
