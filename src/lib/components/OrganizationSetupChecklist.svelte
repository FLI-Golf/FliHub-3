<script lang="ts">
	import { resolve } from '$app/paths';
	import { tick } from 'svelte';
	import { Check, ChevronDown, ChevronRight, CircleDot, Flag, Plus, Shapes, Target, Timer, Users } from 'lucide-svelte';
	import type { SetupChecklist } from '$lib/setup/checklist';
	import LeagueSeasonSetup from '$lib/components/LeagueSeasonSetup.svelte';
	let { organizationId, checklist, leagues }: {
		organizationId: string;
		checklist: SetupChecklist;
		leagues: { id: string; name: string; status: 'active' }[] | null;
	} = $props();
	const steps = $derived([
		...checklist.steps.filter((step) => step.id === 'structure'),
		...checklist.steps.filter((step) => step.id !== 'structure')
	]);
	const stepTitles: Record<string, string> = {
		structure: 'League & season',
		teams: 'Teams',
		athletes: 'Athletes',
		rosters: 'Rosters',
		courses: 'Courses',
		events: 'Event',
		operations: 'Scoring setup'
	};
	type SavedSeason = { id: string; name: string; leagueName: string };
	let savedSeason = $state<SavedSeason | null>(null);
	const icons: Record<string, typeof CircleDot> = {
		structure: Shapes,
		teams: Users,
		athletes: CircleDot,
		rosters: Users,
		courses: Flag,
		events: Timer,
		operations: Target
	};
	const destinations: Record<string, string> = {
		'leagues-seasons': 'Open Leagues & seasons',
		teams: 'Open Teams & rosters',
		athletes: 'Open Athletes',
		'venues-courses': 'Open Courses',
		events: 'Open Events'
	};

	const eventCount = $derived(
		checklist.steps.find((step) => step.id === 'events')?.counts[0]?.count
	);
	let currentStep = $state(0);
	let progressHeading = $state<HTMLHeadingElement>();
	const storageKey = $derived(`flihub:setup-guide:v2:${organizationId}`);

	$effect(() => {
		const key = storageKey;
		const stepCount = steps.length;
		try {
			const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null');
			if (saved && typeof saved.season?.id === 'string' &&
				Number.isInteger(saved.index) && saved.index >= 0 && saved.index <= stepCount) {
				savedSeason = saved.season;
				currentStep = saved.index;
			} else {
				savedSeason = null;
				currentStep = 0;
			}
		} catch {
			currentStep = 0;
		}
	});

	function onSeasonSaved(season: SavedSeason) {
		savedSeason = season;
		void moveTo(1);
	}
	function startOver() {
		savedSeason = null;
		void moveTo(0);
	}

	async function moveTo(index: number) {
		currentStep = index;
		try {
			sessionStorage.setItem(storageKey, JSON.stringify({ index, season: savedSeason }));
		} catch {
			// The guide still works when browser storage is unavailable.
		}
		await tick();
		progressHeading?.focus();
	}
</script>

<details class="group/setup rounded-xl border bg-card">
	<summary class="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
		<span
			class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-green-700 text-white transition-colors group-open/setup:bg-red-700"
		>
			<Plus class="size-5 transition-transform group-open/setup:rotate-45" aria-hidden="true" />
		</span>
		<span>
			{eventCount === 0
				? 'Create your first competition'
				: eventCount
					? 'Set up another competition'
					: 'Set up a competition'}
		</span>
		<ChevronDown class="ml-auto size-4 shrink-0 transition-transform group-open/setup:rotate-180" aria-hidden="true" />
	</summary>
<section
	aria-labelledby="golf-setup-heading"
	class="flex flex-col gap-4 border-t p-4 sm:p-6"
