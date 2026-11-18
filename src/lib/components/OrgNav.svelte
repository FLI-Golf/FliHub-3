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
	import NavigationCountBadges from '$lib/components/NavigationCountBadges.svelte';
	import { availabilityMeta, type CapabilityDefinition } from '$lib/capabilities/catalog';
	import type { OrganizationNavigationCounts } from '$lib/server/organization-navigation-counts';

	interface Props {
		orgId: string;
		enabledCapabilities: CapabilityDefinition[];
		canManage: boolean;
		current: string;
		counts?: OrganizationNavigationCounts;
	}
	let { orgId, enabledCapabilities, canManage, current, counts = {} }: Props = $props();
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
	function cardClass(active: boolean): string {
		return `flex min-h-32 min-w-0 flex-col gap-3 rounded-xl border p-4 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${active ? 'border-blue-600 bg-blue-50 text-blue-950 ring-1 ring-blue-600' : 'border-border bg-card text-card-foreground hover:border-blue-300 hover:bg-blue-50/50'}`;
	}
</script>

<nav
	class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
	aria-label="Organization sections"
>
	<a
		href={resolve('/(app)/organizations/[id]', { id: orgId })}
		aria-current={current === 'overview' ? 'page' : undefined}
		class={cardClass(current === 'overview')}
	>
		<span class="flex items-start gap-2"
			><Users aria-hidden="true" class="mt-0.5 size-5 shrink-0" /><span
				class="min-w-0 leading-snug font-semibold break-words">Overview &amp; members</span
			></span
		>
		<span class="flex flex-wrap items-center gap-x-3 gap-y-2"
			><NavigationCountBadges items={counts.overview} /></span
		>
		<span class="mt-auto text-xs text-muted-foreground">Organization and membership</span>
	</a>
	{#each enabledCapabilities as capability (capability.id)}
		{@const meta = availabilityMeta[capability.availability]}
		{@const Icon = icons[capability.id] ?? Shapes}
		<a
			href={resolve('/(app)/organizations/[id]/cap/[capability]', {
				id: orgId,
				capability: capability.id
			})}
			aria-current={current === capability.id ? 'page' : undefined}
			class={cardClass(current === capability.id)}
		>
			<span class="flex items-start gap-2"
				><Icon aria-hidden="true" class="mt-0.5 size-5 shrink-0" /><span
					class="min-w-0 leading-snug font-semibold break-words">{capability.label}</span
				></span
			>
			{#if counts[capability.id]?.length && (capability.id !== 'sponsorships' || canManage)}
				{#if capability.id === 'venues-courses'}
					<span class="flex flex-wrap items-center gap-x-3 gap-y-2">
						<NavigationCountBadges
							items={counts[capability.id].filter((item) => item.group !== 'positions')}
						/>
					</span>
					<span class="flex flex-wrap items-center gap-x-3 gap-y-2">
						<span class="sr-only">Basket positions or tee sets</span>
						<NavigationCountBadges
							items={counts[capability.id].filter((item) => item.group === 'positions')}
						/>
					</span>
				{:else}
					<span class="flex flex-wrap items-center gap-x-3 gap-y-2">
						<NavigationCountBadges items={counts[capability.id]} />
					</span>
				{/if}
			{/if}
			<span class="mt-auto flex flex-wrap items-center gap-2"
				><Badge variant="secondary" class={`w-fit text-[10px] ${meta.badgeClass}`}
					>{meta.label}</Badge
				></span
			>
		</a>
	{/each}
	{#if canManage}
		<a
			href={resolve('/(app)/organizations/[id]/public', { id: orgId })}
			aria-current={current === 'public' ? 'page' : undefined}
			class={cardClass(current === 'public')}
		>
			<span class="flex items-start gap-2"
				><Flag aria-hidden="true" class="mt-0.5 size-5 shrink-0" /><span
					class="min-w-0 leading-snug font-semibold break-words">Public page</span
				></span
			>
			<span class="mt-auto text-xs text-muted-foreground">Branding and publication</span>
		</a>
		<a
			href={resolve('/(app)/organizations/[id]/settings', { id: orgId })}
			aria-current={current === 'settings' ? 'page' : undefined}
			class={cardClass(current === 'settings')}
		>
			<span class="flex items-start gap-2"
				><Settings aria-hidden="true" class="mt-0.5 size-5 shrink-0" /><span
					class="min-w-0 leading-snug font-semibold break-words">Settings</span
				></span
			>
			<span class="mt-auto text-xs text-muted-foreground">Configuration and capabilities</span>
		</a>
	{/if}
</nav>
