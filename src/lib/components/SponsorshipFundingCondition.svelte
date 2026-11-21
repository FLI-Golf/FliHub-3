<script lang="ts">
	import { CalendarDays, ClipboardCheck, Save, Target } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { Sponsor, SponsorshipAgreement } from '$lib/sponsorships/model';
	import {
		parseFundingTarget,
		previewFundingThreshold,
		type SponsorshipFundingCondition
	} from '$lib/sponsorships/funding-threshold';

	let { sponsor, agreement, sponsors, agreements, condition, asOf, form }: {
		sponsor: Sponsor;
		agreement: SponsorshipAgreement;
		sponsors: Sponsor[];
		agreements: SponsorshipAgreement[];
		condition?: SponsorshipFundingCondition;
		asOf: string;
		form: unknown;
	} = $props();

	const result = $derived(form as {
		conditionAgreement?: string;
		conditionError?: string;
		conditionValues?: { target: string; percentage: string; currency: string; deadline: string; selectedIds: string[] };
	} | null);
	const ownResult = $derived(result?.conditionAgreement === agreement.id ? result : null);
	const values = $derived(ownResult?.conditionValues);
	const initiallyOpen = () => Boolean(ownResult?.conditionError);
	let conditionOpen = $state(initiallyOpen());
	const initialTerms = () => ({
		target: values?.target ?? (condition ? (condition.targetCents / 100).toFixed(2) : ''),
		percentage: values ? Number(values.percentage) : condition?.percentage ?? 50,
		currency: values?.currency ?? condition?.currency ?? agreement.currency,
		deadline: values?.deadline ?? condition?.deadline ?? '',
		selected: [...(values?.selectedIds ?? condition?.selectedIds ?? [])]
	});
	const terms = $state<{ target: string; percentage: number | undefined; currency: string; deadline: string; selected: string[] }>(initialTerms());
	const field = 'rounded border bg-background p-2';
	const amber = 'border-amber-400 bg-amber-50 ring-2 ring-amber-200 dark:bg-amber-950 dark:ring-amber-800';
	const targetCents = $derived(parseFundingTarget(terms.target));
	const percentValid = $derived(terms.percentage !== undefined && Number.isInteger(terms.percentage) &&
		terms.percentage >= 1 && terms.percentage <= 100);
	const cutoff = $derived(terms.deadline && terms.deadline < asOf ? terms.deadline : asOf);
	const eligible = $derived(agreements.filter((row) =>
		row.currency === terms.currency && Boolean(row.signedOn) && row.signedOn <= cutoff
	));
	const eligibleSelected = $derived(eligible.filter((row) => terms.selected.includes(row.id)));
	const names = $derived(new Map(sponsors.map((row) => [row.id, row.name])));
	const byId = $derived(new Map(agreements.map((row) => [row.id, row])));
	const savedStatus = $derived(condition ? previewFundingThreshold({ ...condition, asOf, agreements }) : null);
	const preview = $derived(targetCents && percentValid && terms.percentage !== undefined && terms.deadline
		? previewFundingThreshold({
			targetCents, percentage: terms.percentage, currency: terms.currency, deadline: terms.deadline,
			asOf, selectedIds: terms.selected, agreements
		})
		: null);

	function money(cents: number, currency: string) {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100) + ' ' + currency;
	}
</script>

