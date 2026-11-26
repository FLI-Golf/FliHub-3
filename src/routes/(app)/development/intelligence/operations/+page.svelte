<script lang="ts">
	import { resolve } from '$app/paths';
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
		ChevronDown
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const tabs = [
		{ label: 'Workspace', icon: ClipboardCheck },
		{ label: 'Operations', icon: ListChecks },
		{ label: 'History', icon: History },
		{ label: 'Capabilities', icon: Layers },
		{ label: 'Usage', icon: BarChart3 }
	] as const;

	let activeTab = $state<(typeof tabs)[number]['label']>('Workspace');

	const restrictions = [
		{ label: 'External provider access', value: 'Disabled', icon: WifiOff },
		{ label: 'Persistent mutations', value: 'Disabled', icon: Database },
		{ label: 'Operation execution', value: 'Disabled', icon: Lock },
		{ label: 'Data source', value: 'Synthetic only', icon: ShieldCheck },
		{ label: 'Paid provider cost', value: '$0.00', icon: Wallet }
	];
</script>

<svelte:head>
	<title>Controlled Intelligence Workspace | FliHub</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-5">
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
			<h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight">
				<BrainCircuit size={26} aria-hidden="true" />
				Jev Application Intelligence
			</h1>
			<p class="text-sm text-muted-foreground">Protected controlled operations workspace.</p>
		</div>
		<Badge variant="secondary">Offline mock</Badge>
	</header>

	<section class="space-y-4 rounded-lg border bg-card p-4">
		<nav aria-label="Controlled intelligence workspace" class="flex flex-wrap gap-2 border-b pb-3">
			{#each tabs as tab (tab.label)}
				{@const TabIcon = tab.icon}
				<Button
					type="button"
					size="sm"
					variant={activeTab === tab.label ? 'default' : 'outline'}
					aria-pressed={activeTab === tab.label}
					onclick={() => (activeTab = tab.label)}
				>
					<TabIcon size={16} aria-hidden="true" />
					{tab.label}
				</Button>
			{/each}
		</nav>

		{#if form?.message}
			<p role="status" class="rounded-md border p-3 text-sm">{form.message}</p>
		{/if}

		{#if activeTab === 'Workspace'}
			<div class="space-y-4 rounded-md border p-4">
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
						<Button type="submit" variant="outline">
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
		{:else if activeTab === 'Usage'}
			<div class="grid grid-cols-2 gap-3">
				{#each [{ label: 'Paid provider cost', value: '$0.00' }, { label: 'External requests', value: '0' }, { label: 'Operations executed', value: '0' }, { label: 'Your current session', value: data.session ? '1' : '0' }] as metric (metric.label)}
					<div class="space-y-2 rounded-md border p-3">
						<p class="text-xs text-muted-foreground">{metric.label}</p>
						<p class="text-2xl font-bold tabular-nums">{metric.value}</p>
					</div>
				{/each}
			</div>
			<p class="text-xs text-muted-foreground">
				Initial workspace restrictions, not provider billing or global server statistics.
			</p>
		{:else if activeTab === 'Capabilities'}
			<div class="overflow-hidden rounded-md border">
				{#each ['Prepare an event', 'Assess event readiness', 'Create synthetic group assignments'] as capability, index (capability)}
					<div
						class="flex items-center justify-between gap-2 p-3 text-sm {index % 2 === 0
							? 'bg-muted/40'
							: ''}"
					>
						<span class="font-semibold">{capability}</span>
						<Badge variant="outline">Not enabled</Badge>
					</div>
				{/each}
			</div>
		{:else}
			<div class="flex flex-col items-center gap-3 rounded-md border border-dashed p-8 text-center">
				<Lock size={32} aria-hidden="true" class="text-muted-foreground" />
				<h2 class="font-semibold">
					{activeTab === 'Operations' ? 'Operation execution disabled' : 'History not enabled'}
				</h2>
				<p class="text-sm text-muted-foreground">
					This capability will be introduced in a subsequent implementation phase.
				</p>
			</div>
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
