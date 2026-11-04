<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>FliHub</title>
	<meta
		name="description"
		content="FliHub — configurable sports organization management with connected fantasy competitions."
	/>
</svelte:head>

<div class="flex min-h-screen flex-col">
	<header class="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
		<div class="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
			<a href={resolve('/')} class="flex items-center gap-2 font-semibold">
				<span
					class="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground"
					>FH</span
				>
				FliHub
			</a>
			<Badge variant="secondary">Foundation</Badge>
			<nav class="ml-auto hidden items-center gap-1 sm:flex">
				<Button variant="ghost" href="#planned-features">Planned features</Button>
				<Button variant="ghost" href="#setup">Setup</Button>
				<Button
					variant="ghost"
					href="https://github.com/FLI-Golf/FliHub-3"
					target="_blank"
					rel="noreferrer">Repository</Button
				>
			</nav>
			<div class="ml-auto sm:ml-0">
				<Button disabled title="Authentication arrives with the membership milestone"
					>Sign in (not yet available)</Button
				>
			</div>
		</div>
		<nav class="flex items-center gap-1 overflow-x-auto border-t px-4 py-2 sm:hidden">
			<Button variant="ghost" size="sm" href="#planned-features">Planned features</Button>
			<Button variant="ghost" size="sm" href="#setup">Setup</Button>
			<Button
				variant="ghost"
				size="sm"
				href="https://github.com/FLI-Golf/FliHub-3"
				target="_blank"
				rel="noreferrer">Repository</Button
			>
		</nav>
	</header>

	<main class="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
		{@render children()}
	</main>

	<footer class="border-t">
		<div
			class="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
		>
			<p>
				FliHub foundation build. Authentication, organization data, and competitions are planned,
				not yet available.
			</p>
			<p>
				PocketBase: {data.pocketbase.configured ? 'configured' : 'not configured'}
			</p>
		</div>
	</footer>
</div>
