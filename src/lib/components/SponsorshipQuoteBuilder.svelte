<script lang="ts">
	import {
		Calculator,
		Crown,
		Disc3,
		FileText,
		Globe,
		Lock,
		Pencil,
		Shirt,
		Target
	} from 'lucide-svelte';
	import SponsorshipQuoteConversion from '$lib/components/SponsorshipQuoteConversion.svelte';
	import { tick } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { Sponsor, SponsorshipAgreement, SponsorshipQuote } from '$lib/sponsorships/model';
	import packages from '../../../pocketbase/pb_hooks/title_sponsor_pilot.json';

	let {
		sponsor,
		quotes,
		agreements,
		targets,
		form
	}: {
		sponsor: Sponsor;
		quotes: SponsorshipQuote[];
		agreements: SponsorshipAgreement[];
		targets: { value: string; label: string }[];
		form: unknown;
	} = $props();
	const feedback = $derived(
		form as {
			conversionQuote?: string;
			conversionError?: string;
			conversionMessage?: string;
			quoteSponsor?: string;
			quoteError?: string;
			quoteMessage?: string;
			quoteSelected?: string[];
			quotePackage?: string;
			quoteId?: string;
		} | null
	);
	const result = $derived(feedback?.quoteSponsor === sponsor.id ? feedback : null);
	const packageIcons = {
		'title-pilot': Crown,
		basket: Target,
		disc: Disc3,
		'us-apparel': Shirt,
		'international-apparel': Globe
	};
	const optionalBenefits = (pkg: (typeof packages)[number]) =>
		pkg.benefits.filter((benefit) => !benefit.required).map((benefit) => benefit.id);
	let quoteOpen = $state(false);
	let editingId = $state('');
	let packageSelect = $state<HTMLSelectElement>();
	let packageName = $state('');
	let selected = $state<string[]>([]);
	const current = $derived(packages.find((pkg) => pkg.name === packageName) ?? packages[0]);
	const Icon = $derived(packageIcons[current.id as keyof typeof packageIcons]);
	$effect(() => {
		if (result?.quoteError) quoteOpen = true;
		if (result?.quotePackage && result.quoteSelected) {
			editingId = result.quoteId ?? '';
			packageName = result.quotePackage;
			selected = result.quoteSelected;
		}
	});
	async function editDraft(quote: SponsorshipQuote) {
		editingId = quote.id;
		packageName = quote.packageName;
		selected = quote.benefits.filter((benefit) => !benefit.required).map((benefit) => benefit.id);
		quoteOpen = true;
		await tick();
		packageSelect?.focus();
	}
	function cancelEdit() {
		editingId = '';
		packageName = '';
		selected = [];
	}
	function choosePackage(event: Event) {
		const name = (event.currentTarget as HTMLSelectElement).value;
		const pkg = packages.find((item) => item.name === name);
		if (pkg) {
			packageName = pkg.name;
			selected = optionalBenefits(pkg);
		}
	}
	const total = $derived(
		current.benefits.reduce(
			(sum, benefit) =>
				sum + (benefit.required || selected.includes(benefit.id) ? benefit.amountCents : 0),
			0
		)
	);
	const money = (cents: number, currency: string) =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
</script>

