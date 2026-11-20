<script lang="ts">
	import type { NavigationCount } from '$lib/server/organization-navigation-counts';

	let { items = [] }: { items?: NavigationCount[] } = $props();
</script>

{#each items as item (item.label)}
	<span
		class="inline-flex shrink-0 items-baseline gap-1 text-[10px]"
		title={`${item.label}: ${item.value === null ? 'count unavailable' : item.value}`}
	>
		{#if item.shortLabel}
			<span aria-hidden="true" class="font-medium text-muted-foreground">{item.shortLabel}</span>
		{/if}
		<span
			aria-label={`${item.label}: ${item.value === null ? 'count unavailable' : item.value}`}
			class="font-semibold tabular-nums {item.tone === 'red'
				? 'text-red-700 dark:text-red-400'
				: item.tone === 'blue'
					? 'text-blue-700 dark:text-blue-400'
					: 'text-foreground'}"
		>
			{item.value === null ? '—' : item.value > 999 ? '999+' : item.value}
		</span>
	</span>
{/each}
