<script lang="ts">
	import { resolve } from '$app/paths';
	import ScoreCompletionMark from '$lib/components/ScoreCompletionMark.svelte';
	import { ArrowLeft, BadgeCheck, CircleAlert, Flag, History, Lock, Megaphone } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// The OFFICIAL result is the latest PUBLISHED version; an approved-but-
	// unpublished version is pending and never presented as official.
	const officialVersion = $derived(
		data.result && data.result.publishedVersion > 0
			? (data.versions.find((v) => v.version === data.result?.publishedVersion) ?? null)
			: null
	);
	const pendingVersion = $derived(
		data.result && data.result.currentVersion !== data.result.publishedVersion
			? (data.versions.find((v) => v.version === data.result?.currentVersion) ?? null)
			: null
	);
	const reviewTeams = $derived(
		(!data.result || data.result.status === 'correcting') ? data.previewTeams : pendingVersion?.totals.teams ?? officialVersion?.totals.teams ?? []
	);
	const playoffTeams = $derived.by(() => {
		const teams = [...reviewTeams].sort((a, b) => a.total - b.total);
		if (teams.length < 2) return [];
		const start = teams[0].total === teams[1].total ? 0 : 1;
		return teams.slice(start).filter((team) => team.total === teams[start].total);
	});
	const playoffPlace = $derived(playoffTeams[0]?.total === Math.min(...reviewTeams.map((team) => team.total)) ? 1 : 2);
	const attempts = $derived(data.result?.status === 'published' ? (officialVersion?.playoffAttempts ?? []) : []);
	const playoffWinner = $derived(attempts.find((attempt) => attempt.winner)?.winner);
	const latestBands = $derived(attempts[attempts.length - 1]?.bands);
	const pendingEntries = $derived(latestBands?.filter((band) => band.length > 1).flat());
	const finalOrder = $derived.by(() => {
		if (!playoffWinner) return [];
		return latestBands?.flat() ?? [
			playoffWinner, ...playoffTeams.filter((team) => team.entry !== playoffWinner).map((team) => team.entry)
		];
	});
	const playoffAthletes = $derived.by(() => {
		const totals = officialVersion?.totals;
		if (!totals?.hasInjuryHandoff) return totals?.athletes ?? [];
		const round = totals.rounds[totals.rounds.length - 1];
		const hole = round?.holes?.[round.holes.length - 1]?.hole;
		return totals.athletes.filter((row) => round && hole && row.roundScores?.[round.round]?.[hole] !== undefined);
	});
	const playoffLineups = $derived(playoffTeams.filter((team) => !pendingEntries || pendingEntries.includes(team.entry)).map((team) => ({
		...team,
		athletes: playoffAthletes.filter((athlete) => athlete.entry === team.entry)
	})));

	const reviewTies = $derived(tiedTotals(reviewTeams));
	const officialVersionTies = $derived(tiedTotals(officialVersion?.totals.teams ?? []));
	const pendingVersionTies = $derived(tiedTotals(pendingVersion?.totals.teams ?? []));

	function tiedTotals(teams: { total: number }[]) {
		const seen = new Set<number>();
		const ties = new Set<number>();
		for (const { total } of teams) {
			if (seen.has(total)) ties.add(total);
			seen.add(total);
		}
		return ties;
	}

	const allSubmitted = $derived(data.totalCards > 0 && data.submittedCount === data.totalCards);
	const publicationComplete = $derived(
		Boolean(
			data.result?.status === 'published' &&
			officialVersion &&
			data.result.currentVersion === data.result.publishedVersion
		)
	);
	const greenBadge = 'gap-2 border-green-300 bg-green-100 text-green-950';
	const blueBadge = 'gap-2 border-blue-300 bg-blue-100 text-blue-950';
	const amberBadge = 'gap-2 border-amber-300 bg-amber-100 text-amber-950';
	const resultPanelClass = $derived(
		data.result?.status === 'correcting'
			? 'border-amber-300 bg-amber-50/40'
			: publicationComplete
				? 'border-green-300 bg-green-50/40'
				: 'border-blue-200 bg-blue-50/30'
	);

	const formRecord = $derived(
		form && typeof form === 'object' ? (form as Record<string, unknown>) : null
	);
	const message = $derived(
		formRecord && 'message' in formRecord ? String(formRecord.message) : null
	);

	const statusLabel: Record<string, string> = {
		approved: 'Approved — not yet published',
		published: 'Published',
		correcting: 'Under correction'
	};

	function when(value: string): string {
		return value ? value.replace('T', ' ').slice(0, 16) : '';
	}
