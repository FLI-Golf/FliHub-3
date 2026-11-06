<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowLeft, Download, Video } from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const primary = $derived(data.narrated ?? data.silent);
</script>

<svelte:head>
	<title>Phase 1C walkthrough — FliHub</title>
	<meta
		name="description"
		content="Recorded walkthrough of FliHub Phase 1C: athlete identity, private contact fields, and role-based access."
	/>
</svelte:head>

<section class="mx-auto flex max-w-4xl flex-col gap-6 py-6">
	<Button variant="ghost" size="sm" href={resolve('/')} class="w-fit">
		<ArrowLeft class="size-4" />
		Back to overview
	</Button>

	<div class="flex flex-wrap items-center gap-3">
		<h1 class="text-2xl font-semibold tracking-tight">Phase 1C walkthrough</h1>
		{#if data.narrated}
			<Badge>Narrated walkthrough</Badge>
		{:else}
			<Badge variant="secondary">Silent walkthrough — narration planned</Badge>
		{/if}
	</div>
	<p class="max-w-2xl text-muted-foreground">
		Athlete records with organization-scoped identity: Owners and Admins manage private contact and
		eligibility fields while Scorekeepers and Viewers receive identity only — plus archive/restore
		and CSV import, recorded against a disposable local instance with fictional demo accounts.
	</p>

	{#if primary}
		<Card.Root>
			<Card.Content class="flex flex-col gap-4 pt-6">
				{#if data.narrated}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- static asset path, not a route -->
					<video
						controls
						preload="metadata"
						src={data.narrated.src}
						class="w-full rounded-md border"
					>
						<!-- Real captions, generated with the narrated cut. -->
						<track
							kind="captions"
							src={data.narrated.captionsSrc ?? ''}
							label="English captions"
							default
						/>
						Your browser does not support embedded video — use the download link below.
					</video>
				{:else}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- static asset path, not a route -->
					<!-- eslint-disable-next-line svelte/no-unused-svelte-ignore -- the a11y_media_has_caption ignore below IS used by svelte-check (verified: warning fires without it); eslint's svelte parser does not model that warning -->
					<!-- svelte-ignore a11y_media_has_caption -- the silent original has no audio track, so there is nothing to caption (WCAG captions apply to audio content) -->
					<video
						controls
						preload="metadata"
						src={data.silent?.src}
						class="w-full rounded-md border"
					>
						Your browser does not support embedded video — use the download link below.
					</video>
				{/if}
				<div class="flex flex-wrap items-center gap-3">
					{#if data.narrated}
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- static asset path, not a route -->
						<Button
							variant="outline"
							href={data.narrated.src}
							download="flihub-phase1c-walkthrough.mp4"
						>
							<Download class="size-4" />
							Download narrated video ({data.narrated.sizeMb} MB, MP4)
						</Button>
					{:else if data.silent}
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- static asset path, not a route -->
						<Button
							variant="outline"
							href={data.silent.src}
							download="flihub-phase1c-walkthrough.webm"
						>
							<Download class="size-4" />
							Download video ({data.silent.sizeMb} MB, WebM)
						</Button>
					{/if}
					{#if data.narrated && data.silent}
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- static asset path, not a route -->
						<Button
							variant="ghost"
							href={data.silent.src}
							download="flihub-phase1c-walkthrough-silent.webm"
						>
							Silent original ({data.silent.sizeMb} MB, WebM)
						</Button>
					{/if}
				</div>
				{#if !data.narrated}
					<p class="text-sm text-muted-foreground">
						Silent recording. Narration is scripted and will be added in a later assembly step.
					</p>
				{/if}
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Content class="flex items-center gap-3 pt-6">
				<Video class="size-5 text-muted-foreground" />
				<p class="text-muted-foreground">
					Walkthrough coming soon — the recording has not been generated on this checkout yet. See
					<code class="rounded bg-muted px-1 py-0.5 text-sm">recordings/README.md</code> to regenerate
					it.
				</p>
			</Card.Content>
		</Card.Root>
	{/if}
</section>
