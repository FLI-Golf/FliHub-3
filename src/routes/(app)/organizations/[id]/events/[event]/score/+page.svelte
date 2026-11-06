<script lang="ts">
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

	const round = $derived(data.rounds.find((r) => r.id === selectedRound) ?? data.rounds[0] ?? null);
	const group = $derived(data.groups.find((g) => g.id === selectedGroup) ?? data.groups[0] ?? null);
	const groupAthletes = $derived(
		group ? data.groupAthletes.filter((ga) => ga.group === group.id) : []
	);
	const scorecard = $derived(
		round && group
			? (data.scorecards.find((c) => c.round === round.id && c.group === group.id) ?? null)
			: null
	);
	const isDraft = $derived(!scorecard || scorecard.status === 'draft');
	const editable = $derived(data.canScore && isDraft);

	const strokesFor = (athleteId: string, holeId: string) =>
		round
			? (data.scores.find(
					(s) => s.round === round.id && s.athlete === athleteId && s.hole === holeId
				)?.strokes ?? null)
			: null;

	const athleteTotal = (athleteId: string) =>
		round
			? data.scores
					.filter((s) => s.round === round.id && s.athlete === athleteId)
					.reduce((sum, s) => sum + s.strokes, 0)
			: 0;

	/** Demo team score: both athletes' strokes added together; lower wins. */
	const teamTotals = $derived.by(() => {
		if (!round || !group) return [];
		const byEntry: Record<string, { teamName: string; total: number; missing: number }> = {};
		for (const ga of groupAthletes) {
			const bucket = byEntry[ga.entry] ?? { teamName: ga.teamName, total: 0, missing: 0 };
			for (const hole of round.holes) {
				const strokes = strokesFor(ga.athlete, hole.id);
				if (strokes === null) bucket.missing += 1;
				else bucket.total += strokes;
			}
			byEntry[ga.entry] = bucket;
		}
		return Object.values(byEntry);
	});

	const missingCount = $derived(
		round && group
			? groupAthletes.length * round.holes.length -
					data.scores.filter(
						(s) => s.round === round.id && groupAthletes.some((ga) => ga.athlete === s.athlete)
					).length
			: 0
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

	function submitOnChange(event: Event) {
		(event.currentTarget as HTMLInputElement).form?.requestSubmit();
	}
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
					onclick={() => (selectedRound = r.id)}
				>
					Round {r.number} · {r.holeCount} holes{r.positionLabel ? ` · ${r.positionLabel}` : ''}
				</Button>
			{/each}
		</div>

		<div class="flex flex-wrap gap-1.5">
			{#each data.groups as g (g.id)}
				<Button
					variant={group.id === g.id ? 'default' : 'outline'}
					size="sm"
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
											<span class="block text-xs text-muted-foreground">
												{hole.name}{hole.positionMissing ? ' · ⚠ position missing' : ''}
											</span>
										</td>
										{#each groupAthletes as ga (ga.athlete)}
											<td class="px-1 py-1 text-center">
												{#if editable}
													<form method="POST" action="?/enterScore" class="inline">
														<input type="hidden" name="round" value={round.id} />
														<input type="hidden" name="group" value={group.id} />
														<input type="hidden" name="athlete" value={ga.athlete} />
														<input type="hidden" name="hole" value={hole.id} />
														<input
															type="number"
															name="strokes"
															min="1"
															step="1"
															inputmode="numeric"
															value={strokesFor(ga.athlete, hole.id) ?? ''}
															onchange={submitOnChange}
															aria-label={`Strokes for ${ga.athleteName} on hole ${hole.number + round.displayOffset}`}
															class="h-9 w-14 rounded-md border bg-background text-center"
														/>
													</form>
												{:else}
													<span
														class={strokesFor(ga.athlete, hole.id) === null
															? 'text-muted-foreground'
															: ''}
													>
														{strokesFor(ga.athlete, hole.id) ?? '—'}
													</span>
												{/if}
											</td>
										{/each}
									</tr>
								{/each}
								<tr>
									<td class="py-1.5 pr-2 font-medium">Total</td>
									{#each groupAthletes as ga (ga.athlete)}
										<td class="px-1 py-1.5 text-center font-medium">
											{athleteTotal(ga.athlete)}
										</td>
									{/each}
								</tr>
							</tbody>
						</table>
					</div>

					<div class="flex flex-col gap-1 text-sm">
						{#each teamTotals as team (team.teamName)}
							<p>
								<span class="font-medium">{team.teamName}</span>
								— team total {team.total}{team.missing > 0
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

					{#if editable}
						<div class="flex flex-wrap items-center gap-2">
							<form method="POST" action="?/submitScorecard">
								<input type="hidden" name="round" value={round.id} />
								<input type="hidden" name="group" value={group.id} />
								<Button type="submit" disabled={missingCount > 0}>
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
							{#if data.canManage}
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
								: ''}{change.holeNumber ? ` (hole ${change.holeNumber})` : ''}{change.action ===
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
