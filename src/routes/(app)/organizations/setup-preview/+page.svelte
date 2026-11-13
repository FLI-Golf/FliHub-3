<script lang="ts">
	import { tick } from 'svelte';
	import {
		Flag,
		CircleDot,
		Timer,
		Target,
		Crosshair,
		Dog,
		Car,
		Crown,
		Shapes,
		Users
	} from 'lucide-svelte';
	import { resolve } from '$app/paths';
	import {
		activities,
		blankSelection,
		choicesFor,
		reconcile,
		type Selection
	} from '$lib/setup/preview';

	const activityVisuals: Record<string, { icon: typeof Flag; color: string }> = {
		'disc-golf': { icon: Flag, color: 'border-emerald-200 bg-emerald-50 text-emerald-950' },
		golf: { icon: Flag, color: 'border-green-200 bg-green-50 text-green-950' },
		baseball: { icon: CircleDot, color: 'border-sky-200 bg-sky-50 text-sky-950' },
		basketball: { icon: CircleDot, color: 'border-orange-200 bg-orange-50 text-orange-950' },
		bowling: { icon: CircleDot, color: 'border-violet-200 bg-violet-50 text-violet-950' },
		running: { icon: Timer, color: 'border-cyan-200 bg-cyan-50 text-cyan-950' },
		pickleball: { icon: Users, color: 'border-lime-200 bg-lime-50 text-lime-950' },
		darts: { icon: Target, color: 'border-red-200 bg-red-50 text-red-950' },
		billiards: { icon: CircleDot, color: 'border-teal-200 bg-teal-50 text-teal-950' },
		archery: { icon: Crosshair, color: 'border-amber-200 bg-amber-50 text-amber-950' },
		'dog-show': { icon: Dog, color: 'border-rose-200 bg-rose-50 text-rose-950' },
		'car-show': { icon: Car, color: 'border-blue-200 bg-blue-50 text-blue-950' },
		pageant: { icon: Crown, color: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950' },
		other: { icon: Shapes, color: 'border-slate-200 bg-slate-50 text-slate-950' }
	};

	const formatVisuals: typeof activityVisuals = {
		league: { icon: Users, color: 'border-blue-200 bg-blue-50 text-blue-950' },
		tournament: { icon: Crown, color: 'border-amber-200 bg-amber-50 text-amber-950' },
		series: { icon: Shapes, color: 'border-violet-200 bg-violet-50 text-violet-950' },
		single: { icon: Flag, color: 'border-teal-200 bg-teal-50 text-teal-950' },
		show: { icon: Crown, color: 'border-rose-200 bg-rose-50 text-rose-950' }
	};
	const competitorVisuals: typeof activityVisuals = {
		individual: { icon: CircleDot, color: 'border-sky-200 bg-sky-50 text-sky-950' },
		team: { icon: Users, color: 'border-indigo-200 bg-indigo-50 text-indigo-950' },
		pair: { icon: Users, color: 'border-violet-200 bg-violet-50 text-violet-950' },
		relay: { icon: Timer, color: 'border-cyan-200 bg-cyan-50 text-cyan-950' },
		contestant: { icon: Crown, color: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950' },
		animal: { icon: Dog, color: 'border-rose-200 bg-rose-50 text-rose-950' },
		vehicle: { icon: Car, color: 'border-blue-200 bg-blue-50 text-blue-950' },
		exhibit: { icon: Shapes, color: 'border-amber-200 bg-amber-50 text-amber-950' }
	};
	const resultVisuals: typeof activityVisuals = {
		strokes: { icon: Flag, color: 'border-emerald-200 bg-emerald-50 text-emerald-950' },
		time: { icon: Timer, color: 'border-cyan-200 bg-cyan-50 text-cyan-950' },
		pins: { icon: CircleDot, color: 'border-violet-200 bg-violet-50 text-violet-950' },
		points: { icon: Target, color: 'border-amber-200 bg-amber-50 text-amber-950' },
		matches: { icon: Users, color: 'border-blue-200 bg-blue-50 text-blue-950' },
		measurement: { icon: Crosshair, color: 'border-teal-200 bg-teal-50 text-teal-950' },
		judging: { icon: Crown, color: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950' },
		voting: { icon: Users, color: 'border-indigo-200 bg-indigo-50 text-indigo-950' },
		awards: { icon: Crown, color: 'border-orange-200 bg-orange-50 text-orange-950' }
	};

	let step = $state(0);
	let name = $state('');
	let selection = $state<Selection>({ ...blankSelection });
	let notice = $state('');
	let validation = $state('');
	let heading = $state<HTMLHeadingElement>();
	let errorMessage = $state<HTMLParagraphElement>();
	const steps = ['Organization', 'Activity', 'Format', 'Competitors', 'Results', 'Review'];
	const fieldByStep = ['', 'activity', 'format', 'competitors', 'result', ''] as const;
	const activity = $derived(activities.find((item) => item.id === selection.activity));
	const choices = $derived(
		step === 1
			? activities
			: step >= 2 && step <= 4
				? choicesFor(selection, fieldByStep[step] as 'format' | 'competitors' | 'result')
				: []
	);
	const selected = $derived(
		step >= 1 && step <= 4 ? selection[fieldByStep[step] as keyof Selection] : ''
	);
	const golf = $derived(selection.activity === 'disc-golf' || selection.activity === 'golf');
	const questions = [
		'Who is organizing the competition?',
		'What is the activity?',
		'How will the competition run?',
		'What competes?',
		'How are results determined?',
		'Review your setup preview'
	];
	const summary = $derived([
		{ label: 'Organization', value: name.trim() },
		{ label: 'Activity', value: activity?.label ?? '' },
		...(['format', 'competitors', 'result'] as const).map((field, index) => ({
			label: steps[index + 2],
			value:
				choicesFor(selection, field).find((item) => item.id === selection[field])?.label ??
				'Choose an option'
		}))
	]);

	function choose(value: string) {
		const field = fieldByStep[step];
		if (!field) return;
		const previous = selection;
		const next = reconcile({ ...selection, [field]: value });
		const cleared = (['format', 'competitors', 'result'] as const).some(
			(key) => key !== field && previous[key] && !next[key]
		);
		selection = next;
		validation = '';
		notice = cleared
			? 'Your new choice cleared incompatible later answers. Review the following steps.'
			: '';
	}
	async function move(next: number) {
		step = next;
		validation = '';
		await tick();
		heading?.focus();
	}
	async function advance() {
		if (step === 0 && (name.trim().length < 2 || name.trim().length > 120)) {
			validation = 'Enter an organization name of 2–120 characters.';
		} else if (step >= 1 && step <= 4 && !choices.some((item) => item.id === selected)) {
			validation = 'Choose an option to continue.';
		} else {
			await move(Math.min(step + 1, 5));
			return;
		}
		await tick();
		errorMessage?.focus();
	}
</script>

<svelte:head><title>Guided setup preview — FliHub</title></svelte:head>

<section class="mx-auto flex max-w-4xl flex-col gap-6 py-6">
	<header class="flex flex-col gap-3">
		<a class="w-fit text-sm underline underline-offset-4" href={resolve('/(app)/organizations')}
			>Return to organizations and existing setup</a
		>
		<div>
			<span class="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-950"
				>Preview · nothing is saved</span
			>
		</div>
		<h1 class="text-2xl font-semibold tracking-tight">Build the right competition setup</h1>
		<p class="text-muted-foreground">
			Explore a setup tailored to your activity. Back and Next keep your answers here; refreshing or
			leaving this page resets them. Existing organizations are not changed.
		</p>
	</header>

	<nav aria-label="Setup progress">
		<ol class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
			{#each steps as label, index (label)}
				<li
					aria-current={step === index ? 'step' : undefined}
					class={`rounded-md border px-3 py-2 text-sm ${step === index ? 'border-blue-600 bg-blue-50 font-semibold text-blue-950' : 'text-muted-foreground'}`}
				>
					{index + 1}. {label}
				</li>
			{/each}
		</ol>
	</nav>

	{#if activity}
		<aside
			class="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"
			aria-label="Workflow support"
		>
			<strong
				>{activity.label}: {golf
					? 'existing golf foundation; configuration preview'
					: 'Planned workflow'}</strong
			>
			<p class="mt-1">
				{golf
					? 'Course and stroke workflows exist. This preview does not certify every format or competitor combination; pairs, brackets, and format-specific rules still need review.'
					: 'This activity’s complete entry and result workflow is not implemented. Shared organization features do not provide its scoring rules.'}
				No records will be created.
			</p>
		</aside>
	{/if}

	<div class="rounded-xl border bg-card p-5 sm:p-7">
		<p class="mb-2 text-sm text-muted-foreground">Step {step + 1} of {steps.length}</p>
		<h2 bind:this={heading} tabindex="-1" class="mb-5 text-xl font-semibold focus:outline-none">
			{questions[step]}
		</h2>
		{#if validation}<p
				bind:this={errorMessage}
				tabindex="-1"
				role="alert"
				class="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-red-950"
			>
				{validation}
			</p>{/if}
		<p role="status" class="mb-3 text-sm text-muted-foreground">{notice}</p>

		{#if step === 0}
			<label for="preview-name" class="mb-2 block font-medium">Organization name</label>
			<input
				id="preview-name"
				type="text"
				bind:value={name}
				maxlength="120"
				aria-describedby="name-help"
				class="min-h-11 w-full rounded-md border bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring"
				placeholder="e.g. Riverside Running Club"
			/>
			<p id="name-help" class="mt-2 text-sm text-muted-foreground">
				Use a sample or existing name. This does not create or edit an organization. An organization
				may eventually run several activities.
			</p>
		{:else if step <= 4}
			{#if step === 2}<p class="mb-4 text-sm text-muted-foreground">
					These formats are suggestions for {activity?.label}. Choosing one does not implement its
					rules.
				</p>{/if}
			{#if step === 3}<p class="mb-4 text-sm text-muted-foreground">
					Competitors are separate from people’s accounts and permissions. Animals, vehicles, and
					exhibits need dedicated records.
				</p>{/if}
			{#if step === 4}<p class="mb-4 text-sm text-muted-foreground">
					Required inputs, ranking, ties, penalties, and corrections need explicit rules for this
					method.
				</p>{/if}
			<fieldset class="grid gap-3 sm:grid-cols-2">
				<legend class="sr-only">{questions[step]}</legend>
				{#each choices as option (option.id)}
					{@const visuals =
						step === 1
							? activityVisuals
							: step === 2
								? formatVisuals
								: step === 3
									? competitorVisuals
									: resultVisuals}
					{@const visual = visuals[option.id] ?? activityVisuals.other}
					{@const Icon = visual.icon}
					<label
						class={`relative flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-shadow focus-within:ring-2 focus-within:ring-blue-700 focus-within:ring-offset-2 hover:shadow-md ${visual.color} ${selected === option.id ? 'ring-2 ring-blue-700 ring-offset-2' : ''}`}
					>
						<input
							class="mt-1 size-4 shrink-0 accent-blue-700"
							type="radio"
							name={`preview-${step}`}
							value={option.id}
							checked={selected === option.id}
							onchange={() => choose(option.id)}
						/>
						<span
							class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/75"
							aria-hidden="true"
						>
							<Icon class="size-6" />
						</span>
						<span class="min-w-0">
							<strong class="block">{option.label}</strong>
							<span class="mt-1 block text-sm">{option.description}</span>
						</span>
					</label>
				{/each}
			</fieldset>
		{:else}
			<dl class="divide-y rounded-lg border px-4">
				{#each summary as row (row.label)}<div class="grid gap-1 py-3 sm:grid-cols-3">
						<dt class="font-medium">{row.label}</dt>
						<dd class="break-words sm:col-span-2">{row.value}</dd>
					</div>{/each}
			</dl>
			<h3 class="mt-5 mb-2 font-semibold">What this setup would need</h3>
			<ul class="list-disc space-y-1 pl-5 text-sm">
				{#each activity?.features ?? [] as feature (feature)}<li>{feature}</li>{/each}
			</ul>
			<p class="mt-4 rounded-md bg-muted p-4 text-sm">
				Preview complete. Nothing has been saved. The next design step is to review this
				combination’s rules and data mapping before enabling creation. Fantasy is optional and needs
				its own supported entry and scoring policy.
			</p>
		{/if}

		<div class="mt-6 flex flex-wrap justify-between gap-3 border-t pt-5">
			<button
				type="button"
				disabled={step === 0}
				onclick={() => move(step - 1)}
				class="min-h-11 rounded-md border px-5 py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
				>Back</button
			>
			{#if step < 5}
				<button
					type="button"
					onclick={advance}
					class="min-h-11 rounded-md bg-blue-700 px-5 py-2 font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					>{step === 4 ? 'Review setup' : 'Next'}</button
				>
			{:else}
				<a
					class="inline-flex min-h-11 items-center rounded-md border px-5 py-2 font-medium underline underline-offset-4"
					href={resolve('/(app)/organizations')}>Finish preview and return</a
				>
			{/if}
		</div>
	</div>
</section>