</script>

<svelte:head>
	<title>Official results — {data.event.name} — FliHub</title>
</svelte:head>

<section class="mx-auto flex max-w-3xl flex-col gap-4 py-4">
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
		<h1 class="text-xl font-semibold tracking-tight">Official results — {data.event.name}</h1>
		<p class="text-sm text-muted-foreground">
			Approval snapshots the submitted scores into a numbered result version; corrections reopen
			with a recorded reason and require reapproval. Published results cannot be silently changed.
		</p>
		{#if !data.canManage}
			<p class="flex items-center gap-1.5 text-sm text-muted-foreground">
				<Lock class="size-3.5" />
				Read-only: approval, publication, and corrections are Owner/Admin actions.
			</p>
		{/if}
	</div>

	{#if playoffTeams.length > 1}
		<section class="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" aria-label="Event playoff">
			<h2 class="flex items-center gap-2 font-bold">
				<Flag class="size-4" aria-hidden="true" />
				Tie for {playoffPlace === 1 ? 'first' : 'second'} · {playoffTeams[0].total} strokes
			</h2>
			<p>{playoffTeams.map((team) => team.teamName).join(' · ')}</p>
			{#if playoffWinner}
				<p class="font-semibold">Shootout winner: {playoffTeams.find((team) => team.entry === playoffWinner)?.teamName}.</p>
				<ul class="grid gap-1" aria-label="Resolved playoff positions">
					{#each finalOrder as entry, index (entry)}
						<li>Place {playoffPlace + index} · {playoffTeams.find((team) => team.entry === entry)?.teamName}</li>
					{/each}
				</ul>
			{:else}
				<p>Playoff pending.</p>
			{/if}
			{#each attempts as attempt, index (index)}
				<p>
					Attempt {index + 1} · {attempt.winner ? 'Decisive' : 'Tie remains'} ·
					{attempt.teams.map((team) =>
						`${playoffTeams.find((row) => row.entry === team.entry)?.teamName}: ${(team.nanometers / 1e9).toFixed(6)} m`
					).join(' · ')}
				</p>
			{/each}
			{#if data.canManage && !playoffWinner}
				{#if data.result?.status !== 'published' || !officialVersion}
					<p>Publish the regulation result before recording the shootout.</p>
				{:else if playoffLineups.some((team) => team.athletes.length !== 2)}
					<p>Each tied team needs exactly two athletes in the published lineup.</p>
				{:else}
					<form method="POST" action="?/recordPlayoff" class="grid gap-4">
						<input type="hidden" name="version" value={officialVersion.version} />
						<input type="hidden" name="attemptCount" value={attempts.length} />
						{#each playoffLineups as team, index (team.entry)}
							<fieldset class="grid gap-2 rounded-md border border-amber-300 p-3">
								<legend class="px-1 font-semibold">{team.teamName}</legend>
								<input type="hidden" name="entry" value={team.entry} />
								{#each team.athletes as athlete, athleteIndex (athlete.athlete)}
									{@const key = `${index}-${athleteIndex}`}
									<input type="hidden" name={`athlete-${key}`} value={athlete.athlete} />
									<div class="flex flex-wrap gap-2">
										<label class="grid flex-1 gap-1">
											{athlete.athleteName} · distance
											<input type="number" name={`distance-${key}`} min="0" max="9999.999" step="0.001" required class="min-h-10 rounded-md border bg-white px-2" />
										</label>
										<label class="grid gap-1">
											Unit
											<select name={`unit-${key}`} class="min-h-10 rounded-md border bg-white px-2">
												<option value="feet">Feet</option><option value="meters">Meters</option><option value="yards">Yards</option>
											</select>
										</label>
									</div>
								{/each}
							</fieldset>
						{/each}
						<Button type="submit" class="w-fit bg-green-700 text-white hover:bg-green-800">Record shootout</Button>
					</form>
				{/if}
			{/if}
		</section>
	{/if}

	{#if data.previewTeams.some((team) => reviewTies.has(team.total) && !playoffTeams.includes(team))}
		<ul class="grid gap-1 text-sm">
			{#each data.previewTeams.filter((team) => reviewTies.has(team.total) && !playoffTeams.includes(team)) as team (team.entry)}
				<li>{team.teamName} · {team.total} strokes <Badge variant="outline" class={amberBadge}>Tied</Badge></li>
			{/each}
		</ul>
	{/if}

	{#if message}
		<Alert.Root variant="destructive">
			<CircleAlert class="size-4" />
			<Alert.Title>Action failed</Alert.Title>
			<Alert.Description>{message}</Alert.Description>
		</Alert.Root>
	{/if}

	<!-- Submission readiness -->
	<Card.Root class={allSubmitted ? 'border-green-300 bg-green-50/40' : ''}>
		<Card.Header>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<Card.Title class="text-base">Submitted scorecards</Card.Title>
				<Badge variant="outline" class={allSubmitted ? greenBadge : amberBadge}>
					{#if allSubmitted}<ScoreCompletionMark />{/if}
					{data.submittedCount}/{data.totalCards} submitted
				</Badge>
			</div>
			<Card.Description>
				Every (round × group) scorecard must be Submitted before approval — missing scores never
				count as zero.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-2">
			{#each data.submissionGrid as row (row.roundId)}
				{@const roundSubmitted =
					row.hasCourse &&
					row.groups.length > 0 &&
					row.groups.every((cell) => cell.status === 'submitted')}
				<div
					class={`flex flex-col gap-3 rounded-xl border p-4 text-sm ${roundSubmitted ? 'border-green-300 bg-green-50' : 'border-amber-200 bg-amber-50/40'}`}
				>
					<span class="flex flex-wrap items-center gap-2 font-semibold">
						{#if roundSubmitted}<ScoreCompletionMark />{/if}Round {row.roundNumber}{row.positionLabel
							? ` · ${row.positionLabel}`
							: ''}
						{#if !row.hasCourse}
							<span class="text-destructive"> — no course (blocks approval)</span>
						{/if}
					</span>
					<div class="flex flex-wrap gap-1.5">
						{#each row.groups as cell (cell.groupName)}
							<Badge
								variant="outline"
								class={`min-h-9 px-3 py-2 ${cell.status === 'submitted' ? greenBadge : amberBadge}`}
							>
								{#if cell.status === 'submitted'}<ScoreCompletionMark />{/if}
								{cell.groupName}: {cell.status}
							</Badge>
						{/each}
					</div>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>

	<!-- Result status + controls -->
	<Card.Root class={resultPanelClass}>
		<Card.Header>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<Card.Title class="flex items-center gap-2 text-base">
					<BadgeCheck
						class={`size-5 ${publicationComplete ? 'text-green-700' : data.result?.status === 'correcting' ? 'text-amber-700' : 'text-blue-700'}`}
					/>
					Official result
				</Card.Title>
				{#if data.result}
					<Badge
						variant="outline"
						class={data.result.status === 'correcting'
							? amberBadge
							: publicationComplete
								? greenBadge
								: blueBadge}
					>
						{#if publicationComplete}<ScoreCompletionMark
							/>{:else if data.result.status === 'approved'}<BadgeCheck
								class="size-4"
								aria-hidden="true"
							/>{/if}
						{publicationComplete
							? 'Published — complete'
							: (statusLabel[data.result.status] ?? data.result.status)} · v{data.result
							.currentVersion}
					</Badge>
				{:else}
					<Badge variant="outline" class={blueBadge}>Not approved yet</Badge>
				{/if}
			</div>
			{#if publicationComplete}<p
					role="status"
					class="flex items-center gap-2 rounded-lg border border-green-300 bg-green-100 p-3 text-sm font-semibold text-green-950"
				>
					<ScoreCompletionMark />Official result published. Approval and publication are complete
					for this version.
				</p>{:else if data.result?.status === 'approved'}<p
					role="status"
					class="rounded-lg border border-blue-300 bg-blue-100 p-3 text-sm text-blue-950"
				>
					Approved and awaiting publication. Publish this version to make it the official result.
				</p>{/if}
			{#if data.result?.status === 'correcting'}
				<Card.Description>
					Under correction{data.result.pendingReason
						? ` — reason: ${data.result.pendingReason}`
						: ''}. Reopen the affected scorecard, correct the scores, resubmit, then reapprove. The
					last published version stays on record below.
				</Card.Description>
			{/if}
		</Card.Header>
		<Card.Content class="flex flex-col gap-3">
			{#if data.canManage}
				{#if !data.result || data.result.status === 'correcting'}
					<p
						class="rounded-xl border-2 border-blue-300 bg-blue-50 p-4 text-sm font-medium text-blue-950"
					>
						<BadgeCheck class="mr-2 inline-block size-5" aria-hidden="true" />
						{allSubmitted
							? 'Next step: approve the submitted scores using the blue button below. Approval creates a result version; publish it afterward to update official and fantasy standings.'
							: 'Next step: submit every required scorecard. Approval becomes available when all cards are submitted.'}
					</p>
				{:else if data.result.status === 'approved'}
					<p
						class="rounded-xl border-2 border-green-300 bg-green-50 p-4 text-sm font-medium text-green-950"
					>
						<Megaphone class="mr-2 inline-block size-5" aria-hidden="true" />Next step: publish the
						approved version using the green button below. Publication makes it available to
						official and fantasy standings.
					</p>
				{/if}
				<div class="flex flex-wrap items-center gap-2">
					{#if !data.result || data.result.status === 'correcting'}
						<form
							method="POST"
							action="?/approveResult"
							class="w-full rounded-xl border border-blue-200 bg-white p-4"
						>
							<input type="hidden" name="result" value={data.result?.id ?? ''} />
							<button
								type="submit"
								disabled={!allSubmitted}
								class="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border-2 border-blue-800 bg-blue-700 px-6 py-3 text-base font-bold text-white shadow-md hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
								data-testid="approve-official-result"
							>
								<BadgeCheck class="size-5" aria-hidden="true" />
								{data.result ? 'Reapprove result · new version' : 'Approve result'}
							</button>
							<p class="mt-3 text-xs text-slate-600">
								{data.submittedCount}/{data.totalCards} scorecards submitted. Approval preserves a numbered
								snapshot; it does not publish it.
							</p>
						</form>
						{#if !allSubmitted}
							<p class="text-sm text-muted-foreground">
								Approval is blocked until every scorecard is submitted.
							</p>
						{/if}
					{/if}
					{#if data.result?.status === 'approved'}
						<form
							method="POST"
							action="?/publishResult"
							class="w-full rounded-xl border border-green-200 bg-white p-4"
						>
							<input type="hidden" name="result" value={data.result.id} />
							<button
								type="submit"
								class="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border-2 border-green-800 bg-green-700 px-6 py-3 text-base font-bold text-white shadow-md hover:bg-green-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-green-700"
								data-testid="publish-official-result"
							>
								<Megaphone class="size-5" aria-hidden="true" />Publish official result
							</button>
						</form>
					{/if}
					{#if data.result && data.result.status !== 'correcting'}
						<form method="POST" action="?/reopenResult" class="flex items-center gap-2">
							<input type="hidden" name="result" value={data.result.id} />
							<input
								type="text"
								name="reason"
								required
								placeholder="Correction reason (recorded)"
								aria-label="Correction reason"
								class="h-8 rounded-md border border-input bg-background px-2 text-sm"
							/>
							<Button variant="outline" size="sm" type="submit">Reopen for correction</Button>
						</form>
					{/if}
				</div>
			{/if}
			{#if officialVersion}
				<div
					class="flex flex-col gap-3 rounded-xl border border-green-300 bg-green-50 p-4"
					data-testid="official-result"
				>
					<p class="flex flex-wrap items-center gap-2 text-sm font-semibold text-green-950">
						<ScoreCompletionMark />Official published result — v{officialVersion.version}, published
						{when(officialVersion.publishedAt)} by {officialVersion.publishedByName}
					</p>
					{#if !publicationComplete}<p class="text-xs text-green-950">
							This is the last published official version. Newer approval or correction work is not
							published yet.
						</p>{/if}
					<div class="overflow-x-auto">
						<table class="w-full text-sm" data-testid="official-totals">
							<thead>
								<tr class="border-b text-left">
									<th class="py-1.5 pr-2 font-medium">Team</th>
									{#each officialVersion.totals.rounds as round (round.round)}
										<th class="px-1 py-1.5 text-center font-medium">R{round.number}</th>
									{/each}
									<th class="px-1 py-1.5 text-center font-medium">Total</th>
								</tr>
							</thead>
							<tbody>
								{#each officialVersion.totals.teams as team (team.entry)}
									<tr class="border-b">
										<td class="py-1.5 pr-2">
											{team.teamName}
											{#if officialVersionTies.has(team.total)}<Badge variant="outline" class={amberBadge}>Tied</Badge>{/if}
										</td>
										{#each officialVersion.totals.rounds as round (round.round)}
											<td class="px-1 py-1.5 text-center">{team.roundTotals[round.round] ?? 0}</td>
										{/each}
										<td class="px-1 py-1.5 text-center font-medium">{team.total}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<p class="text-xs text-muted-foreground">
						Lower team total wins (demo scoring). The official result stays at this published
						version until a corrected version is published.
					</p>
				</div>
			{/if}
			{#if pendingVersion}
				<div
					class="flex flex-col gap-3 rounded-xl border border-blue-300 bg-blue-50 p-4"
					data-testid="pending-result"
				>
					<p class="text-sm font-semibold text-blue-950">
						Approved v{pendingVersion.version} — awaiting publication (NOT the official result until published).
						Approved {when(pendingVersion.approvedAt)} by
						{pendingVersion.approvedByName}.
					</p>
					<div class="overflow-x-auto">
						<table class="w-full text-sm" data-testid="pending-totals">
							<thead>
								<tr class="border-b text-left">
									<th class="py-1.5 pr-2 font-medium">Team</th>
									{#each pendingVersion.totals.rounds as round (round.round)}
										<th class="px-1 py-1.5 text-center font-medium">R{round.number}</th>
									{/each}
									<th class="px-1 py-1.5 text-center font-medium">Total</th>
								</tr>
							</thead>
							<tbody>
								{#each pendingVersion.totals.teams as team (team.entry)}
									<tr class="border-b">
										<td class="py-1.5 pr-2">
											{team.teamName}
											{#if pendingVersionTies.has(team.total)}<Badge variant="outline" class={amberBadge}>Tied</Badge>{/if}
										</td>
										{#each pendingVersion.totals.rounds as round (round.round)}
											<td class="px-1 py-1.5 text-center">{team.roundTotals[round.round] ?? 0}</td>
										{/each}
										<td class="px-1 py-1.5 text-center font-medium">{team.total}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}
			{#if !officialVersion && !pendingVersion}
				<p class="text-sm text-muted-foreground">
					No approved result yet. Once every scorecard is submitted, an Owner/Admin can approve.
				</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- Version history -->
	{#if data.versions.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2 text-base">
					<History class="size-4" />
					Version history
				</Card.Title>
				<Card.Description>
					Previous values are preserved with author, timestamp, and reason.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-2">
				{#each data.versions as version (version.version)}
					<div
						class={`rounded-lg border p-3 text-sm ${version.publishedAt ? 'border-green-200 bg-green-50' : 'border-blue-200 bg-blue-50'}`}
					>
						<p class="font-medium">
							{#if version.publishedAt}<span class="mr-1 inline-flex">
									<ScoreCompletionMark />
								</span>{/if}v{version.version}
							{#if data.result && version.version === data.result.currentVersion}
								<Badge variant="secondary">current</Badge>
							{/if}
						</p>
						<p class="text-muted-foreground">
							Approved {when(version.approvedAt)} by {version.approvedByName}{version.publishedAt
								? `; published ${when(version.publishedAt)} by ${version.publishedByName}`
								: ''}{version.reason ? `; correction reason: ${version.reason}` : ''}
						</p>
						<p class="text-xs text-muted-foreground">
							{#each version.totals.teams.slice(0, 3) as team, index (team.entry)}
								{index > 0 ? ' · ' : ''}{team.teamName} {team.total}
							{/each}{version.totals.teams.length > 3 ? ' · …' : ''}
						</p>
					</div>
				{/each}
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Audit log -->
	{#if data.changes.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Result history</Card.Title>
			</Card.Header>
			<Card.Content class="flex flex-col gap-1 text-sm">
				{#each data.changes as change, index (index)}
					<p class="text-muted-foreground">
						<span class="font-medium text-foreground">{change.authorName}</span>
						{change.action} v{change.version}{change.reason ? ` — reason: ${change.reason}` : ''} · {when(
							change.created
						)}
					</p>
				{/each}
			</Card.Content>
		</Card.Root>
	{/if}
</section>
