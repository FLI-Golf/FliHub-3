<script lang="ts">
	import { resolve } from '$app/paths';
	import { CircleDot, Flag, Shapes, Target, Timer, Users } from 'lucide-svelte';
	import type { SetupChecklist } from '$lib/setup/checklist';
	let { organizationId, checklist }: { organizationId: string; checklist: SetupChecklist } =
		$props();
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
		'venues-courses': 'Open Venues & courses',
		events: 'Open Events'
	};
	const labels = {
		disabled: 'Enable capability',
		unknown: 'Not checked',
		started: 'Records found',
		empty: 'Needs records'
	};
</script>

<section
	aria-labelledby="golf-setup-heading"
	class="flex flex-col gap-4 rounded-xl border p-4 sm:p-6"
>
	<div>
		<p class="text-sm font-medium text-blue-700">Disc golf · League season · Teams · Strokes</p>
		<h2 id="golf-setup-heading" class="mt-1 text-xl font-semibold">
			Set up your first competition
		</h2>
		<p class="mt-2 text-sm text-muted-foreground">
			Your organization is created. Use these existing tools to add the competition details. Counts
			cover non-archived records across this organization; they do not prove the records belong to
			one season or event, satisfy eligibility, or are ready for scoring.
		</p>
	</div>
	<ol class="grid list-none gap-3 p-0 md:grid-cols-2">
		{#each checklist.steps as step, index (step.id)}
			{@const Icon = icons[step.id] ?? CircleDot}
			<li class={`flex flex-col gap-3 rounded-xl border p-4 ${step.color}`}>
				<div class="flex items-start gap-3">
					<Icon aria-hidden="true" class="mt-1 size-5 shrink-0" />
					<div class="min-w-0">
						<h3 class="font-semibold">{index + 1}. {step.title}</h3>
						<p class="mt-1 text-sm">{step.description}</p>
					</div>
				</div>
				<span class="w-fit rounded-full border bg-white/80 px-2 py-1 text-xs font-medium"
					>{labels[step.state]}</span
				>
				{#if step.state !== 'disabled'}
					<ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
						{#each step.counts as item (item.label)}<li>
								{item.label}: {item.count ?? 'Not checked'}
							</li>{/each}
					</ul>
				{:else}
					<p class="text-xs">
						Required capabilities: {step.required.join(', ')}. Existing records are preserved.
					</p>
				{/if}
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
			</li>
		{/each}
	</ol>
	<p class="text-xs text-muted-foreground">
		Counts refresh when this overview reloads. An unavailable count stays Not checked; no error is
		treated as zero. This guide does not create records or change permissions. Fantasy remains
		optional.
	</p>
</section>
