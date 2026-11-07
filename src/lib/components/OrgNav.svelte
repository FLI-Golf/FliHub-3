<script lang="ts">
	import { resolve } from '$app/paths';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { availabilityMeta, type CapabilityDefinition } from '$lib/capabilities/catalog';

	interface Props {
		orgId: string;
		/** Enabled capabilities (catalog definitions, already filtered). */
		enabledCapabilities: CapabilityDefinition[];
		canManage: boolean;
		/** 'overview' | 'settings' | a capability id. */
		current: string;
	}

	let { orgId, enabledCapabilities, canManage, current }: Props = $props();
</script>

<nav class="flex flex-wrap items-center gap-1" aria-label="Organization sections">
	<Button
		variant={current === 'overview' ? 'secondary' : 'ghost'}
		size="sm"
		href={resolve('/(app)/organizations/[id]', { id: orgId })}
	>
		Overview & members
	</Button>
	{#each enabledCapabilities as capability (capability.id)}
		{@const meta = availabilityMeta[capability.availability]}
		<Button
			variant={current === capability.id ? 'secondary' : 'ghost'}
			size="sm"
			href={resolve('/(app)/organizations/[id]/cap/[capability]', {
				id: orgId,
				capability: capability.id
			})}
			class="gap-1.5"
		>
			{capability.label}
			<Badge variant="secondary" class={`text-[10px] ${meta.badgeClass}`}>{meta.label}</Badge>
		</Button>
	{/each}
	{#if canManage}
		<Button
			variant={current === 'public' ? 'secondary' : 'ghost'}
			size="sm"
			href={resolve('/(app)/organizations/[id]/public', { id: orgId })}
		>
			Public page
		</Button>
		<Button
			variant={current === 'settings' ? 'secondary' : 'ghost'}
			size="sm"
			href={resolve('/(app)/organizations/[id]/settings', { id: orgId })}
		>
			Settings
		</Button>
	{/if}
</nav>
