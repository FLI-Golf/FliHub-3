<script lang="ts">
	import type { NavigationCount } from '$lib/server/organization-navigation-counts';
	let {
        items = [],
        useYellow = false
    }: { items?: NavigationCount[]; useYellow?: boolean } = $props();
</script>

{#each items as item (item.label)}
	<span
		class="inline-flex shrink-0 items-center gap-1"
		title={`${item.label}: ${item.value === null ? 'count unavailable' : item.value}`}
	>
		{#if item.shortLabel}<span
				aria-hidden="true"
				class={`text-[10px] text-muted-foreground ${useYellow ? 'font-medium' : 'font-normal'}`}>{item.shortLabel}</span
			>{/if}
		<span
			aria-label={`${item.label}: ${item.value === null ? 'count unavailable' : item.value}`}
			class={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums ${useYellow && item.tone !== 'red' ? 'border-yellow-300 bg-yellow-100 text-yellow-950' : item.value === null ? 'border-amber-300 bg-amber-50 text-amber-950' : item.tone === 'red' ? 'border-red-200 bg-red-100 text-red-950' : item.tone === 'blue' ? 'border-blue-200 bg-blue-100 text-blue-950' : item.value === 0 ? 'border-slate-300 bg-slate-100 text-slate-700' : 'border-blue-200 bg-blue-100 text-blue-950'}`}
		>
			{item.value === null ? '—' : item.value > 999 ? '999+' : item.value}
		</span>
	</span>
{/each}
