<script lang="ts">
	import { resolve } from '$app/paths';
	import { AlertCircle, Building2, CircleCheck, Plus } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const memberships = $derived(data.memberships ?? []);
	const message = $derived(form && 'message' in form ? form.message : null);
	const nameValue = $derived(form && 'name' in form ? String(form.name ?? '') : '');

	function roleLabel(role: string): string {
		return role.charAt(0).toUpperCase() + role.slice(1);
	}
</script>

<svelte:head>
	<title>Organizations — FliHub</title>
</svelte:head>

<section class="flex flex-col gap-8 py-4">
	<div class="flex flex-col gap-2">
		<h1 class="text-2xl font-semibold tracking-tight">Your organizations</h1>
		<p class="text-sm text-muted-foreground">
			Signed in as {data.user?.email}. You belong to {memberships.length}
			{memberships.length === 1 ? 'organization' : 'organizations'}.
		</p>
	</div>

	{#if message}
		<Alert.Root variant="destructive">
			<AlertCircle class="size-4" />
			<Alert.Title>Action failed</Alert.Title>
			<Alert.Description>{message}</Alert.Description>
		</Alert.Root>
	{/if}

	<div class="grid gap-4 md:grid-cols-2">
		{#each memberships as membership (membership.id)}
			{@const isActive = membership.organization.id === data.activeOrgId}
			<Card.Root class={isActive ? 'border-primary' : ''}>
				<Card.Header>
					<Card.Title class="flex items-center gap-2">
						<Building2 class="size-5" />
						{membership.organization.name}
					</Card.Title>
					<Card.Description class="flex items-center gap-2">
						<Badge variant="secondary">{roleLabel(membership.role)}</Badge>
						{#if isActive}
							<Badge>Active</Badge>
						{/if}
					</Card.Description>
				</Card.Header>
				<Card.Footer class="flex gap-2">
					<Button href={resolve('/(app)/organizations/[id]', { id: membership.organization.id })}>
						Open
					</Button>
					{#if !isActive}
						<form method="POST" action="?/switch">
							<input type="hidden" name="organization" value={membership.organization.id} />
							<Button type="submit" variant="outline">Set active</Button>
						</form>
					{/if}
				</Card.Footer>
			</Card.Root>
		{/each}

		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<Plus class="size-5" />
					Create an organization
				</Card.Title>
				<Card.Description>
					You become its Owner. Owners appoint Admins and manage all memberships.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form method="POST" action="?/create" class="flex flex-col gap-4">
					<div class="flex flex-col gap-2">
						<Label for="org-name">Organization name</Label>
						<Input
							id="org-name"
							name="name"
							type="text"
							minlength={2}
							maxlength={120}
							required
							value={nameValue}
							placeholder="e.g. Riverside Disc Golf Club"
						/>
					</div>
					<Button type="submit" class="w-full">Create organization</Button>
				</form>
			</Card.Content>
		</Card.Root>
	</div>

	{#if memberships.length === 0}
		<Alert.Root>
			<CircleCheck class="size-4" />
			<Alert.Title>No memberships yet</Alert.Title>
			<Alert.Description>
				Create an organization above, or open an invitation link while signed in to join an existing
				one.
			</Alert.Description>
		</Alert.Root>
	{/if}
</section>
