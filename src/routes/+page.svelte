<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		Users,
		Flag,
		ClipboardCheck,
		Trophy,
		Wallet,
		Eye,
		EyeOff,
		ArrowRight,
		Plus,
		LogIn,
		Map,
		Server,
		CircleCheck,
		CircleAlert,
		Play,
		Layers
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { buildStatus } from '$lib/data/build-status';
	import {
		capabilities,
		capabilityStatusMeta,
		type Capability,
		type CapabilityCategory
	} from '$lib/data/planned-features';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const groups = [
		{
			id: 'organization',
			title: 'Organization & people',
			icon: Users,
			color: 'border-blue-200 bg-blue-50 text-blue-950',
			summary: 'Accounts, invitations, roles, athletes, teams, and season rosters.'
		},
		{
			id: 'competition',
			title: 'Competition operations',
			icon: Flag,
			color: 'border-teal-200 bg-teal-50 text-teal-950',
			summary: 'Guided setup, leagues, seasons, courses, event groups, and tee schedules.'
		},
		{
			id: 'results',
			title: 'Scoring & results',
			icon: ClipboardCheck,
			color: 'border-violet-200 bg-violet-50 text-violet-950',
			summary: 'Mobile scorecards, reviewed results, corrections, standings, and public pages.'
		},
		{
			id: 'fantasy',
			title: 'Fantasy',
			icon: Trophy,
			color: 'border-orange-200 bg-orange-50 text-orange-950',
			summary: 'Private leagues, participant invitations, snake drafts, and event scoring.'
		},
		{
			id: 'funding',
			title: 'Funding',
			icon: Wallet,
			color: 'border-emerald-200 bg-emerald-50 text-emerald-950',
			summary:
				'Record sponsorship agreements. Tier quotes, installments, donations, and pledges are planned.'
		}
	] as const;
	const inCategory = (category: CapabilityCategory) =>
		capabilities.filter(
			(item) => item.category === category && (category === 'funding' || item.status !== 'planned')
		);
	const planned = capabilities.filter(
		(item) => item.status === 'planned' && item.category !== 'funding'
	);
	const completeCount = capabilities.filter((item) => item.status === 'complete').length;
	const reviewCount = capabilities.filter(
		(item) => item.status === 'ready-to-verify' || item.status === 'in-progress'
	).length;
</script>

<svelte:head>
	<title>FliHub — competitions, results & fantasy</title>
	<meta
		name="description"
		content="Manage your golf organization, prepare events, publish reviewed results, and run private fantasy drafts. Explore available workflows and upcoming plans."
	/>
</svelte:head>

