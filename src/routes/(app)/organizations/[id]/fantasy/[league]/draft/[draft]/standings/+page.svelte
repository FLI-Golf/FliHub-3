<script lang="ts">
	import { resolve } from '$app/paths';
	import { invalidate } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	const standings = $derived(data.standings);
	let refreshing = $state(false);
	let refreshError = $state('');
	function score(value: number | null): string {
		return value === null
			? 'Incomplete'
			: value === 0
				? 'E'
				: value > 0
					? `+${value}`
					: String(value);
	}
	async function refresh() {
		refreshing = true;
		refreshError = '';
		try {
			await invalidate('fantasy:standings');
		} catch {
			refreshError = 'Could not refresh standings. Try again.';
		} finally {
			refreshing = false;
		}
	}
</script>

<svelte:head><title>Fantasy standings — {standings.league.name} — FliHub</title></svelte:head>
<section class="mx-auto flex max-w-4xl flex-col gap-3 py-2">
	<a
		class="w-fit text-sm underline"
		href={resolve('/(app)/organizations/[id]/fantasy/[league]', {
			id: data.organizationId,
			league: standings.league.id
		})}>Back to fantasy league</a
	>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div>
			<h1 class="text-xl font-semibold">Fantasy standings</h1>
			<p class="text-sm text-muted-foreground">{standings.event.name} · {standings.league.name}</p>
		</div>
		<Button variant="outline" size="sm" onclick={refresh} disabled={refreshing}
			>{refreshing ? 'Refreshing…' : 'Refresh'}</Button
		>
	</div>
	<p class="text-sm">
		Strokes − par. Add all four athletes across every event round. Lowest complete score wins; equal
		totals share a rank.
	</p>
	{#if refreshError}<p role="alert" class="text-sm text-destructive">{refreshError}</p>{/if}
	{#if standings.version !== null}
		<p class="text-xs text-muted-foreground" data-testid="fantasy-result-version">
			Published official result v{standings.version}{standings.version > 1
				? ' · corrected version'
				: ''}
		</p>
	{/if}
	{#if standings.correctionPending}
		<p role="status" class="rounded-md border p-3 text-sm">
			A result correction is pending. These standings continue to use published v{standings.version} until
			the corrected result is published.
		</p>
	{/if}
	{#if standings.state !== 'published'}
		<p role="status" class="rounded-md border p-3" data-testid="fantasy-scoring-state">
			{standings.message}
		</p>
	{:else}
		<div class="overflow-x-auto rounded-lg border">
			<table class="w-full text-sm" data-testid="fantasy-standings">
				<caption class="sr-only"
					>Fantasy standings from published result version {standings.version}</caption
				>
				<thead class="bg-muted"
					><tr
						><th scope="col" class="p-2 text-left">Rank</th><th scope="col" class="p-2 text-left"
							>Participant</th
						><th scope="col" class="p-2 text-right">Score</th></tr
					></thead
				>
				<tbody
					>{#each standings.rows as row (row.user)}
						<tr class="border-t" data-testid="fantasy-standing-row"
							><td class="p-2">{row.rank ?? '—'}</td><th
								scope="row"
								class="p-2 text-left font-medium"
								>{row.name}{#if !row.complete}<span class="block text-xs font-normal"
										>{row.scoredAthletes}/4 athletes scored</span
									>{/if}</th
							><td class="p-2 text-right font-semibold tabular-nums">{score(row.score)}</td></tr
						>
					{/each}</tbody
				>
			</table>
		</div>
		<h2 class="mt-2 font-semibold">Roster scores</h2>
		{#each standings.rows as row (row.user)}
			<details class="rounded-lg border p-3" data-testid="fantasy-roster-explanation">
				<summary class="cursor-pointer text-sm font-medium">{row.name} · {score(row.score)}</summary
				>
				<ul class="mt-2 flex flex-col divide-y text-sm">
					{#each row.athletes as athlete (athlete.athlete)}
						<li class="py-2">
							<div class="flex items-start justify-between gap-2">
								<span class="font-medium"
									>{athlete.name} <span class="text-xs font-normal">{athlete.division}</span></span
								><strong class="tabular-nums">{score(athlete.score)}</strong>
							</div>
							{#if athlete.originalName}<p class="text-xs text-muted-foreground">
									Designated substitute for {athlete.originalName}
								</p>{/if}
							<p class="text-xs text-muted-foreground">{athlete.teamName}</p>
							{#if athlete.score !== null}
								<p class="text-xs">
									{athlete.strokes} strokes − {athlete.par} par = {score(athlete.score)}
								</p>
								<p class="text-xs text-muted-foreground">
									{#each athlete.rounds as round (round.number)}<span class="mr-3 inline-block"
											>R{round.number}: {round.strokes} − {round.par} = {score(round.score)}</span
										>{/each}
								</p>
							{:else}<p class="text-xs">
									Incomplete official athlete data. No zero score has been substituted.
								</p>{/if}
						</li>
					{/each}
				</ul>
			</details>
		{/each}
	{/if}
</section>
