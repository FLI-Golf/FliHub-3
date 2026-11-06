<script lang="ts">
	import './layout.css';
	import logoIcon from '#lib/assets/logos/logo_f.png';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	const activeMembership = $derived(
		data.memberships?.find((m) => m.organization.id === data.activeOrgId) ?? null
	);

	function roleLabel(role: string): string {
		return role.charAt(0).toUpperCase() + role.slice(1);
	}
</script>

<svelte:head>
	<link rel="icon" href={logoIcon} />
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
				<img src={logoIcon} alt="" class="size-9 shrink-0 object-contain" />
				FliHub
			</a>
			<Badge variant="secondary">Phase 1G</Badge>
			<nav class="ml-auto hidden items-center gap-1 sm:flex">
				{#if data.user}
					<Button variant="ghost" href={resolve('/(app)/organizations')}>Organizations</Button>
					{#if activeMembership}
						<Badge variant="outline" class="gap-1">
							{activeMembership.organization.name} · {roleLabel(activeMembership.role)}
						</Badge>
					{/if}
					<span class="px-2 text-sm text-muted-foreground">{data.user.name}</span>
					<form method="POST" action={resolve('/(app)/logout')}>
						<Button type="submit" variant="ghost">Sign out</Button>
					</form>
				{:else}
					<Button variant="ghost" href="/#planned-features">Planned features</Button>
					<Button variant="ghost" href={resolve('/(auth)/login')}>Sign in</Button>
					<Button href={resolve('/(auth)/register')}>Create account</Button>
				{/if}
			</nav>
		</div>
		<nav class="flex items-center gap-1 overflow-x-auto border-t px-4 py-2 sm:hidden">
			{#if data.user}
				<Button variant="ghost" size="sm" href={resolve('/(app)/organizations')}
					>Organizations</Button
				>
				{#if activeMembership}
					<Badge variant="outline" class="gap-1 text-xs">
						{activeMembership.organization.name} · {roleLabel(activeMembership.role)}
					</Badge>
				{/if}
				<form method="POST" action={resolve('/(app)/logout')} class="ml-auto">
					<Button type="submit" variant="ghost" size="sm">Sign out</Button>
				</form>
			{:else}
				<Button variant="ghost" size="sm" href="/#planned-features">Planned features</Button>
				<Button variant="ghost" size="sm" href={resolve('/(auth)/login')}>Sign in</Button>
				<Button size="sm" href={resolve('/(auth)/register')}>Create account</Button>
			{/if}
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
				FliHub Phase 1G build. Organizations, onboarding, athletes, competition structure, rosters,
				event operations, and mobile scorekeeping are implemented and verified; official results,
				standings, and fantasy remain planned.
			</p>
			<p>
				PocketBase: {data.pocketbase.configured ? 'configured' : 'not configured'}
			</p>
		</div>
	</footer>
</div>
