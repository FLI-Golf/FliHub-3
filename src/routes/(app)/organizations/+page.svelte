<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { AlertCircle, Building2, CircleCheck, Plus } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import {
		availabilityMeta,
		missingDependencies,
		type RaceDistance,
		type TemplateId
	} from '$lib/capabilities/catalog';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const memberships = $derived(data.memberships ?? []);
	const message = $derived(form && 'message' in form ? form.message : null);
	const nameValue = $derived(form && 'name' in form ? String(form.name ?? '') : '');

	function roleLabel(role: string): string {
		return role.charAt(0).toUpperCase() + role.slice(1);
	}

	// ---- Onboarding form state (initial value intentionally captured once) ----
	let orgName = $state(untrack(() => nameValue));
	let template = $state<TemplateId | ''>('');
	let selectedCaps = $state<string[]>([]);
	let presetDistances = $state<string[]>([]);
	let customDistances = $state<RaceDistance[]>([]);

	const templates = $derived(data.catalog?.templates ?? []);
	const capabilityDefs = $derived(data.catalog?.capabilities ?? []);

	const activeTemplate = $derived(templates.find((t) => t.id === template) ?? null);
	const presetList = $derived(activeTemplate?.defaultRaceDistances ?? []);
	const depHints = $derived(missingDependencies(selectedCaps));
	const distancesJson = $derived(
		JSON.stringify([
			...presetList.filter((d) => presetDistances.includes(d.key)),
			...customDistances.filter((d) => d.label.trim() && d.distance > 0)
		])
	);

	function chooseTemplate(id: TemplateId) {
		template = id;
		const t = templates.find((x) => x.id === id);
		selectedCaps = [...(t?.defaultCapabilities ?? [])];
		presetDistances = (t?.defaultRaceDistances ?? []).map((d) => d.key);
		customDistances = [];
	}

	function toggleCapability(id: string, checked: boolean) {
		if (checked) {
			// Auto-include required dependencies.
			const def = capabilityDefs.find((c) => c.id === id);
			const withDeps = new Set([...selectedCaps, id, ...(def?.dependsOn ?? [])]);
			selectedCaps = capabilityDefs.filter((c) => withDeps.has(c.id)).map((c) => c.id);
		} else {
			// Cascade: unchecking a dependency also unchecks what depends on it.
			let next = selectedCaps.filter((c) => c !== id);
			let changed = true;
			while (changed) {
				changed = false;
				for (const capId of next) {
					const def = capabilityDefs.find((c) => c.id === capId);
					if (def?.dependsOn.some((dep) => !next.includes(dep))) {
						next = next.filter((c) => c !== capId);
						changed = true;
					}
				}
			}
			selectedCaps = next;
		}
	}

	function addCustomDistance() {
		customDistances = [
			...customDistances,
			{ key: 'custom', label: '', distance: 0, unit: 'km' as const }
		];
	}

	function removeCustomDistance(index: number) {
		customDistances = customDistances.filter((_, i) => i !== index);
	}
</script>

<svelte:head>
	<title>{data.scorekeeperView ? 'Scoring assignments' : 'Organizations'} — FliHub</title>
</svelte:head>

