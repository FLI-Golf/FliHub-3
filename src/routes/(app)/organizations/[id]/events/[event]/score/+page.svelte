<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import { firstUnsubmittedRound, blockingRounds } from '$lib/scoring/round-flow';
	import ScoreStepper from '$lib/components/ScoreStepper.svelte';
	import ScoreCompletionMark from '$lib/components/ScoreCompletionMark.svelte';
	import { cardProgress } from '$lib/scoring/card-progress';
	let pendingSaves = $state(0);
	let fillingEvent = $state(false);
	function trackSave(change: number) {
		pendingSaves = Math.max(0, pendingSaves + change);
	}
	import { teeDisplay } from '$lib/tee-times';
	import { resolve } from '$app/paths';
	import {
		ArrowLeft,
		CircleAlert,
		ClipboardCheck,
		History,
		Layers,
		Lock,
		Send
	} from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let selectedRound = $state('');
	let selectedGroup = $state('');
	let submitting = $state(false);
	let navigationNotice = $state('');
	let activeRoundHeading = $state<HTMLHeadingElement>();

	const group = $derived(
		data.groups.find((g) => g.id === (selectedGroup || String(formRecord?.activeGroup ?? ''))) ??
			data.groups.find((g) => g.scorekeeper === data.currentUserId) ??
			data.groups[0] ??
			null
	);
	const orderedRounds = $derived([...data.rounds].sort((a, b) => a.number - b.number));
	function isRoundLocked(roundId: string, groupId: string): boolean {
		return blockingRounds(roundId, groupId, data.rounds, data.scorecards).length > 0;
	}
	const round = $derived.by(() => {
		const requested = orderedRounds.find(
			(item) => item.id === (selectedRound || String(formRecord?.activeRound ?? ''))
		);
		if (requested && group && !isRoundLocked(requested.id, group.id)) return requested;
		const next = group ? firstUnsubmittedRound(orderedRounds, data.scorecards, group.id) : null;
		return orderedRounds.find((item) => item.id === next) ?? orderedRounds[0] ?? null;
	});
	function selectGroup(groupId: string) {
		selectedGroup = groupId;
		selectedRound =
			firstUnsubmittedRound(orderedRounds, data.scorecards, groupId) ?? orderedRounds[0]?.id ?? '';
		navigationNotice = '';
	}
	function roundLabel(roundId: string): string {
		const item = data.rounds.find((candidate) => candidate.id === roundId);
		return item
			? `Round ${item.number} · ${item.holes.length} holes${item.positionLabel ? ` · ${item.positionLabel} positions` : ''}`
			: 'Round';
	}
	const groupAthletes = $derived(
		group ? data.groupAthletes.filter((ga) => ga.group === group.id) : []
	);
	const scorecard = $derived(
		round && group
			? (data.scorecards.find((c) => c.round === round.id && c.group === group.id) ?? null)
			: null
	);
	const teeSlot = $derived(round?.teeSchedule?.slots.find((slot) => slot.group === group?.id));
	const isDraft = $derived(!scorecard || scorecard.status === 'draft');
	const editable = $derived(
		isDraft &&
			(data.canManage ||
				(data.myRole === 'scorekeeper' && group?.scorekeeper === data.currentUserId))
	);

	const strokesFor = (athleteId: string, holeId: string) =>
		round
			? (data.scores.find(
					(s) =>
						s.round === round.id &&
						s.group === group?.id &&
						s.athlete === athleteId &&
						s.hole === holeId
				)?.strokes ?? null)
			: null;

	function progressFor(roundId: string, groupId: string) {
		return cardProgress(
			roundId,
			groupId,
			data.rounds.find((item) => item.id === roundId)?.holes ?? [],
			data.groupAthletes.filter((athlete) => athlete.group === groupId),
			data.scores
		);
	}
	function isCardComplete(roundId: string, groupId: string) {
		return (
			!(round?.id === roundId && group?.id === groupId && pendingSaves > 0) &&
			progressFor(roundId, groupId).complete
		);
	}
	const scoresComplete = $derived(Boolean(round && group && isCardComplete(round.id, group.id)));
	function hasSavedScore(athleteId: string, holeId: string): boolean {
		const value = strokesFor(athleteId, holeId);
		return value !== null && Number.isInteger(value) && value > 0;
	}
	function holeComplete(holeId: string) {
		return (
			!pendingSaves &&
			groupAthletes.length > 0 &&
			groupAthletes.every((athlete) => {
				const value = strokesFor(athlete.athlete, holeId);
				return value !== null && Number.isInteger(value) && value > 0;
			})
		);
	}
	const selectedHoles = $state<Record<string, string>>({});
	const reviewing = $state<Record<string, boolean>>({});
	const cardKey = $derived(`${round?.id ?? ''}:${group?.id ?? ''}`);
	const currentHole = $derived(
		round?.holes.find((hole) => hole.id === selectedHoles[cardKey]) ??
			round?.holes.find((hole) =>
				groupAthletes.some((athlete) => strokesFor(athlete.athlete, hole.id) === null)
			) ??
			round?.holes[0] ??
			null
	);
	const currentIndex = $derived(
		round && currentHole ? round.holes.findIndex((hole) => hole.id === currentHole.id) : 0
	);
	const holeMissing = $derived(
		currentHole
			? groupAthletes.filter((athlete) => strokesFor(athlete.athlete, currentHole.id) === null)
					.length
			: 0
	);
	const showReview = $derived(!editable || (reviewing[cardKey] ?? scoresComplete));
	$effect(() => {
		if (currentHole && !selectedHoles[cardKey]) selectedHoles[cardKey] = currentHole.id;
	});
	function openHole(holeId: string) {
		selectedHoles[cardKey] = holeId;
		reviewing[cardKey] = false;
	}
	function nextHole() {
		if (!round || holeMissing || pendingSaves) return;
		const next = round.holes[currentIndex + 1];
		if (next) openHole(next.id);
		else reviewing[cardKey] = true;
	}

	const athleteTotal = (athleteId: string) => {
		if (!round) return { total: 0, recorded: 0, missing: 0 };
		const values = round.holes.map((hole) => strokesFor(athleteId, hole.id));
		const recorded = values.filter((value): value is number => value !== null);
		return {
			total: recorded.reduce((sum, value) => sum + value, 0),
			recorded: recorded.length,
			missing: values.length - recorded.length
		};
	};

	/** Demo team score: both athletes' strokes added together; lower wins. */
	const teamTotals = $derived.by(() => {
		if (!round || !group) return [];
		const byEntry: Record<
			string,
			{ teamName: string; total: number; missing: number; recorded: number }
		> = {};
		for (const ga of groupAthletes) {
			const bucket = byEntry[ga.entry] ?? {
				teamName: ga.teamName,
				total: 0,
				missing: 0,
				recorded: 0
			};
			for (const hole of round.holes) {
				const strokes = strokesFor(ga.athlete, hole.id);
				if (strokes === null) bucket.missing += 1;
				else {
					bucket.total += strokes;
					bucket.recorded += 1;
				}
			}
			byEntry[ga.entry] = bucket;
		}
		return Object.values(byEntry);
	});

	const missingCount = $derived(
		groupAthletes.reduce((count, athlete) => count + athleteTotal(athlete.athlete).missing, 0)
	);

	const cardChanges = $derived(
		scorecard ? data.changes.filter((ch) => ch.scorecard === scorecard.id) : []
	);

	const formRecord = $derived(
		form && typeof form === 'object' ? (form as Record<string, unknown>) : null
	);
	const message = $derived(
		formRecord && 'message' in formRecord ? String(formRecord.message) : null
	);

	const nextRoundId = $derived(
		group ? firstUnsubmittedRound(orderedRounds, data.scorecards, group.id) : null
	);
