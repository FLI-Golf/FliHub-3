<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ArrowLeft, Clock3, Megaphone } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';

	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const board = $derived(data.board);
	const isOwner = $derived(board.league.owner === board.me);

	let nowMs = $state(Date.now());
	let serverOffset = $state(0);
	const deadlineMs = $derived(board.draft.deadline ? Date.parse(board.draft.deadline) : null);
	const remainingSeconds = $derived(
		deadlineMs === null || !Number.isFinite(deadlineMs)
			? null
			: Math.max(0, Math.ceil((deadlineMs - (nowMs + serverOffset)) / 1000))
	);

	// Synchronize against each new server response.
	$effect(() => {
		const serverTime = Date.parse(board.serverNow);
		const receivedAt = Date.now();
		if (Number.isFinite(serverTime)) {
			serverOffset = serverTime - receivedAt;
		}
		nowMs = receivedAt;
	});

	let tickForm: HTMLFormElement | undefined = $state();
	let lastTickAt = 0;

	// One persistent clock loop, independent of board refreshes.
	onMount(() => {
		let refreshing = false;
		let lastRefreshAt = 0;

		const interval = setInterval(() => {
			const currentTime = Date.now();
			nowMs = currentTime;

			if (
				refreshing ||
				currentTime - lastRefreshAt < 1000 ||
				!['ready', 'active', 'paused'].includes(board.draft.status)
			)
				return;

			lastRefreshAt = currentTime;
			if (
				board.draft.status === 'active' &&
				deadlineMs !== null &&
				Number.isFinite(deadlineMs) &&
				currentTime + serverOffset >= deadlineMs &&
				currentTime - lastTickAt >= 1500 &&
				tickForm
			) {
				lastTickAt = currentTime;
				tickForm.requestSubmit();
				return;
			}

			refreshing = true;
			void invalidate('fantasy:board')
				.catch((error: unknown) => {
					console.error('Draft board refresh failed', error);
				})
				.finally(() => {
					refreshing = false;
				});
		}, 250);

		return () => clearInterval(interval);
	});

	const onClockRoster = $derived(
		board.rosters.find((r) => r.user === board.draft.onTheClock?.user) ?? null
	);
	function genderFull(gender: string): boolean {
		if (!onClockRoster) return false;
		const count = gender === 'male' ? onClockRoster.maleCount : onClockRoster.femaleCount;
		return count >= 2;
	}

	const recommendation = $derived(
		board.pool.find(
			(athlete) =>
				athlete.athlete === board.recommendedAthlete &&
				!athlete.pickedBy &&
				!genderFull(athlete.gender)
		) ?? null
	);

	const eligibleCandidates = $derived(
		board.pool.filter((athlete) => {
			if (athlete.pickedBy) return false;
			return (
				!(['active', 'paused'].includes(board.draft.status) && (board.draft.round ?? 0) >= 3) ||
				!genderFull(athlete.gender)
			);
		})
	);

	let athleteSearch = $state('');

	function normalizeSearch(value: string): string {
		return value
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.trim();
	}
	const searchTerm = $derived(normalizeSearch(athleteSearch));
	const searchMatches = $derived(
		eligibleCandidates.filter((athlete) => {
			const searchable = normalizeSearch(`${athlete.name} ${athlete.teamName} ${athlete.division}`);
			return !searchTerm || searchTerm.split(/\s+/).every((word) => searchable.includes(word));
		})
	);
	const candidates = $derived(eligibleCandidates);

	let browserHeartbeat = $state(0);
	$effect(() => {
		const heartbeat = setInterval(() => {
			browserHeartbeat += 1;
		}, 1000);
		return () => clearInterval(heartbeat);
	});
</script>