>
	<div>
		<p class="text-sm font-medium text-blue-700">Disc golf · League season · Teams · Strokes</p>
		<h2 id="golf-setup-heading" class="mt-1 text-xl font-semibold">
			Competition setup guide
		</h2>
		<p class="mt-2 text-sm text-muted-foreground">
			Save a season first, then use the setup tools to continue.
		</p>
	</div>
	<ol class="grid list-none grid-cols-2 gap-1 p-0 sm:grid-cols-4 xl:grid-cols-7" aria-label="Competition setup progress">
		{#each steps as step, index (step.id)}
			<li
				aria-current={index === currentStep ? 'step' : undefined}
				title={step.title}
				class="flex items-center justify-between gap-1 rounded-md border px-2 py-2 text-xs font-semibold {index === currentStep
					? 'border-blue-700 bg-linear-to-r from-blue-800 to-indigo-700 text-white'
					: index < currentStep
						? 'border-blue-200 bg-blue-100 text-blue-950'
						: 'border-slate-200 bg-slate-50 text-slate-600'}"
			>
				<span class="inline-flex items-center gap-1">
					{#if index < currentStep}<Check class="size-3.5 shrink-0" aria-hidden="true" />{/if}
					{index + 1}. <span>{stepTitles[step.id] ?? step.title}</span>
				</span>
				{#if index < steps.length - 1}
					<ChevronRight class="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
				{/if}
			</li>
		{/each}
	</ol>
	<h3 bind:this={progressHeading} tabindex="-1" class="text-sm font-semibold">
		{currentStep < steps.length
			? `Step ${currentStep + 1} of ${steps.length}`
			: 'Setup guide reviewed'}
	</h3>
	{#if savedSeason}
		<p class="text-sm"><strong>{savedSeason.leagueName}</strong> · {savedSeason.name}</p>
	{/if}
	<ol class="list-none p-0">
		{#each steps as step, index (step.id)}
			{#if index === currentStep}
				{@const Icon = icons[step.id] ?? CircleDot}
				<li class={`flex flex-col gap-3 rounded-xl border p-4 ${step.color}`}>
					<div class="flex items-start gap-3">
						<Icon aria-hidden="true" class="mt-1 size-5 shrink-0" />
						<div class="min-w-0">
							<h3 class="font-semibold">{index + 1}. {step.title}</h3>
							<p class="mt-1 text-sm">{step.description}</p>
						</div>
					</div>
					{#if step.id === 'structure' && step.state !== 'disabled'}
						{#if savedSeason}
							<p class="text-sm">Season saved. Use Next to continue.</p>
						{:else if leagues}
							<LeagueSeasonSetup
								{leagues}
								form={null}
								action={resolve('/(app)/organizations/[id]/cap/[capability]', {
									id: organizationId,
									capability: 'leagues-seasons'
								}) + '?/setupLeagueSeason'}
								onSaved={onSeasonSaved}
							/>
						{:else}
							<p role="alert" class="text-sm">Could not load leagues. Refresh and try again.</p>
						{/if}
					{:else}
					<div class="mt-auto flex flex-wrap gap-3 pt-1">
						{#if step.state === 'disabled'}
							<a
								class="inline-flex min-h-11 items-center rounded-md border bg-white/80 px-3 py-2 text-sm font-medium underline underline-offset-4"
								href={resolve('/(app)/organizations/[id]/settings', { id: organizationId })}
								>Review settings</a
							>
						{:else}
							<a
								class="inline-flex min-h-11 items-center rounded-md border bg-white/80 px-3 py-2 text-sm font-medium underline underline-offset-4"
								href={resolve('/(app)/organizations/[id]/cap/[capability]', {
									id: organizationId,
									capability: step.capability
								})}>{destinations[step.capability] ?? 'Open setup tools'}</a
							>
							{#if step.id === 'rosters'}<a
									class="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
									href={resolve('/(app)/organizations/[id]/cap/[capability]', {
										id: organizationId,
										capability: 'leagues-seasons'
									})}>Enter teams in a season</a
								>{/if}
						{/if}
					</div>
				{/if}
				</li>
			{/if}
		{/each}
	</ol>
	<div class="flex flex-wrap justify-between gap-2 border-t pt-3">
		<button
			type="button"
			class="min-h-11 rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-40"
			disabled={currentStep === 0}
			onclick={() => moveTo(currentStep - 1)}
		>Back</button>
		{#if currentStep < steps.length && (currentStep > 0 || savedSeason)}
			<button
				type="button"
				class="inline-flex min-h-11 items-center gap-1 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
				onclick={() => moveTo(currentStep + 1)}
			>
				{currentStep === steps.length - 1 ? 'Finish guide' : 'Next'}
				<ChevronRight class="size-4" aria-hidden="true" />
			</button>
		{:else if currentStep === steps.length}
			<button type="button" class="min-h-11 rounded-md border px-4 py-2 text-sm font-medium"
				onclick={startOver}>Start over</button>
		{/if}
	</div>
	<p class="text-xs text-muted-foreground">
		Counts refresh when this overview reloads. An unavailable count stays Not checked; no error is
		treated as zero. This guide does not create records or change permissions. Fantasy remains
		optional.
	</p>
</section>
</details>
