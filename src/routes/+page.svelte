<script lang="ts">
	import { buildStatus } from '$lib/data/build-status';
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
		<Badge>{buildStatus.label} · {buildStatus.scope}</Badge>
		<Badge variant="outline">SvelteKit</Badge>
		<Badge variant="outline">Tailwind CSS</Badge>
		<Badge variant="outline">shadcn-svelte</Badge>
		<Badge variant="outline">PocketBase</Badge>
	</div>
	<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">
		FliHub — organizations, competitions & events
	</h1>
	<p class="max-w-2xl text-lg text-muted-foreground">
		Available today: golf event operations, published results, private fantasy drafts, and event
		standings. Next, we are planning adaptable setup for multiple sports and judged events,
		including shows and pageants. New timing, judging, and match workflows remain planned.
	</p>
	<div class="flex flex-wrap gap-2">
		{#if data.user}
			<Button href={resolve('/(app)/account')}>Choose an activity</Button>
		{:else}
			<Button href={resolve('/(auth)/register')}>Create account</Button>
			<Button variant="outline" href={resolve('/(auth)/login')}>Sign in</Button>
		{/if}
		<Button variant="outline" href="#planned-features">View progress & plans</Button>
	</div>
</section>

<Separator class="my-6" />

<!-- Near-term direction -->
<section class="grid gap-4 py-4 md:grid-cols-3" aria-label="Platform direction">
	<Card.Root>
		<details class="group">
			<summary
				class="block cursor-pointer list-none rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
				><div
					class="mb-4 flex items-center justify-between gap-3 rounded-t-lg border-b border-blue-200 bg-blue-50 px-4 py-3 text-blue-950"
				>
					<span class="text-sm font-semibold"
						><span class="group-open:hidden"
							><svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								class="size-5"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
								<circle cx="12" cy="12" r="3" />
							</svg><span class="sr-only">Show more</span></span
						><span class="hidden group-open:inline"
							><svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								class="size-5"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M3 8c2 3 5 5 9 5s7-2 9-5" />
								<path d="m3 14 2-3m3 6 1-4m6 4-1-4m7 1-2-3" />
							</svg><span class="sr-only">Show less</span></span
						></span
					><span aria-hidden="true" class="flex items-center gap-2">
						<span class="text-xs font-medium">
							<span class="group-open:hidden">Show more</span>
							<span class="hidden group-open:inline">Show less</span>
						</span>
						<span class="text-xs font-medium"
							><span class="group-open:hidden"
								><svg
									aria-hidden="true"
									viewBox="0 0 24 24"
									class="size-5"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
									<circle cx="12" cy="12" r="3" />
								</svg><span class="sr-only">Show more</span></span
							><span class="hidden group-open:inline"
								><svg
									aria-hidden="true"
									viewBox="0 0 24 24"
									class="size-5"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M3 8c2 3 5 5 9 5s7-2 9-5" />
									<path d="m3 14 2-3m3 6 1-4m6 4-1-4m7 1-2-3" />
								</svg><span class="sr-only">Show less</span></span
							></span
						><span
							class="inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-slate-400 p-0.5 transition-colors group-open:bg-blue-600"
							><span
								class="size-5 rounded-full bg-white shadow-sm transition-transform group-open:translate-x-5"
							></span></span
						></span
					>
				</div>
				<Card.Header
					><Badge class="w-fit bg-green-600 text-white">Available today</Badge><Card.Title
						>Golf operations & fantasy</Card.Title
					></Card.Header
				></summary
			>
			<Card.Content class="text-sm text-muted-foreground"
				>Manage organizations, athletes, teams, and events. Enter scores, publish reviewed results,
				run private drafts, and see event fantasy standings. Golf fantasy uses strokes minus saved
				par; lowest wins.</Card.Content
			>
		</details></Card.Root
	>
	<Card.Root>
		<details class="group">
			<summary
				class="block cursor-pointer list-none rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
				><div
					class="mb-4 flex items-center justify-between gap-3 rounded-t-lg border-b border-blue-200 bg-blue-50 px-4 py-3 text-blue-950"
				>
					<span class="text-sm font-semibold"
						><span class="group-open:hidden"
							><svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								class="size-5"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
								<circle cx="12" cy="12" r="3" />
							</svg><span class="sr-only">Show more</span></span
						><span class="hidden group-open:inline"
							><svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								class="size-5"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M3 8c2 3 5 5 9 5s7-2 9-5" />
								<path d="m3 14 2-3m3 6 1-4m6 4-1-4m7 1-2-3" />
							</svg><span class="sr-only">Show less</span></span
						></span
					><span aria-hidden="true" class="flex items-center gap-2">
						<span class="text-xs font-medium">
							<span class="group-open:hidden">Show more</span>
							<span class="hidden group-open:inline">Show less</span>
						</span>
						<span class="text-xs font-medium"
							><span class="group-open:hidden"
								><svg
									aria-hidden="true"
									viewBox="0 0 24 24"
									class="size-5"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
									<circle cx="12" cy="12" r="3" />
								</svg><span class="sr-only">Show more</span></span
							><span class="hidden group-open:inline"
								><svg
									aria-hidden="true"
									viewBox="0 0 24 24"
									class="size-5"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M3 8c2 3 5 5 9 5s7-2 9-5" />
									<path d="m3 14 2-3m3 6 1-4m6 4-1-4m7 1-2-3" />
								</svg><span class="sr-only">Show less</span></span
							></span
						><span
							class="inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-slate-400 p-0.5 transition-colors group-open:bg-blue-600"
							><span
								class="size-5 rounded-full bg-white shadow-sm transition-transform group-open:translate-x-5"
							></span></span
						></span
					>
				</div>
				<Card.Header
					><Badge variant="secondary" class="w-fit">Next focus · planning</Badge><Card.Title
						>Adaptable organization setup</Card.Title
					></Card.Header
				></summary
			>
			<Card.Content class="text-sm text-muted-foreground"
				>Build on existing onboarding and templates. Separate the activity, competition format,
				entry type, and result method. Review the shared capability catalog before implementing the
				next workflow.</Card.Content
			>
		</details></Card.Root
	>
	<Card.Root>
		<details class="group">
			<summary
				class="block cursor-pointer list-none rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
				><div
					class="mb-4 flex items-center justify-between gap-3 rounded-t-lg border-b border-blue-200 bg-blue-50 px-4 py-3 text-blue-950"
				>
					<span class="text-sm font-semibold"
						><span class="group-open:hidden"
							><svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								class="size-5"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
								<circle cx="12" cy="12" r="3" />
							</svg><span class="sr-only">Show more</span></span
						><span class="hidden group-open:inline"
							><svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								class="size-5"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M3 8c2 3 5 5 9 5s7-2 9-5" />
								<path d="m3 14 2-3m3 6 1-4m6 4-1-4m7 1-2-3" />
							</svg><span class="sr-only">Show less</span></span
						></span
					><span aria-hidden="true" class="flex items-center gap-2">
						<span class="text-xs font-medium">
							<span class="group-open:hidden">Show more</span>
							<span class="hidden group-open:inline">Show less</span>
						</span>
						<span class="text-xs font-medium"
							><span class="group-open:hidden"
								><svg
									aria-hidden="true"
									viewBox="0 0 24 24"
									class="size-5"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
									<circle cx="12" cy="12" r="3" />
								</svg><span class="sr-only">Show more</span></span
							><span class="hidden group-open:inline"
								><svg
									aria-hidden="true"
									viewBox="0 0 24 24"
									class="size-5"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M3 8c2 3 5 5 9 5s7-2 9-5" />
									<path d="m3 14 2-3m3 6 1-4m6 4-1-4m7 1-2-3" />
								</svg><span class="sr-only">Show less</span></span
							></span
						><span
							class="inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-slate-400 p-0.5 transition-colors group-open:bg-blue-600"
							><span
								class="size-5 rounded-full bg-white shadow-sm transition-transform group-open:translate-x-5"
							></span></span
						></span
					>
				</div>
				<Card.Header
					><Badge variant="outline" class="w-fit">Planned</Badge><Card.Title
						>More sports & event types</Card.Title
					></Card.Header
				></summary
			>
			<Card.Content class="text-sm text-muted-foreground"
				>Support additional sports, races, dog shows, car shows, and pageants through dedicated
				timing, match, judging, and award workflows. Animals, vehicles, and exhibits need suitable
				entry records; they are not supported yet.</Card.Content
			>
		</details></Card.Root
	>
</section>

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
			<details class="group">
				<summary
					class="block cursor-pointer list-none rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
					><div
						class="mb-4 flex items-center justify-between gap-3 rounded-t-lg border-b border-blue-200 bg-blue-50 px-4 py-3 text-blue-950"
					>
						<span class="text-sm font-semibold"
							><span class="group-open:hidden"
								><svg
									aria-hidden="true"
									viewBox="0 0 24 24"
									class="size-5"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
									<circle cx="12" cy="12" r="3" />
								</svg><span class="sr-only">Show more</span></span
							><span class="hidden group-open:inline"
								><svg
									aria-hidden="true"
									viewBox="0 0 24 24"
									class="size-5"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M3 8c2 3 5 5 9 5s7-2 9-5" />
									<path d="m3 14 2-3m3 6 1-4m6 4-1-4m7 1-2-3" />
								</svg><span class="sr-only">Show less</span></span
							></span
						><span aria-hidden="true" class="flex items-center gap-2">
							<span class="text-xs font-medium">
								<span class="group-open:hidden">Show more</span>
								<span class="hidden group-open:inline">Show less</span>
							</span>
							<span class="text-xs font-medium"
								><span class="group-open:hidden"
									><svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										class="size-5"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
										<circle cx="12" cy="12" r="3" />
									</svg><span class="sr-only">Show more</span></span
								><span class="hidden group-open:inline"
									><svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										class="size-5"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M3 8c2 3 5 5 9 5s7-2 9-5" />
										<path d="m3 14 2-3m3 6 1-4m6 4-1-4m7 1-2-3" />
									</svg><span class="sr-only">Show less</span></span
								></span
							><span
								class="inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-slate-400 p-0.5 transition-colors group-open:bg-blue-600"
								><span
									class="size-5 rounded-full bg-white shadow-sm transition-transform group-open:translate-x-5"
								></span></span
							></span
						>
					</div>
					<Card.Header>
						<Card.Title class="flex items-center gap-2">
							<Server class="size-5" />
							Local PocketBase setup
						</Card.Title>
						<Card.Description>
							PocketBase provides authentication, the database, and file storage for FliHub.
						</Card.Description>
					</Card.Header></summary
				>
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
							Copy <code class="rounded bg-muted px-1 py-0.5">.env.example</code>
							to
							<code class="rounded bg-muted px-1 py-0.5">.env</code> and set
							<code class="rounded bg-muted px-1 py-0.5">POCKETBASE_URL</code>.
						</li>
						<li>Restart the dev server.</li>
					</ol>
				</Card.Content>
			</details>
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
		<h2 class="text-xl font-semibold tracking-tight">Progress & upcoming work</h2>
	</div>
	<p class="max-w-2xl text-muted-foreground">
		Planned work appears first, followed by the available foundation and its walkthroughs.
		Multi-event design is our next focus; new event workflows are not available yet. A capability is
		marked Complete only after its workflow and access control are verified end to end.
	</p>
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each capabilities as capability (capability.title)}
			{@const meta = capabilityStatusMeta[capability.status]}
			<Card.Root class="flex flex-col">
				<details class="group">
					<summary
						class="block cursor-pointer list-none rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
						><div
							class="mb-4 flex items-center justify-between gap-3 rounded-t-lg border-b border-blue-200 bg-blue-50 px-4 py-3 text-blue-950"
						>
							<span class="text-sm font-semibold"
								><span class="group-open:hidden"
									><svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										class="size-5"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
										<circle cx="12" cy="12" r="3" />
									</svg><span class="sr-only">Show more</span></span
								><span class="hidden group-open:inline"
									><svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										class="size-5"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M3 8c2 3 5 5 9 5s7-2 9-5" />
										<path d="m3 14 2-3m3 6 1-4m6 4-1-4m7 1-2-3" />
									</svg><span class="sr-only">Show less</span></span
								></span
							><span aria-hidden="true" class="flex items-center gap-2">
								<span class="text-xs font-medium">
									<span class="group-open:hidden">Show more</span>
									<span class="hidden group-open:inline">Show less</span>
								</span>
								<span class="text-xs font-medium"
									><span class="group-open:hidden"
										><svg
											aria-hidden="true"
											viewBox="0 0 24 24"
											class="size-5"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
											<circle cx="12" cy="12" r="3" />
										</svg><span class="sr-only">Show more</span></span
									><span class="hidden group-open:inline"
										><svg
											aria-hidden="true"
											viewBox="0 0 24 24"
											class="size-5"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<path d="M3 8c2 3 5 5 9 5s7-2 9-5" />
											<path d="m3 14 2-3m3 6 1-4m6 4-1-4m7 1-2-3" />
										</svg><span class="sr-only">Show less</span></span
									></span
								><span
									class="inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-slate-400 p-0.5 transition-colors group-open:bg-blue-600"
									><span
										class="size-5 rounded-full bg-white shadow-sm transition-transform group-open:translate-x-5"
									></span></span
								></span
							>
						</div>
						<Card.Header>
							<div class="flex items-start justify-between gap-2">
								<Card.Title class="text-base">{capability.title}</Card.Title>
								<Badge variant="secondary" class={`shrink-0 ${meta.badgeClass}`}>
									{meta.label}
								</Badge>
							</div>
							<Card.Description>{capability.description}</Card.Description>
						</Card.Header></summary
					>
					<div class="flex flex-col gap-2 px-6 pb-4">
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
					</div>
				</details>
				<Card.Content class="mt-auto flex flex-col gap-2"
					><div class="flex flex-wrap items-center gap-2 pt-1">
						{#if capability.featureHref}
							<Button
								size="sm"
								variant="ghost"
								href={capability.featureHref}
								class="bg-purple-100 text-purple-950 hover:bg-purple-200"
							>
								Open feature
							</Button>
						{/if}
						{#each capability.walkthroughs ?? [] as walkthrough (walkthrough.href)}
							{#if data.walkthroughAvailable?.[walkthrough.href]}
								<Button
									size="sm"
									variant="ghost"
									href={walkthrough.href}
									class="bg-orange-100 text-orange-950 hover:bg-orange-200"
								>
									{walkthrough.label}
								</Button>
							{:else}
								<span class="text-xs text-muted-foreground">Walkthrough coming soon</span>
							{/if}
						{/each}
						{#if capability.walkthroughHref && data.walkthroughAvailable?.[capability.walkthroughHref]}
							<Button
								size="sm"
								variant="ghost"
								href={capability.walkthroughHref}
								class="bg-orange-100 text-orange-950 hover:bg-orange-200"
							>
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
			<details class="group">
				<summary
					class="block cursor-pointer list-none rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
					><div
						class="mb-4 flex items-center justify-between gap-3 rounded-t-lg border-b border-blue-200 bg-blue-50 px-4 py-3 text-blue-950"
					>
						<span class="text-sm font-semibold"
							><span class="group-open:hidden"
								><svg
									aria-hidden="true"
									viewBox="0 0 24 24"
									class="size-5"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
									<circle cx="12" cy="12" r="3" />
								</svg><span class="sr-only">Show more</span></span
							><span class="hidden group-open:inline"
								><svg
									aria-hidden="true"
									viewBox="0 0 24 24"
									class="size-5"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M3 8c2 3 5 5 9 5s7-2 9-5" />
									<path d="m3 14 2-3m3 6 1-4m6 4-1-4m7 1-2-3" />
								</svg><span class="sr-only">Show less</span></span
							></span
						><span aria-hidden="true" class="flex items-center gap-2">
							<span class="text-xs font-medium">
								<span class="group-open:hidden">Show more</span>
								<span class="hidden group-open:inline">Show less</span>
							</span>
							<span class="text-xs font-medium"
								><span class="group-open:hidden"
									><svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										class="size-5"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
										<circle cx="12" cy="12" r="3" />
									</svg><span class="sr-only">Show more</span></span
								><span class="hidden group-open:inline"
									><svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										class="size-5"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M3 8c2 3 5 5 9 5s7-2 9-5" />
										<path d="m3 14 2-3m3 6 1-4m6 4-1-4m7 1-2-3" />
									</svg><span class="sr-only">Show less</span></span
								></span
							><span
								class="inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-slate-400 p-0.5 transition-colors group-open:bg-blue-600"
								><span
									class="size-5 rounded-full bg-white shadow-sm transition-transform group-open:translate-x-5"
								></span></span
							></span
						>
					</div>
					<Card.Header>
						<Card.Title class="text-base">What works today</Card.Title>
						<Card.Description
							>Implemented through event fantasy scoring; remaining work is listed in the capability
							cards.</Card.Description
						>
					</Card.Header></summary
				>
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
							Sport-neutral athlete records with CSV import and Owner/Admin-only private fields
							(1C).
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

						<li>
							Published organization pages and competition standings from published official results
							(1I).
						</li>
						<li>
							Account activity selection and fan-created fantasy leagues for eligible seasons,
							without staff membership (PR #27).
						</li>
						<li>
							Private fantasy participation, completed snake drafts, compact mobile selections,
							athlete search, and commissioner Pause/Resume (2A–2B).
						</li>
						<li>
							Event fantasy standings from saved strokes and pars, four-athlete explanations, shared
							ranks, and correction-safe result replacement (2C event scoring; merged in PR #28).
						</li>
					</ul>
				</Card.Content>
			</details></Card.Root
		>
		<Card.Root>
			<details class="group">
				<summary
					class="block cursor-pointer list-none rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
					><div
						class="mb-4 flex items-center justify-between gap-3 rounded-t-lg border-b border-blue-200 bg-blue-50 px-4 py-3 text-blue-950"
					>
						<span class="text-sm font-semibold"
							><span class="group-open:hidden"
								><svg
									aria-hidden="true"
									viewBox="0 0 24 24"
									class="size-5"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
									<circle cx="12" cy="12" r="3" />
								</svg><span class="sr-only">Show more</span></span
							><span class="hidden group-open:inline"
								><svg
									aria-hidden="true"
									viewBox="0 0 24 24"
									class="size-5"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M3 8c2 3 5 5 9 5s7-2 9-5" />
									<path d="m3 14 2-3m3 6 1-4m6 4-1-4m7 1-2-3" />
								</svg><span class="sr-only">Show less</span></span
							></span
						><span aria-hidden="true" class="flex items-center gap-2">
							<span class="text-xs font-medium">
								<span class="group-open:hidden">Show more</span>
								<span class="hidden group-open:inline">Show less</span>
							</span>
							<span class="text-xs font-medium"
								><span class="group-open:hidden"
									><svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										class="size-5"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
										<circle cx="12" cy="12" r="3" />
									</svg><span class="sr-only">Show more</span></span
								><span class="hidden group-open:inline"
									><svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										class="size-5"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M3 8c2 3 5 5 9 5s7-2 9-5" />
										<path d="m3 14 2-3m3 6 1-4m6 4-1-4m7 1-2-3" />
									</svg><span class="sr-only">Show less</span></span
								></span
							><span
								class="inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-slate-400 p-0.5 transition-colors group-open:bg-blue-600"
								><span
									class="size-5 rounded-full bg-white shadow-sm transition-transform group-open:translate-x-5"
								></span></span
							></span
						>
					</div>
					<Card.Header>
						<Card.Title class="text-base">Get started</Card.Title>
						<Card.Description>
							Create an account, verify your email, then choose Play fantasy, manage an
							organization, or join through an invitation.
						</Card.Description>
					</Card.Header></summary
				>
				<p class="px-6 pb-4 text-sm text-muted-foreground">Choose an activity to continue.</p>
			</details>
			<Card.Content class="flex flex-col gap-3">
				{#if data.user}
					<p class="text-sm text-muted-foreground">
						Signed in as {data.user.email}.
					</p>
					<Button href={resolve('/(app)/account')}>Choose an activity</Button>
				{:else}
					<Button href={resolve('/(auth)/register')}>Create account</Button>
					<Button variant="outline" href={resolve('/(auth)/login')}>Sign in</Button>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
</section>
