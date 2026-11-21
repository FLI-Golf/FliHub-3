<script lang="ts">
	import { CalendarDays, ClipboardCheck, Target } from 'lucide-svelte';
	import type { Sponsor, SponsorshipAgreement } from '$lib/sponsorships/model';
	import { parseFundingTarget, previewFundingThreshold } from '$lib/sponsorships/funding-threshold';

	let { sponsors, agreements }: { sponsors: Sponsor[]; agreements: SponsorshipAgreement[] } = $props();
	let target = $state('');
	let percentage = $state<number | undefined>(50);
	let currency = $state('USD');
	let deadline = $state('');
	let asOf = $state('');
	let selected = $state<string[]>([]);
	const field = 'rounded border bg-background p-2';
	const amber = 'border-amber-400 bg-amber-50 ring-2 ring-amber-200 dark:bg-amber-950 dark:ring-amber-800';
	const targetCents = $derived(parseFundingTarget(target));
	const percentValid = $derived(percentage !== undefined && Number.isInteger(percentage) && percentage >= 1 && percentage <= 100);
	const cutoff = $derived(asOf && deadline ? (asOf < deadline ? asOf : deadline) : '');
	const eligible = $derived(agreements.filter((agreement) =>
		agreement.currency === currency && Boolean(agreement.signedOn) && (!cutoff || agreement.signedOn <= cutoff)
	));
	const names = $derived(new Map(sponsors.map((sponsor) => [sponsor.id, sponsor.name])));
	const preview = $derived(targetCents && percentValid && percentage !== undefined && deadline && asOf
		? previewFundingThreshold({ targetCents, percentage, currency, deadline, asOf, selectedIds: selected, agreements })
		: null);
	const money = (cents: number) =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
</script>

<details class="rounded-lg border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-800 dark:bg-blue-950/35">
	<summary class="cursor-pointer font-semibold">
		<Target class="mr-1 inline-block size-5 text-blue-700 dark:text-blue-300" aria-hidden="true" />
		Preview a funding threshold
	</summary>
	<p class="my-3 text-sm">Choose which signed commitments count and preview the funding condition. This preview does not change agreement terms or release installments.</p>
	<div class="grid gap-3 text-sm sm:grid-cols-2">
		<label class="grid gap-1">Sponsorship funding target
			<input inputmode="decimal" bind:value={target} placeholder="250,000.00" class={field + (targetCents ? '' : ' ' + amber)} />
		</label>
		<label class="grid gap-1">Currency
			<select bind:value={currency} class="rounded border border-blue-400 bg-blue-50 p-2 text-blue-950">
				{#each ['USD', 'CAD', 'EUR', 'GBP'] as code (code)}<option value={code}>{code}</option>{/each}
			</select>
		</label>
		<label class="grid gap-1">Threshold (%)
			<input type="number" min="1" max="100" step="1" bind:value={percentage} class={field + (percentValid ? '' : ' ' + amber)} />
		</label>
		<label class="grid gap-1">
			<span><CalendarDays class="inline-block size-4" aria-hidden="true" /> Funding deadline</span>
			<input type="date" bind:value={deadline} class={field + (deadline ? '' : ' ' + amber)} />
		</label>
		<label class="grid gap-1">
			<span><CalendarDays class="inline-block size-4" aria-hidden="true" /> Evaluate as of</span>
			<input type="date" bind:value={asOf} class={field + (asOf ? '' : ' ' + amber)} />
		</label>
	</div>
	<fieldset class="mt-4">
		<legend class="mb-2 text-sm font-semibold">
			<ClipboardCheck class="inline-block size-4" aria-hidden="true" /> Qualifying signed agreements
		</legend>
		{#if eligible.length}
			<div class="overflow-hidden rounded border">
				{#each eligible as agreement (agreement.id)}
					<label class="flex flex-wrap items-center gap-2 p-2 text-sm odd:bg-background even:bg-muted">
						<input type="checkbox" value={agreement.id} bind:group={selected} />
						<span>{names.get(agreement.sponsor) ?? 'Sponsor'} · {agreement.title} · Signed {agreement.signedOn}</span>
						<strong class="ml-auto tabular-nums">{money(agreement.amountCents)}</strong>
					</label>
				{/each}
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">No signed agreements match the currency and dates.</p>
		{/if}
	</fieldset>
	{#if preview}
		<div class="mt-4 rounded-lg border bg-card p-3 text-sm" aria-live="polite">
			<p class="font-semibold">Funding condition · {preview.status}</p>
			<dl class="mt-2 grid gap-2 sm:grid-cols-3">
				<div><dt>Threshold amount</dt><dd>{money(preview.requiredCents)} {currency}</dd></div>
				<div><dt>Qualifying commitments</dt><dd>{money(preview.committedCents)} {currency}</dd></div>
				<div><dt>Remaining to threshold</dt><dd>{money(preview.remainingCents)} {currency}</dd></div>
			</dl>
		</div>
	{/if}
</details>
