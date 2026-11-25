<script lang="ts">
	import {
		BrainCircuit,
		ClipboardCheck,
		History,
		Layers,
		BarChart3,
		Users,
		Network,
		ClipboardList,
		ListChecks,
		CircleHelp,
		ChevronDown,
		CalendarDays,
		MapPin,
		Lightbulb,
		Gauge,
		AlertTriangle,
		Shield,
		Eye,
		Clock,
		Lock,
		Wallet,
		Activity,
		Settings,
		Timer,
		WifiOff,
		Database,
		Save
	} from 'lucide-svelte';

	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let busy = $state(false);

	type AssessmentResult = NonNullable<NonNullable<PageProps['form']>['result']>;

	type HistoryEntry = {
		id: number;
		timestamp: string;
		objectiveId: string;
		fixtureId: string;
		result: AssessmentResult;
	};

	let history = $state<HistoryEntry[]>([]);
	let selectedHistory = $state<HistoryEntry | null>(null);

	let totalAttempts = $state(0);
	let advisedCount = $state(0);
	let unavailableCount = $state(0);
	let disabledCount = $state(0);
	let otherCount = $state(0);
	let replayCount = $state(0);

	let displayedResult = $derived(selectedHistory?.result ?? form?.result);

	let displayedFixture = $derived(selectedHistory?.fixtureId ?? form?.fixtureId ?? '');

	function viewHistory(entry: HistoryEntry) {
		selectedHistory = entry;
		replayCount += 1;
		activeTab = 'Assessment';
	}

	function formatTimestamp(value: string) {
		return new Date(value).toLocaleString();
	}

	function displayName(value: string) {
		return value
			.split('_')
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	}

	function objectiveLabel(value: string) {
		return value === 'prepare_tournament'
			? 'Help me prepare our next tournament'
			: 'Assess event readiness';
	}

	const tabs = ['Assessment', 'History', 'Capabilities', 'Usage'] as const;

	type Tab = (typeof tabs)[number];

	let activeTab = $state<Tab>('Assessment');

	const tabIcons = {
		Assessment: ClipboardCheck,
		History: History,
		Capabilities: Layers,
		Usage: BarChart3
	};

	const capabilityIcons = {
		review_participant_readiness: Users,
		plan_group_assignments: Network,
		review_scoring_requirements: ClipboardList,
		review_event_prerequisites: ListChecks,
		request_clarification: CircleHelp
	};

	function assignment(value: boolean | null, positive: string, negative: string) {
		return value === null ? 'Unknown' : value ? positive : negative;
	}

	function count(value: number | null) {
		return value === null ? 'Unknown' : String(value);
	}
</script>

