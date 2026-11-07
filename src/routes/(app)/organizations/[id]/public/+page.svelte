<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Eye, Globe, Megaphone } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import OrgNav from '$lib/components/OrgNav.svelte';
	import PublicOrgPage from '$lib/components/PublicOrgPage.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const publicUrl = $derived(
		data.publicPage.slug ? resolve('/o/[slug]', { slug: data.publicPage.slug }) : null
	);
</script>

<svelte:head>
	<title>Public page — {data.organizationName} — FliHub</title>
</svelte:head>

<section class="flex flex-col gap-6 py-4">
	<div class="flex flex-col gap-2">
		<h1 class="text-2xl font-semibold tracking-tight">
			{data.organizationName} — Public page
		</h1>
		<OrgNav
			orgId={data.organizationId}
			enabledCapabilities={data.enabledCapabilities}
			canManage={data.canManage}
			current="public"
		/>
	</div>

	{#if form?.message}
		<Alert.Root variant="destructive" data-testid="public-page-error">
			<Alert.Title>That didn’t work</Alert.Title>
			<Alert.Description>{form.message}</Alert.Description>
		</Alert.Root>
	{/if}

	<Card.Root data-testid="publish-state">
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<Globe class="size-4" /> Publication
				{#if data.publicPage.published}
					<Badge>Published</Badge>
				{:else}
					<Badge variant="secondary">Not published</Badge>
				{/if}
			</Card.Title>
			<Card.Description>
				{#if data.publicPage.published && publicUrl}
					The page is live at <a class="underline" href={publicUrl} data-testid="public-url"
						>{publicUrl}</a
					>. Unpublishing hides it (visitors get a 404) without deleting any data.
				{:else if data.publicPage.slug}
					The page is hidden. Visitors to /o/{data.publicPage.slug} get a 404 until you publish.
				{:else}
					Reserve a slug below, then publish to make the page reachable.
				{/if}
			</Card.Description>
		</Card.Header>
		{#if data.canManage}
			<Card.Content class="flex flex-wrap gap-2">
				{#if data.publicPage.published}
					<form method="POST" action="?/unpublish" use:enhance>
						<Button type="submit" variant="outline" data-testid="unpublish-button">
							Unpublish
						</Button>
					</form>
				{:else}
					<form method="POST" action="?/publish" use:enhance>
						<Button type="submit" disabled={!data.publicPage.slug} data-testid="publish-button">
							<Megaphone class="mr-1 size-4" /> Publish
						</Button>
					</form>
				{/if}
			</Card.Content>
		{/if}
	</Card.Root>

	{#if data.canManage}
		<Card.Root data-testid="branding-settings">
			<Card.Header>
				<Card.Title>Slug & branding</Card.Title>
				<Card.Description>
					Only the organization name is required to publish; tagline, logo, and theme colors are
					optional. Slugs are 3–50 lowercase letters, digits, and single hyphens, unique across
					FliHub, and changeable only here.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form method="POST" action="?/saveSettings" use:enhance class="grid gap-4 sm:grid-cols-2">
					<div class="flex flex-col gap-1.5">
						<Label for="pp-slug">Public slug</Label>
						<Input
							id="pp-slug"
							name="slug"
							placeholder="my-club"
							value={data.publicPage.slug}
							data-testid="slug-input"
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="pp-tagline">Tagline</Label>
						<Input
							id="pp-tagline"
							name="tagline"
							maxlength={160}
							value={data.publicPage.tagline}
							data-testid="tagline-input"
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="pp-logo">Logo URL</Label>
						<Input
							id="pp-logo"
							name="logoUrl"
							placeholder="https://…"
							value={data.publicPage.logoUrl}
						/>
					</div>
					<div class="flex gap-4">
						<div class="flex flex-col gap-1.5">
							<Label for="pp-primary">Primary color</Label>
							<Input
								id="pp-primary"
								name="themePrimary"
								placeholder="#1d4ed8"
								value={data.publicPage.themePrimary}
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<Label for="pp-secondary">Secondary color</Label>
							<Input
								id="pp-secondary"
								name="themeSecondary"
								placeholder="#0f172a"
								value={data.publicPage.themeSecondary}
							/>
						</div>
					</div>
					<div class="sm:col-span-2">
						<Button type="submit" data-testid="save-branding">Save</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>

		<Card.Root data-testid="record-publication">
			<Card.Header>
				<Card.Title>What is published</Card.Title>
				<Card.Description>
					Publication is per record — nothing is public by default. Events control the public
					schedule, results, and standings; teams and athlete display profiles appear only when
					individually published. Unpublishing never deletes data.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-6">
				<div class="flex flex-col gap-2">
					<p class="text-sm font-medium">Events</p>
					{#if data.records.events.length === 0}
						<p class="text-sm text-muted-foreground">No events yet.</p>
					{/if}
					{#each data.records.events as event (event.id)}
						<div class="flex flex-wrap items-center gap-2 text-sm" data-testid="event-toggle">
							<span>{event.name}</span>
							{#if event.officialResultPublished}
								<Badge variant="outline" class="text-[10px]">Official result published</Badge>
							{/if}
							<form method="POST" action="?/toggleRecord" use:enhance class="ml-auto">
								<input type="hidden" name="collection" value="events" />
								<input type="hidden" name="id" value={event.id} />
								<input type="hidden" name="next" value={String(!event.publicPublished)} />
								<Button
									type="submit"
									size="sm"
									variant={event.publicPublished ? 'secondary' : 'outline'}
								>
									{event.publicPublished ? 'Public — unpublish' : 'Private — publish'}
								</Button>
							</form>
						</div>
					{/each}
				</div>
				<Separator />
				<div class="flex flex-col gap-2">
					<p class="text-sm font-medium">Teams</p>
					{#if data.records.teams.length === 0}
						<p class="text-sm text-muted-foreground">No active teams yet.</p>
					{/if}
					{#each data.records.teams as team (team.id)}
						<div class="flex flex-wrap items-center gap-2 text-sm" data-testid="team-toggle">
							<span>{team.name}</span>
							<form method="POST" action="?/toggleRecord" use:enhance class="ml-auto">
								<input type="hidden" name="collection" value="teams" />
								<input type="hidden" name="id" value={team.id} />
								<input type="hidden" name="next" value={String(!team.publicPublished)} />
								<Button
									type="submit"
									size="sm"
									variant={team.publicPublished ? 'secondary' : 'outline'}
								>
									{team.publicPublished ? 'Public — unpublish' : 'Private — publish'}
								</Button>
							</form>
						</div>
					{/each}
				</div>
				<Separator />
				<div class="flex flex-col gap-2">
					<p class="text-sm font-medium">Athlete display profiles</p>
					<p class="text-xs text-muted-foreground">
						Public profiles show only display name, gender, and nationality. Contact and eligibility
						data is never public. Athlete self-service opt-out is a recorded open decision.
					</p>
					{#if data.records.athletes.length === 0}
						<p class="text-sm text-muted-foreground">No active athletes yet.</p>
					{/if}
					{#each data.records.athletes as athlete (athlete.id)}
						<div class="flex flex-wrap items-center gap-2 text-sm" data-testid="athlete-toggle">
							<span>{athlete.name}</span>
							<form method="POST" action="?/toggleRecord" use:enhance class="ml-auto">
								<input type="hidden" name="collection" value="athletes" />
								<input type="hidden" name="id" value={athlete.id} />
								<input type="hidden" name="next" value={String(!athlete.publicPublished)} />
								<Button
									type="submit"
									size="sm"
									variant={athlete.publicPublished ? 'secondary' : 'outline'}
								>
									{athlete.publicPublished ? 'Public — unpublish' : 'Private — publish'}
								</Button>
							</form>
						</div>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root data-testid="public-preview">
		<Card.Header>
			<Card.Title class="flex items-center gap-2"><Eye class="size-4" /> Preview</Card.Title>
			<Card.Description>
				Exactly what a visitor sees{data.publicPage.published ? '' : ' once the page is published'} —
				only members can open this preview.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<div class="rounded-lg border bg-background p-4">
				<PublicOrgPage page={data.preview} />
			</div>
		</Card.Content>
	</Card.Root>
</section>