</script>

<svelte:head>
	<title>Scoring — {data.event.name} — FliHub</title>
</svelte:head>

<section class="mx-auto flex max-w-2xl flex-col gap-4 py-4">
	<Button
		variant="ghost"
		size="sm"
		href={resolve('/(app)/organizations/[id]/cap/[capability]', {
			id: data.organizationId,
			capability: 'scoring-results'
		})}
		class="w-fit"
	>
		<ArrowLeft class="size-4" />
		Back to scoring
	</Button>

	<div class="flex flex-col gap-1">
		<h1 class="text-xl font-semibold tracking-tight">Scoring — {data.event.name}</h1>
		<p class="text-sm text-muted-foreground">
			Rounds, groups, teams, and athletes come from the event setup. Missing scores stay missing —
			they never count as zero.
		</p>
		{#if !data.canScore}
			<p class="flex items-center gap-1.5 text-sm text-muted-foreground">
				<Lock class="size-3.5" />
				Read-only: score entry needs the Scorekeeper role plus a group assignment in this event (or Owner/Admin).
			</p>
		{/if}
	</div>

	{#if message}
		<Alert.Root variant="destructive">
			<CircleAlert class="size-4" />
			<Alert.Title>Action failed</Alert.Title>
			<Alert.Description>{message}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if data.rounds.length === 0 || data.groups.length === 0}
		<Card.Root>
			<Card.Content class="pt-6">
				<p class="text-sm text-muted-foreground">
					Scoring needs at least one round (with a course) and one group — set them up on the Events
					page first.
				</p>
			</Card.Content>
		</Card.Root>
	{:else if round && group}
		{#if navigationNotice}<p
				role="status"
				class="rounded-lg border border-green-300 bg-green-50 p-3 text-sm font-medium text-green-950"
			>
				{navigationNotice}
			</p>{/if}
		<section
			class="rounded-xl border-2 border-blue-500 bg-blue-50 p-4 text-blue-950"
			aria-label="Active round"
		>
			<p class="text-xs font-bold tracking-wide uppercase">
				{!isDraft
					? 'Submitted scorecard'
					: editable && scoresComplete
						? 'Review and submit this round'
						: editable
							? 'Entering scores'
							: 'Viewing scorecard'}
			</p>
			<h2
				bind:this={activeRoundHeading}
				tabindex="-1"
				class="mt-1 text-2xl font-bold focus:outline-none"
			>
				{roundLabel(round.id)}
			</h2>
			<p class="mt-2 font-semibold">
				{group.name} · Playing holes {round.holes[0]
					? round.holes[0].number + round.displayOffset
					: '—'}–{round.holes.length
					? round.holes[round.holes.length - 1].number + round.displayOffset
					: '—'}
			</p>
			<p class="mt-2 text-sm">
				{isDraft
					? 'Save every player’s score on every hole, then review and submit this round. The next round unlocks after submission for this group.'
					: 'This round is submitted. Its scores are locked; authorized corrections use the existing reopen workflow.'}
			</p>
		</section>
		<p class="text-sm font-medium">
			{#if teeSlot && round.teeSchedule}Tee time · {teeDisplay(
					teeSlot.startsAt,
					round.teeSchedule.timeZone
				)}
			{:else}Tee time awaiting setup{/if}
		</p>

		{#if teamTotals.length}
			<section class="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4" aria-labelledby="round-team-scores">
				<h2 id="round-team-scores" class="font-bold text-blue-950">Team scores · current round</h2>
				<ul class="grid grid-cols-2 gap-2 sm:gap-3">
					{#each teamTotals as team (team.teamName)}
						<li class="min-w-0 rounded-lg border border-blue-200 bg-white p-3">
							<h3 class="wrap-break-word font-bold text-blue-950">{team.teamName}</h3>
							<p class="mt-1 text-2xl font-extrabold text-blue-950 tabular-nums">
								{team.recorded ? team.total : '—'}
							</p>
							<p class="text-xs text-slate-700">
								{!team.recorded ? 'Not started' : team.missing ? 'Partial total' : 'Team total'}
								{#if team.missing}
									· {team.missing} score{team.missing === 1 ? '' : 's'} missing
								{/if}
							</p>
						</li>
					{/each}
				</ul>
				<p class="text-xs text-blue-950">Team scores add both athletes’ strokes. Lower is better.</p>
			</section>
		{/if}

		{#if data.canManage && editable}
			<details class="space-y-3 rounded-md border border-amber-400 bg-amber-50 p-4 text-black">
				<summary class="cursor-pointer rounded-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4">
					<ClipboardCheck class="mr-1 inline-block size-5 align-middle" aria-hidden="true" />Demo testing — current scorecard
				</summary>
				<p class="text-sm">
					Fill missing scores for this group and round with generated test values. Existing scores
					are preserved. Review the results before submitting.
				</p>
				<form method="POST" action="?/fillDemoScores">
					<input type="hidden" name="round" value={round.id} />
					<input type="hidden" name="group" value={group.id} />
					<Button
						type="submit"
						disabled={pendingSaves > 0 || submitting}
						style="background-color: #16a34a; color: white;"
					>
						Fill missing · current scorecard
					</Button>
				</form>
				<Button
					type="button"
					variant="outline"
					disabled={pendingSaves > 0 || submitting}
					onclick={() => (reviewing[cardKey] = true)}
				>
					Review scorecard
				</Button>
			</details>
		{/if}

		{#if import.meta.env.DEV && data.canManage && !data.resultStatus}
			<details
				class="space-y-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-amber-950"
				open={Boolean(formRecord?.eventDemoSummary)}
			>
				<summary class="cursor-pointer rounded-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4">
					<Layers class="mr-1 inline-block size-5 align-middle" aria-hidden="true" />Demo testing — entire event
				</summary>
				<p class="text-sm">
					Generate missing test scores across every active group and round. Existing scores are
					preserved; submitted cards are skipped. This can take a moment. Review and submit each
					card afterward.
				</p>
				<form
					method="POST"
					action="?/fillAllDemoScores"
					use:enhance={() => {
						fillingEvent = true;
						return async ({ update }) => {
							try {
								await update({ reset: false });
							} finally {
								fillingEvent = false;
							}
						};
					}}
				>
					<Button
						type="submit"
						disabled={pendingSaves > 0 || submitting || fillingEvent}
						class="min-h-11 bg-blue-700 text-white hover:bg-blue-800"
					>
						<Layers class="mr-2 size-4" aria-hidden="true" />{fillingEvent
							? 'Filling missing event scores…'
							: 'Fill missing · entire event'}
					</Button>
				</form>
				<form
					method="POST"
					action="?/submitAllDemoScorecards"
					use:enhance={() => {
						fillingEvent = true;
						return async ({ update }) => {
							try {
								await update({ reset: false });
							} finally {
								fillingEvent = false;
							}
						};
					}}
				>
					<Button
						type="submit"
						disabled={pendingSaves > 0 || submitting || fillingEvent}
						class="min-h-11 bg-green-700 text-white hover:bg-green-800"
					>
						<Send class="mr-2 size-4" aria-hidden="true" />{fillingEvent
							? 'Processing event scorecards…'
							: 'Submit all complete scorecards'}
					</Button>
				</form>
				<p class="text-xs">
					For rapid development testing: checks the entire event for complete scores before
					submitting draft cards. Already submitted cards are skipped. Approval and publication
					remain separate.
				</p>

				{#if formRecord?.eventDemoSummary}<p
						role="status"
						class="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-950"
					>
						{String(formRecord.eventDemoSummary)}
					</p>{/if}
			</details>
		{/if}

		<details
			class="group/full-scorecard overflow-hidden rounded-xl border border-blue-200 bg-blue-50/40"
			data-testid="all-holes-overview"
			data-score-overview="button-toggle"
		>
			<summary
				class="flex min-h-14 cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-xl bg-blue-50 px-4 py-3 text-blue-950 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
			>
				<span class="flex items-center gap-3">
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						class="size-6 shrink-0"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle
							cx="12"
							cy="12"
							r="3"
						/>
					</svg><span>
						<span class="block font-semibold">Full scorecard · {group.name}</span><span
							class="block text-xs"
						>
							All {data.rounds.reduce((count, item) => count + item.holes.length, 0)} holes · Saved scores
						</span>
					</span>
				</span>
				<span class="rounded-md border border-blue-300 bg-white px-3 py-2 text-sm font-semibold">
					<span class="group-open/full-scorecard:hidden">Show scorecard</span><span
						class="hidden group-open/full-scorecard:inline"
					>
						Hide scorecard
					</span>
				</span>
			</summary>
			<p class="my-3 px-4 text-sm text-muted-foreground">
				Saved scores across all rounds. Missing scores appear as dashes.
			</p>
			<div class="overflow-x-auto px-4 pb-4">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b">
							<th scope="col" class="p-2 text-left">Hole</th>
							{#each groupAthletes as athlete (athlete.athlete)}
								<th scope="col" class="p-2 text-center">
									{athlete.athleteName}
									<span class="block text-xs font-normal text-muted-foreground">
										{athlete.teamName}
									</span>
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each data.rounds as overviewRound (overviewRound.id)}
							<tr
								class={isCardComplete(overviewRound.id, group.id)
									? 'border-b bg-green-100 text-green-950'
									: 'border-b bg-muted'}
							>
								<th colspan={groupAthletes.length + 1} class="p-2 text-left">
									{#if isCardComplete(overviewRound.id, group.id)}<span class="mr-2 inline-flex">
											<ScoreCompletionMark /><span class="sr-only">Scores complete.</span>
										</span>{/if}Round {overviewRound.number}
									{overviewRound.positionLabel ? ` · ${overviewRound.positionLabel}` : ''}
								</th>
							</tr>
							{#each overviewRound.holes as hole (hole.id)}
								<tr class="border-b">
									<th scope="row" class="p-2 text-left font-normal">
										{hole.number + overviewRound.displayOffset} · {hole.name}
										<span class="block text-xs text-muted-foreground">Par {hole.par}</span>
									</th>
									{#each groupAthletes as athlete (athlete.athlete)}
										{@const strokes =
											data.scores.find(
												(score) =>
													score.round === overviewRound.id &&
													score.group === group.id &&
													score.athlete === athlete.athlete &&
													score.hole === hole.id
											)?.strokes ?? null}
										<td
											class="p-2 text-center font-semibold"
											style={strokes === null
												? undefined
												: `color: ${
														strokes < hole.par
															? '#dc2626'
															: strokes === hole.par
																? '#2563eb'
																: '#000000'
													};`}
										>
											{strokes ?? '—'}
										</td>
									{/each}
								</tr>
							{/each}
						{/each}
						<tr class="border-t">
							<th scope="row" class="p-2 text-left">Combined total</th>
							{#each groupAthletes as athlete (athlete.athlete)}
								{@const values = data.rounds.flatMap((item) =>
									item.holes.map(
										(hole) =>
											data.scores.find(
												(score) =>
													score.round === item.id &&
													score.group === group.id &&
													score.athlete === athlete.athlete &&
													score.hole === hole.id
											)?.strokes ?? null
									)
								)}
								{@const missing = values.filter((value) => value === null).length}
								<td class="p-2 text-center font-semibold">
									{values.length > missing
										? values.reduce((total, value) => (total ?? 0) + (value ?? 0), 0)
										: '—'}
									{#if missing}
										<span class="block text-xs font-normal text-muted-foreground">
											Partial · {missing} missing
										</span>
									{/if}
								</td>
							{/each}
						</tr>
					</tbody>
				</table>
			</div>
		</details>

		<!-- Round selector: the hole count comes from the round's course. -->
		<div
			class="flex flex-col gap-3"
			data-testid="round-picker"
			data-round-navigation="status-buttons"
		>
			{#each orderedRounds as r, index (r.id)}
				{@const locked = isRoundLocked(r.id, group.id)}
				{@const complete = isCardComplete(r.id, group.id)}
				{@const submitted = data.scorecards.some(
					(card) => card.round === r.id && card.group === group.id && card.status === 'submitted'
				)}
				{@const progress = progressFor(r.id, group.id)}
				{#if index > 0}<div class="flex items-center gap-2 px-3 text-xs text-muted-foreground">
						<span class="h-px flex-1 bg-border"></span><span
							class="rounded-full bg-muted px-3 py-1"
						>
							Intermission
						</span><span class="h-px flex-1 bg-border"></span>
					</div>{/if}
				<button
					type="button"
					aria-pressed={round.id === r.id}
					disabled={pendingSaves > 0 || submitting || locked}
					onclick={() => (selectedRound = r.id)}
					class={`flex min-h-20 w-full flex-wrap items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed ${round.id === r.id ? 'ring-2 ring-blue-500 ring-offset-2' : ''} ${locked ? 'border-slate-200 bg-slate-100 text-slate-600' : complete ? 'border-green-300 bg-green-50 text-green-950 hover:bg-green-100' : 'border-blue-300 bg-blue-50 text-blue-950 hover:bg-blue-100'}`}
				>
					<span class="flex min-w-0 items-start gap-3">
						{#if locked}<Lock
								class="mt-1 size-5 shrink-0"
								aria-hidden="true"
							/>{:else if complete}<span class="mt-1"><ScoreCompletionMark /></span>{:else}<span
								class="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white"
							>
								{r.number}
							</span>{/if}<span>
							<span class="block text-base font-bold">{roundLabel(r.id)}</span><span
								class="mt-1 block text-xs"
							>
								{#if locked}Submit Round {blockingRounds(
										r.id,
										group.id,
										data.rounds,
										data.scorecards
									).join(', ')} for {group.name} first.{:else}{group.name} · {progress.recorded}/{progress.required}
									scores saved{/if}
							</span>
						</span>
					</span>
					<span
						class={`rounded-full border px-3 py-1 text-xs font-bold ${locked ? 'border-slate-300 bg-slate-200' : complete ? 'border-green-300 bg-green-100' : 'border-blue-300 bg-white'}`}
					>
						{locked
							? 'Locked'
							: submitted
								? 'Submitted'
								: complete
									? round.id === r.id && editable
										? 'Ready to submit'
										: 'Scores complete · Draft'
									: round.id === r.id
										? editable
											? 'Working on'
											: 'Viewing'
										: r.id === nextRoundId
											? 'Ready to start'
											: 'View round'}
					</span>
				</button>
			{/each}
		</div>

		<div class="flex flex-wrap gap-1.5">
			{#each data.groups as g (g.id)}
				<Button
					variant={group.id === g.id ? 'default' : 'outline'}
					size="sm"
					disabled={pendingSaves > 0 || submitting}
					onclick={() => selectGroup(g.id)}
					aria-pressed={group.id === g.id}
					class={`h-auto min-h-9 gap-2 whitespace-normal ${group.id === g.id ? 'ring-2 ring-ring ring-offset-2' : ''}`}
					style={isCardComplete(round.id, g.id)
						? 'background-color: #dcfce7; color: #14532d; border-color: #86efac;'
						: undefined}
				>
					{#if isCardComplete(round.id, g.id)}<ScoreCompletionMark />{/if}
					{g.name}{isCardComplete(round.id, g.id) ? ' · Scores complete' : ''}
				</Button>
			{/each}
		</div>

		<Card.Root class={scoresComplete ? 'border-green-300 bg-green-50/40' : ''}>
			<Card.Header>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<Card.Title class="text-base">
						{roundLabel(round.id)} · {group.name}
					</Card.Title>
					{#if scoresComplete}<span
							class="inline-flex items-center gap-2 rounded-md border border-green-300 bg-green-100 px-2 py-1 text-sm font-medium text-green-900"
						>
							<ScoreCompletionMark />Scores complete
						</span>{/if}
					{#if isDraft}
						<Badge variant="secondary">Draft</Badge>
					{:else}
						<Badge>Submitted</Badge>
					{/if}
				</div>
				{#if scoresComplete && isDraft}<p role="status" class="text-sm font-medium text-green-900">
						All required scores are saved. This card is still Draft — review and submit it
						separately.
					</p>{/if}
				<Card.Description>
					{#if group.scorekeeperName}
						Scorekeeper: {group.scorekeeperName}{group.scorekeeperHasAccess
							? ''
							: ' — no scoring access (Viewer role; assignment alone grants nothing)'}.
					{:else}
						No scorekeeper assigned to this group.
					{/if}
					{#if scorecard?.status === 'submitted' && scorecard.submittedByName}
						Submitted by {scorecard.submittedByName}.
					{/if}
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				{#if groupAthletes.length === 0}
					<p class="text-sm text-muted-foreground">No athletes assigned to this group.</p>
				{:else}
					{#if editable && !showReview && currentHole}
						<section class="space-y-4" aria-label="Current hole">
							<div>
								<p class="text-sm text-muted-foreground">
									Hole {currentIndex + 1} of {round.holes.length}
								</p>
								<h2 class="text-lg font-semibold">
									Hole {currentHole.number + round.displayOffset} — {currentHole.name}
								</h2>
								<p class="text-sm">
									Par {currentHole.par}{round.positionLabel
										? ` · ${round.positionLabel} positions`
										: ''}
								</p>
							</div>
							<p class="text-sm text-muted-foreground">
								Use − or + to record a score, or Confirm par. Each score saves immediately. Complete
								all players before continuing.
							</p>
							{#each groupAthletes as athlete (athlete.athlete)}
								<div
									class={`flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 ${!pendingSaves && hasSavedScore(athlete.athlete, currentHole.id) ? 'border-green-300 bg-green-50' : ''}`}
								>
									<div>
										<p class="flex items-center gap-2 font-medium">
											{#if !pendingSaves && hasSavedScore(athlete.athlete, currentHole.id)}<ScoreCompletionMark
												/><span class="sr-only">Score saved:</span>{/if}{athlete.athleteName}
										</p>
										<p class="text-sm text-muted-foreground">{athlete.teamName}</p>
									</div>
									{#key `${round.id}:${group.id}:${currentHole.id}:${athlete.athlete}`}
										<ScoreStepper
											roundId={round.id}
											groupId={group.id}
											athleteId={athlete.athlete}
											holeId={currentHole.id}
											athleteName={athlete.athleteName}
											holeNumber={currentHole.number + round.displayOffset}
											par={currentHole.par}
											strokes={strokesFor(athlete.athlete, currentHole.id)}
											onPending={trackSave}
										/>
									{/key}
								</div>
							{/each}
							<p role="status" class="text-sm">
								{pendingSaves
									? 'Saving scores…'
									: holeMissing
										? `${holeMissing} players still need a confirmed score.`
										: 'All scores for this hole are saved.'}
							</p>
							<div class="flex flex-wrap gap-2">
								<Button
									type="button"
									variant="outline"
									disabled={currentIndex === 0 || pendingSaves > 0}
									onclick={() => openHole(round.holes[currentIndex - 1].id)}
									style="background-color: #16a34a !important; color: white !important;"
								>
									Previous hole
								</Button>
								<Button
									type="button"
									disabled={holeMissing > 0 || pendingSaves > 0}
									onclick={nextHole}
								>
									{currentIndex === round.holes.length - 1 ? 'Review scorecard' : 'Next hole'}
								</Button>
								<Button
									type="button"
									variant="outline"
									disabled={pendingSaves > 0 || submitting}
									onclick={() => (reviewing[cardKey] = true)}
								>
									View scorecard
								</Button>
							</div>
						</section>
					{/if}
					{#if editable && !round.holes.length}
						<p class="text-sm text-muted-foreground">
							This round needs course holes before scores can be entered.
						</p>
					{/if}
					<div class="flex items-center gap-2">
						<h2 class="font-semibold">
							Saved scorecard · Round {round.number}{round.positionLabel
								? ` · ${round.positionLabel}`
								: ''}
						</h2>
						{#if scoresComplete}<ScoreCompletionMark />{/if}
					</div>
					<p class="text-sm text-muted-foreground">
						Current saved strokes, one hole per row. Missing scores stay as dashes. Detailed edits
						are in Recent change history below.
					</p>
					{#if editable && showReview}
						<Button
							type="button"
							variant="outline"
							disabled={submitting || pendingSaves > 0}
							onclick={() => (reviewing[cardKey] = false)}
						>
							Back to hole entry
						</Button>
					{/if}
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<caption class="sr-only">
								Saved strokes for Round {round.number}, {group.name}
							</caption>
							<thead>
								<tr class="border-b text-left">
									<th scope="col" class="py-1.5 pr-2 font-medium">Hole</th>
									{#each groupAthletes as ga (ga.athlete)}
										<th scope="col" class="px-1 py-1.5 text-center font-medium">
											{ga.athleteName}
											<span class="block text-xs font-normal text-muted-foreground">
												{ga.teamName}
											</span>
										</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each round.holes as hole (hole.id)}
									<tr class={holeComplete(hole.id) ? 'border-b bg-green-50' : 'border-b'}>
										<td class="py-1.5 pr-2">
											<!-- Display numbering may continue (10–18 on a second pass);
											     scores stay keyed by the physical hole. -->
											<span class="inline-flex items-center gap-2 font-medium">
												{#if holeComplete(hole.id)}<ScoreCompletionMark /><span class="sr-only">
														All scores saved for hole
													</span>{/if}{hole.number + round.displayOffset}
											</span>
											{#if editable}<button
													type="button"
													disabled={submitting || pendingSaves > 0}
													onclick={() => openHole(hole.id)}
													class="ml-2 text-xs underline"
													aria-label="Edit hole {hole.number + round.displayOffset}"
												>
													Edit
												</button>{/if}
											<span class="block text-xs text-muted-foreground">
												{hole.name} · Par {hole.par}{hole.positionMissing
													? ' · ⚠ position missing'
													: ''}
											</span>
										</td>
										{#each groupAthletes as ga (ga.athlete)}
											<td class="px-1 py-1 text-center">
												<span
													class={strokesFor(ga.athlete, hole.id) === null
														? 'text-muted-foreground'
														: ''}
												>
													{strokesFor(ga.athlete, hole.id) ?? '—'}
												</span>
											</td>
										{/each}
									</tr>
								{/each}
								<tr>
									<td class="py-1.5 pr-2 font-medium">Total</td>
									{#each groupAthletes as ga (ga.athlete)}
										{@const total = athleteTotal(ga.athlete)}
										<td class="px-1 py-1.5 text-center font-medium">
											{total.recorded ? total.total : '—'}
											{#if total.missing > 0}<span
													class="block text-xs font-normal text-muted-foreground"
												>
													{total.recorded ? 'Partial' : 'Not started'} · {total.missing} missing
												</span>{/if}
										</td>
									{/each}
								</tr>
							</tbody>
						</table>
					</div>

					{#if missingCount > 0}
						<Alert.Root>
							<CircleAlert class="size-4" />
							<Alert.Title>{missingCount} score{missingCount === 1 ? '' : 's'} missing</Alert.Title>
							<Alert.Description>
								Missing scores block submission and are never stored as zero.
							</Alert.Description>
						</Alert.Root>
					{/if}

					{#if editable && showReview}
						<div class="flex flex-wrap items-center gap-2">
							<form
								method="POST"
								action="?/submitScorecard"
								use:enhance={({ cancel }) => {
									if (!round || !group || !scoresComplete || pendingSaves || submitting) {
										cancel();
										return;
									}
									const submittedRound = round.id,
										submittedGroup = group.id,
										submittedLabel = roundLabel(round.id);
									navigationNotice = '';
									submitting = true;
									return async ({ result, update }) => {
										try {
											await update({ reset: false });
											await tick();
											if (result.type === 'success' && result.data?.submitted) {
												const next = firstUnsubmittedRound(
													orderedRounds,
													data.scorecards,
													submittedGroup
												);
												selectedGroup = submittedGroup;
												selectedRound = next ?? submittedRound;
												navigationNotice = next
													? `${submittedLabel} submitted. Continue with ${roundLabel(next)} for this group.`
													: `${submittedLabel} submitted. All rounds for this group are submitted.`;
												await tick();
												activeRoundHeading?.focus();
												activeRoundHeading?.scrollIntoView({ block: 'start' });
											}
										} finally {
											submitting = false;
										}
									};
								}}
							>
								<input type="hidden" name="round" value={round.id} />
								<input type="hidden" name="group" value={group.id} />
								<Button type="submit" disabled={!scoresComplete || pendingSaves > 0 || submitting}>
									<Send class="mr-1 size-4" />
									{submitting ? 'Submitting…' : `Submit Round ${round.number} scorecard`}
								</Button>
							</form>
							<form method="POST" action="?/fillDemoScores">
								<input type="hidden" name="round" value={round.id} />
								<input type="hidden" name="group" value={group.id} />
								<Button variant="outline" type="submit">
									Fill with demo scores (demo data — not real entry)
								</Button>
							</form>
						</div>
					{:else if scorecard?.status === 'submitted'}
						<div class="flex flex-wrap items-center gap-2">
							<p class="flex items-center gap-1.5 text-sm text-muted-foreground">
								<ClipboardCheck class="size-4" />
								Submitted — locked against silent changes.
							</p>
							{#if data.canManage && (!data.resultStatus || data.resultStatus === 'correcting')}
								<form method="POST" action="?/reopenScorecard" class="flex items-center gap-2">
									<input type="hidden" name="scorecard" value={scorecard.id} />
									<input
										type="text"
										name="reason"
										required
										placeholder="Reason for reopening (recorded)"
										aria-label="Reason for reopening"
										class="h-8 rounded-md border border-input bg-background px-2 text-sm"
									/>
									<Button variant="outline" size="sm" type="submit">Reopen to draft</Button>
								</form>
							{:else if data.resultStatus && data.resultStatus !== 'correcting'}
								<p class="text-sm text-muted-foreground">
									The event's official result is {data.resultStatus} — reopen the result (with a reason)
									before reopening a scorecard.
								</p>
							{/if}
						</div>
					{/if}
				{/if}
			</Card.Content>
		</Card.Root>

		{#if cardChanges.length > 0}
			<details class="rounded-lg border p-4">
				<summary class="flex cursor-pointer items-center gap-2 font-semibold">
					<History class="size-4" aria-hidden="true" />Recent change history ({cardChanges.length})
				</summary>
				<p class="my-3 text-sm text-muted-foreground">
					Recent audit entries returned for this card, newest first. This is an edit log, not
					another scorecard or a complete event audit export.
				</p>
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<caption class="sr-only">
							Recent score changes for Round {round.number}, {group.name}
						</caption><thead>
							<tr class="border-b text-left">
								{#each ['Time (UTC)', 'Who', 'Action', 'Athlete', 'Hole', 'Before', 'After', 'Reason'] as label (label)}<th
										scope="col"
										class="p-2 whitespace-nowrap"
									>
										{label}
									</th>{/each}
							</tr>
						</thead><tbody>
							{#each cardChanges as change, index (index)}<tr class="border-b">
									<td class="p-2 whitespace-nowrap">
										{change.created ? change.created.replace('T', ' ').slice(0, 19) : '—'}
									</td><td class="p-2">{change.authorName}</td><td class="p-2">
										{change.action}
									</td><td class="p-2">{change.athleteName ?? '—'}</td><td class="p-2">
										{change.holeNumber ? change.holeNumber + round.displayOffset : '—'}
									</td><td class="p-2 text-center">{change.prevStrokes ?? '—'}</td><td
										class="p-2 text-center"
									>
										{change.newStrokes ?? '—'}
									</td><td class="p-2">{change.reason ?? '—'}</td>
								</tr>{/each}
						</tbody>
					</table>
				</div>
			</details>
		{/if}
	{/if}
</section>
