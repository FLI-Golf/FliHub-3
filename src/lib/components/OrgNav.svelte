<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		CircleDot,
		Users,
		CalendarRange,
		Flag,
		Timer,
		Target,
		Trophy,
		Crown,
		Shapes,
		Settings
	} from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { getOrganizationProfile } from '$lib/organizations/profiles';
	import NavigationCountBadges from '$lib/components/NavigationCountBadges.svelte';
	import { availabilityMeta, type CapabilityDefinition } from '$lib/capabilities/catalog';
	import type { OrganizationNavigationCounts } from '$lib/server/organization-navigation-counts';

	interface Props {
		orgId: string;
		profile?: string;
		enabledCapabilities: CapabilityDefinition[];
		canManage: boolean;
		current: string;
		counts?: OrganizationNavigationCounts;
	}
	let {
		orgId,
		profile = '',
		enabledCapabilities,
		canManage,
		current,
		counts = {}
	}: Props = $props();

	const profileDefinition = $derived(getOrganizationProfile(profile));
	const icons: Record<string, typeof CircleDot> = {
		athletes: CircleDot,
		teams: Users,
		'leagues-seasons': CalendarRange,
		'venues-courses': Flag,
		events: Timer,
		'scoring-results': Target,
		standings: Trophy,
		fantasy: Crown
	};
	function rowClass(active: boolean): string {
		return `grid min-w-0 content-start gap-0.5 rounded-md px-2 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${active ? 'bg-blue-50 text-blue-950 ring-1 ring-inset ring-blue-300' : 'bg-white text-card-foreground even:bg-slate-300 hover:bg-blue-50 even:hover:bg-blue-50'}`;
	}
</script>

<nav class="grid gap-0.5" aria-label="Organization sections">
	<a
		href={resolve('/(app)/organizations/[id]', { id: orgId })}
		aria-current={current === 'overview' ? 'page' : undefined}
		class={rowClass(current === 'overview')}
	>
		<span class="flex items-start gap-2"
			><Users aria-hidden="true" class="mt-0.5 size-4 shrink-0" /><span
				class="min-w-0 leading-snug font-semibold break-words">Overview &amp; members</span
			>
			<NavigationCountBadges items={counts.overview?.filter((item) => !item.shortLabel)} /></span
		>
		<span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 pl-6"
			><NavigationCountBadges items={counts.overview?.filter((item) => item.shortLabel)} /></span
		>
		<span class="sr-only">Organization and membership</span>
	</a>
	{#each enabledCapabilities as capability (capability.id)}
		{@const meta = availabilityMeta[capability.availability]}
		{@const Icon = icons[capability.id] ?? Shapes}
		{@const capabilityCounts =
			canManage || (capability.id !== 'sponsorships' && capability.id !== 'reimbursements')
				? (counts[capability.id] ?? [])
				: []}
		<a
			href={resolve('/(app)/organizations/[id]/cap/[capability]', {
				id: orgId,
				capability: capability.id
			})}
			aria-current={current === capability.id ? 'page' : undefined}
			class={rowClass(current === capability.id)}
		>
			<span class="flex items-start gap-2"
				><Icon aria-hidden="true" class="mt-0.5 size-4 shrink-0" /><span
					class="min-w-0 leading-snug font-semibold break-words"
					>{capability.id === 'athletes' && profileDefinition
						? profileDefinition.terminology.athletes
						: capability.label}</span
				>
				<NavigationCountBadges items={capabilityCounts.filter((item) => !item.shortLabel)} /></span
			>
			{#if capabilityCounts.some((item) => item.shortLabel)}
				{#if capability.id === 'venues-courses'}
					<span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 pl-6">
						<NavigationCountBadges
							items={capabilityCounts.filter(
								(item) => item.shortLabel && item.group !== 'positions'
							)}
						/>
					</span>
					<span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 pl-6">
						<span class="sr-only">Basket positions or tee sets</span>
						<NavigationCountBadges
							items={capabilityCounts.filter(
								(item) => item.shortLabel && item.group === 'positions'
							)}
						/>
					</span>
				{:else}
					<span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 pl-6">
						<NavigationCountBadges items={capabilityCounts.filter((item) => item.shortLabel)} />
					</span>
				{/if}
			{/if}
			{#if meta.label !== 'Available'}
				<span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 pl-6"
					><Badge variant="secondary" class={`w-fit text-[10px] ${meta.badgeClass}`}
						>{meta.label}</Badge
					></span
				>
			{/if}
		</a>
	{/each}
	{#if canManage && !profileDefinition}
		<a
			href={resolve('/(app)/organizations/[id]/public', { id: orgId })}
			aria-current={current === 'public' ? 'page' : undefined}
			class={rowClass(current === 'public')}
		>
			<span class="flex items-start gap-2"
				><Flag aria-hidden="true" class="mt-0.5 size-4 shrink-0" /><span
					class="min-w-0 leading-snug font-semibold break-words">Public page</span
				></span
			>
			<span class="sr-only">Branding and publication</span>
		</a>
	{/if}
	{#if canManage}
		<a
			href={resolve('/(app)/organizations/[id]/settings', { id: orgId })}
			aria-current={current === 'settings' ? 'page' : undefined}
			class={rowClass(current === 'settings')}
		>
			<span class="flex items-start gap-2"
				><Settings aria-hidden="true" class="mt-0.5 size-4 shrink-0" /><span
					class="min-w-0 leading-snug font-semibold break-words">Settings</span
				></span
			>
			<span class="sr-only">Configuration and capabilities</span>
		</a>
	{/if}
</nav>
