<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Users } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const lobby = $derived(data.lobby);
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
			<Badge data-testid="seats-filled">Seats filled</Badge>
		{/if}
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

	<Card.Root data-testid="lobby-members">
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
					<Badge variant="outline" class="text-[10px] capitalize">{member.role}</Badge>
					<Badge
						variant={member.status === 'approved' ? 'default' : 'secondary'}
						class="text-[10px] capitalize"
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
