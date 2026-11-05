<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { AlertCircle, CircleCheck, MailWarning } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	const next = $derived(page.url.searchParams.get('next'));
	const loginHref = $derived(
		next ? `${resolve('/(auth)/login')}?next=${encodeURIComponent(next)}` : resolve('/(auth)/login')
	);
</script>

<svelte:head>
	<title>Create account — FliHub</title>
</svelte:head>

<section class="mx-auto flex max-w-md flex-col gap-6 py-10">
	<div class="flex flex-col gap-2 text-center">
		<h1 class="text-2xl font-semibold tracking-tight">Create your FliHub account</h1>
		<p class="text-sm text-muted-foreground">
			Creating an account grants no organization access — you join organizations by invitation or by
			creating your own.
		</p>
	</div>

	{#if form?.registered}
		<Card.Root>
			<Card.Content class="flex flex-col gap-4 pt-6">
				<Alert.Root>
					<CircleCheck class="size-4" />
					<Alert.Title>Account created</Alert.Title>
					<Alert.Description>
						We sent a verification email to
						<code class="rounded bg-muted px-1 py-0.5 text-sm">{form.email}</code>. Open it and
						follow the verification link before accepting invitations.
					</Alert.Description>
				</Alert.Root>
				{#if form.verificationSent === false}
					<Alert.Root variant="destructive">
						<MailWarning class="size-4" />
						<Alert.Title>Verification email not sent</Alert.Title>
						<Alert.Description>
							The account was created but the verification email could not be sent. In local
							development, confirm mailpit is running (see pocketbase/README.md).
						</Alert.Description>
					</Alert.Root>
				{:else}
					<p class="text-sm text-muted-foreground">
						Local development: captured email is visible in mailpit at
						<a
							class="underline underline-offset-4"
							href="http://127.0.0.1:8025"
							target="_blank"
							rel="noreferrer">127.0.0.1:8025</a
						>.
					</p>
				{/if}
				<Button href={loginHref} class="w-full">Continue to sign in</Button>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Content class="flex flex-col gap-4 pt-6">
				{#if form?.message}
					<Alert.Root variant="destructive">
						<AlertCircle class="size-4" />
						<Alert.Title>Registration failed</Alert.Title>
						<Alert.Description>{form.message}</Alert.Description>
					</Alert.Root>
				{/if}

				<form method="POST" class="flex flex-col gap-4">
					<div class="flex flex-col gap-2">
						<Label for="name">Display name</Label>
						<Input
							id="name"
							name="name"
							type="text"
							autocomplete="name"
							required
							value={form?.name ?? ''}
						/>
					</div>
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
							autocomplete="new-password"
							minlength={8}
							required
						/>
					</div>
					<div class="flex flex-col gap-2">
						<Label for="passwordConfirm">Confirm password</Label>
						<Input
							id="passwordConfirm"
							name="passwordConfirm"
							type="password"
							autocomplete="new-password"
							minlength={8}
							required
						/>
					</div>
					<Button type="submit" class="w-full">Create account</Button>
				</form>
			</Card.Content>
		</Card.Root>

		<p class="text-center text-sm text-muted-foreground">
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() applies the base path; only a query string is appended -->
			Already registered? <a class="underline underline-offset-4" href={loginHref}>Sign in</a>
		</p>
	{/if}
</section>
