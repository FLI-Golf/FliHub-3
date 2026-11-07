<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ArrowLeft, Clock3, Megaphone } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const board = $derived(data.board);
	const isOwner = $derived(board.league.owner === board.me);

	// The pick clock counts against the SERVER deadline (serverNow anchors
	// the offset so client clock drift never lies about the deadline).
	let nowMs = $state(Date.now());
	const serverOffset = $derived(Date.parse(board.serverNow) - Date.now());
	const deadlineMs = $derived(board.draft.deadline ? Date.parse(board.draft.deadline) : null);
	const remainingSeconds = $derived(
		deadlineMs === null
			? null
			: Math.max(0, Math.ceil((deadlineMs - (nowMs + serverOffset)) / 1000))
	);

	let tickForm: HTMLFormElement | undefined = $state();
	let lastTickAt = 0;

	// Poll the server-owned board while the draft runs; when the deadline
	// passes, submit a tick so the overdue auto-pick happens server-side.
	$effect(() => {
		if (board.draft.status !== 'active') return;
		const interval = setInterval(() => {
			nowMs = Date.now();
			invalidate('fantasy:board');
			if (
				deadlineMs !== null &&
				nowMs + serverOffset >= deadlineMs &&
				Date.now() - lastTickAt > 1000 &&
				tickForm
			) {
				lastTickAt = Date.now();
				tickForm.requestSubmit();
			}
		}, 1000);
		return () => clearInterval(interval);
	});

	const myRoster = $derived(board.rosters.find((r) => r.user === board.me) ?? null);
	function genderFull(gender: string): boolean {
		if (!myRoster) return false;
		const count = gender === 'male' ? myRoster.maleCount : myRoster.femaleCount;
		return count >= 2;
	}
</script>

<svelte:head>
	<title>{board.event.name} draft — {board.league.name} — FliHub</title>
</svelte:head>