<section class="flex flex-col gap-8 py-4">
	<div class="flex flex-col gap-2">
		<h1 class="text-2xl font-semibold tracking-tight">
			{data.scorekeeperView ? 'Your scoring assignments' : 'Your organizations'}
		</h1>
		<p class="text-sm text-muted-foreground">
			Signed in as {data.user?.email}. You belong to {memberships.length}
			{memberships.length === 1 ? 'organization' : 'organizations'}.
		</p>
	</div>

	{#if message}
		<Alert.Root variant="destructive">
			<AlertCircle class="size-4" />
			<Alert.Title>Action failed</Alert.Title>
			<Alert.Description>{message}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if data.scorekeeperView}
		{#if data.assignments.length === 0}
			<Card.Root>
				<Card.Header>
					<Card.Title>No scoring assignments yet</Card.Title>
					<Card.Description>
						Your organizer will assign you to an event group. Your events and rounds will appear
						here afterward.
					</Card.Description>
				</Card.Header>
			</Card.Root>
		{/if}

		{#each data.assignments as assignment (assignment.id)}
			<Card.Root>
				<Card.Header>
					<Card.Title>{assignment.eventName}</Card.Title>
					<Card.Description>
						{assignment.organizationName} · {assignment.groupName}
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-2">
					{#each assignment.rounds as round (round.id)}
						<div class="rounded-md border p-3 text-sm">
							<p class="font-medium">
								Round {round.number}{round.name ? ` — ${round.name}` : ''}
							</p>
							<p class="text-muted-foreground">
								{round.course || 'Course awaiting setup'}
								{round.position ? ` · ${round.position}` : ''}
								<span class="block font-medium">{round.teeTime}</span>
							</p>
						</div>
					{/each}
					{#if assignment.rounds.length === 0}
						<p class="text-sm text-muted-foreground">Rounds are awaiting setup.</p>
					{/if}
				</Card.Content>
				<Card.Footer>
					<Button
						href={resolve('/(app)/organizations/[id]/events/[event]/score', {
							id: assignment.organizationId,
							event: assignment.eventId
						})}
					>
						Open scoring
					</Button>
				</Card.Footer>
			</Card.Root>
		{/each}

		<details class="rounded-md border p-3">
			<summary class="cursor-pointer text-sm font-medium">Your organizations</summary>
			<div class="mt-3 flex flex-wrap gap-2">
				{#each memberships as membership (membership.id)}
					<Button
						variant="outline"
						href={resolve('/(app)/organizations/[id]', { id: membership.organization.id })}
					>
						{membership.organization.name}
					</Button>
				{/each}
			</div>
		</details>
	{/if}

	{#if !data.scorekeeperView}
		<div class="grid gap-4 md:grid-cols-2">
			{#each memberships as membership (membership.id)}
				{@const isActive = membership.organization.id === data.activeOrgId}
				{@const canManage = membership.role === 'owner' || membership.role === 'admin'}
				<Card.Root class={isActive ? 'border-primary' : ''}>
					<Card.Header>
						<Card.Title class="flex items-center gap-2">
							<Building2 class="size-5" />
							{membership.organization.name}
						</Card.Title>
						<Card.Description class="flex flex-wrap items-center gap-2">
							<Badge variant="secondary">{roleLabel(membership.role)}</Badge>
							{#if isActive}
								<Badge>Active</Badge>
							{/if}
							{#if !membership.organization.onboarded}
								<Badge variant="outline">Setup pending</Badge>
							{/if}
						</Card.Description>
					</Card.Header>
					<Card.Footer class="flex flex-wrap gap-2">
						<Button href={resolve('/(app)/organizations/[id]', { id: membership.organization.id })}>
							Open
						</Button>
						{#if !membership.organization.onboarded && canManage}
							<Button
								variant="outline"
								href={resolve('/(app)/organizations/[id]/settings', {
									id: membership.organization.id
								})}
							>
								Complete setup
							</Button>
						{/if}
						{#if !isActive}
							<form method="POST" action="?/switch">
								<input type="hidden" name="organization" value={membership.organization.id} />
								<Button type="submit" variant="outline">Set active</Button>
							</form>
						{/if}
					</Card.Footer>
				</Card.Root>
			{/each}
		</div>

		{#if memberships.length === 0}
			<Alert.Root>
				<CircleCheck class="size-4" />
				<Alert.Title>No memberships yet</Alert.Title>
				<Alert.Description>
					Create an organization below, or open an invitation link while signed in to join an
					existing one.
				</Alert.Description>
			</Alert.Root>
		{/if}

		<!-- Onboarding: create an organization -->
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<Plus class="size-5" />
					Create an organization
				</Card.Title>
				<a
					href={resolve('/(app)/organizations/setup-preview')}
					class="inline-flex min-h-11 w-fit items-center rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-950 underline underline-offset-4 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
				>
					Try guided setup preview
				</a>
				<Card.Description>
					You become its Owner. Pick a starter template for suggested capabilities — you can adjust
					them here and later in organization settings. Capabilities marked Planned or Upcoming are
					not implemented software yet. Templates suggest a starting configuration; they do not
					select an activity or add a result method. Available scorekeeping, official results, and
					standings currently use golf rules. Timing, match scoring, judging, and animal, vehicle,
					or exhibit entries are planned.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form method="POST" action="?/create" class="flex flex-col gap-6">
					<div class="flex flex-col gap-2">
						<Label for="org-name">Organization name</Label>
						<Input
							id="org-name"
							name="name"
							type="text"
							minlength={2}
							maxlength={120}
							required
							bind:value={orgName}
							placeholder="e.g. Riverside Disc Golf Club"
						/>
					</div>

					<div class="flex flex-col gap-2">
						<span class="text-sm font-medium">Starter template</span>
						<div class="grid gap-2 sm:grid-cols-3">
							{#each templates as t (t.id)}
								<label
									class={`flex cursor-pointer flex-col gap-1 rounded-md border p-3 text-sm ${
										template === t.id ? 'border-primary bg-accent' : ''
									}`}
								>
									<span class="flex items-center gap-2 font-medium">
										<input
											type="radio"
											name="template"
											value={t.id}
											checked={template === t.id}
											onchange={() => chooseTemplate(t.id)}
										/>
										{t.label}
									</span>
									<span class="text-muted-foreground">{t.description}</span>
								</label>
							{/each}
						</div>
					</div>

					{#if activeTemplate}
						<div class="flex flex-col gap-2">
							<span class="text-sm font-medium">
								Capabilities
								<span class="font-normal text-muted-foreground">
									(suggested by the {activeTemplate.label} template; adjust freely)
								</span>
							</span>
							<div class="grid gap-2 sm:grid-cols-2">
								{#each capabilityDefs as capability (capability.id)}
									{@const meta = availabilityMeta[capability.availability]}
									<label class="flex items-start gap-2 rounded-md border p-2.5 text-sm">
										<input
											type="checkbox"
											name="capability"
											value={capability.id}
											checked={selectedCaps.includes(capability.id)}
											onchange={(e) => toggleCapability(capability.id, e.currentTarget.checked)}
											class="mt-0.5"
										/>
										<span class="flex min-w-0 flex-col">
											<span class="flex flex-wrap items-center gap-2 font-medium">
												{capability.label}
												<Badge variant="secondary" class={meta.badgeClass}>{meta.label}</Badge>
											</span>
											<span class="text-muted-foreground">{capability.description}</span>
										</span>
									</label>
								{/each}
							</div>
							{#if depHints.length > 0}
								<p class="text-sm text-muted-foreground">
									Also required by your selection: {depHints.join(', ')} (added automatically).
								</p>
							{/if}
						</div>

						{#if template === 'race-event'}
							<div class="flex flex-col gap-2">
								<span class="text-sm font-medium">Race distances</span>
								<p class="text-sm text-muted-foreground">
									Distances are configuration only. Race timing and race results are not
									implemented.
								</p>
								{#each presetList as preset (preset.key)}
									<label class="flex items-center gap-2 text-sm">
										<input
											type="checkbox"
											checked={presetDistances.includes(preset.key)}
											onchange={(e) => {
												presetDistances = e.currentTarget.checked
													? [...presetDistances, preset.key]
													: presetDistances.filter((k) => k !== preset.key);
											}}
										/>
										{preset.label} — {preset.distance}
										{preset.unit}
									</label>
								{/each}
								{#each customDistances as custom, i (i)}
									<div class="flex flex-wrap items-center gap-2">
										<Input
											placeholder="Label (e.g. 10K)"
											value={custom.label}
											oninput={(e) => {
												customDistances[i].label = e.currentTarget.value;
											}}
											class="w-40"
										/>
										<Input
											type="number"
											placeholder="Distance"
											min="0.01"
											step="any"
											value={custom.distance || ''}
											oninput={(e) => {
												customDistances[i].distance = Number(e.currentTarget.value);
											}}
											class="w-28"
										/>
										<select
											class="rounded-md border bg-background px-2 py-1.5 text-sm"
											value={custom.unit}
											onchange={(e) => {
												customDistances[i].unit = e.currentTarget.value === 'mi' ? 'mi' : 'km';
											}}
										>
											<option value="km">km</option>
											<option value="mi">mi</option>
										</select>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onclick={() => removeCustomDistance(i)}
										>
											Remove
										</Button>
									</div>
								{/each}
								<div>
									<Button type="button" variant="outline" size="sm" onclick={addCustomDistance}>
										Add custom distance
									</Button>
								</div>
							</div>
						{/if}

						<!-- Summary before completion -->
						<div class="rounded-md border bg-muted/40 p-3 text-sm">
							<span class="font-medium">Summary:</span>
							{orgName.trim() || 'Unnamed organization'} — {activeTemplate.label} template,
							{selectedCaps.length}
							{selectedCaps.length === 1 ? 'capability' : 'capabilities'} selected
							{#if template === 'race-event'}
								, {presetDistances.length +
									customDistances.filter((d) => d.label.trim() && d.distance > 0).length}
								distance(s) configured
							{/if}
							.
						</div>
						<input type="hidden" name="raceDistances" value={distancesJson} />
					{/if}

					<Button type="submit" class="w-full sm:w-fit">Create organization</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}
</section>