{#snippet compactRosters()}
	<section class="min-w-0" data-testid="draft-rosters">
		<div class="mb-1">
			<h2 class="text-sm font-semibold">
				{board.draft.status === 'complete' ? 'Final rosters' : 'Rosters'}
			</h2>
		</div>
		<div>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard access to horizontally scrolling roster table.) -->
			<div
				class="overflow-x-auto"
				tabindex="0"
				role="region"
				aria-label="Fantasy participant rosters"
			>
				<table class="w-full min-w-[440px] border-collapse text-xs" data-testid="roster-table">
					<caption class="sr-only">Fantasy participants and their drafted athletes</caption>
					<thead>
						<tr class="border-y bg-muted">
							<th scope="col" class="sticky left-0 z-10 w-28 bg-muted px-2 py-1 text-left"
								>Participant</th
							>
							<th scope="col" class="px-2 py-1 text-left">MPO 1</th>
							<th scope="col" class="px-2 py-1 text-left">MPO 2</th>
							<th scope="col" class="px-2 py-1 text-left">FPO 1</th>
							<th scope="col" class="px-2 py-1 text-left">FPO 2</th>
						</tr>
					</thead>
					<tbody>
						{#each board.rosters as roster (roster.user)}
							{@const current =
								['active', 'paused'].includes(board.draft.status) &&
								board.draft.onTheClock?.user === roster.user}
							<tr
								class="border-b align-top"
								style={current ? 'background-color: #f0fdf4; color: #14532d;' : undefined}
								data-testid="roster-tile"
							>
								<th
									scope="row"
									class="sticky left-0 z-10 px-2 py-1 text-left font-semibold"
									style:background-color={current ? '#f0fdf4' : 'var(--background)'}
								>
									<span class="block max-w-28 break-words">{roster.name}</span>

									{#if current}
										<span class="block text-[10px]"
											>{board.draft.status === 'paused' ? 'Turn paused' : 'On the clock'}</span
										>
									{/if}
								</th>
								{#each ['male', 'female'] as gender (gender)}
									{#each [0, 1] as index (index)}
										{@const slot = roster.athletes.filter((athlete) => athlete.gender === gender)[
											index
										]}
										<td
											class="px-2 py-1"
											style:background-color={gender === 'male' ? '#eff6ff' : '#fdf2f8'}
										>
											{#if slot}
												<div class="max-w-36 text-slate-950" data-testid="roster-slot">
													<span class="block font-medium">{slot.substituteName || slot.name}</span>
													{#if slot.substituteName}
														<span class="block text-[10px]">Substitute for {slot.name}</span>
													{/if}
												</div>
											{:else}
												<span class="text-slate-500" aria-label="Empty roster slot">—</span>
											{/if}
										</td>
									{/each}
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	</section>
{/snippet}

{#snippet availableAthletes()}
	<section class="min-w-0" data-testid="draft-pool">
		<div class="mb-2">
			<h2 class="text-sm font-semibold">Available athletes</h2>
		</div>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard access to the scrolling athlete grid.) -->
		<div
			class="grid max-h-[20dvh] grid-cols-2 gap-2 overflow-y-auto overscroll-contain p-1 sm:grid-cols-3 xl:grid-cols-4"
			tabindex="0"
			role="region"
			aria-label="Available athlete selections"
		>
			{#each candidates as athlete (athlete.athlete)}
				{@const canPick =
					board.draft.status === 'active' &&
					board.myTurn &&
					!genderFull(athlete.gender) &&
					remainingSeconds !== 0}
				<form
					method="POST"
					action="?/pick"
					use:enhance
					class="min-w-0"
					data-testid="pool-athlete"
					data-athlete={athlete.athlete}
				>
					<input type="hidden" name="athlete" value={athlete.athlete} />
					<button
						type="submit"
						disabled={!canPick}
						aria-label={canPick
							? `Pick ${athlete.name}, ${athlete.division}, ${athlete.teamName}`
							: `${athlete.name}, ${athlete.division}, ${athlete.teamName}, unavailable to pick now`}
						class="flex h-full min-h-11 w-full flex-row flex-wrap items-center justify-between gap-1 rounded-md border px-2 py-1 text-left leading-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 enabled:cursor-pointer enabled:hover:brightness-95 enabled:active:scale-[0.98] disabled:cursor-default"
						style={athlete.gender === 'male'
							? 'background-color: #eff6ff; border-color: #93c5fd; color: #172554;'
							: athlete.gender === 'female'
								? 'background-color: #fdf2f8; border-color: #f9a8d4; color: #831843;'
								: undefined}
						data-testid="pick-button"
					>
						<span class="text-xs font-medium">{athlete.name}</span>
						<span class="text-[10px] font-medium">{athlete.division}</span>

						{#if !canPick && board.draft.status === 'active' && board.myTurn && genderFull(athlete.gender)}
							<span class="mt-auto pt-1 text-[10px]">Roster full at {athlete.division}</span>
						{/if}
					</button>
				</form>
			{:else}
				<p class="col-span-full text-sm text-muted-foreground">
					{board.draft.status === 'complete'
						? 'Draft complete — see final rosters above.'
						: 'No eligible athletes available.'}
				</p>
			{/each}
		</div>
	</section>
{/snippet}

<svelte:head>
	<title>{board.event.name} draft — {board.league.name} — FliHub</title>
</svelte:head>

<section class="flex flex-col gap-3 py-2">
	<Button
		variant="ghost"
		size="sm"
		class="w-fit"
		href={resolve('/(app)/organizations/[id]/fantasy/[league]', {
			id: data.organizationId,
			league: data.leagueId
		})}
	>
		<ArrowLeft class="size-4" /> Back to lobby
	</Button>

	{#if form?.message}
		<Alert.Root variant="destructive" data-testid="draft-error">
			<Alert.Title>That didn’t work</Alert.Title>
			<Alert.Description>{form.message}</Alert.Description>
		</Alert.Root>
	{/if}

	<!-- Hidden tick form: processes expired deadlines on the server. -->
	<form method="POST" action="?/tick" use:enhance bind:this={tickForm} class="hidden"></form>

	{#if board.pendingSubstitutions.length > 0}
		<Card.Root data-testid="pending-substitutions">
			<Card.Header>
				<Card.Title>Designated event substitutions</Card.Title>
				<Card.Description>
					A drafted athlete has a designated event substitute. Applying it preserves the original
					pick and records the substitution separately. Ambiguous cases are rejected for a product
					decision.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-2 text-sm">
				{#each board.pendingSubstitutions as pending (pending.pick)}
					<div class="flex flex-wrap items-center gap-2" data-testid="pending-substitution">
						<span>
							{pending.athleteOutName} →
							<span class="font-medium">{pending.athleteInName}</span>
							<span class="text-xs text-muted-foreground">
								({pending.managerName}, pick {pending.pickNumber})
							</span>
						</span>
						{#if isOwner}
							<form method="POST" action="?/applySubstitution" use:enhance class="ml-auto">
								<input type="hidden" name="pick" value={pending.pick} />
								<Button type="submit" size="sm" data-testid="apply-substitution">
									Apply substitution
								</Button>
							</form>
						{/if}
					</div>
				{/each}
			</Card.Content>
		</Card.Root>
	{/if}

	{#if ['ready', 'active', 'paused', 'complete'].includes(board.draft.status)}
		<div
			class="w-full rounded-xl border bg-background"
			style="padding-bottom: env(safe-area-inset-bottom, 0px);"
			data-testid="draft-bottom-controls"
			role="region"
			aria-label="Draft controls"
		>
			<div class="p-2 sm:p-3">
				{#if board.draft.status === 'complete'}{@render compactRosters()}{/if}
				{#if ['ready', 'paused'].includes(board.draft.status)}
					{@render compactRosters()}
					<div class="my-2 border-t"></div>
					{@render availableAthletes()}
				{/if}
				{#if board.draft.status === 'ready'}
					<Card.Root>
						<Card.Content class="flex flex-wrap items-center gap-3 pt-6">
							<p class="text-sm text-muted-foreground">
								Draft order is drawn and saved: {board.order.map((o) => o.name).join(' → ')}. The
								snake reverses direction each round; the {board.draft.pickSeconds}-second pick clock
								starts with the draft.
							</p>
							{#if isOwner}
								<form method="POST" action="?/start" use:enhance>
									<Button type="submit" data-testid="start-draft">
										<Megaphone class="mr-1 size-4" /> Start draft
									</Button>
								</form>
							{:else}
								<p class="text-sm text-muted-foreground">
									Waiting for the commissioner to start the draft.
								</p>
							{/if}
						</Card.Content>
					</Card.Root>
				{/if}

				{#if board.draft.status === 'paused'}
					<section class="flex flex-col gap-2" data-testid="draft-paused">
						<h2 class="text-xl font-semibold">Draft paused</h2>
						<p>
							{board.draft.onTheClock?.name}'s turn is paused with {Math.ceil(
								(board.draft.pausedRemainingMs ?? 0) / 1000
							)} seconds remaining. Picks and timeout auto-picks are stopped.
						</p>
						{#if isOwner}
							<form method="POST" action="?/draftClock" use:enhance>
								<input type="hidden" name="operation" value="resume" /><Button
									type="submit"
									style="background-color: #166534; color: white;"
									data-testid="resume-draft">Resume draft</Button
								>
							</form>
						{:else}<p class="text-sm">Waiting for the commissioner to resume.</p>{/if}
					</section>
				{/if}
				{#if board.draft.status === 'active'}
					<section class="flex flex-col gap-2" data-testid="draft-focus">
						{@render compactRosters()}
						<div class="my-2 border-t"></div>
						{@render availableAthletes()}
						{#if isOwner}
							<form method="POST" action="?/draftClock" use:enhance class="self-start">
								<input type="hidden" name="operation" value="pause" /><Button
									type="submit"
									variant="outline"
									style="background-color: #fef3c7; color: #78350f;"
									data-testid="pause-draft">Pause draft</Button
								>
							</form>
						{/if}
						<div class="flex flex-wrap items-center justify-between gap-3">
							<div>
								<p class="text-sm font-medium">
									Round {board.draft.round} · Pick {board.draft.currentPick} of {board.draft
										.totalPicks}
								</p>
								<h2 class="text-lg font-semibold" data-testid="draft-turn">
									{board.draft.onTheClock?.name} is on the clock
								</h2>
								{#if board.myTurn}<p class="mt-1 font-semibold" data-testid="your-turn">
										Your turn — choose your next athlete.
									</p>{:else}<p class="mt-1">Waiting for your turn.</p>{/if}
							</div>

							<p class="text-xs" data-testid="browser-heartbeat">
								Browser updates: {browserHeartbeat}
							</p>
							<div
								class="flex items-center gap-2 text-2xl font-bold tabular-nums"
								data-testid="draft-clock"
							>
								<Clock3 class="size-7" />{remainingSeconds ?? '—'}<span class="text-sm font-normal"
									>seconds</span
								>
							</div>
						</div>
						{#if recommendation}
							<div
								class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2 text-slate-950"
								data-testid="draft-recommendation"
							>
								<div>
									<p class="text-xs font-semibold uppercase">Recommended pro</p>
									<p class="text-base font-semibold">{recommendation.name}</p>
									<p class="text-sm">{recommendation.division} · {recommendation.teamName}</p>
								</div>
								{#if board.myTurn}
									<form method="POST" action="?/pick" use:enhance>
										<input type="hidden" name="athlete" value={recommendation.athlete} />
										<Button
											type="submit"
											disabled={remainingSeconds === 0}
											style="background-color: #166534; color: white;"
											data-testid="pick-recommendation">Pick {recommendation.name}</Button
										>
									</form>
								{/if}
							</div>
						{/if}
						<p class="text-sm">
							Choose the recommended pro or tap an available athlete in this panel. At zero, the
							server processes the timeout pick.
						</p>
						<div class="mt-1 rounded-md bg-white p-2 text-slate-950">
							<label for="draft-quick-find" class="mb-1 block text-xs font-semibold"
								>Quick find an athlete</label
							>
							<div class="flex items-center gap-2">
								<input
									id="draft-quick-find"
									type="search"
									bind:value={athleteSearch}
									placeholder="Name, team, MPO or FPO…"
									autocomplete="off"
									class="min-h-11 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-base text-slate-950"
								/>
								{#if athleteSearch}
									<button
										type="button"
										class="min-h-11 rounded-md border border-slate-300 px-3 text-sm"
										onclick={() => (athleteSearch = '')}>Clear</button
									>
								{/if}
							</div>

							{#if searchTerm}
								<div class="mt-2 grid grid-cols-2 gap-2" data-testid="quick-find-results">
									{#each searchMatches as athlete (athlete.athlete)}
										{@const canPick =
											board.draft.status === 'active' &&
											board.myTurn &&
											!genderFull(athlete.gender) &&
											remainingSeconds !== 0}
										<form method="POST" action="?/pick" use:enhance class="min-w-0">
											<input type="hidden" name="athlete" value={athlete.athlete} />
											<button
												type="submit"
												disabled={!canPick}
												aria-label={canPick
													? `Pick ${athlete.name}`
													: `${athlete.name}, unavailable to pick now`}
												class="flex h-full min-h-20 w-full flex-col items-start gap-1 rounded-md border p-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 enabled:cursor-pointer enabled:hover:brightness-95"
												style={athlete.gender === 'male'
													? 'background-color: #eff6ff; border-color: #93c5fd; color: #172554;'
													: 'background-color: #fdf2f8; border-color: #f9a8d4; color: #831843;'}
												data-testid="quick-find-pick"
											>
												<span class="text-sm font-semibold">{athlete.name}</span>
												<span class="text-xs">{athlete.division} · {athlete.teamName}</span>
												<span class="text-xs font-semibold">
													{canPick
														? 'Tap to pick'
														: genderFull(athlete.gender)
															? 'Roster places full'
															: 'Waiting for your turn'}
												</span>
											</button>
										</form>
									{:else}
										<p class="col-span-full text-xs text-slate-600">
											No matching available athletes. Drafted athletes are shown in the rosters.
										</p>
									{/each}
								</div>
							{/if}
						</div>
					</section>
				{/if}

				{#if import.meta.env.DEV && isOwner && ['active', 'paused', 'complete'].includes(board.draft.status)}
					<details
						class="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950"
						data-testid="demo-draft-reset"
					>
						<summary class="cursor-pointer font-semibold">Demo testing · Stop and reset</summary>
						<p class="text-sm">
							Stops the draft and clears this draft's picks and returns it to Ready. Keeps the same
							participants, saved order, and athlete ranking. Only available for leagues filled with
							demo participants.
						</p>
						<form
							method="POST"
							action="?/resetDemoDraft"
							use:enhance
							class="flex flex-col items-start gap-3"
						>
							<label for="reset-pick-timer" class="text-sm font-medium">Pick timer</label>
							<select
								id="reset-pick-timer"
								name="pickSeconds"
								class="rounded-md border bg-white p-2 text-black"
							>
								<option value="30" selected>30 seconds — recommended for testing</option><option
									value="15">15 seconds</option
								><option value="7">7 seconds</option>
							</select>
							<label class="flex items-center gap-2 text-sm"
								><input type="checkbox" name="confirm" value="RESET" required /> Clear the picks from
								this demo draft.</label
							>
							<Button type="submit" style="background-color: #b91c1c; color: white;"
								>Stop and reset demo draft</Button
							>
						</form>
					</details>
				{/if}
			</div>
		</div>
	{/if}
</section>
