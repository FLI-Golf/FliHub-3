<script lang="ts">
	import { AlertCircle, CircleCheck, Construction, Map, Server } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { plannedFeatures } from '$lib/data/planned-features';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<!-- Hero -->
<section class="flex flex-col items-start gap-4 py-6 sm:py-10">
	<div class="flex flex-wrap items-center gap-2">
		<Badge>Foundation milestone</Badge>
		<Badge variant="outline">SvelteKit</Badge>
		<Badge variant="outline">Tailwind CSS</Badge>
		<Badge variant="outline">shadcn-svelte</Badge>
		<Badge variant="outline">PocketBase</Badge>
	</div>
	<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">
		FliHub — sports organization management
	</h1>
	<p class="max-w-2xl text-lg text-muted-foreground">
		A configurable platform for sports organizations with connected fantasy competitions. This build
		is the runnable foundation: application shell, design system, and backend integration
		groundwork. The features below are planned, not yet available.
	</p>
	<div class="flex flex-wrap gap-2">
		<Button href="#planned-features">View planned features</Button>
		<Button variant="outline" href="#setup">Development setup</Button>
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
				<code class="rounded bg-muted px-1 py-0.5 text-sm">{data.pocketbase.url}</code>.
				Authentication and data collections are not implemented yet — they arrive with the
				membership milestone.
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

<!-- Planned features -->
<section id="planned-features" class="flex flex-col gap-4 py-4">
	<div class="flex items-center gap-2">
		<Map class="size-5" />
		<h2 class="text-xl font-semibold tracking-tight">Planned capabilities</h2>
	</div>
	<p class="max-w-2xl text-muted-foreground">
		Every item below is planned work from the project milestones. None of it is implemented in this
		foundation build.
	</p>
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each plannedFeatures as feature (feature.title)}
			<Card.Root class="flex flex-col">
				<Card.Header>
					<div class="flex items-start justify-between gap-2">
						<Card.Title class="text-base">{feature.title}</Card.Title>
						<Badge variant="secondary" class="shrink-0">Planned</Badge>
					</div>
					<Card.Description>{feature.description}</Card.Description>
				</Card.Header>
				<Card.Content class="mt-auto">
					<p class="text-xs text-muted-foreground">{feature.milestone}</p>
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
				<Card.Description>Verified in this foundation build.</Card.Description>
			</Card.Header>
			<Card.Content>
				<ul class="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
					<li>Responsive application shell and this welcome page.</li>
					<li>Strict TypeScript, linting, formatting, and production build checks.</li>
					<li>Per-request PocketBase client foundation (no shared auth state).</li>
					<li>Environment placeholder configuration with secret-free examples.</li>
				</ul>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Authentication — planned</Card.Title>
				<Card.Description>
					Sign-in arrives with the membership milestone (Phase 1A). This form is a non-functional
					placeholder.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form class="flex flex-col gap-3">
					<div class="flex flex-col gap-1.5">
						<Label for="email-placeholder">Email</Label>
						<Input id="email-placeholder" type="email" placeholder="you@example.com" disabled />
					</div>
					<Button disabled title="Authentication arrives with the membership milestone">
						Sign in (not yet available)
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	</div>
</section>
