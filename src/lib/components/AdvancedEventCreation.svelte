<script lang="ts">
	import { Settings2, Plus } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	interface SeasonOption {
		id: string;
		name: string;
		startsOn?: string | null;
		endsOn?: string | null;
	}

	let {
		seasons,
		form
	}: {
		seasons: SeasonOption[];
		form: unknown;
	} = $props();

	let newSeasonId = $state('');
	const newSeason = $derived(seasons.find((s) => s.id === newSeasonId));
	let newMultiDay = $state(false);

	const formRecord = $derived(
		form && typeof form === 'object' ? (form as Record<string, unknown>) : null
	);

	const message = $derived(
		typeof formRecord?.eventCreationMessage === 'string' ? formRecord.eventCreationMessage : null
	);

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
</script>

<details
	open={Boolean(message)}
	class="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4"
>
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
			{#if message}
				<p role="alert" class="mb-3 text-sm text-red-700">
					{message}
				</p>
			{/if}
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
