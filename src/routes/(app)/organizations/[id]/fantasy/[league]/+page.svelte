<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Check, Users } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const lobby = $derived(data.lobby);
	const seatLimit = $derived(lobby.league.participantLimit);
	const openSeats = $derived(Math.max(seatLimit - lobby.approvedCount, 0));
	const pendingCount = $derived(lobby.members.filter((m) => m.status === 'accepted').length);
	const invitedCount = $derived(lobby.members.filter((m) => m.status === 'invited').length);
	const progress = $derived(
		seatLimit > 0 ? Math.round((lobby.approvedCount / seatLimit) * 100) : 0
	);

	const complete = $derived(lobby.seatsFilled);
	const barColor = $derived(
		complete ? 'bg-green-600' : progress >= 50 ? 'bg-lime-500' : 'bg-amber-500'
	);
	const roleLabel = (role: string) =>
		role === 'owner' ? 'commissioner' : role === 'manager' ? 'participant' : role;

	const nextStep = $derived.by(() => {
		if (lobby.seatsFilled) return 'All seats approved. Drafts are open.';
		if (!lobby.isOwner) {
			return `Waiting on the commissioner. ${openSeats} ${openSeats === 1 ? 'seat is' : 'seats are'} still open.`;
		}
		if (pendingCount > 0) {
			return `${pendingCount} ${pendingCount === 1 ? 'request is' : 'requests are'} waiting for your approval.`;
		}
		if (invitedCount > 0) return 'Waiting for invited participants to accept.';
		return `${openSeats} ${openSeats === 1 ? 'seat' : 'seats'} still open. Invite participants to continue.`;
	});
</script>

<svelte:head>
	<title>{lobby.league.name} — Fantasy — FliHub</title>
</svelte:head>

