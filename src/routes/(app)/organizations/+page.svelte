<script lang="ts">
	import { resolve } from '$app/paths';
	import { AlertCircle, Building2, CircleCheck } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	const memberships = $derived(data.memberships ?? []);
	const message = $derived(form && 'message' in form ? form.message : null);
	function roleLabel(role: string): string {
		return role.charAt(0).toUpperCase() + role.slice(1);
	}
</script>

<svelte:head>
	<title>{data.scorekeeperView ? 'Scoring assignments' : 'Organizations'} — FliHub</title>
</svelte:head>

<section class="flex flex-col gap-8 py-4">
	<div class="flex flex-col gap-2">
		<h1 class="text-2xl font-semibold tracking-tight">
			{data.scorekeeperView ? 'Your scoring assignments' : 'Your organizations'}
		</h1>
		<p class="text-sm text-muted-foreground">
			Signed in as {data.user?.email}. You belong to {memberships.length}
			{memberships.length === 1 ? 'organization' : 'organizations'}.
		</p>
		<div class="flex flex-wrap gap-3">
			<a
				href={resolve('/(app)/organizations/new')}
				class="inline-flex min-h-11 items-center rounded-md bg-blue-700 px-4 py-2 font-medium text-white underline underline-offset-4 hover:bg-blue-800"
				>Create an organization</a
			>
			<a
				href={resolve('/(app)/organizations/setup-preview')}
				class="inline-flex min-h-11 items-center px-3 py-2 text-sm underline underline-offset-4"
				>Explore setup preview</a
			>
		</div>
	</div>

	{#if message}
		<Alert.Root variant="destructive">
			<AlertCircle class="size-4" />
			<Alert.Title>Action failed</Alert.Title>
			<Alert.Description>{message}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if data.scorekeeperView}
		{#if data.assignments.length === 0}
			<Card.Root>
				<Card.Header>
					<Card.Title>No scoring assignments yet</Card.Title>
					<Card.Description>
						Your organizer will assign you to an event group. Your events and rounds will appear
						here afterward.
					</Card.Description>
				</Card.Header>
			</Card.Root>
		{/if}

		{#each data.assignments as assignment (assignment.id)}
			<Card.Root>
				<Card.Header>
					<Card.Title>{assignment.eventName}</Card.Title>
					<Card.Description>
						{assignment.organizationName} · {assignment.groupName}
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-2">
					{#each assignment.rounds as round (round.id)}
						<div class="rounded-md border p-3 text-sm">
							<p class="font-medium">
								Round {round.number}{round.name ? ` — ${round.name}` : ''}
							</p>
							<p class="text-muted-foreground">
								{round.course || 'Course awaiting setup'}
								{round.position ? ` · ${round.position}` : ''}
								<span class="block font-medium">{round.teeTime}</span>
							</p>
						</div>
					{/each}
					{#if assignment.rounds.length === 0}
						<p class="text-sm text-muted-foreground">Rounds are awaiting setup.</p>
					{/if}
				</Card.Content>
				<Card.Footer>
					<Button
						href={resolve('/(app)/organizations/[id]/events/[event]/score', {
							id: assignment.organizationId,
							event: assignment.eventId
						})}
					>
						Open scoring
					</Button>
				</Card.Footer>
			</Card.Root>
		{/each}

		<details class="rounded-md border p-3">
			<summary class="cursor-pointer text-sm font-medium">Your organizations</summary>
			<div class="mt-3 flex flex-wrap gap-2">
				{#each memberships as membership (membership.id)}
					<Button
						variant="outline"
						href={resolve('/(app)/organizations/[id]', { id: membership.organization.id })}
					>
						{membership.organization.name}
					</Button>
				{/each}
			</div>
		</details>
	{/if}

	{#if !data.scorekeeperView}
		<div class="grid gap-4 md:grid-cols-2">
			{#each memberships as membership (membership.id)}
				{@const isActive = membership.organization.id === data.activeOrgId}
				{@const canManage = membership.role === 'owner' || membership.role === 'admin'}
				<Card.Root class={isActive ? 'border-primary' : ''}>
					<Card.Header>
						<Card.Title class="flex items-center gap-2">
							<Building2 class="size-5" />
							{membership.organization.name}
						</Card.Title>
						<Card.Description class="flex flex-wrap items-center gap-2">
							<Badge variant="secondary">{roleLabel(membership.role)}</Badge>
							{#if isActive}
								<Badge>Active</Badge>
							{/if}
							{#if !membership.organization.onboarded}
								<Badge variant="outline">Setup pending</Badge>
							{/if}
						</Card.Description>
					</Card.Header>
					<Card.Footer class="flex flex-wrap gap-2">
						<Button href={resolve('/(app)/organizations/[id]', { id: membership.organization.id })}>
							Open
						</Button>
						{#if !membership.organization.onboarded && canManage}
							<Button
								variant="outline"
								href={resolve('/(app)/organizations/[id]/settings', {
									id: membership.organization.id
								})}
							>
								Complete setup
							</Button>
						{/if}
						{#if !isActive}
							<form method="POST" action="?/switch">
								<input type="hidden" name="organization" value={membership.organization.id} />
								<Button type="submit" variant="outline">Set active</Button>
							</form>
						{/if}
					</Card.Footer>
				</Card.Root>
			{/each}
		</div>

		{#if memberships.length === 0}
			<Alert.Root>
				<CircleCheck class="size-4" />
				<Alert.Title>No memberships yet</Alert.Title>
				<Alert.Description>
					Use Create an organization above, or open an invitation link while signed in to join an
					existing one.
				</Alert.Description>
			</Alert.Root>
		{/if}
	{/if}
</section>
