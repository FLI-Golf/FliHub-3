<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { enhance } from '$app/forms';
	import { formatTournamentPurse } from '$lib/season-purse';
	import {
		minimumPerProCents,
		placeShares,
		tournamentAwards,
		type PayoutEvent
	} from '$lib/standings-payouts';
	import * as Card from '$lib/components/ui/card/index.js';
	import { toParDisplay, type StandingsRow, type StandingsTable } from '$lib/public-page';

	interface Props {
		standings: StandingsTable[];
		canAdjustPayouts?: boolean;
		/** Rendering context marker for test selectors. */
		testid?: string;
	}

	let { standings, testid = 'standings', canAdjustPayouts = false }: Props = $props();
	let sortBy = $state('rank');

	let drafts = $state<Record<string, number>>({});
	let lowerDrafts = $state<Record<string, number>>({});
	let modeDrafts = $state<Record<string, boolean>>({});
	let eventDrafts = $state<Record<string, { top?: number; lower?: number }>>({});
	let saving = $state(false);
	let saveStatus = $state<{ ok: boolean; message: string } | null>(null);
	let selectedEvent = $state('');
	const payoutEvents = $derived(standings.flatMap((table) => table.payoutEvents ?? []));
	const chartEvent = $derived(
		payoutEvents.find((event) => event.event === selectedEvent) ?? payoutEvents[0]
	);
	const topWeight = $derived(chartEvent ? curveFor(chartEvent).top : 0);
	const lowerWeight = $derived(chartEvent ? curveFor(chartEvent).lower : 0);
	const perTournament = $derived(chartEvent ? perTournamentFor(chartEvent) : false);
	const dirty = $derived(
		!!chartEvent &&
			(perTournament !== (chartEvent.perTournament ?? false) ||
				topWeight !== savedCurve(chartEvent).top ||
				lowerWeight !== savedCurve(chartEvent).lower)
	);

	const resettable = $derived(
		Boolean(
			payoutEvents.some(
				(event) =>
					event.leagueId === chartEvent?.leagueId &&
					((event.topWeight ?? 0) !== 0 ||
						(event.lowerWeight ?? 0) !== 0 ||
						event.perTournament ||
						event.eventCurve)
			)
		)
	);

	function perTournamentFor(event: PayoutEvent) {
		return (
			(event.leagueId ? modeDrafts[event.leagueId] : undefined) ?? event.perTournament ?? false
		);
	}

	function savedCurve(event: PayoutEvent) {
		const own = event.perTournament ? event.eventCurve : undefined;
		return { top: own?.top ?? event.topWeight ?? 0, lower: own?.lower ?? event.lowerWeight ?? 0 };
	}

	function curveFor(event: PayoutEvent) {
		if (perTournamentFor(event)) {
			const draft = eventDrafts[event.event];
			const own = event.eventCurve;
			return {
				top: draft?.top ?? own?.top ?? event.topWeight ?? 0,
				lower: draft?.lower ?? own?.lower ?? event.lowerWeight ?? 0
			};
		}
		const league = event.leagueId;
		return {
			top: (league ? drafts[league] : undefined) ?? event.topWeight ?? 0,
			lower: (league ? lowerDrafts[league] : undefined) ?? event.lowerWeight ?? 0
		};
	}

	function previewLower(weight: number) {
		if (chartEvent?.leagueId) {
			if (perTournament)
				eventDrafts[chartEvent.event] = { ...eventDrafts[chartEvent.event], lower: weight };
			else lowerDrafts[chartEvent.leagueId] = weight;
		}
		saveStatus = null;
	}

	function setPerTournament(on: boolean) {
		if (chartEvent?.leagueId) modeDrafts[chartEvent.leagueId] = on;
		saveStatus = null;
	}

	function previewCurve(weight: number) {
		if (chartEvent?.leagueId) {
			if (perTournament)
				eventDrafts[chartEvent.event] = { ...eventDrafts[chartEvent.event], top: weight };
			else drafts[chartEvent.leagueId] = weight;
		}
		saveStatus = null;
	}

	const chartShares = $derived(
		chartEvent?.purseCents == null
			? null
			: placeShares(chartEvent.purseCents, chartEvent.teams.length, topWeight, lowerWeight)
	);
	const earningsByEvent = $derived(
		new Map(
			payoutEvents.map((event) => [
				event.event,
				tournamentAwards(event, curveFor(event).top, curveFor(event).lower)
			])
		)
	);

	type Earnings = Map<string, { cents: number; pending: boolean }>;

	function earningsFor(events: PayoutEvent[], athletes: boolean): Earnings {
		const earnings: Earnings = new SvelteMap();
		for (const event of events) {
			for (const award of earningsByEvent.get(event.event)?.awards ?? []) {
				for (const id of athletes ? award.athletes : [award.entry]) {
					const previous = earnings.get(id) ?? { cents: 0, pending: false };
					earnings.set(id, {
						cents: previous.cents + (athletes ? award.athleteCents[id] : award.perPro * 2),
						pending: previous.pending || award.pending
					});
				}
			}
		}
		return earnings;
	}

	function sorted(rows: StandingsRow[], order: string, earnings: Earnings) {
		if (order === 'rank') return rows;
		return [...rows].sort((a, b) => {
			let comparison = 0;
			switch (order) {
				case 'strokes':
					comparison = a.total - b.total;
					break;
				case 'par':
					comparison = (a.diff ?? Number.MAX_SAFE_INTEGER) - (b.diff ?? Number.MAX_SAFE_INTEGER);
					break;
				case 'events':
					comparison = b.played - a.played;
					break;
				case 'earnings':
					comparison =
						(earnings.get(b.id ?? '')?.cents ?? -1) - (earnings.get(a.id ?? '')?.cents ?? -1);
					break;
			}
			return comparison || a.name.localeCompare(b.name);
		});
	}
