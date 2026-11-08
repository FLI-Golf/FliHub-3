<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowLeft, Download } from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.title} — Phase 2A–2B walkthrough — FliHub</title>
	<meta name="description" content={data.description} />
</svelte:head>

<section class="mx-auto flex max-w-4xl flex-col gap-6 py-6">
	<Button variant="ghost" size="sm" href={resolve('/')} class="w-fit">
		<ArrowLeft class="size-4" /> Back to overview
	</Button>
	<div class="flex flex-wrap items-center gap-3">
		<h1 class="text-2xl font-semibold tracking-tight">{data.title}</h1>
		<Badge variant="secondary">Narrated walkthrough</Badge>
	</div>
	<p class="max-w-2xl text-muted-foreground">{data.description}</p>
	<Card.Root>
		<Card.Content class="flex flex-col gap-4 pt-6">
			{#if data.src}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- static video asset -->
				<video controls preload="metadata" src={data.src} class="w-full rounded-md border">
					<track kind="captions" src={data.captions} srclang="en" label="English" />
					Your browser does not support embedded video — use the download link below.
				</video>
				<div>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- static video asset -->
					<Button variant="outline" href={data.src} download={data.file}>
						<Download class="size-4" /> Download video ({data.sizeMb} MB, MP4)
					</Button>
				</div>
				<p class="text-sm text-muted-foreground">
					Narrated recording with on-screen scene labels and optional English captions.
				</p>
			{:else}
				<p class="text-muted-foreground">
					Walkthrough coming soon — recording is not present in this checkout. See
					recordings/README.md to regenerate it.
				</p>
			{/if}
		</Card.Content>
	</Card.Root>
</section>
