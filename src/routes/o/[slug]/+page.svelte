<script lang="ts">
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

<PublicOrgPage page={data.page} />
