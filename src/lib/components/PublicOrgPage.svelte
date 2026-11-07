<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import StandingsTables from '$lib/components/StandingsTables.svelte';
	import { toParDisplay, type PublicPagePayload } from '$lib/public-page';

	interface Props {
		page: PublicPagePayload;
	}

	let { page }: Props = $props();

	const org = $derived(page.organization);
	const accent = $derived(org.themePrimary || '');

	function when(value: string): string {
		if (!value) return '';
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
	}
</script>

<article class="flex flex-col gap-8" data-testid="public-page">
	<header
		class="flex flex-col gap-3 rounded-lg border p-6"
		style={accent ? `border-color: ${accent}` : ''}
	>
		<div class="flex items-center gap-4">
			{#if org.logoUrl}
				<img src={org.logoUrl} alt="" class="size-14 shrink-0 rounded object-contain" />
			{/if}
			<div class="flex flex-col gap-1">
				<h1
					class="text-3xl font-semibold tracking-tight"
					style={accent ? `color: ${accent}` : ''}
					data-testid="public-org-name"
				>
					{org.name}
				</h1>
				{#if org.tagline}
					<p class="text-muted-foreground" data-testid="public-org-tagline">{org.tagline}</p>
				{/if}
			</div>
		</div>
	</header>

	{#if page.sections.includes('schedule')}
		<section class="flex flex-col gap-3" data-testid="public-schedule">
			<h2 class="text-xl font-semibold" style={accent ? `color: ${accent}` : ''}>Schedule</h2>
			{#if (page.schedule ?? []).length === 0}
				<p class="text-sm text-muted-foreground">No published events yet.</p>
			{:else}
				<div class="overflow-x-auto rounded-lg border">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b text-left">
								<th class="px-3 py-2 font-medium">Event</th>
								<th class="px-3 py-2 font-medium">Season</th>
								<th class="px-3 py-2 font-medium">Date</th>
								<th class="px-3 py-2 font-medium">Status</th>
							</tr>
						</thead>
						<tbody>
							{#each page.schedule ?? [] as entry (entry.event)}
								<tr class="border-b last:border-0">
									<td class="px-3 py-2">{entry.name}</td>
									<td class="px-3 py-2">{entry.seasonName ?? '—'}</td>
									<td class="px-3 py-2">{when(entry.startsAt)}</td>
									<td class="px-3 py-2 capitalize">{entry.status}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	{/if}

	{#if page.sections.includes('standings')}
		<section class="flex flex-col gap-3" data-testid="public-standings">
			<h2 class="text-xl font-semibold" style={accent ? `color: ${accent}` : ''}>Standings</h2>
			<StandingsTables standings={page.standings ?? []} testid="public-standings" />
		</section>
	{/if}

	{#if page.sections.includes('results')}
		<section class="flex flex-col gap-3" data-testid="public-results">
			<h2 class="text-xl font-semibold" style={accent ? `color: ${accent}` : ''}>Results</h2>
			{#if (page.results ?? []).length === 0}
				<p class="text-sm text-muted-foreground">No published official results yet.</p>
			{:else}
				{#each page.results ?? [] as result (result.event)}
					<Card.Root data-testid="public-result">
						<Card.Header>
							<Card.Title class="flex flex-wrap items-center gap-2">
								{result.eventName}
								{#if result.corrected}
									<!-- Correction indicator (Dustin 2026-11-07): badge + date, no reason. -->
									<Badge variant="outline" data-testid="corrected-badge">
										Corrected {when(result.correctedAt ?? '')}
									</Badge>
								{/if}
							</Card.Title>
							<Card.Description>
								Official published result · {when(result.publishedAt)}
							</Card.Description>
						</Card.Header>
						<Card.Content class="flex flex-col gap-6">
							<div class="overflow-x-auto">
								<p class="mb-1 text-sm font-medium">Teams</p>
								<table class="w-full text-sm" data-testid="public-result-teams">
									<thead>
										<tr class="border-b text-left">
											<th class="py-1.5 pr-2 font-medium">#</th>
											<th class="py-1.5 pr-2 font-medium">Team</th>
											<th class="px-1 py-1.5 text-center font-medium">Strokes</th>
											<th class="px-1 py-1.5 text-center font-medium">To par</th>
										</tr>
									</thead>
									<tbody>
										{#each result.teams as row (row.entry)}
											{@const par = toParDisplay(row.total, row.par)}
											<tr class="border-b last:border-0">
												<td class="py-1.5 pr-2">{row.rank}</td>
												<td class="py-1.5 pr-2">{row.teamName}</td>
												<td class="px-1 py-1.5 text-center font-medium">{row.total}</td>
												<td class="px-1 py-1.5 text-center font-medium {par.className}">
													{par.label}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
							<div class="overflow-x-auto">
								<p class="mb-1 text-sm font-medium">Athletes</p>
								<table class="w-full text-sm" data-testid="public-result-athletes">
									<thead>
										<tr class="border-b text-left">
											<th class="py-1.5 pr-2 font-medium">#</th>
											<th class="py-1.5 pr-2 font-medium">Athlete</th>
											<th class="py-1.5 pr-2 font-medium">Team</th>
											<th class="px-1 py-1.5 text-center font-medium">Strokes</th>
											<th class="px-1 py-1.5 text-center font-medium">To par</th>
										</tr>
									</thead>
									<tbody>
										{#each result.athletes as row (row.athlete)}
											{@const par = toParDisplay(row.total, row.par)}
											<tr class="border-b last:border-0">
												<td class="py-1.5 pr-2">{row.rank}</td>
												<td class="py-1.5 pr-2">{row.athleteName}</td>
												<td class="py-1.5 pr-2">{row.teamName}</td>
												<td class="px-1 py-1.5 text-center font-medium">{row.total}</td>
												<td class="px-1 py-1.5 text-center font-medium {par.className}">
													{par.label}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</Card.Content>
					</Card.Root>
				{/each}
			{/if}
		</section>
	{/if}

	{#if page.sections.includes('teams')}
		<section class="flex flex-col gap-3" data-testid="public-teams">
			<h2 class="text-xl font-semibold" style={accent ? `color: ${accent}` : ''}>Teams</h2>
			{#if (page.teams ?? []).length === 0}
				<p class="text-sm text-muted-foreground">No published teams yet.</p>
			{:else}
				<ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
					{#each page.teams ?? [] as team (team.name)}
						<li class="rounded-lg border px-3 py-2 text-sm">{team.name}</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	{#if page.sections.includes('athletes')}
		<section class="flex flex-col gap-3" data-testid="public-athletes">
			<h2 class="text-xl font-semibold" style={accent ? `color: ${accent}` : ''}>Athletes</h2>
			{#if (page.athletes ?? []).length === 0}
				<p class="text-sm text-muted-foreground">No published athlete profiles yet.</p>
			{:else}
				<ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
					{#each page.athletes ?? [] as athlete (athlete.displayName)}
						<li class="flex flex-col rounded-lg border px-3 py-2 text-sm">
							<span class="font-medium">{athlete.displayName}</span>
							<span class="text-muted-foreground">
								{[athlete.gender, athlete.nationality].filter(Boolean).join(' · ')}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</article>
