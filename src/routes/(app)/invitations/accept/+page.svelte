<script lang="ts">
	import { AlertCircle, CircleCheck, MailWarning } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const message = $derived(form && 'message' in form ? form.message : null);

	const acceptable = $derived(
		data.info !== null &&
			data.info.status === 'pending' &&
			data.info.emailMatches &&
			!data.info.alreadyMember &&
			(data.user?.verified ?? false)
	);

	function roleLabel(role: string): string {
		return role.charAt(0).toUpperCase() + role.slice(1);
	}
</script>

<svelte:head>
	<title>Accept invitation — FliHub</title>
</svelte:head>

<section class="mx-auto flex max-w-md flex-col gap-6 py-10">
	<div class="flex flex-col gap-2 text-center">
		<h1 class="text-2xl font-semibold tracking-tight">Organization invitation</h1>
	</div>

	<Card.Root>
		<Card.Content class="flex flex-col gap-4 pt-6">
			{#if message}
				<Alert.Root variant="destructive">
					<AlertCircle class="size-4" />
					<Alert.Title>Could not accept</Alert.Title>
					<Alert.Description>{message}</Alert.Description>
				</Alert.Root>
			{/if}

			{#if data.lookupError}
				<Alert.Root variant="destructive">
					<AlertCircle class="size-4" />
					<Alert.Title>Invitation not valid</Alert.Title>
					<Alert.Description>{data.lookupError}</Alert.Description>
				</Alert.Root>
			{:else if data.info}
				<p class="text-sm">
					You were invited to join
					<strong>{data.info.organizationName}</strong> as
					<Badge variant="secondary">{roleLabel(data.info.role)}</Badge>.
				</p>

				{#if data.info.status !== 'pending'}
					<Alert.Root variant="destructive">
						<AlertCircle class="size-4" />
						<Alert.Title>Invitation {data.info.status}</Alert.Title>
						<Alert.Description>
							This invitation is no longer pending. Ask an Owner or Admin for a new one.
						</Alert.Description>
					</Alert.Root>
				{:else if !data.info.emailMatches}
					<Alert.Root variant="destructive">
						<AlertCircle class="size-4" />
						<Alert.Title>Different recipient</Alert.Title>
						<Alert.Description>
							This invitation was issued for a different email address. Sign in with the account the
							invitation was sent to.
						</Alert.Description>
					</Alert.Root>
				{:else if data.info.alreadyMember}
					<Alert.Root>
						<CircleCheck class="size-4" />
						<Alert.Title>Already a member</Alert.Title>
						<Alert.Description>You already belong to this organization.</Alert.Description>
					</Alert.Root>
				{:else if !data.user?.verified}
					<Alert.Root variant="destructive">
						<MailWarning class="size-4" />
						<Alert.Title>Verify your email first</Alert.Title>
						<Alert.Description>
							Your email address is not verified yet. Open the verification email we sent when you
							registered, then return to this link.
						</Alert.Description>
					</Alert.Root>
				{/if}

				{#if acceptable}
					<form method="POST" class="flex flex-col gap-4">
						<input type="hidden" name="token" value={data.token} />
						<Button type="submit" class="w-full">
							Accept and join {data.info.organizationName}
						</Button>
					</form>
				{/if}
			{/if}

			<Button href="/organizations" variant="outline">Back to organizations</Button>
		</Card.Content>
	</Card.Root>
</section>
