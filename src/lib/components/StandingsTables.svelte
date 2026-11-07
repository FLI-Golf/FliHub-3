<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { toParDisplay, type StandingsTable } from '$lib/public-page';

	interface Props {
		standings: StandingsTable[];
		/** Rendering context marker for test selectors. */
		testid?: string;
	}

	let { standings, testid = 'standings' }: Props = $props();
</script>

{#if standings.length === 0}
	<p class="text-sm text-muted-foreground" data-testid="{testid}-empty">
		No published official results yet — standings appear once an event's official result is
		published.
	</p>
{:else}
	{#each standings as table (table.scope === 'season' ? table.season : table.event)}
		<Card.Root data-testid="{testid}-table">
			<Card.Header>
				<Card.Title>
					{table.scope === 'season' ? table.seasonName : table.eventName}
				</Card.Title>
				<Card.Description>
					{table.scope === 'season'
						? `Season standings — total strokes summed across ${table.events.length} published ${
								table.events.length === 1 ? 'event' : 'events'
							} (lowest leads; ties share a position; teams and athletes are ranked only after a
							result in every counted event — others show Unranked).`
						: 'Single-event standings from the published official result.'}
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-6">
				<div class="overflow-x-auto">
					<p class="mb-1 text-sm font-medium">Teams</p>
					<table class="w-full text-sm" data-testid="{testid}-teams">
						<thead>
							<tr class="border-b text-left">
								<th class="py-1.5 pr-2 font-medium">#</th>
								<th class="py-1.5 pr-2 font-medium">Team</th>
								<th class="px-1 py-1.5 text-center font-medium">Events</th>
								<th class="px-1 py-1.5 text-center font-medium">Strokes</th>
								<th class="px-1 py-1.5 text-center font-medium">To par</th>
							</tr>
						</thead>
						<tbody>
							{#each table.teams as row (row.name + row.rank)}
								{@const par = toParDisplay(row.total, row.par)}
								<tr class="border-b last:border-0">
									<td class="py-1.5 pr-2">
										{#if row.rank === null}
											<span class="text-xs text-muted-foreground">Unranked</span>
										{:else}
											{row.rank}
										{/if}
									</td>
									<td class="py-1.5 pr-2">{row.name}</td>
									<td class="px-1 py-1.5 text-center">{row.played} of {row.eventsCounted}</td>
									<td class="px-1 py-1.5 text-center font-medium">{row.total}</td>
									<td class="px-1 py-1.5 text-center font-medium {par.className}">{par.label}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="overflow-x-auto">
					<p class="mb-1 text-sm font-medium">Athletes</p>
					<table class="w-full text-sm" data-testid="{testid}-athletes">
						<thead>
							<tr class="border-b text-left">
								<th class="py-1.5 pr-2 font-medium">#</th>
								<th class="py-1.5 pr-2 font-medium">Athlete</th>
								<th class="px-1 py-1.5 text-center font-medium">Events</th>
								<th class="px-1 py-1.5 text-center font-medium">Strokes</th>
								<th class="px-1 py-1.5 text-center font-medium">To par</th>
							</tr>
						</thead>
						<tbody>
							{#each table.athletes as row (row.name + row.rank)}
								{@const par = toParDisplay(row.total, row.par)}
								<tr class="border-b last:border-0">
									<td class="py-1.5 pr-2">
										{#if row.rank === null}
											<span class="text-xs text-muted-foreground">Unranked</span>
										{:else}
											{row.rank}
										{/if}
									</td>
									<td class="py-1.5 pr-2">{row.name}</td>
									<td class="px-1 py-1.5 text-center">{row.played} of {row.eventsCounted}</td>
									<td class="px-1 py-1.5 text-center font-medium">{row.total}</td>
									<td class="px-1 py-1.5 text-center font-medium {par.className}">{par.label}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Card.Content>
		</Card.Root>
	{/each}
{/if}