<svelte:head>
	<title>Application Intelligence Playground | FliHub</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-5">
	<header class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<p class="text-sm font-medium text-muted-foreground">Development playground</p>
			<h1 class="text-2xl font-bold tracking-tight">
				<span class="flex items-center gap-2">
					<BrainCircuit size={26} aria-hidden="true" />
					Jev Application Intelligence
				</span>
			</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				Explore intelligent application guidance using synthetic event scenarios.
			</p>
		</div>
		<Badge variant="secondary">Offline mock</Badge>
	</header>

	<section class="rounded-lg border bg-card p-4">
		<nav aria-label="Intelligence workspace" class="flex flex-wrap gap-2 border-b pb-3">
			{#each tabs as tab (tab)}
				{@const TabIcon = tabIcons[tab]}
				<Button
					type="button"
					size="sm"
					variant={activeTab === tab ? 'default' : 'outline'}
					aria-pressed={activeTab === tab}
					onclick={() => (activeTab = tab)}
				>
					<TabIcon size={16} aria-hidden="true" />
					{tab}
				</Button>
			{/each}
		</nav>

		{#if activeTab === 'Capabilities'}
			<section class="mt-4 space-y-4 rounded-lg border bg-card p-4">
				<div class="flex items-center justify-between gap-2">
					<h2 class="text-lg font-semibold">Registered capabilities</h2>
					<Badge variant="secondary">
						{data.capabilities.length}
					</Badge>
				</div>

				<p class="text-sm text-muted-foreground">
					Available advisory capabilities. Eligibility depends on the selected event context.
				</p>

				<div class="overflow-hidden rounded-md border">
					{#each data.capabilities as capability, index (capability.id)}
						{@const CapabilityIcon = capabilityIcons[capability.id]}
						<details class="group {index % 2 === 0 ? 'bg-muted/40' : ''}">
							<summary class="flex cursor-pointer list-none items-center justify-between gap-3 p-3">
								<div class="space-y-1">
									<p class="text-sm font-semibold">
										<span class="flex items-center gap-2">
											<CapabilityIcon size={18} aria-hidden="true" />
											{capability.label}
										</span>
									</p>
									<Badge variant="secondary">Recommendation only</Badge>
								</div>
								<span aria-hidden="true" class="transition-transform group-open:rotate-180"
									><ChevronDown size={18} aria-hidden="true" /></span
								>
							</summary>

							<div class="space-y-2 px-3 pb-3">
								<p class="text-sm">
									{capability.description}
								</p>
								<p class="text-xs text-muted-foreground">
									Capability ID: {capability.id}
								</p>
								<Badge variant="outline"
									><Lock size={12} aria-hidden="true" />
									Execution not implemented</Badge
								>
							</div>
						</details>
					{/each}
				</div>
			</section>
		{:else if activeTab === 'History'}
			<section class="mt-4 space-y-4 rounded-lg border bg-card p-4">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<h2 class="flex items-center gap-2 text-lg font-semibold">
						<History size={21} aria-hidden="true" />
						Assessment history
					</h2>
					<Badge variant="secondary">
						{history.length}
						{history.length === 1 ? 'record' : 'records'}
					</Badge>
				</div>

				<p class="text-sm text-muted-foreground">
					Review previous assessments without making another intelligence request.
				</p>

				{#if history.length === 0}
					<div
						class="flex flex-col items-center gap-3 rounded-md border border-dashed p-8 text-center"
					>
						<History size={32} aria-hidden="true" class="text-muted-foreground" />
						<p class="font-semibold">No assessments yet</p>
						<p class="text-sm text-muted-foreground">
							Run an assessment to begin building your session history.
						</p>
						<Button type="button" onclick={() => (activeTab = 'Assessment')}>
							<ClipboardCheck size={16} aria-hidden="true" />
							Go to Assessment
						</Button>
					</div>
				{:else}
					<div class="overflow-hidden rounded-md border">
						{#each history as entry, index (entry.id)}
							<div class="border-b last:border-b-0 {index % 2 === 0 ? 'bg-muted/40' : ''}">
								<details class="group">
									<summary
										class="flex cursor-pointer list-none items-center justify-between gap-3 p-4"
									>
										<div class="min-w-0 space-y-2">
											<p class="flex items-center gap-2 font-semibold">
												<ClipboardCheck size={18} aria-hidden="true" />
												{displayName(entry.fixtureId)}
											</p>

											<p class="flex items-center gap-2 text-xs text-muted-foreground">
												<Clock size={13} aria-hidden="true" />
												{formatTimestamp(entry.timestamp)}
											</p>

											{#if entry.result.status === 'advised'}
												<p
													class="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400"
												>
													<Lightbulb size={16} aria-hidden="true" />
													{entry.result.explanation.recommendation ?? 'No recommendation available'}
												</p>
											{:else}
												<Badge variant="outline">
													{displayName(entry.result.status)}
												</Badge>
											{/if}
										</div>

										<ChevronDown
											size={18}
											aria-hidden="true"
											class="shrink-0 transition-transform group-open:rotate-180"
										/>
									</summary>

									<div class="space-y-3 px-4 pb-4 text-sm">
										<p class="text-muted-foreground">
											{objectiveLabel(entry.objectiveId)}
										</p>

										{#if entry.result.status === 'advised'}
											{#if entry.result.plan.readiness}
												<div class="flex items-center justify-between gap-2">
													<span class="flex items-center gap-2">
														<Gauge size={16} aria-hidden="true" />
														Qualitative readiness
													</span>
													<span class="font-semibold">
														{entry.result.plan.readiness.score.toFixed(2)}
														/ {entry.result.plan.readiness.maximum}
													</span>
												</div>
											{/if}
										{/if}
									</div>
								</details>
								<div class="px-4 pb-4">
									<Button
										type="button"
										size="sm"
										variant="outline"
										disabled={busy}
										onclick={() => viewHistory(entry)}
									>
										<Eye size={16} aria-hidden="true" />
										View original assessment
									</Button>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<p class="flex items-center gap-2 text-xs text-muted-foreground">
					<Shield size={16} aria-hidden="true" />
					Session history only. Maximum {data.limits.historyLimit} records. Refreshing clears history.
				</p>
			</section>
		{:else if activeTab === 'Usage'}
			<section class="mt-4 space-y-5 rounded-lg border bg-card p-4">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<h2 class="flex items-center gap-2 text-lg font-semibold">
						<BarChart3 size={21} aria-hidden="true" />
						Session usage
					</h2>
					<Badge variant="secondary">Offline mock</Badge>
				</div>

				<p class="text-sm text-muted-foreground">
					Review assessment activity, configured resource limits, and offline execution
					restrictions.
				</p>

				<dl class="grid grid-cols-2 gap-3">
					{#each [{ label: 'Assessment submissions', value: totalAttempts, icon: ClipboardCheck }, { label: 'Advisory responses', value: advisedCount, icon: BrainCircuit }, { label: 'Historical views', value: replayCount, icon: History }, { label: 'Paid provider cost', value: '$0.00', icon: Wallet }] as metric (metric.label)}
						{@const MetricIcon = metric.icon}

						<div class="min-w-0 space-y-2 rounded-lg border p-3">
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
						<Activity size={18} aria-hidden="true" />
						Response breakdown
					</h3>

					<dl class="overflow-hidden rounded-md border">
						{#each [{ label: 'Advisory responses', value: advisedCount, icon: BrainCircuit }, { label: 'Unavailable responses', value: unavailableCount, icon: AlertTriangle }, { label: 'Disabled responses', value: disabledCount, icon: Lock }, { label: 'Other responses', value: otherCount, icon: CircleHelp }] as metric, index (metric.label)}
							{@const MetricIcon = metric.icon}

							<div
								class="flex items-center justify-between gap-2 p-3 text-sm {index % 2 === 0
									? 'bg-muted/40'
									: ''}"
							>
								<dt class="flex items-center gap-2 font-semibold">
									<MetricIcon size={17} aria-hidden="true" class="text-muted-foreground" />
									{metric.label}
								</dt>
								<dd class="font-semibold tabular-nums">
									{metric.value}
								</dd>
							</div>
						{/each}
					</dl>

					{#if busy}
						<p class="text-xs text-amber-700 dark:text-amber-400">
							An assessment is currently in progress.
						</p>
					{/if}
				</section>

				<section class="space-y-3">
					<h3 class="flex items-center gap-2 text-sm font-semibold">
						<Settings size={18} aria-hidden="true" />
						Configured resource limits
					</h3>

					<dl class="overflow-hidden rounded-md border">
						{#each [{ label: 'Requests per minute', value: data.limits.requestsPerMinute, icon: Timer }, { label: 'Concurrent requests', value: data.limits.concurrency, icon: Layers }, { label: 'History capacity', value: `${history.length} / ${data.limits.historyLimit}`, icon: History }] as metric, index (metric.label)}
							{@const MetricIcon = metric.icon}

							<div
								class="flex items-center justify-between gap-2 p-3 text-sm {index % 2 === 0
									? 'bg-muted/40'
									: ''}"
							>
								<dt class="flex items-center gap-2 font-semibold">
									<MetricIcon size={17} aria-hidden="true" class="text-muted-foreground" />
									{metric.label}
								</dt>
								<dd class="font-semibold tabular-nums">
									{metric.value}
								</dd>
							</div>
						{/each}
					</dl>

					<p class="text-xs text-muted-foreground">
						Request and concurrency limits are configured for the playground server instance, not
						individual browser sessions.
					</p>
				</section>

				<section class="space-y-3">
					<h3 class="flex items-center gap-2 text-sm font-semibold">
						<Shield size={18} aria-hidden="true" />
						Security and execution
					</h3>

					<dl class="overflow-hidden rounded-md border">
						{#each [{ label: 'External provider access', value: 'Disabled', icon: WifiOff }, { label: 'Data source', value: 'Synthetic', icon: Database }, { label: 'Application execution', value: 'Disabled', icon: Lock }, { label: 'Persistent history', value: 'Disabled', icon: Save }] as restriction, index (restriction.label)}
							{@const RestrictionIcon = restriction.icon}

							<div
								class="flex flex-wrap items-center justify-between gap-2 p-3 text-sm {index % 2 ===
								0
									? 'bg-muted/40'
									: ''}"
							>
								<dt class="flex items-center gap-2 font-semibold">
									<RestrictionIcon size={17} aria-hidden="true" class="text-muted-foreground" />
									{restriction.label}
								</dt>
								<dd>
									<Badge variant="secondary">
										{restriction.value}
									</Badge>
								</dd>
							</div>
						{/each}
					</dl>
				</section>

				<div
					class="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground"
				>
					<CircleHelp size={17} aria-hidden="true" class="shrink-0" />
					<p>
						Statistics reflect enhanced submissions and historical views in this browser page
						session. They are not global server statistics or provider billing records. Refreshing
						the page resets these counters and clears history.
					</p>
				</div>
			</section>
		{/if}

		<div hidden={activeTab !== 'Assessment'} class="pt-4">
			<form
				method="POST"
				action="?/assess"
				class="space-y-4"
				use:enhance={({ formData, cancel }) => {
					if (busy) {
						cancel();
						return;
					}

					busy = true;
					selectedHistory = null;

					const objectiveId = String(formData.get('objectiveId'));
					const fixtureId = String(formData.get('fixtureId'));
					const id = ++totalAttempts;

					return async ({ result: response, update }) => {
						try {
							if (response.type === 'success' && response.data?.result) {
								const assessment = response.data.result as AssessmentResult;

								if (assessment.status === 'advised') {
									advisedCount += 1;
								} else if (assessment.status === 'unavailable') {
									unavailableCount += 1;
								} else if (assessment.status === 'disabled') {
									disabledCount += 1;
								} else {
									otherCount += 1;
								}

								const entry: HistoryEntry = {
									id,
									timestamp: new Date().toISOString(),
									objectiveId,
									fixtureId,
									result: assessment
								};

								history = [entry, ...history].slice(0, data.limits.historyLimit);
							} else {
								otherCount += 1;
							}

							await update({ reset: false });
						} finally {
							busy = false;
						}
					};
				}}
			>
				<div class="space-y-2">
					<label for="objective" class="text-sm font-semibold">
						What would you like to accomplish?
					</label>
					<select
						id="objective"
						name="objectiveId"
						class="w-full rounded-md border bg-background px-3 py-2 text-sm"
					>
						{#each data.objectives as objective (objective)}
							<option value={objective}>{objectiveLabel(objective)}</option>
						{/each}
					</select>
				</div>

				<div class="space-y-2">
					<label for="scenario" class="text-sm font-semibold">Synthetic event scenario</label>
					<select
						id="scenario"
						name="fixtureId"
						class="w-full rounded-md border bg-background px-3 py-2 text-sm"
					>
						{#each data.scenarios as scenario (scenario)}
							<option value={scenario}>{displayName(scenario)}</option>
						{/each}
					</select>
				</div>

				<Button type="submit" disabled={busy}>
					{busy ? 'Assessing…' : 'Run assessment'}
				</Button>
			</form>
		</div>
	</section>

	<div hidden={activeTab !== 'Assessment'} aria-live="polite" aria-busy={busy}>
		{#if !selectedHistory && form?.message}
			<p class="rounded-md border p-3 text-sm text-destructive">{form.message}</p>
		{/if}

		{#if selectedHistory}
			<div
				class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 p-3 text-sm"
			>
				<div class="space-y-1">
					<p class="flex items-center gap-2 font-semibold">
						<History size={16} aria-hidden="true" />
						Viewing historical assessment
					</p>
					<p class="text-xs text-muted-foreground">
						{formatTimestamp(selectedHistory.timestamp)}
						· {objectiveLabel(selectedHistory.objectiveId)}
					</p>
				</div>
				<Button type="button" size="sm" variant="outline" onclick={() => (selectedHistory = null)}>
					Return to latest result
				</Button>
			</div>
		{/if}

		{#if displayedResult}
			{#if displayedResult.status === 'advised'}
				{@const result = displayedResult}
				{@const facts = result.plan.facts}
				{@const contextRows = [
					{
						label: 'Event date',
						icon: CalendarDays,
						value: assignment(facts.dateAssigned, 'Assigned', 'Not assigned'),
						attention: facts.dateAssigned !== true
					},
					{
						label: 'Venue',
						icon: MapPin,
						value: assignment(facts.venueAssigned, 'Assigned', 'Not assigned'),
						attention: facts.venueAssigned !== true
					},
					{
						label: 'Registered participants',
						icon: Users,
						value: count(facts.participantCount),
						attention: facts.participantCount === null || facts.participantCount === 0
					},
					{
						label: 'Competition groups recorded',
						icon: Network,
						value: count(facts.groupCount),
						attention: facts.groupCount === null || facts.groupCount === 0
					},
					{
						label: 'Scoring',
						icon: ClipboardList,
						value: assignment(facts.scoringConfigured, 'Configured', 'Not configured'),
						attention: facts.scoringConfigured !== true
					}
				]}
				<section class="space-y-4 rounded-lg border bg-card p-4">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<h2 class="flex items-center gap-2 text-lg font-semibold">
							<ClipboardCheck size={21} aria-hidden="true" />
							{result.explanation.heading}
						</h2>
						<Badge variant="outline">{displayName(displayedFixture)}</Badge>
					</div>

					<details open class="group overflow-hidden rounded-md border">
						<summary
							class="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-semibold"
						>
							<span class="flex items-center gap-2">
								<ListChecks size={18} aria-hidden="true" />
								Event context
							</span>
							<ChevronDown
								size={18}
								aria-hidden="true"
								class="transition-transform group-open:rotate-180"
							/>
						</summary>

						<dl class="border-t">
							{#each contextRows as row, index (row.label)}
								{@const RowIcon = row.icon}

								<div
									class="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm {index %
										2 ===
									0
										? 'bg-muted/40'
										: ''}"
								>
									<dt class="flex items-center gap-2 font-semibold">
										<RowIcon
											size={17}
											aria-hidden="true"
											class={row.attention ? 'text-amber-600' : 'text-muted-foreground'}
										/>
										{row.label}
									</dt>

									<dd
										class="flex items-center gap-2 font-medium {row.attention
											? 'text-amber-700 dark:text-amber-400'
											: ''}"
									>
										{row.value}

										{#if row.attention}
											<AlertTriangle size={15} aria-hidden="true" />
										{/if}
									</dd>
								</div>
							{/each}
						</dl>

						<p class="border-t px-3 py-2 text-xs text-muted-foreground">
							Recorded values do not establish overall preparation or complete participant
							assignment.
						</p>
					</details>

					{#if result.explanation.recommendation}
						<div class="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/5 p-4">
							<p
								class="flex items-center gap-2 text-xs font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400"
							>
								<Lightbulb size={20} aria-hidden="true" />
								{result.plan.decision.status === 'clarification'
									? 'Clarification needed'
									: 'Recommended next step'}
							</p>
							<h3 class="text-lg font-bold">{result.explanation.recommendation}</h3>
							{#if result.explanation.reasoning}
								<p class="text-sm">{result.explanation.reasoning}</p>
							{/if}
						</div>
					{/if}

					{#if result.plan.readiness}
						<div class="space-y-2">
							<div class="flex justify-between gap-2 text-sm font-semibold">
								<span class="flex items-center gap-2">
									<Gauge size={18} aria-hidden="true" />
									Qualitative readiness
								</span>
								<span>
									{result.plan.readiness.score.toFixed(2)} / {result.plan.readiness.maximum}
								</span>
							</div>
							<progress
								aria-label="Qualitative readiness"
								value={result.plan.readiness.score}
								max={result.plan.readiness.maximum}
								class="readiness-progress h-2 w-full"
							></progress>
							<p class="text-xs text-muted-foreground">Not an official completion measurement.</p>
						</div>
					{/if}

					{#if result.explanation.alternatives.length}
						<details class="group overflow-hidden rounded-md border">
							<summary
								class="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-semibold"
							>
								<span class="flex items-center gap-2">
									<Layers size={18} aria-hidden="true" />
									Alternative recommendations
								</span>
								<span class="flex items-center gap-2">
									<Badge variant="secondary">
										{result.explanation.alternatives.length}
									</Badge>
									<ChevronDown
										size={18}
										aria-hidden="true"
										class="transition-transform group-open:rotate-180"
									/>
								</span>
							</summary>

							<ul class="border-t text-sm">
								{#each result.explanation.alternatives as alternative, index (alternative)}
									<li class="p-3 {index % 2 === 0 ? 'bg-muted/40' : ''}">
										{alternative}
									</li>
								{/each}
							</ul>
						</details>
					{/if}

					{#each result.explanation.notices as notice, index (index)}
						<div
							class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
						>
							<AlertTriangle size={18} aria-hidden="true" class="mt-0.5 shrink-0 text-amber-600" />
							<p>{notice}</p>
						</div>
					{/each}

					<div class="flex items-start gap-2 text-xs text-muted-foreground">
						<Shield size={16} aria-hidden="true" class="shrink-0" />
						<p>{result.explanation.disclaimer}</p>
					</div>
				</section>
			{:else}
				<section class="rounded-lg border p-4">
					<h2 class="font-semibold">Assessment {displayName(displayedResult.status)}</h2>
					{#if displayedResult.status === 'unavailable'}
						<p class="text-sm text-muted-foreground">
							Reason: {displayName(displayedResult.reason)}
						</p>
					{/if}
				</section>
			{/if}
		{/if}
	</div>

	<footer class="flex flex-wrap justify-between gap-2 rounded-md border p-3 text-xs">
		<span>Advisory only · Synthetic data · Execution disabled</span>
		<span class="font-semibold">Paid provider cost: $0.00</span>
	</footer>
</div>

<style>
	.readiness-progress {
		appearance: none;
		-webkit-appearance: none;
		display: block;
		overflow: hidden;
		border: none;
		border-radius: 9999px;
		background: var(--muted);
		color: #d97706;
	}

	.readiness-progress::-webkit-progress-bar {
		background: var(--muted);
		border-radius: 9999px;
	}

	.readiness-progress::-webkit-progress-value {
		background: #d97706;
		border-radius: 9999px;
	}

	.readiness-progress::-moz-progress-bar {
		background: #d97706;
		border-radius: 9999px;
	}
</style>