{#if quotes.length}
	<div
		class="grid gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-800 dark:bg-indigo-950/40"
	>
		<h4 class="flex items-center gap-2 text-sm font-semibold">
			<FileText class="size-4" aria-hidden="true" />Sponsorship quotes
		</h4>
		{#each quotes as quote (quote.id)}
			{@const agreement = agreements.find((item) => item.quote === quote.id)}
			<details
				open={feedback?.conversionQuote === quote.id &&
					Boolean(feedback?.conversionError || feedback?.conversionMessage)}
				class="rounded-lg border p-3 text-sm odd:bg-white even:bg-indigo-100 dark:odd:bg-slate-900 dark:even:bg-indigo-950"
			>
				<summary class="cursor-pointer"
					>{quote.packageName} · {money(quote.amountCents, quote.currency)}
					{quote.currency}</summary
				>
				<ul class="mt-2 overflow-hidden rounded-md border border-indigo-200 dark:border-indigo-800">
					{#each quote.benefits as benefit (benefit.id)}
						<li
							class="px-3 py-2 odd:bg-indigo-50 even:bg-white dark:odd:bg-indigo-950 dark:even:bg-slate-900"
						>
							{benefit.name} · {money(benefit.amountCents, quote.currency)}
						</li>
					{/each}
				</ul>
				{#if agreement}
					<a
						href={'#sponsorship-agreement-' + agreement.id}
						class="mt-2 inline-block font-medium text-blue-700 underline dark:text-blue-300"
						>Converted · View agreement</a
					>
					{#if feedback?.conversionQuote === quote.id && feedback.conversionMessage}
						<p role="status" class="mt-2 text-emerald-700 dark:text-emerald-300">
							{feedback.conversionMessage}
						</p>
					{/if}
				{:else if !sponsor.archived}
					<SponsorshipQuoteConversion {sponsor} {quote} {targets} {form} />
					<Button
						type="button"
						size="sm"
						variant="outline"
						class="mt-2 border-blue-400 bg-blue-50 text-blue-950"
						onclick={() => editDraft(quote)}
					>
						<Pencil class="size-4" aria-hidden="true" /> Edit draft
					</Button>
				{/if}
			</details>
		{/each}
	</div>
{/if}
{#if result?.quoteMessage}<p
		role="status"
		class="rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
	>
		{result.quoteMessage}
	</p>{/if}
{#if !sponsor.archived}
	<details
		bind:open={quoteOpen}
		class="rounded-lg border border-blue-200 bg-white p-3 dark:border-blue-800 dark:bg-slate-900"
	>
		<summary class="cursor-pointer text-sm font-semibold"
			><FileText class="mr-1 inline-block size-4" aria-hidden="true" />{editingId
				? 'Edit sponsorship quote'
				: 'Build a sponsorship quote'}</summary
		>
		<form method="POST" action="?/saveSponsor" class="mt-3 grid gap-3 text-sm">
			<input type="hidden" name="intent" value="quote" />
			<input type="hidden" name="quote" value={editingId} />
			<input type="hidden" name="sponsor" value={sponsor.id} />
			<label class="grid gap-1 font-medium">
				<span class="flex items-center gap-2"
					><Icon class="size-4" aria-hidden="true" />Sponsorship package</span
				>
				<select
					bind:this={packageSelect}
					name="package"
					value={packageName}
					onchange={choosePackage}
					required
					class={packageName
						? 'rounded border border-blue-400 bg-blue-50 p-2 text-blue-950'
						: 'rounded border-2 border-amber-400 bg-amber-50 p-2 text-amber-950 ring-2 ring-amber-200'}
				>
					<option value="" disabled>Choose a sponsorship package</option>
					<optgroup label="Title Sponsor">
						<option value={packages[0].name}>{packages[0].name}</option>
					</optgroup>
					<optgroup label="Tier 2 · Brand partnerships">
						{#each packages.filter((pkg) => pkg.tier === 'Tier 2') as pkg (pkg.id)}
							<option value={pkg.name}>{pkg.name}</option>
						{/each}
					</optgroup>
					<optgroup label="Tier 3 · Tournament partnerships">
						{#each packages.filter((pkg) => pkg.tier === 'Tier 3') as pkg (pkg.id)}
							<option value={pkg.name}>{pkg.name}</option>
						{/each}
					</optgroup>
					<optgroup label="Tier 4 · Team partnerships">
						{#each packages.filter((pkg) => pkg.tier === 'Tier 4') as pkg (pkg.id)}
							<option value={pkg.name}>{pkg.name}</option>
						{/each}
					</optgroup>
					<optgroup label="Tier 5 · Hole partnerships">
						{#each packages.filter((pkg) => pkg.tier === 'Tier 5') as pkg (pkg.id)}
							<option value={pkg.name}>{pkg.name}</option>
						{/each}
					</optgroup>
					<optgroup label="Tier 6 · Community supporters">
						{#each packages.filter((pkg) => pkg.tier === 'Tier 6') as pkg (pkg.id)}
							<option value={pkg.name}>{pkg.name}</option>
						{/each}
					</optgroup>
				</select>
			</label>
			{#if packageName}
				<fieldset>
					<legend class="mb-2 flex items-center gap-2 font-semibold"
						><Icon class="size-4" aria-hidden="true" />{current.name} · illustrative pricing</legend
					>
					{#key current.id}
						<div class="overflow-hidden rounded border">
							{#each current.benefits as benefit (benefit.id)}
								<label
									class="flex flex-wrap items-center gap-2 p-3 odd:bg-blue-50 even:bg-white dark:odd:bg-blue-950 dark:even:bg-slate-900"
								>
									{#if benefit.required}
										<input type="checkbox" checked disabled />
									{:else}
										<input
											type="checkbox"
											name="benefit"
											value={benefit.id}
											bind:group={selected}
										/>
									{/if}
									<span>{benefit.name}</span>
									{#if benefit.required}
										<span class="inline-flex items-center gap-1 text-xs text-muted-foreground"
											><Lock class="size-3" aria-hidden="true" />Required</span
										>
									{/if}
									<span class="ml-auto tabular-nums"
										>{money(benefit.amountCents, current.currency)}</span
									>
								</label>
							{/each}
						</div>
					{/key}
				</fieldset>
				<p aria-live="polite" class="flex items-center gap-2 font-semibold">
					<Calculator class="size-4" aria-hidden="true" />Quote total {money(
						total,
						current.currency
					)}
					{current.currency}
				</p>
			{/if}
			{#if result?.quoteError}<p role="alert" class="text-destructive">{result.quoteError}</p>{/if}
			<div>
				<Button
					type="submit"
					disabled={!packageName}
					class="bg-green-700 text-white hover:bg-green-800"
					>{editingId ? 'Save draft changes' : 'Save draft quote'}</Button
				>
				{#if editingId}<Button type="button" variant="ghost" onclick={cancelEdit}
						>Cancel edit</Button
					>{/if}
			</div>
		</form>
	</details>
{/if}