<section class="flex flex-col gap-6 py-4">
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

	<div class="flex flex-wrap items-center gap-3">
		<h1 class="text-2xl font-semibold tracking-tight" data-testid="draft-title">
			{board.event.name} draft
		</h1>
		<Badge variant="secondary" class="capitalize" data-testid="draft-status">
			{board.draft.status}
		</Badge>
		{#if board.draft.status === 'active'}
			<Badge data-testid="draft-turn">
				Round {board.draft.round} · Pick {board.draft.currentPick} of {board.draft.totalPicks} —
				{board.draft.onTheClock?.name} on the clock
			</Badge>
			<Badge variant="outline" class="gap-1 tabular-nums" data-testid="draft-clock">
				<Clock3 class="size-3.5" />
				{remainingSeconds}s
			</Badge>
		{/if}
	</div>

	{#if form?.message}
		<Alert.Root variant="destructive" data-testid="draft-error">
			<Alert.Title>That didn’t work</Alert.Title>
			<Alert.Description>{form.message}</Alert.Description>
		</Alert.Root>
	{/if}

	<!-- Hidden tick form: processes expired deadlines on the server. -->
	<form method="POST" action="?/tick" use:enhance bind:this={tickForm} class="hidden"></form>

	{#if board.draft.status === 'ready'}
		<Card.Root>
			<Card.Content class="flex flex-wrap items-center gap-3 pt-6">
				<p class="text-sm text-muted-foreground">
					Draft order is drawn and saved: {board.order.map((o) => o.name).join(' → ')}. The snake
					reverses direction each round; the {board.draft.pickSeconds}-second pick clock starts with
					the draft.
				</p>
				{#if isOwner}
					<form method="POST" action="?/start" use:enhance>
						<Button type="submit" data-testid="start-draft">
							<Megaphone class="mr-1 size-4" /> Start draft
						</Button>
					</form>
				{:else}
					<p class="text-sm text-muted-foreground">Waiting for the owner to start the draft.</p>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}

	{#if board.draft.status === 'active' && board.myTurn}
		<Alert.Root data-testid="your-turn">
			<Clock3 class="size-4" />
			<Alert.Title>You're on the clock</Alert.Title>
			<Alert.Description>
				Pick before the clock hits zero or the highest-ranked eligible athlete is auto-picked for
				you.
			</Alert.Description>
		</Alert.Root>
	{/if}

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root data-testid="draft-pool">
			<Card.Header>
				<Card.Title>Athletes</Card.Title>
				<Card.Description>
					Eligible athletes with their real event teams. Rosters finish with exactly 2 MPO and 2
					FPO.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-1.5">
				{#each board.pool as athlete (athlete.athlete)}
					<div
						class="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-sm {athlete.pickedBy
							? 'opacity-50'
							: ''}"
						data-testid="pool-athlete"
					>
						<span class="font-medium">{athlete.name}</span>
						<Badge variant="outline" class="text-[10px]">{athlete.division}</Badge>
						<span class="text-xs text-muted-foreground">{athlete.teamName}</span>
						{#if athlete.pickedBy}
							<Badge variant="secondary" class="ml-auto text-[10px]">
								{board.order.find((o) => o.user === athlete.pickedBy)?.name ?? 'Drafted'}
							</Badge>
						{:else if board.draft.status === 'active' && board.myTurn}
							{#if genderFull(athlete.gender)}
								<Badge variant="secondary" class="ml-auto text-[10px]">
									Roster already full at {athlete.division}
								</Badge>
							{:else}
								<form method="POST" action="?/pick" use:enhance class="ml-auto">
									<input type="hidden" name="athlete" value={athlete.athlete} />
									<Button type="submit" size="sm" data-testid="pick-button">Pick</Button>
								</form>
							{/if}
						{/if}
					</div>
				{/each}
			</Card.Content>
		</Card.Root>

		<div class="flex flex-col gap-6">
			<Card.Root data-testid="draft-log">
				<Card.Header>
					<Card.Title>Picks so far</Card.Title>
					<Card.Description>
						First-round order: {board.order.map((o) => o.name).join(' → ')} (reverses each round).
					</Card.Description>
				</Card.Header>
				<Card.Content class="flex flex-col gap-1 text-sm">
					{#if board.picks.length === 0}
						<p class="text-muted-foreground">No picks yet.</p>
					{/if}
					{#each board.picks as pickRow (pickRow.pickNumber)}
						<div class="flex flex-wrap items-center gap-2" data-testid="pick-log-row">
							<span class="w-14 text-muted-foreground tabular-nums">
								R{pickRow.round} · {pickRow.pickNumber}
							</span>
							<span class="font-medium">{pickRow.managerName}</span>
							<span>→ {pickRow.athleteName}</span>
							{#if pickRow.auto}
								<Badge variant="secondary" class="text-[10px]">Auto</Badge>
							{/if}
						</div>
					{/each}
				</Card.Content>
			</Card.Root>

			<Card.Root data-testid="draft-rosters">
				<Card.Header>
					<Card.Title>
						{board.draft.status === 'complete' ? 'Final rosters' : 'Rosters'}
					</Card.Title>
					<Card.Description>Each roster completes with 2 MPO + 2 FPO athletes.</Card.Description>
				</Card.Header>
				<Card.Content class="flex flex-col gap-3">
					{#each board.rosters as roster (roster.user)}
						<div class="rounded-md border px-3 py-2" data-testid="roster-tile">
							<p class="flex items-center gap-2 text-sm font-medium">
								{roster.name}
								<Badge variant="outline" class="text-[10px]">
									{roster.athletes.length} of 4 drafted · {roster.maleCount} MPO / {roster.femaleCount}
									FPO
								</Badge>
							</p>
							<ul class="mt-1 flex flex-col gap-0.5 text-sm text-muted-foreground">
								{#each roster.athletes as slot (slot.pickNumber)}
									<li data-testid="roster-slot">
										{#if slot.substituteName}
											<span class="font-medium text-foreground">{slot.substituteName}</span>
											<Badge variant="secondary" class="text-[10px]">
												Substitute for {slot.name}
											</Badge>
										{:else}
											{slot.name}
										{/if}
										<span class="text-xs">
											· {slot.gender === 'male' ? 'MPO' : 'FPO'} · {slot.teamName} · pick {slot.pickNumber}{slot.auto
												? ' (auto)'
												: ''}
										</span>
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</Card.Content>
			</Card.Root>

			{#if board.pendingSubstitutions.length > 0}
				<Card.Root data-testid="pending-substitutions">
					<Card.Header>
						<Card.Title>Designated event substitutions</Card.Title>
						<Card.Description>
							A drafted athlete has a designated event substitute. Applying it preserves the
							original pick and records the substitution separately. Ambiguous cases are rejected
							for a product decision.
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
		</div>
	</div>
</section>
