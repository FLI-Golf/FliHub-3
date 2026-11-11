<script lang="ts">
 import ScoreStepper from '$lib/components/ScoreStepper.svelte';
 let pendingSaves = $state(0);
 function trackSave(change: number) {
  pendingSaves = Math.max(0, pendingSaves + change);
 }
 import { teeDisplay } from '$lib/tee-times';
	import { resolve } from '$app/paths';
	import { ArrowLeft, CircleAlert, ClipboardCheck, History, Lock, Send } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let selectedRound = $state('');
	let selectedGroup = $state('');

        const round = $derived(data.rounds.find((r) => r.id === (selectedRound || String(formRecord?.activeRound ?? ''))) ?? data.rounds[0] ?? null);
        const group = $derived(data.groups.find((g) => g.id === (selectedGroup || String(formRecord?.activeGroup ?? ''))) ?? data.groups.find((g) => g.scorekeeper === data.currentUserId) ?? data.groups[0] ?? null);
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
        const editable = $derived(isDraft && (data.canManage || (data.myRole === 'scorekeeper' && group?.scorekeeper === data.currentUserId)));

	const strokesFor = (athleteId: string, holeId: string) =>
		round
			? (data.scores.find(
					(s) => s.round === round.id && s.athlete === athleteId && s.hole === holeId
				)?.strokes ?? null)
			: null;


 const selectedHoles = $state<Record<string, string>>({});
 const reviewing = $state<Record<string, boolean>>({});
 const cardKey = $derived(`${round?.id ?? ''}:${group?.id ?? ''}`);
 const currentHole = $derived(
  round?.holes.find((hole) => hole.id === selectedHoles[cardKey]) ??
  round?.holes.find((hole) => groupAthletes.some((athlete) => strokesFor(athlete.athlete, hole.id) === null)) ??
  round?.holes[0] ?? null
 );
 const currentIndex = $derived(round && currentHole ? round.holes.findIndex((hole) => hole.id === currentHole.id) : 0);
 const holeMissing = $derived(currentHole ? groupAthletes.filter((athlete) => strokesFor(athlete.athlete, currentHole.id) === null).length : 0);
 const showReview = $derived(!editable || Boolean(reviewing[cardKey]));
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
                const byEntry: Record<string, { teamName: string; total: number; missing: number; recorded: number }> = {};
		for (const ga of groupAthletes) {
                        const bucket = byEntry[ga.entry] ?? { teamName: ga.teamName, total: 0, missing: 0, recorded: 0 };
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


	const nextRoundId = $derived.by(() => {
		if (!group) return null;
		const ordered = [...data.rounds].sort((a, b) => a.number - b.number);
		const index = ordered.findIndex((candidate) =>
			!data.scorecards.some((card) =>
				card.round === candidate.id &&
				card.group === group.id &&
				card.status === 'submitted'
			)
		);
		return index > 0 ? ordered[index].id : null;
	});

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
  <p class="text-sm font-medium">
   {#if teeSlot && round.teeSchedule}Tee time · {teeDisplay(teeSlot.startsAt, round.teeSchedule.timeZone)}
   {:else}Tee time awaiting setup{/if}
  </p>

	{#if data.canManage && editable}
		<section class="space-y-3 rounded-md border border-amber-400 bg-amber-50 p-4 text-black">
			<h2 class="font-semibold">Demo testing — current scorecard</h2>
			<p class="text-sm">
				Fill missing scores for this group and round with generated test values.
				Existing scores are preserved. Review the results before submitting.
			</p>
			<form method="POST" action="?/fillDemoScores">
				<input type="hidden" name="round" value={round.id} />
				<input type="hidden" name="group" value={group.id} />
				<Button type="submit" disabled={pendingSaves > 0}
					style="background-color: #16a34a; color: white;">
					Fill missing scores with demo data
				</Button>
			</form>
			<Button type="button" variant="outline" disabled={pendingSaves > 0}
				onclick={() => reviewing[cardKey] = true}>
				Review scorecard
			</Button>
		</section>
	{/if}


	<details class="rounded-md border p-4" data-testid="all-holes-overview">
		<summary class="cursor-pointer font-semibold">
			All {data.rounds.reduce((count, item) => count + item.holes.length, 0)} holes
			— {group.name}
		</summary>
		<p class="my-3 text-sm text-muted-foreground">
			Saved scores across all rounds. Missing scores appear as dashes.
		</p>
		<div class="overflow-x-auto">
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
						<tr class="border-b bg-muted">
							<th colspan={groupAthletes.length + 1} class="p-2 text-left">
								Round {overviewRound.number}
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
									{@const strokes = data.scores.find((score) =>
										score.round === overviewRound.id &&
										score.group === group.id &&
										score.athlete === athlete.athlete &&
										score.hole === hole.id
									)?.strokes ?? null}
									<td class="p-2 text-center font-semibold"
										style={strokes === null ? undefined :
											`color: ${strokes < hole.par ? '#dc2626' :
												strokes === hole.par ? '#2563eb' : '#000000'};`}>
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
								item.holes.map((hole) => data.scores.find((score) =>
									score.round === item.id &&
									score.group === group.id &&
									score.athlete === athlete.athlete &&
									score.hole === hole.id
								)?.strokes ?? null)
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
		<div class="flex flex-col gap-1" data-testid="round-picker">
			{#each data.rounds as r, index (r.id)}
				{#if index > 0}
					<p class="pl-2 text-xs text-muted-foreground">— intermission —</p>
				{/if}
				<Button
					variant={round.id === r.id ? 'default' : 'outline'}
					size="sm"
					class="justify-start"
                                        disabled={pendingSaves > 0}
 onclick={() => (selectedRound = r.id)}

	style={r.id === nextRoundId
		? 'background-color: #16a34a; color: white;'
		: undefined}
>
					Round {r.number} · {r.holeCount} holes{r.id === nextRoundId ? ' · Next round' : ''}{r.positionLabel ? ` · ${r.positionLabel}` : ''}
				</Button>
			{/each}
		</div>

		<div class="flex flex-wrap gap-1.5">
			{#each data.groups as g (g.id)}
				<Button
					variant={group.id === g.id ? 'default' : 'outline'}
					size="sm"
                                        disabled={pendingSaves > 0}
 onclick={() => (selectedGroup = g.id)}
				>
					{g.name}
				</Button>
			{/each}
		</div>

		<Card.Root>
			<Card.Header>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<Card.Title class="text-base">
						Round {round.number} · {group.name}
					</Card.Title>
					{#if isDraft}
						<Badge variant="secondary">Draft</Badge>
					{:else}
						<Badge>Submitted</Badge>
					{/if}
				</div>
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
    <p class="text-sm text-muted-foreground">Hole {currentIndex + 1} of {round.holes.length}</p>
    <h2 class="text-lg font-semibold">Hole {currentHole.number + round.displayOffset} — {currentHole.name}</h2>
    <p class="text-sm">Par {currentHole.par}{round.positionLabel ? ` · ${round.positionLabel} positions` : ''}</p>
   </div>
   <p class="text-sm text-muted-foreground">Use − or + to record a score, or Confirm par. Each score saves immediately. Complete all players before continuing.</p>
   {#each groupAthletes as athlete (athlete.athlete)}
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
     <div><p class="font-medium">{athlete.athleteName}</p><p class="text-sm text-muted-foreground">{athlete.teamName}</p></div>
     {#key `${round.id}:${group.id}:${currentHole.id}:${athlete.athlete}`}
      <ScoreStepper roundId={round.id} groupId={group.id} athleteId={athlete.athlete}
       holeId={currentHole.id} athleteName={athlete.athleteName}
       holeNumber={currentHole.number + round.displayOffset} par={currentHole.par}
       strokes={strokesFor(athlete.athlete, currentHole.id)} onPending={trackSave} />
     {/key}
    </div>
   {/each}
   <p role="status" class="text-sm">{pendingSaves ? 'Saving scores…' : holeMissing ? `${holeMissing} players still need a confirmed score.` : 'All scores for this hole are saved.'}</p>
   <div class="flex flex-wrap gap-2">
    <Button type="button" variant="outline" disabled={currentIndex === 0 || pendingSaves > 0}
     onclick={() => openHole(round.holes[currentIndex - 1].id)} style="background-color: #16a34a !important; color: white !important;">Previous hole</Button>
    <Button type="button" disabled={holeMissing > 0 || pendingSaves > 0} onclick={nextHole}>
     {currentIndex === round.holes.length - 1 ? 'Review scorecard' : 'Next hole'}
    </Button>
    <Button type="button" variant="outline" disabled={pendingSaves > 0}
     onclick={() => reviewing[cardKey] = true}>View scorecard</Button>
   </div>
  </section>
 {/if}
 {#if editable && !round.holes.length}
  <p class="text-sm text-muted-foreground">This round needs course holes before scores can be entered.</p>
 {/if}
 {#if showReview}
  <h2 class="font-semibold">Scorecard review</h2>
  {#if editable}
   <Button type="button" variant="outline" onclick={() => reviewing[cardKey] = false}>Back to hole entry</Button>
  {/if}
<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b text-left">
									<th class="py-1.5 pr-2 font-medium">Hole</th>
									{#each groupAthletes as ga (ga.athlete)}
										<th class="px-1 py-1.5 text-center font-medium">
											{ga.athleteName.split(' ')[0]}
											<span class="block text-xs font-normal text-muted-foreground">
												{ga.teamName}
											</span>
										</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each round.holes as hole (hole.id)}
									<tr class="border-b">
										<td class="py-1.5 pr-2">
											<!-- Display numbering may continue (10–18 on a second pass);
											     scores stay keyed by the physical hole. -->
											<span class="font-medium">{hole.number + round.displayOffset}</span>
 {#if editable}<button type="button" onclick={() => openHole(hole.id)} class="ml-2 underline text-xs" aria-label="Edit hole {hole.number + round.displayOffset}">Edit</button>{/if}
											<span class="block text-xs text-muted-foreground">
                                                                                                {hole.name} · Par {hole.par}{hole.positionMissing ? ' · ⚠ position missing' : ''}
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
 {#if total.missing > 0}<span class="block text-xs font-normal text-muted-foreground">{total.recorded ? 'Partial' : 'Not started'} · {total.missing} missing</span>{/if}
										</td>
									{/each}
								</tr>
							</tbody>
						</table>
					</div>
 {/if}

					<div class="flex flex-col gap-1 text-sm">
						{#each teamTotals as team (team.teamName)}
							<p>
								<span class="font-medium">{team.teamName}</span>
                                                                — {team.missing > 0 ? 'partial total' : 'team total'} {team.recorded ? team.total : '—'}{team.missing > 0
									? ` (${team.missing} score${team.missing === 1 ? '' : 's'} missing)`
									: ''}
							</p>
						{/each}
						<p class="text-xs text-muted-foreground">
							Demo team score adds both athletes' strokes; lower is better.
						</p>
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
							<form method="POST" action="?/submitScorecard">
								<input type="hidden" name="round" value={round.id} />
								<input type="hidden" name="group" value={group.id} />
                                                                <Button type="submit" disabled={missingCount > 0 || pendingSaves > 0}>
									<Send class="mr-1 size-4" /> Submit scorecard
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
			<Card.Root>
				<Card.Header>
					<Card.Title class="flex items-center gap-2 text-base">
						<History class="size-4" />
						Change history
					</Card.Title>
				</Card.Header>
				<Card.Content class="flex flex-col gap-1 text-sm">
					{#each cardChanges as change, index (index)}
						<p class="text-muted-foreground">
							<span class="font-medium text-foreground">{change.authorName}</span>
							{change.action}{change.athleteName
								? ` — ${change.athleteName}`
								: ''}{change.holeNumber ? ` (hole ${change.holeNumber + round.displayOffset})` : ''}{change.action ===
							'updated'
								? `: ${change.prevStrokes} → ${change.newStrokes}`
								: change.newStrokes
									? `: ${change.newStrokes}`
									: ''}{change.reason ? ` — reason: ${change.reason}` : ''}
						</p>
					{/each}
				</Card.Content>
			</Card.Root>
		{/if}
	{/if}
</section>
