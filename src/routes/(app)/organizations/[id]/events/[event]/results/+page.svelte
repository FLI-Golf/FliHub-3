<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowLeft, BadgeCheck, CircleAlert, History, Lock, Megaphone } from 'lucide-svelte';
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
	const allSubmitted = $derived(data.totalCards > 0 && data.submittedCount === data.totalCards);

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

	{#if message}
		<Alert.Root variant="destructive">
			<CircleAlert class="size-4" />
			<Alert.Title>Action failed</Alert.Title>
			<Alert.Description>{message}</Alert.Description>
		</Alert.Root>
	{/if}

	<!-- Submission readiness -->
	<Card.Root>
		<Card.Header>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<Card.Title class="text-base">Submitted scorecards</Card.Title>
				<Badge variant={allSubmitted ? 'default' : 'secondary'}>
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
				<div class="flex flex-col gap-1 rounded-md border p-2 text-sm">
					<span class="font-medium">
						Round {row.roundNumber}{row.positionLabel ? ` · ${row.positionLabel}` : ''}
						{#if !row.hasCourse}
							<span class="text-destructive"> — no course (blocks approval)</span>
						{/if}
					</span>
					<div class="flex flex-wrap gap-1.5">
						{#each row.groups as cell (cell.groupName)}
							<Badge variant={cell.status === 'submitted' ? 'default' : 'outline'}>
								{cell.groupName}: {cell.status}
							</Badge>
						{/each}
					</div>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>

	<!-- Result status + controls -->
	<Card.Root>
		<Card.Header>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<Card.Title class="flex items-center gap-2 text-base">
					<BadgeCheck class="size-4" />
					Official result
				</Card.Title>
				{#if data.result}
					<Badge variant={data.result.status === 'published' ? 'default' : 'secondary'}>
						{statusLabel[data.result.status] ?? data.result.status} · v{data.result.currentVersion}
					</Badge>
				{:else}
					<Badge variant="outline">Not approved yet</Badge>
				{/if}
			</div>
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
				<div class="flex flex-wrap items-center gap-2">
					{#if !data.result || data.result.status === 'correcting'}
						<form method="POST" action="?/approveResult">
							<input type="hidden" name="result" value={data.result?.id ?? ''} />
							<Button type="submit" disabled={!allSubmitted}>
								{data.result ? 'Reapprove (new version)' : 'Approve result'}
							</Button>
						</form>
						{#if !allSubmitted}
							<p class="text-sm text-muted-foreground">
								Approval is blocked until every scorecard is submitted.
							</p>
						{/if}
					{/if}
					{#if data.result?.status === 'approved'}
						<form method="POST" action="?/publishResult">
							<input type="hidden" name="result" value={data.result.id} />
							<Button type="submit">
								<Megaphone class="mr-1 size-4" /> Publish
							</Button>
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
				<div class="flex flex-col gap-2" data-testid="official-result">
					<p class="text-sm font-medium">
						Official published result — v{officialVersion.version}, published
						{when(officialVersion.publishedAt)} by {officialVersion.publishedByName}
					</p>
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
										<td class="py-1.5 pr-2">{team.teamName}</td>
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
				<div class="flex flex-col gap-2" data-testid="pending-result">
					<p class="text-sm font-medium">
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
										<td class="py-1.5 pr-2">{team.teamName}</td>
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
					<div class="rounded-md border p-2 text-sm">
						<p class="font-medium">
							v{version.version}
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