<section aria-label="Funding condition" class="mt-3 space-y-2 rounded-lg border border-blue-200 p-3 dark:border-blue-800">
	{#if condition && savedStatus}
		<div aria-label="Saved funding condition" role="group" class="space-y-2">
			<p class="font-semibold">
				<Target class="inline-block size-4 text-blue-700 dark:text-blue-300" aria-hidden="true" />
				Funding condition · {savedStatus.status}
			</p>
			<dl class="grid gap-2 sm:grid-cols-3">
				<div><dt>Funding target</dt><dd>{money(condition.targetCents, condition.currency)}</dd></div>
				<div><dt>Threshold ({condition.percentage}%)</dt><dd>{money(savedStatus.requiredCents, condition.currency)}</dd></div>
				<div><dt>Funding deadline</dt><dd><time datetime={condition.deadline}>{condition.deadline}</time></dd></div>
				<div><dt>Qualifying commitments</dt><dd>{money(savedStatus.committedCents, condition.currency)}</dd></div>
				<div><dt>Remaining to threshold</dt><dd>{money(savedStatus.remainingCents, condition.currency)}</dd></div>
				<div><dt>Evaluated as of (UTC)</dt><dd><time datetime={asOf}>{asOf}</time></dd></div>
			</dl>
			<ul aria-label="Selected signed agreements" class="overflow-hidden rounded border">
				{#each condition.selectedIds as id (id)}
					{@const row = byId.get(id)}
					<li class="p-2 odd:bg-background even:bg-muted">
						{#if row}
							<a href={'#sponsorship-agreement-' + id} class="text-blue-700 underline dark:text-blue-300">{names.get(row.sponsor) ?? 'Sponsor'} · {row.title}</a>
						{:else}
							Agreement no longer available
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if !condition?.releasedAt}
	<details bind:open={conditionOpen}>
		<summary class="cursor-pointer font-semibold text-blue-700 dark:text-blue-300">
			<Target class="mr-1 inline-block size-4" aria-hidden="true" />
			{condition ? 'Edit funding condition' : 'Set funding condition'}
		</summary>
		<form method="POST" action="?/saveSponsor" class="mt-3 space-y-3">
			<input type="hidden" name="intent" value="funding-condition" />
			<input type="hidden" name="sponsor" value={sponsor.id} />
			<input type="hidden" name="agreement" value={agreement.id} />
			{#if ownResult?.conditionError}<p role="alert" class="text-destructive">{ownResult.conditionError}</p>{/if}
			<div class="grid gap-3 sm:grid-cols-2">
				<label class="grid gap-1">Sponsorship funding target
					<input name="target" required inputmode="decimal" bind:value={terms.target} placeholder="250,000.00" class={field + (targetCents ? '' : ' ' + amber)} />
				</label>
				<label class="grid gap-1">Currency
					<select name="currency" bind:value={terms.currency} class="rounded border border-blue-400 bg-blue-50 p-2 text-blue-950">
						{#each ['USD', 'CAD', 'EUR', 'GBP'] as code (code)}<option value={code}>{code}</option>{/each}
					</select>
				</label>
				<label class="grid gap-1">Threshold (%)
					<input name="percentage" required type="number" min="1" max="100" step="1" bind:value={terms.percentage} class={field + (percentValid ? '' : ' ' + amber)} />
				</label>
				<label class="grid gap-1">
					<span><CalendarDays class="inline-block size-4" aria-hidden="true" /> Funding deadline</span>
					<input name="deadline" required type="date" bind:value={terms.deadline} class={field + (terms.deadline ? '' : ' ' + amber)} />
				</label>
			</div>
			<fieldset>
				<legend class="mb-2 font-semibold">
					<ClipboardCheck class="inline-block size-4" aria-hidden="true" /> Qualifying signed agreements
				</legend>
				{#if eligible.length}
					<div class="overflow-hidden rounded border">
						{#each eligible as row (row.id)}
							<label class="flex flex-wrap items-center gap-2 p-2 odd:bg-background even:bg-muted">
								<input type="checkbox" name="selectedIds" value={row.id} bind:group={terms.selected} class="accent-blue-700" />
								<span>{names.get(row.sponsor) ?? 'Sponsor'} · {row.title} · Signed {row.signedOn}</span>
								<strong class="ml-auto tabular-nums">{money(row.amountCents, terms.currency)}</strong>
							</label>
						{/each}
					</div>
				{:else}
					<p class="text-muted-foreground">No agreements match the selected currency and signing cutoff.</p>
				{/if}
				{#if !eligibleSelected.length}
					<p class="mt-2 rounded bg-amber-50 p-2 text-amber-900 dark:bg-amber-950 dark:text-amber-200">Select at least one qualifying signed agreement.</p>
				{/if}
			</fieldset>
			{#if preview}
				<p aria-live="polite" class="rounded-lg border bg-card p-3">
					<strong>Preview · {preview.status}</strong>
					<span class="block">{money(preview.committedCents, terms.currency)} committed of {money(preview.requiredCents, terms.currency)} required</span>
				</p>
			{/if}
			<Button type="submit" class="bg-green-700 text-white hover:bg-green-800">
				<Save aria-hidden="true" /> Save funding condition
			</Button>
		</form>
	</details>
	{/if}
</section>