{#snippet disclosure()}
	<span class="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold group-open/panel:hidden">
		<Eye class="size-4" aria-hidden="true" />Show details
	</span>
	<span class="mt-3 hidden items-center gap-1.5 text-xs font-semibold group-open/panel:inline-flex">
		<EyeOff class="size-4" aria-hidden="true" />Hide details
	</span>
{/snippet}

{#snippet capabilityCard(capability: Capability)}
	{@const meta = capabilityStatusMeta[capability.status]}
	<details
		class="group/feature rounded-xl border border-slate-200 bg-white text-slate-950 shadow-sm"
	>
		<summary
			class="cursor-pointer list-none p-4 focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden"
		>
			<span class="flex flex-wrap items-start justify-between gap-2">
				<span class="font-semibold">{capability.title}</span>
				<Badge class={meta.badgeClass}>{meta.label}</Badge>
			</span>
			<span class="mt-2 block text-sm leading-relaxed text-slate-600">
				{capability.description}
			</span>
			<span
				class="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 group-open/feature:hidden"
			>
				<Eye class="size-4" aria-hidden="true" />Show details
			</span>
			<span
				class="mt-3 hidden items-center gap-1.5 text-xs font-medium text-slate-600 group-open/feature:inline-flex"
			>
				<EyeOff class="size-4" aria-hidden="true" />Hide details
			</span>
		</summary>
		<div class="space-y-3 border-t border-slate-200 p-4">
			<p class="text-sm leading-relaxed text-slate-600">{capability.progress}</p>
			{#if capability.next}<p class="text-sm leading-relaxed">
					<strong>Next:</strong>
					{capability.next}
				</p>{/if}
			<div class="flex flex-wrap gap-2">
				{#if capability.featureHref}<Button
						size="sm"
						variant="ghost"
						href={capability.featureHref}
						class="bg-purple-100 text-purple-950 hover:bg-purple-200"
					>
						<ArrowRight class="mr-1.5 size-4" aria-hidden="true" />Open feature
					</Button>{/if}
				{#each capability.walkthroughs ?? [] as walkthrough (walkthrough.href)}
					{#if data.walkthroughAvailable?.[walkthrough.href]}<Button
							size="sm"
							variant="ghost"
							href={walkthrough.href}
							class="h-auto min-h-9 bg-orange-100 whitespace-normal text-orange-950 hover:bg-orange-200"
						>
							<Play class="mr-1.5 size-4 shrink-0" aria-hidden="true" />{walkthrough.label}
						</Button>{:else}<span class="text-xs text-slate-500">Walkthrough coming soon</span>{/if}
				{/each}
				{#if capability.walkthroughHref}
					{#if data.walkthroughAvailable?.[capability.walkthroughHref]}<Button
							size="sm"
							variant="ghost"
							href={capability.walkthroughHref}
							class="h-auto min-h-9 bg-orange-100 whitespace-normal text-orange-950 hover:bg-orange-200"
						>
							<Play
								class="mr-1.5 size-4 shrink-0"
								aria-hidden="true"
							/>{capability.walkthroughLabel ?? 'Watch walkthrough'}
						</Button>{:else}<span class="text-xs text-slate-500">Walkthrough coming soon</span>{/if}
				{/if}
			</div>
			<p class="text-xs text-slate-500">{capability.milestone}</p>
			{#if capability.narration}<p class="text-xs text-slate-500">
					Narration: {capability.narration === 'not-started' ? 'not started' : capability.narration}
				</p>{/if}
		</div>
	</details>
{/snippet}

<section
	class="my-6 rounded-2xl border border-blue-200 bg-blue-50 p-6 text-blue-950 shadow-sm sm:p-9"
>
	<Badge variant="outline" class="border-blue-300 bg-white text-blue-950">
		{buildStatus.label} · Golf workflows available
	</Badge>
	<h1 class="mt-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
		Your organization. Your competition. One place to run it.
	</h1>
	<p class="mt-4 max-w-2xl text-base leading-relaxed text-blue-900 sm:text-lg">
		Set up your golf organization, prepare an event, record scores, and publish reviewed results.
		Bring fans into the competition with private fantasy leagues and drafts.
	</p>
	<div class="mt-6 flex flex-wrap gap-3">
		{#if data.user}<Button
				href={resolve('/(app)/account')}
				class="min-h-11 bg-blue-700 text-white hover:bg-blue-800"
			>
				<ArrowRight class="mr-2 size-4" aria-hidden="true" />Choose an activity
			</Button>
		{:else}<Button
				href={resolve('/(auth)/register')}
				class="min-h-11 bg-green-700 text-white hover:bg-green-800"
			>
				<Plus class="mr-2 size-4" aria-hidden="true" />Create account
			</Button><Button
				variant="outline"
				href={resolve('/(auth)/login')}
				class="min-h-11 bg-white text-blue-950"
			>
				<LogIn class="mr-2 size-4" aria-hidden="true" />Sign in
			</Button>{/if}
		<Button
			variant="outline"
			href="#planned-features"
			class="min-h-11 border-blue-300 bg-white text-blue-950"
		>
			<Layers class="mr-2 size-4" aria-hidden="true" />Explore workflows
		</Button>
	</div>
	{#if data.user}<p class="mt-3 text-sm text-blue-800">Signed in as {data.user.email}.</p>{/if}
</section>

<section
	id="current-focus"
	class="my-5 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-blue-950"
	aria-labelledby="current-focus-heading"
>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h2 id="current-focus-heading" class="text-lg font-bold">Current focus</h2>
		<p class="text-xs text-blue-800">
			Last reviewed <time datetime="2026-11-20">Nov 20, 2026</time>
		</p>
	</div>
	<dl class="mt-3 grid gap-3 text-sm sm:grid-cols-3">
		<div>
			<dt class="font-semibold">Last completed</dt>
			<dd>Playoff tiebreakers and mid-round injury substitutions merged in PR #47.</dd>
		</div>
		<div>
			<dt class="font-semibold">Working on</dt>
			<dd>
				Verifying that published results credit the original fantasy pick for the holes played by
				both players.
			</dd>
		</div>
		<div>
			<dt class="font-semibold">Next step</dt>
			<dd>
				Check the combined score and hole breakdown for a substituted pick in live fantasy
				standings.
			</dd>
		</div>
	</dl>
</section>

<section
	id="planned-features"
	class="scroll-mt-6 space-y-5 py-5"
	aria-labelledby="workflow-heading"
>
	<div>
		<h2 id="workflow-heading" class="text-2xl font-bold tracking-tight">
			What you can do with FliHub
		</h2>
		<p class="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
			Four areas, from organization setup to published results. Open a category to explore its
			features and walkthroughs. Badges count feature areas, not organization records.
		</p>
	</div>
	<div class="flex flex-wrap gap-3 text-sm">
		<span
			class="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-2 font-medium text-green-950"
		>
			<CircleCheck class="size-4" aria-hidden="true" />{completeCount} complete
		</span>
		<span
			class="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 font-medium text-amber-950"
		>
			<CircleAlert class="size-4" aria-hidden="true" />{reviewCount} verification follow-up
		</span>
		<a
			href="#upcoming"
			class="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-3 py-2 font-medium text-slate-700 underline underline-offset-4"
		>
			<Map class="size-4" aria-hidden="true" />{planned.length} planned areas
		</a>
	</div>
	<div class="grid items-start gap-5 lg:grid-cols-2">
		{#each groups as group (group.id)}
			{@const items = inCategory(group.id)}
			{@const Icon = group.icon}
			<details class="group/panel overflow-hidden rounded-xl border-2 shadow-sm {group.color}">
				<summary
					class="cursor-pointer list-none p-5 focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden"
				>
					<span class="flex flex-wrap items-center gap-3">
						<span
							class="inline-flex size-11 items-center justify-center rounded-xl border border-current/15 bg-white/80"
						>
							<Icon class="size-6" aria-hidden="true" />
						</span><span class="text-lg font-bold">{group.title}</span><span
							class="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full border border-current/20 bg-white px-2 text-sm font-bold"
						>
							{items.length}
						</span><span class="text-xs">feature areas</span>
					</span>
					<span class="mt-3 block text-sm leading-relaxed">{group.summary}</span>
					{@render disclosure()}
				</summary>
				<div class="space-y-3 border-t border-current/10 p-4">
					{#each items as item (item.title)}{@render capabilityCard(item)}{/each}
				</div>
			</details>
		{/each}
	</div>
</section>

<section id="upcoming" class="scroll-mt-6 py-5" aria-labelledby="upcoming-heading">
	<h2 id="upcoming-heading" class="mb-3 text-xl font-bold">What’s next</h2>
	<details
		class="group/panel rounded-xl border-2 border-slate-300 bg-slate-50 text-slate-800 shadow-sm"
	>
		<summary
			class="cursor-pointer list-none p-5 focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden"
		>
			<span class="flex items-center gap-3">
				<Map class="size-6" aria-hidden="true" /><span class="text-lg font-bold">
					Upcoming workflows
				</span><span
					class="inline-flex size-8 items-center justify-center rounded-full border border-slate-300 bg-white font-bold"
				>
					{planned.length}
				</span>
			</span><span class="mt-3 block text-sm">
				More sports and judged events, fantasy expansion, embeds, and a public API. Timing, match
				scoring, judging, and new entry types remain planned.
			</span>{@render disclosure()}
		</summary>
		<div class="grid gap-3 border-t border-slate-200 p-4 md:grid-cols-3">
			{#each planned as item (item.title)}{@render capabilityCard(item)}{/each}
		</div>
	</details>
</section>

<section class="py-5 pb-10" aria-label="Technical information">
	<details
		id="setup"
		class="group/panel rounded-xl border border-slate-200 bg-slate-50 p-5 text-slate-700"
	>
		<summary
			class="cursor-pointer list-none focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden"
		>
			<span class="inline-flex items-center gap-2 font-semibold">
				<Server class="size-5" aria-hidden="true" />Technical details & backend configuration
			</span>{@render disclosure()}
		</summary>
		<div class="mt-4 space-y-4 border-t border-slate-200 pt-4 text-sm leading-relaxed">
			<p>
				Built with SvelteKit, Tailwind CSS, shadcn-svelte, and PocketBase. Capability status
				describes verified workflows; it does not imply that every planned activity is implemented.
			</p>
			{#if data.pocketbase.configured}<p>
					<strong>PocketBase URL configured:</strong>
					<code class="rounded bg-white px-1 break-all">{data.pocketbase.url}</code>. Configuration
					alone does not confirm connectivity or collection migrations.
				</p>{:else}<p>
					<strong>PocketBase is not configured.</strong> Start a local instance and set
					<code>POCKETBASE_URL=http://127.0.0.1:8090</code> in your development environment.
				</p>{/if}
			<p>
				Collection migrations are in <code>pocketbase/pb_migrations/</code>. See
				<code>README.md</code>
				and <code>pocketbase/README.md</code> for setup instructions. Available walkthrough links appear
				only when their video assets are included in the build.
			</p>
		</div>
	</details>
</section>
