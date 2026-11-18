<script lang="ts">
	import { untrack } from 'svelte';
	import { Clock, Eye, EyeOff, Save, WandSparkles } from 'lucide-svelte';
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

<section
	class="space-y-5 rounded-xl border-2 border-blue-200 bg-slate-50 p-4 shadow-sm sm:p-6"
	aria-label="Round {round.number} tee times"
>
	<details class="group/schedule">
		<summary
			class="cursor-pointer rounded-lg bg-blue-900 px-4 py-3 text-white focus-visible:outline-2 focus-visible:outline-offset-4"
		>
			<span class="text-lg font-bold">
				<Clock class="mr-1.5 inline-block size-4 align-middle" aria-hidden="true" />Round {round.number}
				tee times
			</span>
			<span
				class="ml-2 inline-flex min-h-7 min-w-7 items-center justify-center rounded-full border border-blue-300 bg-white px-2 text-xs font-bold text-blue-950"
				aria-label="{(round.teeSchedule?.slots ?? []).filter((slot) =>
					groups.some((group) => group.id === slot.group && group.status === 'active')
				).length} saved tee times"
			>
				{(round.teeSchedule?.slots ?? []).filter((slot) =>
					groups.some((group) => group.id === slot.group && group.status === 'active')
				).length}
			</span>
			<span class="ml-1 text-xs">saved tee times</span>
			<span class="mt-1 block text-sm">
				{groups.filter((group) => group.status === 'active').length} groups · {round.teeSchedule
					? round.teeSchedule.timeZone
					: 'No saved schedule'}
			</span>
			{#if round.teeSchedule?.slots[0]}<span class="mt-1 block text-sm">
					First saved tee: {teeDisplay(
						round.teeSchedule.slots[0].startsAt,
						round.teeSchedule.timeZone
					)}
				</span>{/if}
			<span class="mt-2 block text-xs font-semibold group-open/schedule:hidden">
				<Eye class="mr-1.5 inline-block size-4 align-middle" aria-hidden="true" />Show details
			</span><span class="mt-2 hidden text-xs font-semibold group-open/schedule:block">
				<EyeOff class="mr-1.5 inline-block size-4 align-middle" aria-hidden="true" />Hide details
			</span>
		</summary>
		<div class="space-y-5 pt-4">
			{#if canManage}
				<form
					method="POST"
					action="?/saveTeeSchedule"
					onsubmit={validate}
					class="space-y-4 rounded-xl border border-slate-300 bg-white p-4 text-slate-950"
				>
					<input type="hidden" name="round" value={round.id} />
					<p class="text-sm font-bold text-blue-900">Edit schedule · Save below to apply changes</p>
					<div class="flex flex-wrap gap-4 rounded-lg bg-blue-50 p-3">
						<label class="flex min-w-0 flex-col gap-2 text-sm font-semibold">
							Timezone<input
								name="timeZone"
								bind:value={timeZone}
								required
								class="min-h-11 min-w-0 rounded-md border border-slate-400 bg-white p-2 text-slate-950"
							/>
						</label>
						<label class="flex min-w-0 flex-col gap-2 text-sm font-semibold">
							First tee time<input
								type="datetime-local"
								bind:value={first}
								class="min-h-11 min-w-0 rounded-md border border-slate-400 bg-white p-2 text-slate-950"
							/>
						</label>
						<label class="flex min-w-0 flex-col gap-2 text-sm font-semibold">
							Interval in minutes<input
								name="interval"
								type="number"
								min="1"
								max="240"
								step="1"
								bind:value={interval}
								required
								class="min-h-11 w-24 rounded-md border border-slate-400 bg-white p-2 text-slate-950"
							/>
						</label>
					</div>
					<p class="text-sm text-muted-foreground">
						Use a timezone such as America/Phoenix or America/Los_Angeles. Set the order, then
						generate times. Generating replaces the draft times below. Changing timezone
						reinterprets the clock times. Save to apply the full schedule.
					</p>
					<Button
						type="button"
						variant="outline"
						class="min-h-11 border-blue-400 bg-blue-50 font-semibold text-blue-950 hover:bg-blue-100"
						onclick={generate}
						disabled={draft.length === 0}
					>
						<WandSparkles
							class="mr-1.5 inline-block size-4 align-middle"
							aria-hidden="true"
						/>Generate tee times
					</Button>
					{#each draft as slot, index (slot.group)}
						<div
							class="flex flex-wrap items-center gap-3 rounded-lg border border-slate-300 bg-slate-50 p-3 even:bg-white"
						>
							<input type="hidden" name="group" value={slot.group} />
							<span class="mr-auto text-sm font-bold">
								{index + 1}. {slot.name}
							</span>
							<Button
								type="button"
								size="sm"
								variant="outline"
								disabled={index === 0}
								onclick={() => move(index, -1)}
								aria-label="Move {slot.name} earlier"
							>
								Up
							</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								disabled={index === draft.length - 1}
								onclick={() => move(index, 1)}
								aria-label="Move {slot.name} later"
							>
								Down
							</Button>
							<input
								type="datetime-local"
								name="teeTime"
								bind:value={slot.local}
								required
								aria-label="Tee time for {slot.name}"
								class="min-h-11 max-w-full min-w-0 rounded-md border border-slate-400 bg-white p-2 text-sm text-slate-950"
							/>
						</div>
					{/each}
					{#if problem}<p role="alert" class="text-sm text-destructive">
							{problem}
						</p>{/if}
					<Button
						type="submit"
						class="min-h-11 bg-blue-700 font-semibold text-white shadow-sm hover:bg-blue-800"
						disabled={draft.length === 0}
					>
						<Save class="mr-1.5 inline-block size-4 align-middle" aria-hidden="true" />Save round {round.number}
						tee times
					</Button>
				</form>
			{/if}
			{#if !round.teeSchedule}<p class="text-sm text-muted-foreground">
					No tee times saved for this round.
				</p>
			{:else}
				<div
					class="space-y-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950"
				>
					<h4 class="text-sm font-bold">
						<Save class="mr-1.5 inline-block size-4 align-middle" aria-hidden="true" />Saved
						schedule · {round.teeSchedule.timeZone}
					</h4>
					{#each round.teeSchedule.slots as slot (slot.group)}
						{#if groups.some((group) => group.id === slot.group && group.status === 'active')}
							<p class="rounded-md border border-emerald-200 bg-white/80 px-3 py-2 text-sm">
								{groups.find((group) => group.id === slot.group)?.name} · {teeDisplay(
									slot.startsAt,
									round.teeSchedule.timeZone
								)}
							</p>
						{/if}
					{/each}
				</div>
			{/if}
		</div>
	</details>
</section>
