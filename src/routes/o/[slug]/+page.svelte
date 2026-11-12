<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import PublicOrgPage from '$lib/components/PublicOrgPage.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.page.organization.name} — FliHub</title>
	{#if data.page.organization.tagline}
		<meta name="description" content={data.page.organization.tagline} />
	{/if}
</svelte:head>

<div class="mb-6 rounded-lg border bg-blue-50 p-4 text-blue-950">
 <h2 class="font-semibold">Play fantasy with {data.page.organization.name}</h2>
 <p class="my-2 text-sm">Explore seasons open for fantasy and create your own league.</p>
 <Button href={`${resolve('/(app)/account')}?activity=fantasy&organization=${encodeURIComponent(data.page.organization.slug)}`}>Play fantasy</Button>
</div>
<PublicOrgPage page={data.page} />
