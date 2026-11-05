<script lang="ts">
	import { CircleCheck, CircleX } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Email verification — FliHub</title>
</svelte:head>

<section class="mx-auto flex max-w-md flex-col gap-6 py-10">
	<Card.Root>
		<Card.Content class="flex flex-col gap-4 pt-6">
			{#if data.verified}
				<Alert.Root>
					<CircleCheck class="size-4" />
					<Alert.Title>Email verified</Alert.Title>
					<Alert.Description>
						Your email address is verified. You can now sign in and accept organization invitations.
					</Alert.Description>
				</Alert.Root>
				<Button href="/login" class="w-full">Continue to sign in</Button>
			{:else}
				<Alert.Root variant="destructive">
					<CircleX class="size-4" />
					<Alert.Title>Verification link not valid</Alert.Title>
					<Alert.Description>
						This verification link is invalid or has expired. Sign in and request a new verification
						email, or register again.
					</Alert.Description>
				</Alert.Root>
				<div class="flex gap-2">
					<Button href="/login" variant="outline" class="flex-1">Sign in</Button>
					<Button href="/register" variant="outline" class="flex-1">Register</Button>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</section>
