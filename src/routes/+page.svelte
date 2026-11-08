<script lang="ts">
	import { resolve } from '$app/paths';
	import { AlertCircle, CircleCheck, Construction, Map, Server } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { capabilities, capabilityStatusMeta } from '$lib/data/planned-features';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const narrationLabels: Record<string, string> = {
		'not-started': 'not started',
		scripted: 'scripted',
		recorded: 'recorded'
	};
</script>

<!-- Hero -->
<section class="flex flex-col items-start gap-4 py-6 sm:py-10">
	<div class="flex flex-wrap items-center gap-2">
		<Badge>Through Phases 2A–2B — fantasy drafts</Badge>
		<Badge variant="outline">SvelteKit</Badge>
		<Badge variant="outline">Tailwind CSS</Badge>
		<Badge variant="outline">shadcn-svelte</Badge>
		<Badge variant="outline">PocketBase</Badge>
	</div>
	<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">
		FliHub — sports organization management
	</h1>
	<p class="max-w-2xl text-lg text-muted-foreground">
		A configurable platform for sports organizations with connected fantasy competitions. Verified
		today: accounts, organizations, invitations and roles, configurable onboarding, athlete records,
		competition structure, season rosters with reserve pools, event operations (courses, rounds,
		groups), phone-first scorekeeping, official results with versioned corrections, competition
		standings from published results, published organization pages, and fantasy leagues with live
		per-event snake drafts. Fantasy scoring below is planned, not yet available.
	</p>
	<div class="flex flex-wrap gap-2">
		{#if data.user}
			<Button href={resolve('/(app)/organizations')}>Open your organizations</Button>
		{:else}
			<Button href={resolve('/(auth)/register')}>Create account</Button>
			<Button variant="outline" href={resolve('/(auth)/login')}>Sign in</Button>
		{/if}
		<Button variant="outline" href="#planned-features">View planned features</Button>
	</div>
</section>

<Separator class="my-6" />

<!-- Setup status -->
<section id="setup" class="flex flex-col gap-4 py-4">
	<h2 class="text-xl font-semibold tracking-tight">Backend setup status</h2>

	{#if data.pocketbase.configured}
		<Alert.Root>
			<CircleCheck class="size-4" />
			<Alert.Title>PocketBase URL configured</Alert.Title>
			<Alert.Description>
				This server is configured to use the PocketBase instance at
				<code class="rounded bg-muted px-1 py-0.5 text-sm">{data.pocketbase.url}</code>. This
				reports configuration only — it does not check which collections that instance has.
				Collection migrations ship with the repository (see
				<code class="rounded bg-muted px-1 py-0.5 text-sm">pocketbase/pb_migrations/</code>);
				feature availability is shown in the capability progress below.
			</Alert.Description>
		</Alert.Root>
	{:else}
		<Alert.Root>
			<AlertCircle class="size-4" />
			<Alert.Title>PocketBase is not configured yet</Alert.Title>
			<Alert.Description>
				The application runs without it. To prepare backend development, run a local PocketBase
				instance and point the app at it. No paid service is required.
			</Alert.Description>
		</Alert.Root>

		<Card.Root class="max-w-2xl">
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<Server class="size-5" />
					Local PocketBase setup
				</Card.Title>
				<Card.Description>
					PocketBase provides authentication, the database, and file storage for FliHub.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<ol class="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
					<li>
						Download PocketBase from pocketbase.io and place the binary in the
						<code class="rounded bg-muted px-1 py-0.5">pocketbase/</code> directory (it is git-ignored).
					</li>
					<li>
						Run <code class="rounded bg-muted px-1 py-0.5">./pocketbase/pocketbase serve</code>
						to start the local instance at http://127.0.0.1:8090.
					</li>
					<li>
						Copy <code class="rounded bg-muted px-1 py-0.5">.env.example</code> to
						<code class="rounded bg-muted px-1 py-0.5">.env</code> and set
						<code class="rounded bg-muted px-1 py-0.5">POCKETBASE_URL</code>.
					</li>
					<li>Restart the dev server.</li>
				</ol>
			</Card.Content>
			<Card.Footer>
				<Dialog.Root>
					<Dialog.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="outline">View example configuration</Button>
						{/snippet}
					</Dialog.Trigger>
					<Dialog.Content>
						<Dialog.Header>
							<Dialog.Title>Environment configuration</Dialog.Title>
							<Dialog.Description>
								Create a <code>.env</code> file in the repository root. The example file contains no secrets.
							</Dialog.Description>
						</Dialog.Header>
						<pre class="overflow-x-auto rounded-md bg-muted p-4 text-sm"><code
								># .env
POCKETBASE_URL=http://127.0.0.1:8090</code
							></pre>
						<Dialog.Footer>
							<p class="text-sm text-muted-foreground">
								Full instructions live in the README and
								<code>pocketbase/README.md</code>.
							</p>
						</Dialog.Footer>
					</Dialog.Content>
				</Dialog.Root>
			</Card.Footer>
		</Card.Root>
	{/if}
</section>

<Separator class="my-6" />

<!-- Capability progress -->
<section id="planned-features" class="flex flex-col gap-4 py-4">
	<div class="flex items-center gap-2">
		<Map class="size-5" />
		<h2 class="text-xl font-semibold tracking-tight">Capability progress</h2>
	</div>
	<p class="max-w-2xl text-muted-foreground">
		What works today, what is being built, and what is coming next. A capability is marked Complete
		only after its workflow and access control are verified end to end.
	</p>
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each capabilities as capability (capability.title)}
			{@const meta = capabilityStatusMeta[capability.status]}
			<Card.Root class="flex flex-col">
				<Card.Header>
					<div class="flex items-start justify-between gap-2">
						<Card.Title class="text-base">{capability.title}</Card.Title>
						<Badge variant="secondary" class={`shrink-0 ${meta.badgeClass}`}>
							{meta.label}
						</Badge>
					</div>
					<Card.Description>{capability.description}</Card.Description>
				</Card.Header>
				<Card.Content class="mt-auto flex flex-col gap-2">
					<p class="text-sm text-muted-foreground">{capability.progress}</p>
					{#if capability.next}
						<p class="text-sm">
							<span class="font-medium">Next:</span>
							<span class="text-muted-foreground"> {capability.next}</span>
						</p>
					{/if}
					{#if capability.narration}
						<p class="text-xs text-muted-foreground">
							Narration: {narrationLabels[capability.narration]}
						</p>
					{/if}
					<div class="flex flex-wrap items-center gap-2 pt-1">
						{#if capability.featureHref}
							<Button size="sm" variant="outline" href={capability.featureHref}>
								Open feature
							</Button>
						{/if}
						{#each capability.walkthroughs ?? [] as walkthrough (walkthrough.href)}
							{#if data.walkthroughAvailable?.[walkthrough.href]}
								<Button size="sm" variant="outline" href={walkthrough.href}>
									{walkthrough.label}
								</Button>
							{:else}
								<span class="text-xs text-muted-foreground">Walkthrough coming soon</span>
							{/if}
						{/each}
						{#if capability.walkthroughHref && data.walkthroughAvailable?.[capability.walkthroughHref]}
							<Button size="sm" variant="outline" href={capability.walkthroughHref}>
								{capability.walkthroughLabel ?? 'Watch walkthrough'}
							</Button>
						{:else if capability.walkthroughHref}
							<span class="text-xs text-muted-foreground">Walkthrough coming soon</span>
						{/if}
					</div>
					<p class="text-xs text-muted-foreground">{capability.milestone}</p>
				</Card.Content>
			</Card.Root>
		{/each}
	</div>
</section>

<Separator class="my-6" />

<!-- Honest current state -->
<section class="flex flex-col gap-4 py-4 pb-10">
	<div class="flex items-center gap-2">
		<Construction class="size-5" />
		<h2 class="text-xl font-semibold tracking-tight">Current state</h2>
	</div>
	<div class="grid gap-4 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">What works today</Card.Title>
				<Card.Description>Delivered and verified across Phases 1A–1H.</Card.Description>
			</Card.Header>
			<Card.Content>
				<ul class="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
					<li>
						Accounts with verified email, hardened server-validated sessions, organizations with
						Owner/Admin/Scorekeeper/Viewer roles, copy-link invitations, and audited membership
						changes (1A).
					</li>
					<li>
						Configurable onboarding templates with capability-aware navigation that never bypasses
						role permissions (1B).
					</li>
					<li>
						Sport-neutral athlete records with CSV import and Owner/Admin-only private fields (1C).
					</li>
					<li>
						Leagues, seasons, divisions, direct season team entries, and independent or
						season-linked events (1D).
					</li>
					<li>
						Season rosters, reserve pools, and append-only event substitutions that preserve
						participation history (1E).
					</li>
					<li>
						Courses with labeled basket positions, ordered rounds, and staffed event groups with
						assigned scorekeepers (1F).
					</li>
					<li>
						Phone-first score entry with Draft → Submitted scorecards, missing-never-zero
						submission, and locked submissions with reasoned, audited reopen (1G).
					</li>
					<li>
						Owner/Admin-only official-result approval and publication with snapshotted totals,
						reasoned reopening with no unpublish, and versioned, forgery-proof correction history
						(1H).
					</li>
				</ul>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Get started</Card.Title>
				<Card.Description>
					Create an account, verify your email, then create an organization or accept an invitation.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				{#if data.user}
					<p class="text-sm text-muted-foreground">
						Signed in as {data.user.email}.
					</p>
					<Button href={resolve('/(app)/organizations')}>Open your organizations</Button>
				{:else}
					<Button href={resolve('/(auth)/register')}>Create account</Button>
					<Button variant="outline" href={resolve('/(auth)/login')}>Sign in</Button>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
</section>
