<script lang="ts">
	import { ChevronDown as EventChevron } from 'lucide-svelte';
	import { tick } from 'svelte';
	import type { TeeSchedule } from '$lib/tee-times';
	import {
		CircleAlert,
		CircleX,
		SquareCheck,
		Pencil,
		CalendarDays,
		Archive,
		ArchiveRestore,
		MapPin,
		Layers,
		SlidersHorizontal,
		CheckCircle2,
		CirclePlay
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

	interface SetupData {
		rounds: {
			event: string;
			status: string;
			number: number;
			courseName: string | null;
			positionLabel: string | null;
			teeSchedule: TeeSchedule | null;
		}[];
		groups: { event: string; id: string; status: string; scorekeeper: string | null }[];
		groupTeams: { group: string; entry: string; status: string }[];
		groupAthletes: { group: string; entry: string; status: string }[];
		entries: { id: string; season: string; status: string }[];
		members: { userId: string; role: string }[];
	}

	interface Props {
		setupData: SetupData;
		events: FliEvent[];
		seasons: SeasonOption[];
		canManage: boolean;
		myRole: string;
		/** SvelteKit ActionData from the page's form actions (shape varies by action). */
		form: unknown;
	}

	let { events, setupData, seasons, canManage, myRole, form }: Props = $props();

	let editing = $state<FliEvent | null>(null);
	let editMultiDay = $state(false);
	const editSeason = $derived(seasons.find((s) => s.id === editing?.season));

	function eventSetup(event: FliEvent) {
		const rounds = setupData.rounds.filter(
			(round) => round.event === event.id && round.status === 'active'
		);
		const groups = setupData.groups.filter(
			(group) => group.event === event.id && group.status === 'active'
		);
		const groupIds = new Set(groups.map((group) => group.id));
		const eligibleEntries = new Set(
			setupData.entries
				.filter((entry) => entry.season === event.season && entry.status === 'active')
				.map((entry) => entry.id)
		);
		const teams = setupData.groupTeams.filter(
			(team) =>
				groupIds.has(team.group) && eligibleEntries.has(team.entry) && team.status === 'active'
		);
		const assignedEntries = new Set(teams.map((team) => team.entry));
		const athletes = setupData.groupAthletes.filter(
			(athlete) =>
				athlete.status === 'active' &&
				teams.some((team) => team.group === athlete.group && team.entry === athlete.entry)
		);
		const entriesWithLineups = new Set(athletes.map((athlete) => athlete.entry));
		const missingLineups = assignedEntries.size - entriesWithLineups.size;
		const scoringMembers = new Set(
			setupData.members
				.filter((member) => ['owner', 'admin', 'scorekeeper'].includes(member.role))
				.map((member) => member.userId)
		);
		const scorekeepers = groups.filter(
			(group) => group.scorekeeper && scoringMembers.has(group.scorekeeper)
		).length;

		return {
			rounds,
			groups,
			assignedEntries,
			eligibleEntries,
			athletes,
			missingLineups,
			scorekeepers
		};
	}

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
	let eventSearch = $state('');
	let eventStatus = $state('');
	let eventSort = $state('date-asc');

	const eventStatuses = $derived([...new Set(events.map((event) => event.status))].sort());
	const filteredEvents = $derived.by(() => {
		const query = eventSearch.trim().toLowerCase();
		return events
			.filter(
				(event) =>
					(!eventStatus || event.status === eventStatus) &&
					(!query ||
						[event.name, event.seasonName, event.venueName].some((value) =>
							value?.toLowerCase().includes(query)
						))
			)
			.sort((a, b) => {
				const byName = a.name.localeCompare(b.name);
				if (eventSort === 'name') return byName;
				if (!a.startsAt || !b.startsAt) {
					return Number(!a.startsAt) - Number(!b.startsAt) || byName;
				}
				const byDate = a.startsAt.localeCompare(b.startsAt);
				return (eventSort === 'date-desc' ? -byDate : byDate) || byName;
			});
	});
</script>

{#snippet setupItem(complete: boolean, label: string)}
	<li class="flex items-start gap-2">
		{#if complete}
			<SquareCheck class="mt-0.5 size-4 shrink-0 text-green-700" aria-hidden="true" />
			<span class="sr-only">Complete:</span>
		{:else}
			<CircleX class="mt-0.5 size-4 shrink-0 text-red-700" aria-hidden="true" />
			<span class="sr-only">Needs attention:</span>
		{/if}
		<span>{label}</span>
	</li>
{/snippet}

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
			<Card.Description>Review each event’s setup and open it to make changes.</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-4 pt-5 xl:grid-cols-2">
			<div class="grid gap-3 sm:grid-cols-3 xl:col-span-2">
				<label class="grid gap-1 text-sm font-medium">
					Search events
					<input
						type="search"
						bind:value={eventSearch}
						placeholder="Name, season, or venue"
						class="min-h-11 min-w-0 rounded-md border bg-background px-3 py-2"
					/>
				</label>
				<label class="grid gap-1 text-sm font-medium">
					Status
					<select
						bind:value={eventStatus}
						class="min-h-11 rounded-md border bg-background px-3 py-2"
					>
						<option value="">All statuses</option>
						{#each eventStatuses as status (status)}
							<option value={status}>{status[0].toUpperCase() + status.slice(1)}</option>
						{/each}
					</select>
				</label>
				<label class="grid gap-1 text-sm font-medium">
					Sort by
					<select bind:value={eventSort} class="min-h-11 rounded-md border bg-background px-3 py-2">
						<option value="date-asc">Date: earliest first</option>
						<option value="date-desc">Date: latest first</option>
						<option value="name">Name: A–Z</option>
					</select>
				</label>
				<p class="text-sm text-muted-foreground sm:col-span-3" aria-live="polite">
					Showing {filteredEvents.length} of {events.length} events
				</p>
			</div>
			{#if filteredEvents.length === 0}
				<p class="text-sm text-muted-foreground">
					{events.length ? 'No events match those filters.' : 'No events yet.'}
				</p>
			{/if}
			{#each filteredEvents as event (event.id)}
				{@const setup = eventSetup(event)}
				<details class="group/event rounded-xl border border-slate-200 bg-card">
					<summary
						class="flex cursor-pointer list-none flex-wrap items-center gap-2 rounded-xl p-4 focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden"
					>
						<span class="min-w-0 flex-1 font-bold break-words">{event.name}</span>
						<span
							class="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200"
						>
							<span class="group-open/event:hidden">Show setup</span>
							<span class="hidden group-open/event:inline">Hide setup</span>
							<EventChevron
								class="size-4 shrink-0 transition-transform group-open/event:rotate-180"
								aria-hidden="true"
							/>
						</span>
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
						<span class="text-sm text-muted-foreground">
							{event.startsAt ? event.startsAt.slice(0, 10) : 'Date needed'}
						</span>
					</summary>
					<div class="flex flex-col gap-3 border-t p-4">
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
								{:else}
									<span>Starts {display(event.startsAt)} UTC</span>
									{#if event.endsAt}<span> · Ends {display(event.endsAt)} UTC</span>{/if}
								{/if}
							{:else}
								<span>Start date needed — use Edit to schedule this event.</span>
							{/if}
						</div>
						{#if event.status !== 'archived'}
							<div class="grid gap-2 rounded-lg border border-slate-200 p-3 text-sm">
								<h4 class="font-semibold">Event setup</h4>
								<ul class="grid gap-1">
									{@render setupItem(
										Boolean(event.startsAt),
										event.startsAt ? 'Event date set' : 'Event date needed'
									)}
									{#if setup.rounds.length === 0}
										{@render setupItem(false, 'Rounds needed')}
									{/if}
									{#each setup.rounds as round, index (index)}
										{@const scheduled = new Set(round.teeSchedule?.slots.map((slot) => slot.group))}
										{@const teeCount = setup.groups.filter((group) =>
											scheduled.has(group.id)
										).length}
										{@render setupItem(
											Boolean(round.courseName),
											`Round ${round.number} · ${round.courseName ?? 'Course needed'}${round.positionLabel ? ' · ' + round.positionLabel : ''}`
										)}
										{@render setupItem(
											setup.groups.length > 0 && teeCount === setup.groups.length,
											`Round ${round.number} tee times · ${setup.groups.length ? teeCount + '/' + setup.groups.length + ' saved' : 'Add groups first'}`
										)}
									{/each}
									{@render setupItem(
										setup.groups.length > 0,
										setup.groups.length ? setup.groups.length + ' groups' : 'Groups needed'
									)}
									{#if event.season}
										{@render setupItem(
											setup.eligibleEntries.size > 0 &&
												setup.assignedEntries.size === setup.eligibleEntries.size,
											`${setup.assignedEntries.size}/${setup.eligibleEntries.size} season teams assigned`
										)}
										{@render setupItem(
											setup.assignedEntries.size > 0 && setup.missingLineups === 0,
											`${setup.athletes.length} athlete assignments${setup.missingLineups ? ' · Lineups needed for ' + setup.missingLineups + ' team(s)' : ''}`
										)}
									{/if}
									{@render setupItem(
										setup.groups.length > 0 && setup.scorekeepers === setup.groups.length,
										setup.groups.length
											? `${setup.scorekeepers}/${setup.groups.length} groups with scorekeepers`
											: 'Scorekeepers · Add groups first'
									)}
								</ul>
							</div>
						{/if}

						<div class="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
							{#if event.status !== 'archived'}
								<Button
									type="button"
									class="min-h-11 bg-blue-700 text-white shadow-sm hover:bg-blue-800"
									onclick={() => {
										const panel = document.getElementById('event-operations-panel');
										if (panel instanceof HTMLDetailsElement) panel.open = true;
										manageEvent(event.id);
									}}
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
				</details>
			{/each}
		</Card.Content>
	</Card.Root>

	{#if !canManage}
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
