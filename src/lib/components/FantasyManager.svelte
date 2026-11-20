<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { ChevronDown, Plus, Trophy, X } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	interface LeagueRow {
		id: string;
		name: string;
		participantLimit: number;
		role: string;
		status: string;
		membershipId: string;
	}
	interface Props {
		organizationId: string;
		leagues: LeagueRow[];
		form: { message?: string } | null;
	}
	let { organizationId, leagues, form }: Props = $props();

	const invites = $derived(leagues.filter((l) => l.status === 'invited'));
	const seated = $derived(leagues.filter((l) => l.status !== 'invited'));
</script>

<div class="flex flex-col gap-6" data-testid="fantasy-manager">
	{#if form?.message}
		<Alert.Root variant="destructive">
			<Alert.Title>That didn’t work</Alert.Title>
			<Alert.Description>{form.message}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if invites.length > 0}
		<Card.Root data-testid="fantasy-invites">
			<Card.Header>
				<Card.Title>Your invitations</Card.Title>
				<Card.Description>
					Fantasy seats are personal — accepting one grants no organization permissions.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-2">
				{#each invites as invite (invite.membershipId)}
					<div class="flex flex-wrap items-center gap-2 text-sm">
						<span class="font-medium">{invite.name}</span>
						<form method="POST" action="?/respondInvite" use:enhance class="ml-auto flex gap-2">
							<input type="hidden" name="membership" value={invite.membershipId} />
							<Button type="submit" size="sm" name="accept" value="true">Accept</Button>
							<Button type="submit" size="sm" variant="outline" name="accept" value="false">
								Decline
							</Button>
						</form>
					</div>
				{/each}
			</Card.Content>
		</Card.Root>
	{/if}

	<details class="group/my-leagues rounded-xl border bg-card" data-testid="fantasy-leagues" open>
		<summary class="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
			<Trophy class="size-5 shrink-0 text-blue-700 dark:text-blue-300" aria-hidden="true" />
			<span>My leagues</span>
			<ChevronDown class="ml-auto size-4 shrink-0 transition-transform group-open/my-leagues:rotate-180" aria-hidden="true" />
		</summary>
		<Card.Root class="gap-4 rounded-none border-0 border-t bg-transparent py-4 shadow-none">
			<Card.Header>
				<Card.Description>
					Private leagues in this organization where you hold a seat. Drafts run per event once every
					fantasy participant place is approved.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-2">
				{#if seated.length === 0}
					<p class="text-sm text-muted-foreground">No leagues yet.</p>
				{/if}
				{#each seated as league (league.id)}
					<div class="flex flex-wrap items-center gap-2 text-sm" data-testid="fantasy-league-row">
						<span class="font-medium">{league.name}</span>
						<Badge variant="outline" class="text-[10px] capitalize">{league.role}</Badge>
						{#if league.status !== 'approved'}
							<Badge variant="secondary" class="text-[10px] capitalize">{league.status}</Badge>
						{/if}
						<Button
							size="sm"
							variant="ghost"
							class="ml-auto"
							href={resolve('/(app)/organizations/[id]/fantasy/[league]', {
								id: organizationId,
								league: league.id
							})}
						>
							Open lobby
						</Button>
					</div>
				{/each}
			</Card.Content>
		</Card.Root>
	</details>

	<details class="group/create-league rounded-xl border bg-card" data-testid="fantasy-create">
		<summary class="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
			<span class="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-green-700 text-white group-open/create-league:bg-red-700">
				<Plus class="size-4 group-open/create-league:hidden" aria-hidden="true" />
				<X class="hidden size-4 group-open/create-league:block" aria-hidden="true" />
			</span>
			<span class="group-open/create-league:hidden">Create a league</span>
			<span class="hidden group-open/create-league:inline">Close league form</span>
		</summary>
		<Card.Root class="gap-4 rounded-none border-0 border-t bg-transparent py-4 shadow-none">
			<Card.Header>
				<Card.Description>
					You become the league owner — a fantasy role separate from organization staff roles.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/createFantasyLeague"
					use:enhance
					class="flex flex-wrap items-end gap-3"
				>
					<div class="flex flex-col gap-1.5">
						<Label for="fl-name">League name</Label>
						<Input id="fl-name" name="name" required minlength={2} maxlength={80} />
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="fl-limit">Fantasy participant limit</Label>
						<Input
							id="fl-limit"
							name="participantLimit"
							type="number"
							min={2}
							max={12}
							value={6}
							class="w-24"
						/>
					</div>
					<Button type="submit" data-testid="create-league">Create league</Button>
				</form>
			</Card.Content>
		</Card.Root>
	</details>
</div>