</script>

{#if standings.length === 0}
	<p class="text-sm text-muted-foreground" data-testid="{testid}-empty">
		No published official results yet — standings appear once an event's official result is
		published.
	</p>
{:else}
	<label class="flex w-fit flex-wrap items-center gap-2 text-sm font-medium">
		Sort standings
		<select
			bind:value={sortBy}
			class="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-blue-950"
		>
			<option value="rank">Official rank</option>
			<option value="strokes">Strokes · lowest first</option>
			<option value="par">To par · lowest first</option>
			<option value="events">Events played · most first</option>
			<option value="name">Name · A–Z</option>
			{#if payoutEvents.length}<option value="earnings">Estimated earnings · highest first</option
				>{/if}
		</select>
	</label>
	{#if canAdjustPayouts && chartEvent}
		<Card.Root class="border-emerald-200 bg-emerald-50">
			<Card.Header>
				<Card.Title>Payout curve preview</Card.Title>
				<Card.Description>
					Adjust the share awarded to top finishers. Every pro starts at
					{formatTournamentPurse(minimumPerProCents)}. Save to use this curve for all seasons in the
					league.
				</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-4">
				<label class="grid gap-1 text-sm font-medium">
					Tournament
					<select
						class="w-fit rounded-md border bg-white px-3 py-2"
						value={chartEvent.event}
						disabled={saving}
						onchange={(event) => {
							selectedEvent = event.currentTarget.value;
							saveStatus = null;
						}}
					>
						{#each payoutEvents as event (event.event)}
							<option value={event.event}>{event.eventName}</option>
						{/each}
					</select>
				</label>
				<label class="flex items-center gap-2 text-sm font-medium">
					<input
						type="checkbox"
						checked={perTournament}
						disabled={saving || !chartEvent.leagueId}
						onchange={(event) => setPerTournament(event.currentTarget.checked)}
						class="size-4 accent-emerald-700"
					/>
					Set the curve separately for each tournament
				</label>
				{#if perTournament}
					<p class="text-sm">
						Editing {chartEvent.eventName} only. Tournaments without their own saved curve use the league
						curve. Unchecking keeps the saved tournament curves but ignores them.
					</p>
				{/if}
				<div class="flex flex-wrap items-end gap-3">
					<label class="grid w-full max-w-md gap-2 text-sm font-medium">
						Top-place emphasis · {topWeight}%
						<input
							type="range"
							min="0"
							max="100"
							step="1"
							value={topWeight}
							disabled={saving || !chartEvent.leagueId}
							oninput={(event) => previewCurve(event.currentTarget.valueAsNumber)}
							class="w-full accent-emerald-700"
						/>
					</label>
					<label class="grid w-full max-w-md gap-2 text-sm font-medium">
						Places 7–12 boost · {lowerWeight}%
						<input
							type="range"
							min="0"
							max="100"
							step="1"
							value={lowerWeight}
							disabled={saving || !chartEvent.leagueId}
							oninput={(event) => previewLower(event.currentTarget.valueAsNumber)}
							class="w-full accent-emerald-700"
						/>
					</label>
					<button
						type="button"
						class="rounded-md border bg-white px-3 py-2 text-sm font-medium"
						disabled={saving || !chartEvent.leagueId}
						onclick={() => {
							previewCurve(0);
							previewLower(0);
						}}>Preview standard curve</button
					>
				</div>
				{#if chartEvent.leagueId}
					<form
						method="POST"
						action="?/saveLeaguePayoutCurve"
						class="flex flex-wrap items-center gap-3"
						use:enhance={({ cancel }) => {
							const league = chartEvent?.leagueId;
							if (!league || saving) {
								cancel();
								return;
							}
							saving = true;
							saveStatus = null;
							return async ({ result, update }) => {
								try {
									if (result.type === 'success') {
										await update({ reset: false });
										delete drafts[league];
										delete lowerDrafts[league];
										delete modeDrafts[league];
										delete eventDrafts[chartEvent?.event ?? ''];
										saveStatus = { ok: true, message: 'League payout curve saved.' };
									} else {
										saveStatus = {
											ok: false,
											message:
												result.type === 'failure' && typeof result.data?.message === 'string'
													? result.data.message
													: 'Save could not be confirmed. Refresh to check the saved curve.'
										};
									}
								} catch {
									saveStatus = { ok: false, message: 'Refresh to check the saved curve.' };
								} finally {
									saving = false;
								}
							};
						}}
					>
						<input type="hidden" name="league" value={chartEvent.leagueId} />
						<input type="hidden" name="topWeight" value={topWeight} />
						<input type="hidden" name="lowerWeight" value={lowerWeight} />
						<input type="hidden" name="perTournament" value={perTournament ? '1' : '0'} />
						<input type="hidden" name="event" value={chartEvent.event} />
						<button
							type="submit"
							disabled={saving || !dirty}
							class="rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50"
						>
							{saving ? 'Saving…' : 'Save league payout curve'}
						</button>
						<p class="text-sm">
							{chartEvent.leagueName} · Saved: top-place {savedCurve(chartEvent).top}% · places 7–12 {savedCurve(
								chartEvent
							).lower}%{chartEvent.perTournament ? ' · per tournament' : ''}
						</p>
					</form>
					<form
						method="POST"
						action="?/resetLeaguePayoutCurve"
						use:enhance={({ cancel }) => {
							if (
								saving ||
								!confirm(
									"Reset this league's payout curves to the standard settings? This clears the league curve and every saved tournament curve."
								)
							) {
								cancel();
								return;
							}
							saving = true;
							saveStatus = null;
							return async ({ result, update }) => {
								try {
									if (result.type === 'success') {
										await update({ reset: false });
										drafts = {};
										lowerDrafts = {};
										modeDrafts = {};
										eventDrafts = {};
										saveStatus = {
											ok: true,
											message: 'Payout curves reset to the standard settings.'
										};
									} else {
										saveStatus = {
											ok: false,
											message:
												result.type === 'failure' && typeof result.data?.message === 'string'
													? result.data.message
													: 'Reset could not be confirmed. Refresh to check the saved curve.'
										};
									}
								} catch {
									saveStatus = { ok: false, message: 'Refresh to check the saved curve.' };
								} finally {
									saving = false;
								}
							};
						}}
					>
						<input type="hidden" name="league" value={chartEvent.leagueId} />
						<button
							type="submit"
							disabled={saving || !resettable}
							class="rounded-md border bg-white px-3 py-2 text-sm font-medium disabled:opacity-50"
						>
							Reset all to standard
						</button>
					</form>
				{:else}
					<p class="text-sm">
						League settings are unavailable. Check that PocketBase has loaded the payout migration.
					</p>
				{/if}
				{#if saveStatus}
					<p
						role={saveStatus.ok ? 'status' : 'alert'}
						class={saveStatus.ok ? 'text-sm text-emerald-900' : 'text-sm text-red-800'}
					>
						{saveStatus.message}
					</p>
				{/if}
				{#if chartShares}
					<p class="text-sm font-semibold">
						{formatTournamentPurse(chartEvent.purseCents ?? 0)} tournament purse · per-pro amounts by
						place
					</p>
					<ol class="grid gap-2">
						{#each chartShares as cents, index (index)}
							<li class="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2 text-sm">
								<span>#{index + 1}</span>
								<div aria-hidden="true" class="h-4 overflow-hidden rounded bg-white">
									<div
										class="h-full rounded bg-emerald-700"
										style:width={`${(cents / chartShares[0]) * 100}%`}
									></div>
								</div>
								<span class="font-semibold tabular-nums">{formatTournamentPurse(cents)}</span>
							</li>
						{/each}
					</ol>
				{:else}
					<p class="text-sm">
						A tournament purse that covers the minimum for all teams is needed for this preview.
					</p>
				{/if}
			</Card.Content>
		</Card.Root>
	{:else if canAdjustPayouts}
		<p class="text-sm text-muted-foreground">
			The payout chart needs published season results. If you already published results, restart
			development PocketBase to load the updated standings hook.
		</p>
	{/if}
	{#each standings as table (table.scope === 'season' ? table.season : table.event)}
		{@const payoutRows = table.payoutEvents ?? []}
		{@const teamEarnings = earningsFor(payoutRows, false)}
		{@const athleteEarnings = earningsFor(payoutRows, true)}
		{@const unavailable = payoutRows.filter((event) => !earningsByEvent.get(event.event))}
		{@const held = payoutRows.reduce(
			(total, event) => total + (earningsByEvent.get(event.event)?.held ?? 0),
			0
		)}
		{@const unallocated = payoutRows.reduce(
			(total, event) => total + (earningsByEvent.get(event.event)?.unallocated ?? 0),
			0
		)}
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
				{#if payoutRows.length}
					<div class="space-y-1 text-sm text-muted-foreground">
						<p>
							Estimated earnings use published results and equal shares for the two pros on each
							team.
						</p>
						{#if held}<p class="font-medium text-amber-900">
								{formatTournamentPurse(held)} held for pending playoffs.
							</p>{/if}
						{#if unallocated}<p>
								{formatTournamentPurse(unallocated)} remains unallocated to keep tied awards and pro shares
								equal.
							</p>{/if}
						{#if unavailable.length}
							<p>
								Earnings unavailable for {unavailable.map((event) => event.eventName).join(', ')}.
								Check the tournament purse and two-pro lineups.
							</p>
						{/if}
					</div>
				{/if}
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
								{#if payoutRows.length}<th class="px-2 py-1.5 text-right font-medium"
										>Estimated earnings</th
									>{/if}
							</tr>
						</thead>
						<tbody>
							{#each sorted(table.teams, sortBy, teamEarnings) as row, index (row.id ?? index)}
								{@const par = toParDisplay(row.total, row.par)}
								{@const award = teamEarnings.get(row.id ?? '')}
								<tr class="border-b bg-white last:border-0 even:bg-slate-300">
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
									{#if payoutRows.length}
										<td class="px-2 py-1.5 text-right font-semibold whitespace-nowrap tabular-nums">
											{award && (!award.pending || award.cents)
												? formatTournamentPurse(award.cents)
												: '—'}
											{#if award?.pending}<span class="block text-xs text-amber-900"
													>Playoff pending</span
												>{/if}
										</td>
									{/if}
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
								<th class="py-1.5 pr-2 font-medium">Team</th>
								<th class="px-1 py-1.5 text-center font-medium">Events</th>
								<th class="px-1 py-1.5 text-center font-medium">Strokes</th>
								<th class="px-1 py-1.5 text-center font-medium">To par</th>
								{#if payoutRows.length}<th class="px-2 py-1.5 text-right font-medium"
										>Estimated earnings</th
									>{/if}
							</tr>
						</thead>
						<tbody>
							{#each sorted(table.athletes, sortBy, athleteEarnings) as row, index (row.id ?? index)}
								{@const par = toParDisplay(row.total, row.par)}
								{@const award = athleteEarnings.get(row.id ?? '')}
								<tr class="border-b bg-white last:border-0 even:bg-slate-300">
									<td class="py-1.5 pr-2">
										{#if row.rank === null}
											<span class="text-xs text-muted-foreground">Unranked</span>
										{:else}
											{row.rank}
										{/if}
									</td>
									<td class="py-1.5 pr-2">{row.name}</td>
									<td class="py-1.5 pr-2">{row.teamNames?.join(' · ') || '—'}</td>
									<td class="px-1 py-1.5 text-center">{row.played} of {row.eventsCounted}</td>
									<td class="px-1 py-1.5 text-center font-medium">{row.total}</td>
									<td class="px-1 py-1.5 text-center font-medium {par.className}">{par.label}</td>
									{#if payoutRows.length}
										<td class="px-2 py-1.5 text-right font-semibold whitespace-nowrap tabular-nums">
											{award && (!award.pending || award.cents)
												? formatTournamentPurse(award.cents)
												: '—'}
											{#if award?.pending}<span class="block text-xs text-amber-900"
													>Playoff pending</span
												>{/if}
										</td>
									{/if}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Card.Content>
		</Card.Root>
	{/each}
{/if}
