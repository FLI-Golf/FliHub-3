<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	import { onMount } from 'svelte';
	import {
		BrainCircuit,
		ShieldCheck,
		ClipboardCheck,
		ListChecks,
		History,
		Layers,
		BarChart3,
		Lock,
		Clock,
		WifiOff,
		Database,
		Wallet,
		Plus,
		LogOut,
		ArrowLeft,
		ChevronDown,
		Sparkles,
		MessageSquare,
		Users,
		MapPin,
		LoaderCircle,
		CircleHelp,
		Lightbulb,
		Gauge,
		CalendarDays,
		Network,
		ClipboardList,
		AlertTriangle,
		Info
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { PageProps } from './$types';

	type SubmitFunction = NonNullable<Parameters<typeof enhance>[1]>;

	let { data, form }: PageProps = $props();

	const tabs = [
		{ label: 'Workspace', icon: ClipboardCheck },
		{ label: 'Operations', icon: ListChecks },
		{ label: 'History', icon: History },
		{ label: 'Capabilities', icon: Layers },
		{ label: 'Usage', icon: BarChart3 }
	] as const;

	let activeTab = $state<(typeof tabs)[number]['label']>('Workspace');

	const objectives = [
		{ id: 'prepare_tournament', label: 'Prepare a tournament' },
		{ id: 'assess_readiness', label: 'Assess tournament readiness' }
	] as const;

	const scenarios = [
		{ id: 'spring_invitational', label: 'Spring Invitational' },
		{ id: 'participants_missing', label: 'Participants Missing' },
		{ id: 'groups_prepared', label: 'Groups Prepared' },
		{ id: 'preparation_review', label: 'Preparation Review' },
		{ id: 'venue_missing', label: 'Venue Missing' },
		{ id: 'information_missing', label: 'Information Missing' }
	] as const;

	const actors = [
		{ id: 'synthetic-actor-owner', label: 'Organization owner' },
		{ id: 'synthetic-actor-admin', label: 'Organization admin' },
		{ id: 'synthetic-actor-scorekeeper', label: 'Scorekeeper' },
		{ id: 'synthetic-actor-viewer', label: 'Viewer' },
		{ id: 'synthetic-actor-outsider', label: 'Outside organization owner' },
		{ id: 'synthetic-actor-inactive', label: 'Inactive administrator' }
	] as const;

	const objectiveLimit = 256;

	let mode = $state<'natural' | 'registered'>('natural');
	let naturalObjective = $state('');
	let registeredObjective = $state('prepare_tournament');
	let selectedScenario = $state('spring_invitational');
	let selectedActor = $state('synthetic-actor-owner');
	let busy = $state(false);
	let hydrated = $state(false);
	let reviewBusy = $state<'prepare' | 'cancel' | 'execute' | null>(null);
	let confirmedReview = $state<string | null>(null);

	const submitExecution: SubmitFunction = ({ cancel }) => {
		if (!hydrated || busy || reviewBusy || !review || confirmedReview !== review.reviewId) {
			cancel();
			return;
		}

		confirmedReview = null;
		reviewBusy = 'execute';

		return async ({ update }) => {
			try {
				// Recover the retained outcome even when the action response is lost.
				await invalidateAll();
				if (!data.execution) await update({ reset: false, invalidateAll: false });
			} finally {
				reviewBusy = null;
			}
		};
	};

	let review = $derived(data.session && !busy && !reviewBusy ? data.review : null);

	let reviewAvailability = $derived(
		data.session && !busy && !reviewBusy ? data.reviewAvailability : null
	);

	const submitReview =
		(
			action: 'prepare' | 'cancel',
			destination: 'Workspace' | 'Operations' = 'Operations'
		): SubmitFunction =>
		({ cancel }) => {
			if (!hydrated || busy || reviewBusy || !data.session) {
				cancel();
				return;
			}

			reviewBusy = action;

			return async ({ result, update }) => {
				try {
					await update({
						reset: false,
						invalidateAll: true
					});

					if (result.type === 'success') {
						activeTab = destination;
					}
				} finally {
					reviewBusy = null;
				}
			};
		};

	onMount(() => {
		hydrated = true;

		if (data.session && data.review) {
			activeTab = 'Operations';
		}
	});

	let assessment = $derived(
		data.session && !busy && form && 'assessment' in form ? form.assessment : undefined
	);

	function assignment(value: boolean | null, positive: string, negative: string) {
		return value === null ? 'Unknown' : value ? positive : negative;
	}

	function count(value: number | null) {
		return value === null ? 'Unknown' : String(value);
	}

	const assessmentSummary = $derived(data.session ? data.assessmentSummary : null);

	const historyRecords = $derived([...(assessmentSummary?.history ?? [])].reverse());

	const outcomePresentation = {
		advised: {
			label: 'Advisory response',
			icon: ClipboardCheck
		},
		clarification: {
			label: 'Clarification required',
			icon: CircleHelp
		},
		rejected: {
			label: 'Unsupported assessment',
			icon: AlertTriangle
		},
		unavailable: {
			label: 'Assessment unavailable',
			icon: AlertTriangle
		}
	} as const;

	function formatTimestamp(value: number) {
		return new Date(value).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
	}

	const restrictions = [
		{ label: 'External provider access', value: 'Disabled', icon: WifiOff },
		{ label: 'Persistent mutations', value: 'Disabled', icon: Database },
		{ label: 'Synthetic execution', value: 'Explicit approval required', icon: Lock },
		{ label: 'Data source', value: 'Synthetic only', icon: ShieldCheck },
		{ label: 'Paid provider cost', value: '$0.00', icon: Wallet }
	];
</script>

<svelte:head>
	<title>Controlled Intelligence Workspace | FliHub</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0 space-y-4 sm:space-y-5">
	<a
		href={resolve('/(app)/development/intelligence')}
		class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:underline"
	>
		<ArrowLeft size={16} aria-hidden="true" />
		Advisory playground
	</a>

	<header class="flex flex-wrap items-start justify-between gap-3">
		<div class="space-y-1">
			<p class="text-sm text-muted-foreground">Development workspace</p>
			<h1 class="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
				<BrainCircuit size={26} aria-hidden="true" />
				Jev Application Intelligence
			</h1>
			<p class="text-sm text-muted-foreground">Protected controlled operations workspace.</p>
		</div>
		<Badge variant="secondary">Offline mock</Badge>
	</header>

	<section class="min-w-0 space-y-4 rounded-lg border bg-card p-3 sm:p-4">
		<nav aria-label="Controlled intelligence workspace" class="flex flex-wrap gap-2 border-b pb-3">
			{#each tabs as tab (tab.label)}
				{@const TabIcon = tab.icon}
				<Button
					type="button"
					size="sm"
					variant={activeTab === tab.label ? 'default' : 'outline'}
					aria-pressed={activeTab === tab.label}
					disabled={!hydrated || busy || reviewBusy !== null}
					onclick={() => (activeTab = tab.label)}
				>
					<TabIcon size={16} aria-hidden="true" />
					{tab.label}
				</Button>
			{/each}
		</nav>

		{#if data.execution}
			<section aria-label="Synthetic execution outcome" class="space-y-2 rounded-md border p-4">
				{#if data.execution.status === 'published'}
					<h2 class="flex items-center gap-2 font-semibold">
						<ShieldCheck size={20} aria-hidden="true" />
						Synthetic publication completed
					</h2>
					<dl class="grid gap-2 text-sm sm:grid-cols-2">
						{#each [{ label: 'Synthetic revision', value: `${data.execution.revisionBefore} → ${data.execution.revisionAfter}` }, { label: 'Groups created', value: data.execution.groupsCreated }, { label: 'Teams assigned', value: data.execution.teamsAssigned }, { label: 'Athletes assigned', value: data.execution.athletesAssigned }, { label: 'Independent verification', value: data.execution.verification }, { label: 'Persistent application mutations', value: 'None' }, { label: 'Paid provider requests', value: data.execution.paidProviderRequests }, { label: 'Paid provider cost', value: data.execution.paidProviderCost.toLocaleString( 'en-US', { style: 'currency', currency: 'USD' } ) }] as item (item.label)}
							<div class="flex justify-between gap-3 rounded bg-muted/50 px-3 py-2">
								<dt class="font-semibold">{item.label}</dt>
								<dd>{item.value}</dd>
							</div>
						{/each}
					</dl>
				{:else}
					<h2 class="font-semibold">Synthetic execution failed</h2>
					<p class="text-sm">The original synthetic state was retained.</p>
				{/if}
				<p class="text-sm">
					The scenario has concluded. A new workspace is required to begin another scenario.
				</p>
			</section>
		{/if}

		{#if form?.message}
			<p
				role="status"
				aria-live="polite"
				aria-atomic="true"
				class="rounded-md border p-3 text-sm break-words"
			>
				{form.message}
			</p>
		{/if}

		{#if activeTab === 'Workspace'}
			<div class="min-w-0 space-y-4 rounded-md border p-3 sm:p-4">
				<div class="flex items-center gap-3">
					<ShieldCheck size={24} aria-hidden="true" />
					<div>
						<h2 class="font-semibold">Protected workspace</h2>
						<p class="text-xs text-muted-foreground">
							Fresh authentication and development access required.
						</p>
					</div>
				</div>

				<div class="flex items-center justify-between gap-2 border-t pt-3 text-sm">
					<span class="font-semibold">Session status</span>
					<Badge variant={data.session ? 'default' : 'outline'}>
						{data.session ? 'Active at last server response' : 'Not started'}
					</Badge>
				</div>

				{#if data.session}
					<div class="space-y-2 rounded-md bg-muted/40 p-3 text-sm">
						<p class="flex items-center gap-2 font-semibold">
							<Clock size={16} aria-hidden="true" />
							Disposable synthetic session
						</p>
						<p>Idle limit: {data.limits.idleMs / 60000} minutes</p>
						<p>Absolute limit: {data.limits.absoluteMs / 60000} minutes</p>
						<p class="text-xs text-muted-foreground">
							Session validity is checked by the server on every request.
						</p>
					</div>

					<form method="POST" action="?/close">
						<Button type="submit" variant="outline" disabled={busy || reviewBusy !== null}>
							<LogOut size={16} aria-hidden="true" />
							End synthetic session
						</Button>
					</form>
				{:else}
					<div class="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
						<h3 class="font-semibold">Start a workspace session</h3>
						<p class="text-sm">
							Create a temporary server-owned workspace without modifying real application records.
						</p>
						<form method="POST" action="?/start">
							<Button type="submit">
								<Plus size={16} aria-hidden="true" />
								Start synthetic session
							</Button>
						</form>
					</div>
				{/if}
			</div>

			{#if data.session && data.review}
				<section
					aria-labelledby="protected-assessment-heading"
					class="min-w-0 space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 sm:p-4"
				>
					<h2 id="protected-assessment-heading" class="flex items-center gap-2 font-semibold">
						<Lock size={20} aria-hidden="true" class="text-amber-600 dark:text-amber-400" />
						Assessment inputs protected
					</h2>

					<p class="text-sm">
						An exact operation review is active. Discard the current review before changing the
						objective, scenario or simulated operator.
					</p>

					<dl class="overflow-hidden rounded-md border bg-card">
						<div class="space-y-1 bg-muted/40 p-3 text-sm">
							<dt class="text-xs font-semibold text-muted-foreground">Reviewed event</dt>
							<dd class="font-semibold">{data.review.event.name}</dd>
						</div>
						<div class="space-y-1 p-3 text-sm">
							<dt class="text-xs font-semibold text-muted-foreground">Operation</dt>
							<dd class="font-semibold">{data.review.operation.label}</dd>
						</div>
						<div class="space-y-1 bg-muted/40 p-3 text-sm">
							<dt class="text-xs font-semibold text-muted-foreground">Simulated operator</dt>
							<dd>{data.review.operator.role}</dd>
						</div>
					</dl>

					<div class="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							disabled={!hydrated || busy || reviewBusy !== null}
							onclick={() => (activeTab = 'Operations')}
						>
							<ClipboardCheck size={16} aria-hidden="true" />
							View exact operation review
						</Button>

						<form
							method="POST"
							action="?/cancelReview"
							enctype="application/x-www-form-urlencoded"
							use:enhance={submitReview('cancel', 'Workspace')}
						>
							<input type="hidden" name="reviewId" value={data.review.reviewId} />
							<Button
								type="submit"
								variant="outline"
								disabled={!hydrated || busy || reviewBusy !== null}
							>
								{#if reviewBusy === 'cancel'}
									<LoaderCircle size={16} aria-hidden="true" class="animate-spin" />
									Discarding review...
								{:else}
									<ClipboardList size={16} aria-hidden="true" />
									Discard review and edit assessment
								{/if}
							</Button>
						</form>
					</div>

					<p class="text-xs text-muted-foreground">
						Discarding the review does not execute an operation or change application records. A new
						assessment is required before preparing another review.
					</p>
				</section>
			{:else if data.session && data.execution}
				<p class="text-sm">
					This scenario has concluded. Close the workspace to start another scenario.
				</p>
			{:else if data.session && !reviewBusy}
				<section class="min-w-0 space-y-4 rounded-md border p-3 sm:p-4">
					<div class="flex flex-wrap items-start justify-between gap-2">
						<div class="space-y-1">
							<h2 class="flex items-center gap-2 text-lg font-semibold">
								<Sparkles size={21} aria-hidden="true" />
								What would you like to accomplish?
							</h2>
							<p class="text-sm text-muted-foreground">
								Describe a supported objective using a synthetic event scenario.
							</p>
						</div>
						<Badge variant="secondary">Recommendation only</Badge>
					</div>

					<noscript>
						<div class="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
							<p class="font-semibold">JavaScript required for assessments</p>
							<p class="mt-1 text-xs text-muted-foreground">
								Enable JavaScript and reload this page to select objectives, submit assessments and
								view workspace tabs. Starting and ending a synthetic session remain available.
							</p>
						</div>
					</noscript>

					<form
						method="POST"
						action="?/assess"
						aria-busy={busy}
						enctype="application/x-www-form-urlencoded"
						class="space-y-4"
						use:enhance={({ cancel }) => {
							if (!hydrated || busy || reviewBusy || !data.session || data.review) {
								cancel();
								return;
							}

							busy = true;

							return async ({ update }) => {
								try {
									await update({
										reset: false,
										invalidateAll: true
									});
								} finally {
									busy = false;
								}
							};
						}}
					>
						<fieldset disabled={!hydrated || busy || reviewBusy !== null} class="min-w-0 space-y-4">
							<legend class="mb-2 text-sm font-semibold">Objective input mode</legend>

							<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
								<label
									class="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm"
									class:bg-muted={mode === 'natural'}
								>
									<input type="radio" name="mode" value="natural" bind:group={mode} />
									<MessageSquare size={16} aria-hidden="true" />
									Natural language
								</label>

								<label
									class="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm"
									class:bg-muted={mode === 'registered'}
								>
									<input type="radio" name="mode" value="registered" bind:group={mode} />
									<ClipboardCheck size={16} aria-hidden="true" />
									Registered objective
								</label>
							</div>

							{#if mode === 'natural'}
								<div class="space-y-2">
									<label for="workspace-objective" class="text-sm font-semibold">
										Your objective
									</label>

									<textarea
										id="workspace-objective"
										name="objective"
										rows={3}
										maxlength={objectiveLimit}
										bind:value={naturalObjective}
										autocomplete="off"
										aria-describedby="objective-help objective-count"
										placeholder="Help me prepare our next tournament."
										class="w-full resize-y rounded-md border bg-background p-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
									></textarea>

									<div class="flex flex-wrap items-center justify-between gap-2">
										<p id="objective-help" class="text-xs text-muted-foreground">
											Supported objectives only. Do not enter private or real event information.
										</p>
										<span id="objective-count" class="text-xs text-muted-foreground tabular-nums">
											{naturalObjective.length}/{objectiveLimit}
										</span>
									</div>

									<div class="space-y-2 rounded-md bg-muted/40 p-3">
										<p class="flex items-center gap-2 text-xs font-semibold">
											<CircleHelp size={15} aria-hidden="true" />
											Try a supported objective
										</p>
										<div class="flex flex-wrap gap-2">
											<Button
												type="button"
												size="sm"
												variant="outline"
												onclick={() => (naturalObjective = 'Help me prepare our next tournament.')}
											>
												Prepare tournament
											</Button>
											<Button
												type="button"
												size="sm"
												variant="outline"
												onclick={() => (naturalObjective = 'How prepared is our next tournament?')}
											>
												Assess readiness
											</Button>
										</div>
									</div>
								</div>
							{:else}
								<div class="space-y-2">
									<label for="registered-objective" class="text-sm font-semibold">
										Registered objective
									</label>
									<select
										id="registered-objective"
										name="objective"
										bind:value={registeredObjective}
										class="w-full rounded-md border bg-background p-2.5 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
									>
										{#each objectives as objective (objective.id)}
											<option value={objective.id}>{objective.label}</option>
										{/each}
									</select>
								</div>
							{/if}

							<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<div class="min-w-0 space-y-2">
									<label
										for="workspace-scenario"
										class="flex items-center gap-2 text-sm font-semibold"
									>
										<MapPin size={16} aria-hidden="true" />
										Synthetic scenario
									</label>
									<select
										id="workspace-scenario"
										name="fixtureId"
										bind:value={selectedScenario}
										class="w-full rounded-md border bg-background p-2.5 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
									>
										{#each scenarios as scenario (scenario.id)}
											<option value={scenario.id}>{scenario.label}</option>
										{/each}
									</select>
								</div>

								<div class="min-w-0 space-y-2">
									<label
										for="workspace-actor"
										class="flex items-center gap-2 text-sm font-semibold"
									>
										<Users size={16} aria-hidden="true" />
										Simulated operator
									</label>
									<select
										id="workspace-actor"
										name="actorId"
										bind:value={selectedActor}
										aria-describedby="actor-help"
										class="w-full rounded-md border bg-background p-2.5 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
									>
										{#each actors as actor (actor.id)}
											<option value={actor.id}>{actor.label}</option>
										{/each}
									</select>
								</div>
							</div>

							<p id="actor-help" class="text-xs text-muted-foreground">
								Simulated roles do not change your actual FliHub permissions.
							</p>
						</fieldset>

						<div class="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
							<p class="flex items-center gap-2 text-sm font-semibold">
								<ShieldCheck size={16} aria-hidden="true" />
								Advisory assessment only
							</p>
							<p class="text-xs text-muted-foreground">
								No real application records will change. No operations will execute. No external
								intelligence provider will be contacted.
							</p>
						</div>

						<Button
							type="submit"
							disabled={!hydrated || busy || reviewBusy !== null}
							class="w-full sm:w-auto"
						>
							{#if busy}
								<LoaderCircle size={16} aria-hidden="true" class="animate-spin" />
								Assessing objective...
							{:else}
								<Sparkles size={16} aria-hidden="true" />
								Assess objective
							{/if}
						</Button>

						{#if busy}
							<p role="status" class="text-xs text-muted-foreground">
								Generating an offline advisory assessment.
							</p>
						{/if}
					</form>
				</section>
			{/if}

			{#if assessment}
				<section
					aria-labelledby="assessment-results-heading"
					aria-live="polite"
					class="min-w-0 space-y-4 rounded-md border p-3 sm:p-4"
				>
					<div class="flex flex-wrap items-start justify-between gap-2">
						<div class="space-y-1">
							<h2
								id="assessment-results-heading"
								class="flex items-center gap-2 text-lg font-semibold"
							>
								<BrainCircuit size={22} aria-hidden="true" />
								Assessment results
							</h2>
							<p class="text-xs text-muted-foreground">
								Most recent server response. Draft input changes do not reassess it. An active exact
								review must be discarded before editing. Session validity is checked on subsequent
								server requests.
							</p>
						</div>
						<Badge variant="secondary">Offline mock</Badge>
					</div>

					{#if assessment.status === 'advised'}
						{@const result = assessment}

						<div class="overflow-hidden rounded-md border">
							{#each [{ label: 'Resolved objective', value: result.objective }, { label: 'Synthetic scenario', value: result.scenario }, { label: 'Simulated operator', value: result.actor }] as item, index (item.label)}
								<div
									class="flex flex-wrap items-center justify-between gap-2 p-3 text-sm {index %
										2 ===
									0
										? 'bg-muted/40'
										: ''}"
								>
									<span class="font-semibold">{item.label}</span>
									<span>{item.value}</span>
								</div>
							{/each}
						</div>

						<div class="flex flex-wrap gap-2">
							<Badge variant="secondary">
								{result.decision === 'recommended'
									? 'Recommendation available'
									: result.decision === 'clarification'
										? 'Clarification required'
										: 'Assessment abstained'}
							</Badge>
							<Badge variant="outline">Recommendation only</Badge>
							<Badge variant="outline">
								<Lock size={12} aria-hidden="true" />
								Persistent execution disabled
							</Badge>
						</div>

						<div class="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-4">
							<h3 class="flex items-center gap-2 font-semibold">
								<Lightbulb
									size={21}
									aria-hidden="true"
									class="shrink-0 text-amber-600 dark:text-amber-400"
								/>
								{result.explanation.heading}
							</h3>

							<p class="text-sm">{result.explanation.summary}</p>

							{#if result.nextStep}
								<div class="space-y-2 border-t pt-3">
									<p class="text-xs font-semibold text-muted-foreground">Recommended next step</p>
									<p class="text-lg font-semibold">
										{result.nextStep.label}
									</p>
									<p class="text-sm">
										{result.nextStep.description}
									</p>
								</div>
							{:else}
								<p class="text-sm font-medium">No next-step recommendation is available.</p>
							{/if}

							{#if result.explanation.recommendation && result.explanation.recommendation !== result.nextStep?.label}
								<p class="text-sm">
									{result.explanation.recommendation}
								</p>
							{/if}
						</div>

						{#if result.prerequisiteReviewSuggested}
							<div
								class="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3"
							>
								<AlertTriangle
									size={19}
									aria-hidden="true"
									class="shrink-0 text-amber-600 dark:text-amber-400"
								/>
								<div class="space-y-1">
									<p class="text-sm font-semibold">Prerequisite review suggested</p>
									<p class="text-xs text-muted-foreground">
										Review event prerequisites before proceeding.
									</p>
								</div>
							</div>
						{/if}

						<section class="space-y-3">
							<h3 class="flex items-center gap-2 font-semibold">
								<ClipboardCheck size={18} aria-hidden="true" />
								Synthetic event context
							</h3>

							<dl class="overflow-hidden rounded-md border">
								{#each [{ label: 'Event date', value: assignment(result.context.dateAssigned, 'Assigned', 'Not assigned'), icon: CalendarDays, attention: result.context.dateAssigned !== true }, { label: 'Venue', value: assignment(result.context.venueAssigned, 'Assigned', 'Not assigned'), icon: MapPin, attention: result.context.venueAssigned !== true }, { label: 'Participants', value: count(result.context.participantCount), icon: Users, attention: result.context.participantCount === null || result.context.participantCount === 0 }, { label: 'Groups', value: count(result.context.groupCount), icon: Network, attention: result.context.groupCount === null || result.context.groupCount === 0 }, { label: 'Scoring', value: assignment(result.context.scoringConfigured, 'Configured', 'Not configured'), icon: ClipboardList, attention: result.context.scoringConfigured !== true }] as item, index (item.label)}
									{@const ItemIcon = item.icon}

									<div
										class="flex flex-wrap items-center justify-between gap-2 p-3 text-sm {index %
											2 ===
										0
											? 'bg-muted/40'
											: ''}"
									>
										<dt class="flex items-center gap-2 font-semibold">
											<ItemIcon size={16} aria-hidden="true" />
											{item.label}
										</dt>
										<dd class="font-medium tabular-nums">
											{#if item.attention}
												<span class="text-amber-700 dark:text-amber-400">
													{item.value}
												</span>
											{:else}
												{item.value}
											{/if}
										</dd>
									</div>
								{/each}
							</dl>

							<p class="text-xs text-muted-foreground">
								Synthetic data only. Unknown information is not treated as zero.
							</p>
						</section>

						<section class="space-y-3 rounded-md border p-3">
							<h3 class="flex items-center gap-2 font-semibold">
								<Gauge size={20} aria-hidden="true" />
								Qualitative readiness
							</h3>

							{#if result.readiness}
								<div class="flex items-center justify-between gap-3">
									<span class="text-2xl font-bold tabular-nums">
										{result.readiness.score.toFixed(2)}
										<span class="text-sm font-normal text-muted-foreground">
											/ {result.readiness.maximum}
										</span>
									</span>
									<Badge variant="outline">Qualitative only</Badge>
								</div>
							{:else}
								<p class="text-sm font-medium">Not available</p>
							{/if}

							{#if result.explanation.readiness}
								<p class="text-sm text-muted-foreground">
									{result.explanation.readiness}
								</p>
							{/if}

							<p class="text-xs text-muted-foreground">
								Not a probability, completion percentage or authorization to proceed.
							</p>
						</section>

						<details class="group overflow-hidden rounded-md border">
							<summary
								class="flex cursor-pointer list-none items-center justify-between gap-2 p-3 font-semibold"
							>
								<span class="flex items-center gap-2">
									<ListChecks size={18} aria-hidden="true" />
									Assessment reasoning
								</span>
								<ChevronDown
									size={18}
									aria-hidden="true"
									class="shrink-0 transition-transform group-open:rotate-180"
								/>
							</summary>
							<div class="border-t p-3 text-sm">
								{result.explanation.reasoning}
							</div>
						</details>

						{#if result.explanation.alternatives.length > 0}
							<details class="group overflow-hidden rounded-md border">
								<summary
									class="flex cursor-pointer list-none items-center justify-between gap-2 p-3 font-semibold"
								>
									<span class="flex items-center gap-2">
										<Layers size={18} aria-hidden="true" />
										Alternative recommendations
									</span>
									<ChevronDown
										size={18}
										aria-hidden="true"
										class="shrink-0 transition-transform group-open:rotate-180"
									/>
								</summary>
								<ul class="border-t">
									{#each result.explanation.alternatives as alternative, index (index)}
										<li class="p-3 text-sm {index % 2 === 0 ? 'bg-muted/40' : ''}">
											{alternative}
										</li>
									{/each}
								</ul>
							</details>
						{/if}

						{#if result.explanation.notices.length > 0}
							<div class="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
								<h3 class="flex items-center gap-2 text-sm font-semibold">
									<Info size={17} aria-hidden="true" />
									Assessment notices
								</h3>
								<ul class="list-disc space-y-1 pl-5 text-sm">
									{#each result.explanation.notices as notice, index (index)}
										<li>{notice}</li>
									{/each}
								</ul>
							</div>
						{/if}

						<div class="space-y-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
							<p>{result.manualFallback}</p>
							<p>{result.explanation.disclaimer}</p>
						</div>
					{:else}
						<div class="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-4">
							<h3 class="flex items-center gap-2 font-semibold">
								{#if assessment.status === 'clarification'}
									<CircleHelp size={20} aria-hidden="true" />
									Clarification required
								{:else if assessment.status === 'rejected'}
									<AlertTriangle size={20} aria-hidden="true" />
									Unsupported assessment
								{:else}
									<AlertTriangle size={20} aria-hidden="true" />
									Assessment unavailable
								{/if}
							</h3>
							<p class="text-sm">{assessment.message}</p>
							<p class="text-xs text-muted-foreground">
								Revise your objective or continue with manual review.
							</p>
						</div>
					{/if}

					<p class="flex items-start gap-2 text-xs text-muted-foreground">
						<ShieldCheck size={16} aria-hidden="true" class="shrink-0" />
						Advisory guidance only. No real application records have been modified.
					</p>
				</section>
			{/if}

			{#if reviewAvailability && !data.review}
				<section class="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 sm:p-4">
					<h2 class="flex items-center gap-2 font-semibold">
						<ClipboardList
							size={20}
							aria-hidden="true"
							class="text-amber-600 dark:text-amber-400"
						/>
						Controlled operation review
					</h2>

					{#if reviewAvailability}
						<p class="text-sm font-semibold">
							{reviewAvailability.label}
						</p>
						<p class="text-xs text-muted-foreground">
							Candidate from assessment #{reviewAvailability.sequence}. Preparation requires
							server-side authorization and prerequisite checks. This is not approval to execute.
						</p>
						<form
							method="POST"
							action="?/prepareReview"
							enctype="application/x-www-form-urlencoded"
							use:enhance={submitReview('prepare')}
						>
							<input type="hidden" name="generation" value={reviewAvailability.generation} />
							<Button type="submit" disabled={!hydrated || busy || reviewBusy !== null}>
								<ClipboardList size={16} aria-hidden="true" />
								Prepare exact operation review
							</Button>
						</form>
					{/if}
				</section>
			{/if}

			{#if reviewBusy === 'prepare'}
				<p role="status" class="flex items-center gap-2 text-sm text-muted-foreground">
					<LoaderCircle size={16} aria-hidden="true" class="animate-spin" />
					Preparing exact synthetic operation review...
				</p>
			{/if}
		{:else if activeTab === 'History'}
			<section class="min-w-0 space-y-4 rounded-md border p-3 sm:p-4">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div class="space-y-1">
						<h2 class="flex items-center gap-2 text-lg font-semibold">
							<History size={22} aria-hidden="true" />
							Assessment history
						</h2>
						<p class="text-xs text-muted-foreground">Server-owned assessment history</p>
					</div>

					{#if assessmentSummary}
						<Badge variant="secondary">
							{historyRecords.length}
							{historyRecords.length === 1 ? 'record' : 'records'}
						</Badge>
					{/if}
				</div>

				{#if !assessmentSummary}
					<div class="space-y-3 rounded-md border border-dashed p-6 text-center">
						<Lock size={28} aria-hidden="true" class="mx-auto text-muted-foreground" />
						<p class="font-semibold">No active workspace session</p>
						<p class="text-sm text-muted-foreground">
							Start a protected session to view assessment history.
						</p>
						<Button type="button" onclick={() => (activeTab = 'Workspace')}>
							<ClipboardCheck size={16} aria-hidden="true" />
							Go to Workspace
						</Button>
					</div>
				{:else if historyRecords.length === 0}
					<div class="space-y-3 rounded-md border border-dashed p-6 text-center">
						<History size={28} aria-hidden="true" class="mx-auto text-muted-foreground" />
						<p class="font-semibold">No assessments yet</p>
						<p class="text-sm text-muted-foreground">
							Complete an assessment to begin building your session history.
						</p>
						<Button type="button" onclick={() => (activeTab = 'Workspace')}>
							<Sparkles size={16} aria-hidden="true" />
							Assess an objective
						</Button>
					</div>
				{:else}
					<div class="overflow-hidden rounded-md border">
						{#each historyRecords as record, index (record.sequence)}
							{@const presentation = outcomePresentation[record.outcome]}
							{@const OutcomeIcon = presentation.icon}

							<details
								class="group border-b last:border-b-0 {index % 2 === 0 ? 'bg-muted/40' : ''}"
							>
								<summary
									class="flex cursor-pointer list-none items-center justify-between gap-3 p-3"
								>
									<div class="min-w-0 space-y-2">
										<p class="flex items-center gap-2 text-sm font-semibold">
											<OutcomeIcon
												size={18}
												aria-hidden="true"
												class={record.outcome === 'advised'
													? 'shrink-0 text-muted-foreground'
													: 'shrink-0 text-amber-600 dark:text-amber-400'}
											/>
											Assessment #{record.sequence}
										</p>

										<Badge variant="outline">
											{presentation.label}
										</Badge>

										<p class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
											<Clock size={13} aria-hidden="true" />
											{formatTimestamp(record.completedAt)}
										</p>
									</div>

									<ChevronDown
										size={18}
										aria-hidden="true"
										class="shrink-0 transition-transform group-open:rotate-180"
									/>
								</summary>

								<dl class="space-y-2 px-3 pb-3 text-xs">
									<div class="flex flex-wrap justify-between gap-2">
										<dt class="font-semibold">Started</dt>
										<dd>{formatTimestamp(record.startedAt)}</dd>
									</div>
									<div class="flex flex-wrap justify-between gap-2">
										<dt class="font-semibold">Completed</dt>
										<dd>{formatTimestamp(record.completedAt)}</dd>
									</div>
									<div class="flex flex-wrap justify-between gap-2">
										<dt class="font-semibold">Elapsed time</dt>
										<dd class="tabular-nums">
											{Math.max(0, record.completedAt - record.startedAt)} ms
										</dd>
									</div>
								</dl>
							</details>
						{/each}
					</div>
				{/if}

				<div
					class="flex items-start gap-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground"
				>
					<ShieldCheck size={17} aria-hidden="true" class="shrink-0" />
					<div class="space-y-1">
						<p>
							Temporary session metadata only. Maximum {data.limits.maxAssessmentHistory}
							retained records.
						</p>
						<p>
							History survives a page refresh while the session remains valid. Closing or expiring
							the session discards its records.
						</p>
						<p>Raw objectives and full assessment responses are not retained in history.</p>
					</div>
				</div>
			</section>
		{:else if activeTab === 'Usage'}
			<section class="min-w-0 space-y-4 rounded-md border p-3 sm:p-4">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<h2 class="flex items-center gap-2 text-lg font-semibold">
						<BarChart3 size={22} aria-hidden="true" />
						Session usage
					</h2>
					<Badge variant="secondary">Offline mock</Badge>
				</div>

				{#if assessmentSummary}
					<dl class="grid grid-cols-1 gap-3 sm:grid-cols-2">
						{#each [{ label: 'Completed assessments', value: String(assessmentSummary.usage.completedAssessments), icon: ClipboardCheck }, { label: 'Retained records', value: `${assessmentSummary.usage.retainedAssessments} / ${data.limits.maxAssessmentHistory}`, icon: History }, { label: 'Paid provider requests', value: String(assessmentSummary.usage.paidProviderRequests), icon: WifiOff }, { label: 'Paid provider cost', value: `$${assessmentSummary.usage.paidProviderCost.toFixed(2)}`, icon: Wallet }] as metric (metric.label)}
							{@const MetricIcon = metric.icon}

							<div class="min-w-0 space-y-2 rounded-md border p-3">
								<MetricIcon size={23} aria-hidden="true" class="text-muted-foreground" />
								<dt class="text-xs font-medium text-muted-foreground">
									{metric.label}
								</dt>
								<dd class="text-2xl font-bold tabular-nums">
									{metric.value}
								</dd>
							</div>
						{/each}
					</dl>

					<section class="space-y-3">
						<h3 class="flex items-center gap-2 text-sm font-semibold">
							<History size={18} aria-hidden="true" />
							Retained outcome breakdown
						</h3>

						<dl class="overflow-hidden rounded-md border">
							{#each ['advised', 'clarification', 'rejected', 'unavailable'] as outcome, index (outcome)}
								{@const presentation =
									outcomePresentation[outcome as keyof typeof outcomePresentation]}
								{@const OutcomeIcon = presentation.icon}

								<div
									class="flex flex-wrap items-center justify-between gap-2 p-3 text-sm {index %
										2 ===
									0
										? 'bg-muted/40'
										: ''}"
								>
									<dt class="flex items-center gap-2 font-semibold">
										<OutcomeIcon size={16} aria-hidden="true" />
										{presentation.label}
									</dt>
									<dd class="font-semibold tabular-nums">
										{historyRecords.filter((record) => record.outcome === outcome).length}
									</dd>
								</div>
							{/each}
						</dl>

						<p class="text-xs text-muted-foreground">
							Breakdown includes retained history only, not discarded older records.
						</p>
					</section>
				{:else}
					<div class="space-y-2 rounded-md border border-dashed p-4">
						<p class="flex items-center gap-2 font-semibold">
							<Lock size={18} aria-hidden="true" />
							No active session
						</p>
						<p class="text-sm text-muted-foreground">
							Session usage becomes available after starting a protected workspace.
						</p>
					</div>
				{/if}

				<section class="space-y-3">
					<h3 class="flex items-center gap-2 text-sm font-semibold">
						<Layers size={18} aria-hidden="true" />
						Configured resource limits
					</h3>

					<dl class="overflow-hidden rounded-md border">
						{#each [{ label: 'Assessments per user per minute', value: data.limits.maxAssessmentsPerUserPerWindow }, { label: 'Concurrent assessments per session', value: data.limits.maxConcurrentAssessmentsPerSession }, { label: 'Retained history capacity', value: data.limits.maxAssessmentHistory }, { label: 'Idle session limit', value: `${data.limits.idleMs / 60000} minutes` }, { label: 'Absolute session limit', value: `${data.limits.absoluteMs / 60000} minutes` }, { label: 'Synthetic executions per session', value: 1 }] as metric, index (metric.label)}
							<div
								class="flex flex-wrap items-center justify-between gap-2 p-3 text-sm {index % 2 ===
								0
									? 'bg-muted/40'
									: ''}"
							>
								<dt class="font-semibold">{metric.label}</dt>
								<dd class="font-medium tabular-nums">{metric.value}</dd>
							</div>
						{/each}
					</dl>
				</section>

				<div
					class="flex items-start gap-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground"
				>
					<Info size={17} aria-hidden="true" class="shrink-0" />
					<p>
						Usage reflects the current server-owned workspace session at the last server response.
						These are not global server statistics or provider billing records.
					</p>
				</div>
			</section>
		{:else if activeTab === 'Capabilities'}
			<section class="space-y-4 rounded-md border p-3 sm:p-4">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<h2 class="flex items-center gap-2 text-lg font-semibold">
						<Layers size={22} aria-hidden="true" />
						Workspace capabilities
					</h2>
					<Badge variant="secondary">Offline mock</Badge>
				</div>

				<p class="text-sm text-muted-foreground">
					Registered advisory objectives and controlled operation availability.
				</p>

				<div class="overflow-hidden rounded-md border">
					{#each [{ label: 'Prepare a tournament', description: 'Review synthetic event context and recommend a preparation step.', availability: 'Advisory available', icon: ClipboardCheck }, { label: 'Assess tournament readiness', description: 'Review known prerequisites and qualitative readiness.', availability: 'Advisory available', icon: Gauge }, { label: 'Create synthetic group assignments', description: 'Exact synthetic operation review is available after an eligible assessment. Confirmed synthetic execution is available for eligible reviews.', availability: 'Controlled synthetic execution', icon: Network }] as capability, index (capability.label)}
						{@const CapabilityIcon = capability.icon}

						<details class="group border-b last:border-b-0 {index % 2 === 0 ? 'bg-muted/40' : ''}">
							<summary class="flex cursor-pointer list-none items-center justify-between gap-3 p-3">
								<div class="min-w-0 space-y-2">
									<p class="flex items-center gap-2 text-sm font-semibold">
										<CapabilityIcon size={18} aria-hidden="true" class="shrink-0" />
										{capability.label}
									</p>

									<Badge
										variant={capability.availability === 'Advisory available'
											? 'secondary'
											: 'outline'}
									>
										{capability.availability}
									</Badge>
								</div>

								<ChevronDown
									size={18}
									aria-hidden="true"
									class="shrink-0 transition-transform group-open:rotate-180"
								/>
							</summary>

							<div class="space-y-3 px-3 pb-3">
								<p class="text-sm">{capability.description}</p>

								<Badge variant="outline">
									<Lock size={12} aria-hidden="true" />
									Persistent execution disabled
								</Badge>
							</div>
						</details>
					{/each}
				</div>

				{#if data.session}
					<Button type="button" variant="outline" onclick={() => (activeTab = 'Workspace')}>
						<Sparkles size={16} aria-hidden="true" />
						Assess an objective
					</Button>
				{:else}
					<p class="text-xs text-muted-foreground">
						Start a protected workspace session to use advisory capabilities.
					</p>
				{/if}

				<div
					class="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3"
				>
					<ShieldCheck size={18} aria-hidden="true" class="shrink-0" />
					<p class="text-xs text-muted-foreground">
						Advisory availability does not grant application permissions, approve an operation or
						authorize execution.
					</p>
				</div>
			</section>
		{:else if activeTab === 'Operations'}
			<section
				aria-labelledby="operation-review-heading"
				aria-busy={reviewBusy !== null}
				class="min-w-0 space-y-4 rounded-md border p-3 sm:p-4"
			>
				<div class="flex flex-wrap items-start justify-between gap-2">
					<div class="space-y-1">
						<h2 id="operation-review-heading" class="flex items-center gap-2 text-lg font-semibold">
							<ClipboardCheck size={22} aria-hidden="true" />
							Exact operation review
						</h2>
						<p class="text-xs text-muted-foreground">Server-owned synthetic operation proposal.</p>
					</div>
					<Badge variant="outline">Synthetic only</Badge>
				</div>

				{#if reviewBusy}
					<p role="status" class="flex items-center gap-2 text-sm">
						<LoaderCircle size={16} aria-hidden="true" class="animate-spin" />
						{reviewBusy === 'execute'
							? 'Executing and verifying synthetic assignments...'
							: reviewBusy === 'cancel'
								? 'Cancelling review...'
								: 'Preparing review...'}
					</p>
				{:else if review}
					<div class="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
						<h3 class="flex items-center gap-2 font-semibold">
							<Network size={20} aria-hidden="true" class="text-amber-600 dark:text-amber-400" />
							{review.operation.label}
						</h3>
						<p class="text-sm">{review.operation.description}</p>
						<p class="text-xs text-muted-foreground">
							Proposed changes only. No operation has been executed.
						</p>
					</div>

					<dl class="overflow-hidden rounded-md border">
						{#each [{ label: 'Organization', value: review.organization.name, icon: ShieldCheck }, { label: 'Event', value: review.event.name, icon: CalendarDays }, { label: 'Simulated operator', value: review.operator.role, icon: Users }, { label: 'State revision', value: String(review.stateRevision), icon: History }, { label: 'Scope', value: 'Synthetic only', icon: Database }] as item, index (item.label)}
							{@const ItemIcon = item.icon}
							<div
								class="flex flex-wrap items-center justify-between gap-2 p-3 text-sm {index % 2 ===
								0
									? 'bg-muted/40'
									: ''}"
							>
								<dt class="flex items-center gap-2 font-semibold">
									<ItemIcon size={16} aria-hidden="true" />
									{item.label}
								</dt>
								<dd class="break-words">{item.value}</dd>
							</div>
						{/each}
					</dl>

					<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
						{#each [{ label: 'Groups', value: `${review.summary.groupsBefore} → ${review.summary.groupsAfter}`, icon: Network }, { label: 'Teams assigned', value: String(review.summary.teamsAssigned), icon: Users }, { label: 'Athletes assigned', value: String(review.summary.athletesAssigned), icon: Users }] as metric (metric.label)}
							{@const MetricIcon = metric.icon}
							<div class="min-w-0 space-y-1 rounded-md border bg-muted/30 p-3">
								<MetricIcon size={19} aria-hidden="true" class="text-muted-foreground" />
								<p class="text-xs font-semibold text-muted-foreground">{metric.label}</p>
								<p class="text-xl font-bold text-amber-700 tabular-nums dark:text-amber-400">
									{metric.value}
								</p>
							</div>
						{/each}
					</div>

					<section class="space-y-3">
						<h3 class="flex items-center gap-2 font-semibold">
							<Network size={19} aria-hidden="true" />
							Proposed group assignments
						</h3>
						<p class="text-xs text-muted-foreground">
							Expand each group to inspect the exact teams and athletes.
						</p>

						{#key review.reviewId}
							<div class="overflow-hidden rounded-md border">
								{#each review.groups as group, index (group.id)}
									<details
										class="group border-b last:border-b-0 {index % 2 === 0 ? 'bg-muted/40' : ''}"
									>
										<summary
											class="flex cursor-pointer list-none items-center justify-between gap-3 p-3"
										>
											<div class="min-w-0 space-y-1">
												<p class="flex items-center gap-2 text-sm font-semibold">
													<Users size={17} aria-hidden="true" />
													{group.name}
												</p>
												<p class="text-xs text-muted-foreground">
													{group.teams.length} teams ·
													{group.teams.reduce((total, team) => total + team.athletes.length, 0)} athletes
												</p>
											</div>
											<ChevronDown
												size={18}
												aria-hidden="true"
												class="shrink-0 transition-transform group-open:rotate-180"
											/>
										</summary>

										<div class="space-y-2 border-t p-3">
											{#each group.teams as team (team.entryId)}
												<div class="space-y-2 rounded-md border bg-background p-3">
													<p class="text-sm font-semibold">{team.name}</p>
													<ul class="space-y-1">
														{#each team.athletes as athlete (athlete.id)}
															<li class="flex items-center gap-2 text-sm">
																<Users size={14} aria-hidden="true" class="text-muted-foreground" />
																{athlete.name}
															</li>
														{/each}
													</ul>
												</div>
											{/each}
										</div>
									</details>
								{/each}
							</div>
						{/key}
					</section>

					<details class="group overflow-hidden rounded-md border">
						<summary
							class="flex cursor-pointer list-none items-center justify-between gap-2 p-3 font-semibold"
						>
							<span class="flex items-center gap-2">
								<ShieldCheck size={18} aria-hidden="true" />
								Review identity and integrity
							</span>
							<ChevronDown
								size={18}
								aria-hidden="true"
								class="shrink-0 transition-transform group-open:rotate-180"
							/>
						</summary>
						<dl class="space-y-3 border-t p-3 text-xs">
							{#each [{ label: 'Review identity', value: review.reviewId }, { label: 'Plan digest', value: review.planDigest }, { label: 'Operation identity', value: review.operation.id }, { label: 'Organization identity', value: review.organization.id }, { label: 'Event identity', value: review.event.id }, { label: 'Simulated operator identity', value: review.operator.id }, { label: 'Operation effect', value: review.operation.effect }] as item (item.label)}
								<div class="space-y-1">
									<dt class="font-semibold">{item.label}</dt>
									<dd class="font-mono break-all text-muted-foreground">{item.value}</dd>
								</div>
							{/each}
						</dl>
					</details>

					<details class="group overflow-hidden rounded-md border">
						<summary
							class="flex cursor-pointer list-none items-center justify-between gap-2 p-3 font-semibold"
						>
							<span class="flex items-center gap-2">
								<ShieldCheck size={18} aria-hidden="true" />
								Records that remain unchanged
							</span>
							<ChevronDown
								size={18}
								aria-hidden="true"
								class="shrink-0 transition-transform group-open:rotate-180"
							/>
						</summary>
						<ul class="border-t">
							{#each review.boundaries.unchanged as item, index (item)}
								<li
									class="flex items-center gap-2 p-3 text-sm {index % 2 === 0 ? 'bg-muted/40' : ''}"
								>
									<ShieldCheck
										size={16}
										aria-hidden="true"
										class="shrink-0 text-muted-foreground"
									/>
									{item}
								</li>
							{/each}
						</ul>
					</details>

					{#key review.reviewId}
						<form
							method="POST"
							action="?/executeReview"
							enctype="application/x-www-form-urlencoded"
							use:enhance={submitExecution}
							class="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3"
						>
							<h3 class="flex items-center gap-2 font-semibold">
								<Lock size={19} aria-hidden="true" class="text-amber-600 dark:text-amber-400" />
								Confirm synthetic execution
							</h3>
							<p class="text-sm">
								Approve {review.operation.label} for {review.event.name} as {review.operator.role}.
								This creates {review.summary.groupsAfter - review.summary.groupsBefore} groups with the
								reviewed assignments for {review.summary.teamsAssigned} teams and
								{review.summary.athletesAssigned} athletes.
							</p>
							<p class="text-sm">
								No persistent application records will change. No external provider will be
								contacted. Each workspace allows one admitted execution attempt. Execution concludes
								the scenario.
							</p>
							<input type="hidden" name="generation" value={data.reviewGeneration} />
							<input type="hidden" name="reviewId" value={review.reviewId} />
							<input type="hidden" name="planDigest" value={review.planDigest} />
							<label class="flex items-start gap-2 text-sm font-semibold">
								<input
									type="checkbox"
									name="confirmation"
									value="approve-and-execute"
									checked={confirmedReview === review.reviewId}
									onchange={(event) => {
										confirmedReview = event.currentTarget.checked ? review.reviewId : null;
									}}
									disabled={!hydrated || busy || reviewBusy !== null}
									required
								/>
								I approve the exact reviewed assignments.
							</label>
							<Button
								type="submit"
								disabled={!hydrated ||
									busy ||
									reviewBusy !== null ||
									confirmedReview !== review.reviewId}
							>
								Approve and execute
							</Button>
						</form>
					{/key}

					<form
						method="POST"
						action="?/cancelReview"
						enctype="application/x-www-form-urlencoded"
						use:enhance={submitReview('cancel')}
						class="flex flex-wrap items-center gap-3"
					>
						<input type="hidden" name="reviewId" value={review.reviewId} />
						<Button
							type="submit"
							variant="outline"
							disabled={!hydrated || busy || reviewBusy !== null}
						>
							<ClipboardList size={16} aria-hidden="true" />
							Cancel review
						</Button>
						<p class="text-xs text-muted-foreground">
							Cancellation discards the proposal. A new assessment is required to prepare another
							review.
						</p>
					</form>
				{:else}
					<div class="space-y-3 rounded-md border border-dashed p-6 text-center">
						<ClipboardList size={30} aria-hidden="true" class="mx-auto text-muted-foreground" />
						<p class="font-semibold">No active operation review</p>
						<p class="text-sm text-muted-foreground">
							Complete an eligible assessment in the Workspace tab to prepare an exact synthetic
							operation review.
						</p>
						<Button
							type="button"
							variant="outline"
							disabled={!hydrated || busy || reviewBusy !== null}
							onclick={() => (activeTab = 'Workspace')}
						>
							<ArrowLeft size={16} aria-hidden="true" />
							Go to Workspace
						</Button>
					</div>
				{/if}

				<p class="flex items-start gap-2 text-xs text-muted-foreground">
					<Lock size={16} aria-hidden="true" class="shrink-0" />
					Persistent application execution remains disabled. Session validity is checked on subsequent
					server requests.
				</p>
			</section>
		{/if}
	</section>

	<details open class="group overflow-hidden rounded-lg border">
		<summary
			class="flex cursor-pointer list-none items-center justify-between gap-2 p-3 font-semibold"
		>
			<span class="flex items-center gap-2">
				<ShieldCheck size={18} aria-hidden="true" />
				Security and execution boundaries
			</span>
			<ChevronDown
				size={18}
				aria-hidden="true"
				class="transition-transform group-open:rotate-180"
			/>
		</summary>

		<dl class="border-t">
			{#each restrictions as restriction, index (restriction.label)}
				{@const RestrictionIcon = restriction.icon}
				<div
					class="flex flex-wrap items-center justify-between gap-2 p-3 text-sm {index % 2 === 0
						? 'bg-muted/40'
						: ''}"
				>
					<dt class="flex items-center gap-2 font-semibold">
						<RestrictionIcon size={16} aria-hidden="true" />
						{restriction.label}
					</dt>
					<dd><Badge variant="secondary">{restriction.value}</Badge></dd>
				</div>
			{/each}
		</dl>
	</details>

	<footer class="rounded-md border p-3 text-xs text-muted-foreground">
		Jev supplies intelligence. FliHub retains control.
	</footer>
</div>
