<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { PanelLeft } from 'lucide-svelte';
	import OrgNav from '$lib/components/OrgNav.svelte';
	import { getOrganizationProfile } from '$lib/organizations/profiles';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const profile = $derived(getOrganizationProfile(data.organizationNav?.profile ?? ''));
	let mobileOpen = $state(false);
	let desktopOpen = $state(true);
	const route = $derived(page.route.id ?? '');
	const current = $derived(
		page.params.capability ??
			(route.includes('/public')
				? 'public'
				: route.includes('/settings')
					? 'settings'
					: route.includes('/events/')
						? 'events'
						: route.includes('/fantasy/')
							? 'fantasy'
							: 'overview')
	);
	afterNavigate(() => {
		mobileOpen = false;
	});
</script>

{#if data.organizationNav}
	<div class="flex flex-col gap-4">
		<div class="flex items-center gap-2">
			<Button
				variant="outline"
				size="sm"
				class="lg:hidden"
				aria-controls="organization-sidebar"
				aria-expanded={mobileOpen}
				onclick={() => (mobileOpen = !mobileOpen)}
			>
				<PanelLeft aria-hidden="true" />
				{mobileOpen ? 'Hide navigation' : 'Show navigation'}
			</Button>
			<Button
				variant="outline"
				size="sm"
				class="hidden lg:inline-flex"
				aria-controls="organization-sidebar"
				aria-expanded={desktopOpen}
				onclick={() => (desktopOpen = !desktopOpen)}
			>
				<PanelLeft aria-hidden="true" />
				{desktopOpen ? 'Hide navigation' : 'Show navigation'}
			</Button>
		</div>
		<div class="flex flex-col items-start gap-5 lg:flex-row">
			<aside
				id="organization-sidebar"
				class="w-full rounded-xl border bg-card p-3 lg:sticky lg:top-16 lg:max-h-[calc(100dvh-5rem)] lg:w-64 lg:shrink-0 lg:overflow-y-auto {mobileOpen
					? 'block'
					: 'hidden'} {desktopOpen ? 'lg:block' : 'lg:hidden'}"
			>
				<div class="mb-3 px-2">
					<p class="font-semibold">{data.organizationNav.name}</p>
					{#if profile}
						<p class="mt-1 text-xs text-muted-foreground">
							{profile.label}
						</p>
					{/if}
				</div>
				<OrgNav {...data.organizationNav} {current} />
			</aside>
			<div class="w-full min-w-0 flex-1">
				{@render children()}
			</div>
		</div>
	</div>
{:else}
	{@render children()}
{/if}
