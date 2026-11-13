<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { AlertCircle, CircleCheck, Settings } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import OrgNav from '$lib/components/OrgNav.svelte';
	import { availabilityMeta, type RaceDistance, type TemplateId } from '$lib/capabilities/catalog';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const capabilityDefs = $derived(data.catalog.capabilities);
	const templateList = $derived(data.catalog.templates);

	// Editable form state; initial values intentionally captured once from server data.
	let orgName = $state(untrack(() => data.organization.name));
	let template = $state<TemplateId | ''>(untrack(() => data.organization.template));
	let selectedCaps = $state<string[]>(untrack(() => [...data.organization.capabilities]));
	let distances = $state<RaceDistance[]>(untrack(() => [...data.organization.raceDistances]));

	const activeTemplate = $derived(templateList.find((t) => t.id === template) ?? null);
	const presetKeys = $derived(activeTemplate?.defaultRaceDistances?.map((d) => d.key) ?? []);
	const distancesJson = $derived(
		JSON.stringify(distances.filter((d) => d.label.trim() && d.distance > 0))
	);

	function chooseTemplate(id: TemplateId) {
		template = id;
		// Apply suggested defaults as a starting point; still editable.
		const t = templateList.find((x) => x.id === id);
		selectedCaps = [...(t?.defaultCapabilities ?? [])];
		if (id === 'race-event' && distances.length === 0) {
			distances = [...(t?.defaultRaceDistances ?? [])];
		}
	}

	function toggleCapability(id: string, checked: boolean) {
		if (checked) {
			const def = capabilityDefs.find((c) => c.id === id);
			const withDeps = new Set([...selectedCaps, id, ...(def?.dependsOn ?? [])]);
			selectedCaps = capabilityDefs.filter((c) => withDeps.has(c.id)).map((c) => c.id);
		} else {
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
		distances = [...distances, { key: 'custom', label: '', distance: 0, unit: 'km' as const }];
	}

	function removeCustomDistance(index: number) {
		distances = distances.filter((_, i) => i !== index);
	}

	const enabledCaps = $derived(
		capabilityDefs.filter((c) => data.organization.capabilities.includes(c.id))
	);
</script>

<svelte:head>
	<title>{data.organization.name} settings — FliHub</title>
</svelte:head>

<section class="flex flex-col gap-6 py-4">
	<div class="flex flex-col gap-2">
		<Button variant="ghost" size="sm" href={resolve('/(app)/organizations')} class="w-fit">
			All organizations
		</Button>
		<h1 class="flex items-center gap-2 text-2xl font-semibold tracking-tight">
			<Settings class="size-6" />
			{data.organization.name} — settings
		</h1>
		<OrgNav
			orgId={data.organization.id}
			enabledCapabilities={enabledCaps}
			canManage={data.canManage}
			current="settings"
		/>
	</div>

	{#if !data.organization.onboarded}
		<Alert.Root>
			<CircleCheck class="size-4" />
			<Alert.Title>Setup pending</Alert.Title>
			<Alert.Description>
				This organization was created before onboarding existed. Review the template and
				capabilities below and save to complete setup — nothing changes until you do. All existing
				memberships and records are preserved.
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if form?.message}
		<Alert.Root variant="destructive">
			<AlertCircle class="size-4" />
			<Alert.Title>Save failed</Alert.Title>
			<Alert.Description>{form.message}</Alert.Description>
		</Alert.Root>
	{/if}
	{#if form?.saved}
		<Alert.Root>
			<CircleCheck class="size-4" />
			<Alert.Title>Settings saved</Alert.Title>
			<Alert.Description
				>Organization configuration updated and recorded in the audit trail.</Alert.Description
			>
		</Alert.Root>
	{/if}

	{#if !data.canManage}
		<Alert.Root>
			<AlertCircle class="size-4" />
			<Alert.Title>Read-only for your role</Alert.Title>
			<Alert.Description>
				Only Owners and Admins can change organization configuration. Your role:
				{data.myRole}.
			</Alert.Description>
		</Alert.Root>
	{/if}

	<form method="POST" action="?/configure" class="flex flex-col gap-6">
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">General</Card.Title>
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				<div class="flex max-w-md flex-col gap-2">
					<Label for="settings-name">Organization name</Label>
					<Input
						id="settings-name"
						name="name"
						type="text"
						minlength={2}
						maxlength={120}
						required
						bind:value={orgName}
						disabled={!data.canManage}
					/>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Starter template</Card.Title>
				<Card.Description>
					Templates suggest capability defaults; switching template re-applies its suggestions,
					which you can still adjust before saving. Templates do not select an activity or add a
					result method. Available scorekeeping, official results, and standings currently use golf
					rules. Timing, match scoring, judging, and animal, vehicle, or exhibit entries are
					planned.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="grid gap-2 sm:grid-cols-3">
					{#each templateList as t (t.id)}
						<label
							class={`flex flex-col gap-1 rounded-md border p-3 text-sm ${
								template === t.id ? 'border-primary bg-accent' : ''
							} ${data.canManage ? 'cursor-pointer' : 'opacity-70'}`}
						>
							<span class="flex items-center gap-2 font-medium">
								<input
									type="radio"
									name="template"
									value={t.id}
									checked={template === t.id}
									disabled={!data.canManage}
									onchange={() => chooseTemplate(t.id)}
								/>
								{t.label}
							</span>
							<span class="text-muted-foreground">{t.description}</span>
						</label>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Capabilities</Card.Title>
				<Card.Description>
					Disabling a capability hides its workflows in navigation — its records and configuration
					are never deleted, and re-enabling restores them. Capabilities never grant permissions
					beyond a member's role, and Planned/Upcoming capabilities are not implemented software.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="grid gap-2 sm:grid-cols-2">
					{#each capabilityDefs as capability (capability.id)}
						{@const meta = availabilityMeta[capability.availability]}
						<label
							class="flex items-start gap-2 rounded-md border p-2.5 text-sm {data.canManage
								? ''
								: 'opacity-70'}"
						>
							<input
								type="checkbox"
								name="capability"
								value={capability.id}
								checked={selectedCaps.includes(capability.id)}
								disabled={!data.canManage}
								onchange={(e) => toggleCapability(capability.id, e.currentTarget.checked)}
								class="mt-0.5"
							/>
							<span class="flex min-w-0 flex-col">
								<span class="flex flex-wrap items-center gap-2 font-medium">
									{capability.label}
									<Badge variant="secondary" class={meta.badgeClass}>{meta.label}</Badge>
								</span>
								<span class="text-muted-foreground">{capability.description}</span>
								<span class="text-xs text-muted-foreground">{capability.milestone}</span>
							</span>
						</label>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>

		{#if template === 'race-event'}
			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">Race distances</Card.Title>
					<Card.Description>
						Distance options for race configuration (kilometers or miles). This is configuration
						only — scoring and timing rules are separate, later milestones.
					</Card.Description>
				</Card.Header>
				<Card.Content class="flex flex-col gap-2">
					{#each distances as distance, i (i)}
						<div class="flex flex-wrap items-center gap-2">
							<Input
								placeholder="Label (e.g. 10K)"
								value={distance.label}
								disabled={!data.canManage || presetKeys.includes(distance.key)}
								oninput={(e) => {
									distances[i].label = e.currentTarget.value;
								}}
								class="w-40"
							/>
							<Input
								type="number"
								placeholder="Distance"
								min="0.01"
								step="any"
								value={distance.distance || ''}
								disabled={!data.canManage || presetKeys.includes(distance.key)}
								oninput={(e) => {
									distances[i].distance = Number(e.currentTarget.value);
								}}
								class="w-28"
							/>
							<select
								class="rounded-md border bg-background px-2 py-1.5 text-sm"
								value={distance.unit}
								disabled={!data.canManage}
								onchange={(e) => {
									distances[i].unit = e.currentTarget.value === 'mi' ? 'mi' : 'km';
								}}
							>
								<option value="km">km</option>
								<option value="mi">mi</option>
							</select>
							{#if data.canManage}
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onclick={() => removeCustomDistance(i)}
								>
									Remove
								</Button>
							{/if}
						</div>
					{/each}
					{#if data.canManage}
						<div>
							<Button type="button" variant="outline" size="sm" onclick={addCustomDistance}>
								Add distance
							</Button>
						</div>
					{/if}
				</Card.Content>
			</Card.Root>
		{/if}
		<input
			type="hidden"
			name="raceDistances"
			value={template === 'race-event' ? distancesJson : '[]'}
		/>

		{#if data.canManage}
			<div>
				<Button type="submit">
					{data.organization.onboarded ? 'Save settings' : 'Complete setup'}
				</Button>
			</div>
		{/if}
	</form>
</section>
