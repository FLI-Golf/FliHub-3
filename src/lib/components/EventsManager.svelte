<script lang="ts">
	import { CircleAlert, Pencil, Plus, CalendarDays, Archive, ArchiveRestore } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	interface FliEvent {
		id: string;
		season: string | null;
		seasonName: string | null;
		name: string;
		startsAt: string | null;
		status: 'planned' | 'active' | 'completed' | 'archived';
	}
	interface SeasonOption {
		id: string;
		name: string;
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

	const formRecord = $derived(
		form && typeof form === 'object' ? (form as Record<string, unknown>) : null
	);
	const message = $derived(
		formRecord && 'message' in formRecord ? String(formRecord.message) : null
	);

	/** PB dates ('YYYY-MM-DD HH:mm:ss.SSSZ') -> datetime-local input value. */
	function toInput(iso: string | null): string {
		return iso ? iso.replace(' ', 'T').slice(0, 16) : '';
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

	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<CalendarDays class="size-5" />
				Events ({events.length})
			</Card.Title>
			<Card.Description>
				An event belongs to one season or runs independently. Rounds and group assignments arrive in
				Phase 1F.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-2">
			{#if events.length === 0}
				<p class="text-sm text-muted-foreground">No events yet.</p>
			{/if}
			{#each events as event (event.id)}
				<div
					class="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 {event.status ===
					'archived'
						? 'opacity-60'
						: ''}"
				>
					<div class="flex flex-wrap items-center gap-2">
						<span class="font-medium">{event.name}</span>
						{#if event.seasonName}
							<Badge variant="outline">{event.seasonName}</Badge>
						{:else}
							<Badge variant="secondary">Independent</Badge>
						{/if}
						<Badge variant={event.status === 'archived' ? 'secondary' : 'default'}>
							{event.status}
						</Badge>
						<span class="text-sm text-muted-foreground">{display(event.startsAt)}</span>
					</div>
					{#if canManage}
						<div class="flex items-center gap-2">
							<Button variant="outline" size="sm" onclick={() => (editing = event)}>
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
			{/each}
		</Card.Content>
	</Card.Root>

	{#if canManage}
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
						<Label for="event-season">Season</Label>
						<select
							id="event-season"
							name="season"
							class="h-9 rounded-md border bg-background px-2 text-sm"
						>
							<option value="" selected>Independent (no season)</option>
							{#each seasons as season (season.id)}
								<option value={season.id}>{season.name}</option>
							{/each}
						</select>
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="event-starts">Starts at (optional)</Label>
						<Input id="event-starts" name="startsAt" type="datetime-local" />
					</div>
					<div class="flex items-end">
						<Button type="submit">
							<Plus class="mr-1 size-4" /> Add event
						</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
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
					<Label for="edit-event-season">Season</Label>
					<select
						id="edit-event-season"
						name="season"
						class="h-9 rounded-md border bg-background px-2 text-sm"
					>
						<option value="" selected={!editing.season}>Independent (no season)</option>
						{#each seasons as season (season.id)}
							<option value={season.id} selected={editing.season === season.id}>
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
						/>
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
				<Dialog.Footer>
					<Button type="submit">Save changes</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
