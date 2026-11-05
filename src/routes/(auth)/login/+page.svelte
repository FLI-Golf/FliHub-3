<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { AlertCircle } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	const next = $derived(page.url.searchParams.get('next'));
	const registerHref = $derived(
		next
			? `${resolve('/(auth)/register')}?next=${encodeURIComponent(next)}`
			: resolve('/(auth)/register')
	);
</script>

<svelte:head>
	<title>Sign in — FliHub</title>
</svelte:head>

<section class="mx-auto flex max-w-md flex-col gap-6 py-10">
	<div class="flex flex-col gap-2 text-center">
		<h1 class="text-2xl font-semibold tracking-tight">Sign in to FliHub</h1>
		<p class="text-sm text-muted-foreground">Use the email and password you registered with.</p>
	</div>

	<Card.Root>
		<Card.Content class="flex flex-col gap-4 pt-6">
			{#if form?.message}
				<Alert.Root variant="destructive">
					<AlertCircle class="size-4" />
					<Alert.Title>Sign-in failed</Alert.Title>
					<Alert.Description>{form.message}</Alert.Description>
				</Alert.Root>
			{/if}

			<form method="POST" class="flex flex-col gap-4">
				<div class="flex flex-col gap-2">
					<Label for="email">Email</Label>
					<Input
						id="email"
						name="email"
						type="email"
						autocomplete="email"
						required
						value={form?.email ?? ''}
					/>
				</div>
				<div class="flex flex-col gap-2">
					<Label for="password">Password</Label>
					<Input
						id="password"
						name="password"
						type="password"
						autocomplete="current-password"
						required
					/>
				</div>
				<Button type="submit" class="w-full">Sign in</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<p class="text-center text-sm text-muted-foreground">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() applies the base path; only a query string is appended -->
		No account yet? <a class="underline underline-offset-4" href={registerHref}>Create one</a>
	</p>
</section>