<section class="mx-auto flex max-w-4xl flex-col gap-6 py-4">
	<div class="flex flex-wrap items-center gap-3">
		<h1 class="text-2xl font-semibold tracking-tight">{lobby.league.name}</h1>
		<Badge variant="outline" data-testid="seat-count">
			{lobby.approvedCount} of {lobby.league.participantLimit} seats approved
		</Badge>
		{#if lobby.seatsFilled}
			<Badge class="bg-green-600 text-white hover:bg-green-600" data-testid="seats-filled"
				>Seats filled</Badge
			>
		{/if}
	</div>
	<div class="flex flex-col gap-2" data-testid="seat-progress">
		<p
			class="flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium {complete
				? 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100'
				: 'border-border bg-muted/40'}"
			data-testid="next-step"
		>
			{#if complete}<Check class="size-4 text-green-600" />{/if}
			{nextStep}
		</p>
		<div
			class="h-2 w-full overflow-hidden rounded-full bg-muted"
			role="progressbar"
			aria-label="Approved seats"
			aria-valuemin={0}
			aria-valuemax={seatLimit}
			aria-valuenow={lobby.approvedCount}
		>
			<div class="h-full transition-all duration-500 {barColor}" style:width="{progress}%"></div>
		</div>
		<p class="text-xs text-muted-foreground">
			{seatLimit} seats: the commissioner plus {seatLimit - 1} participants.
		</p>
	</div>
	<p class="text-sm text-muted-foreground">
		A private fantasy league. Seats are personal: fantasy membership grants no organization
		permissions, and organization staff see nothing here without a seat.
	</p>

	{#if form?.message}
		<Alert.Root variant="destructive" data-testid="lobby-error">
			<Alert.Title>That didn’t work</Alert.Title>
			<Alert.Description>{form.message}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if import.meta.env.DEV && lobby.isOwner && !lobby.seatsFilled && lobby.drafts.length === 0}
		<section
			class="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950"
			data-testid="demo-fantasy-setup"
		>
			<h2 class="font-semibold">Demo testing · Add fantasy participants</h2>
			<p class="text-sm">
				Fill the remaining places with clearly named demo accounts, already verified and approved.
				Existing participants stay unchanged. No invitation emails are sent.
			</p>
			<form
				method="POST"
				action="?/seedDemoParticipants"
				use:enhance
				class="flex flex-col items-start gap-3"
			>
				<label for="demo-password" class="text-sm font-medium"
					>Password for the new demo accounts</label
				>
				<Input
					id="demo-password"
					name="demoPassword"
					type="password"
					autocomplete="new-password"
					required
					minlength={12}
					maxlength={72}
					class="max-w-sm bg-white text-black"
				/>
				<p class="text-sm">
					Use 12–72 characters. Keep this password if you want to sign in as a demo participant.
				</p>
				<Button type="submit" style="background-color: #166534; color: white;"
					>Fill remaining places with demo participants</Button
				>
			</form>
		</section>
	{/if}
	{#if form && 'demoParticipantsAdded' in form}
		<div role="status" class="rounded-lg border p-4">
			<p>{form.demoParticipantsAdded} demo fantasy participants added.</p>
			{#each form.demoAccounts ?? [] as account (account.email)}
				<p class="mt-2 text-sm">{account.name} · {account.email}</p>
			{/each}
		</div>
	{/if}

	<Card.Root
		data-testid="lobby-members"
		class={complete ? 'border-green-300 dark:border-green-800' : ''}
	>
		<Card.Header>
			<Card.Title class="flex items-center gap-2"
				><Users class="size-4" /> Fantasy participants</Card.Title
			>
			<Card.Description>
				Invited fantasy participants accept their seat, then the commissioner approves it. Only
				approved seats count toward the limit.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-2">
			{#each lobby.members as member (member.id)}
				<div class="flex flex-wrap items-center gap-2 text-sm" data-testid="lobby-member">
					<span class="font-medium">{member.name}</span>
					<Badge variant="outline" class="text-[10px] capitalize"
						>{roleLabel(member.role)}</Badge
					>
					<Badge
						variant={member.status === 'approved' ? 'default' : 'secondary'}
						class="text-[10px] capitalize {member.status === 'approved'
							? 'bg-green-600 text-white hover:bg-green-600'
							: ''}"
					>
						{member.status}
					</Badge>
					{#if lobby.isOwner && member.status === 'accepted'}
						<form method="POST" action="?/approve" use:enhance class="ml-auto">
							<input type="hidden" name="membership" value={member.id} />
							<Button type="submit" size="sm">Approve</Button>
						</form>
					{/if}
					{#if lobby.isOwner && member.role !== 'owner' && member.status === 'approved'}
						<form method="POST" action="?/remove" use:enhance class="ml-auto">
							<input type="hidden" name="membership" value={member.id} />
							<Button type="submit" size="sm" variant="outline">Remove</Button>
						</form>
					{/if}
				</div>
			{/each}
		</Card.Content>
	</Card.Root>

	{#if lobby.isOwner}
		<Card.Root data-testid="lobby-invite">
			<Card.Header>
				<Card.Title>Invite a fantasy participant</Card.Title>
				<Card.Description>
					Invitations are in-app and scoped to this league — the fantasy participant needs a FliHub
					account.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form method="POST" action="?/invite" use:enhance class="flex flex-wrap items-end gap-3">
					<div class="flex flex-col gap-1.5">
						<Label for="inv-email">Fantasy participant email</Label>
						<Input id="inv-email" name="email" type="email" required class="w-72" />
					</div>
					<Button type="submit" data-testid="invite-manager">Invite</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root data-testid="lobby-drafts">
		<Card.Header>
			<Card.Title>Event drafts</Card.Title>
			<Card.Description>
				Each event gets its own fresh four-round snake draft with an independently randomized, saved
				first-round order. 24 picks complete a draft: every roster finishes with exactly 2 MPO and 2
				FPO athletes.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-3">
			{#if lobby.drafts.length === 0}
				<p class="text-sm text-muted-foreground">No drafts yet.</p>
			{/if}
			{#each lobby.drafts as draft (draft.id)}
				<div class="flex flex-wrap items-center gap-2 text-sm" data-testid="lobby-draft">
					<span class="font-medium">{draft.eventName}</span>
					<Badge variant="secondary" class="text-[10px] capitalize">{draft.status}</Badge>
					<Badge variant="outline" class="text-[10px]">{draft.pickSeconds}s clock</Badge>
					<Button
						size="sm"
						variant="ghost"
						class="ml-auto"
						href={resolve('/(app)/organizations/[id]/fantasy/[league]/draft/[draft]', {
							id: data.organizationId,
							league: lobby.league.id,
							draft: draft.id
						})}
					>
						Open draft room
					</Button>
					{#if draft.status === 'complete'}
						<Button
							size="sm"
							variant="outline"
							href={resolve('/(app)/organizations/[id]/fantasy/[league]/draft/[draft]/standings', {
								id: data.organizationId,
								league: lobby.league.id,
								draft: draft.id
							})}>Fantasy standings</Button
						>
					{/if}
				</div>
			{/each}
			{#if lobby.isOwner}
				<form
					method="POST"
					action="?/createDraft"
					use:enhance
					class="flex flex-wrap items-end gap-3 border-t pt-3"
				>
					<div class="flex flex-col gap-1.5">
						<Label for="draft-event">Event</Label>
						<select
							id="draft-event"
							name="event"
							required
							class="h-9 rounded-md border border-input bg-background px-2 text-sm"
						>
							{#each lobby.events as event (event.id)}
								<option value={event.id}>{event.name}</option>
							{/each}
						</select>
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="draft-clock">Pick clock</Label>
						<select
							id="draft-clock"
							name="pickSeconds"
							class="h-9 rounded-md border border-input bg-background px-2 text-sm"
						>
							<option value="7">7 seconds</option>
							<option value="15">15 seconds</option>
							<option value="30" selected>30 seconds</option>
						</select>
					</div>
					<Button type="submit" disabled={!lobby.seatsFilled} data-testid="prepare-draft">
						Prepare draft
					</Button>
					{#if !lobby.seatsFilled}
						<p class="text-xs text-muted-foreground">
							Drafts open once every fantasy participant place is approved.
						</p>
					{/if}
				</form>
			{/if}
		</Card.Content>
	</Card.Root>
</section>
