<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		generateTeeTimes,
		teeDisplay,
		teeLocal,
		toTeeInstant,
		type TeeSchedule
	} from '$lib/tee-times';
	let {
		round,
		groups,
		canManage,
		eventDate
	}: {
		round: { id: string; number: number; teeSchedule: TeeSchedule | null };
		groups: { id: string; name: string; status: string }[];
		canManage: boolean;
		eventDate: string;
	} = $props();
	let timeZone = $state(untrack(() => round.teeSchedule?.timeZone ?? 'America/Phoenix'));
	let interval = $state(untrack(() => round.teeSchedule?.intervalMinutes ?? 10));
	let first = $state(
		untrack(() =>
			round.teeSchedule?.slots[0]
				? teeLocal(round.teeSchedule.slots[0].startsAt, timeZone)
				: eventDate
					? `${eventDate}T09:00`
					: ''
		)
	);
	let draft = $state(
		untrack(() => {
			const active = groups.filter((group) => group.status === 'active');
			const slots = round.teeSchedule?.slots ?? [];
			const ordered = [
				...slots
					.map((slot) => active.find((group) => group.id === slot.group))
					.filter((group) => group !== undefined),
				...active.filter((group) => !slots.some((slot) => slot.group === group.id))
			];
			return ordered.map((group) => {
				const saved = slots.find((slot) => slot.group === group.id);
				return {
					group: group.id,
					name: group.name,
					local: saved ? teeLocal(saved.startsAt, timeZone) : ''
				};
			});
		})
	);
	let problem = $state('');
	function generate() {
		try {
			const times = generateTeeTimes(first, interval, draft.length, timeZone);
			draft = draft.map((slot, index) => ({
				...slot,
				local: teeLocal(times[index], timeZone)
			}));
			problem = '';
		} catch (err) {
			problem = err instanceof Error ? err.message : 'Check schedule settings.';
		}
	}
	function move(index: number, direction: number) {
		const next = [...draft];
		[next[index], next[index + direction]] = [next[index + direction], next[index]];
		draft = next;
	}
	function validate(event: SubmitEvent) {
		try {
			for (const slot of draft) toTeeInstant(slot.local, timeZone);
			problem = '';
		} catch (err) {
			event.preventDefault();
			problem = err instanceof Error ? err.message : 'Check tee times.';
		}
	}
</script>

<section class="space-y-3 rounded-md border p-4" aria-label="Round {round.number} tee times">
	<h3 class="font-semibold">Round {round.number} tee times</h3>
	{#if canManage}
		<form method="POST" action="?/saveTeeSchedule" onsubmit={validate} class="space-y-3">
			<input type="hidden" name="round" value={round.id} />
			<div class="flex flex-wrap gap-3">
				<label class="flex flex-col gap-1 text-sm"
					>Timezone<input
						name="timeZone"
						bind:value={timeZone}
						required
						class="rounded-md border bg-background p-2"
					/></label
				>
				<label class="flex flex-col gap-1 text-sm"
					>First tee time<input
						type="datetime-local"
						bind:value={first}
						class="rounded-md border bg-background p-2"
					/></label
				>
				<label class="flex flex-col gap-1 text-sm"
					>Interval in minutes<input
						name="interval"
						type="number"
						min="1"
						max="240"
						step="1"
						bind:value={interval}
						required
						class="w-24 rounded-md border bg-background p-2"
					/></label
				>
			</div>
			<p class="text-sm text-muted-foreground">
				Use a timezone such as America/Phoenix or America/Los_Angeles. Set the order, then generate
				times. Generating replaces the draft times below. Changing timezone reinterprets the clock
				times. Save to apply the full schedule.
			</p>
			<Button type="button" variant="outline" onclick={generate} disabled={draft.length === 0}
				>Generate tee times</Button
			>
			{#each draft as slot, index (slot.group)}
				<div class="flex flex-wrap items-center gap-2 rounded-md border p-2">
					<input type="hidden" name="group" value={slot.group} />
					<span class="text-sm">{index + 1}. {slot.name}</span>
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={index === 0}
						onclick={() => move(index, -1)}
						aria-label="Move {slot.name} earlier">Up</Button
					>
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={index === draft.length - 1}
						onclick={() => move(index, 1)}
						aria-label="Move {slot.name} later">Down</Button
					>
					<input
						type="datetime-local"
						name="teeTime"
						bind:value={slot.local}
						required
						aria-label="Tee time for {slot.name}"
						class="rounded-md border bg-background p-2 text-sm"
					/>
				</div>
			{/each}
			{#if problem}<p role="alert" class="text-sm text-destructive">
					{problem}
				</p>{/if}
			<Button type="submit" disabled={draft.length === 0}
				>Save round {round.number} tee times</Button
			>
		</form>
	{/if}
	{#if !round.teeSchedule}<p class="text-sm text-muted-foreground">
			No tee times saved for this round.
		</p>
	{:else}
		<h4 class="text-sm font-medium">
			Saved schedule · {round.teeSchedule.timeZone}
		</h4>
		{#each round.teeSchedule.slots as slot (slot.group)}
			{#if groups.some((group) => group.id === slot.group && group.status === 'active')}
				<p class="text-sm">
					{groups.find((group) => group.id === slot.group)?.name} · {teeDisplay(
						slot.startsAt,
						round.teeSchedule.timeZone
					)}
				</p>
			{/if}
		{/each}
	{/if}
</section>
