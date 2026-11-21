<script lang="ts">
	import { CalendarDays, CheckCircle2, ClipboardList } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { Sponsor, SponsorshipQuote } from '$lib/sponsorships/model';

	let { sponsor, quote, targets, form }: {
		sponsor: Sponsor;
		quote: SponsorshipQuote;
		targets: { value: string; label: string }[];
		form: unknown;
	} = $props();
	const feedback = $derived(form as {
		conversionQuote?: string;
		conversionError?: string;
		coverage?: string;
		signedOn?: string;
		dueOn?: string;
	} | null);
	const error = $derived(feedback?.conversionQuote === quote.id ? feedback.conversionError : null);
	let open = $state(false);
	let step = $state(1);
	let coverage = $state('');
	let signedOn = $state('');
	let dueOn = $state('');
	let confirmed = $state(false);
	const steps = [
		{ label: 'Review quote', icon: ClipboardList },
		{ label: 'Coverage and dates', icon: CalendarDays },
		{ label: 'Confirm', icon: CheckCircle2 }
	];
	const blue = 'bg-blue-700 text-white hover:bg-blue-800';
	const amber = 'border-amber-400 bg-amber-50 text-amber-950';
	const field = 'rounded-md border p-2';
	const validDates = $derived(Boolean(signedOn) && (!dueOn || dueOn >= signedOn));
	const ready = $derived(Boolean(coverage) && validDates);
	const money = (cents: number) =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency: quote.currency }).format(cents / 100);
	const reviewTerms = $derived(JSON.stringify([
		quote.packageName, quote.currency, quote.amountCents,
		quote.benefits.map((benefit) => [benefit.id, benefit.name, benefit.amountCents])
	]));
	$effect(() => {
		if (error && feedback) {
			open = true;
			step = 1;
			coverage = feedback.coverage ?? '';
			signedOn = feedback.signedOn ?? '';
			dueOn = feedback.dueOn ?? '';
			confirmed = false;
		}
	});
</script>

<details bind:open class="mt-3 rounded-lg border border-blue-200 bg-card p-3">
	<summary class="cursor-pointer font-semibold">
		<CheckCircle2 class="mr-1 inline-block size-4 text-blue-700" aria-hidden="true" />
		Convert to agreement
	</summary>
	<p class="mt-3 font-semibold">Step {step} of 3</p>
	<ol class="mb-3 mt-2 grid gap-2 sm:grid-cols-3" aria-label="Conversion progress">
		{#each steps as item, index (item.label)}
			<li aria-current={index + 1 === step ? 'step' : undefined}
				class="flex items-center gap-1 rounded px-2 py-1 {index + 1 === step ? 'bg-blue-100 text-blue-950' : 'bg-muted'}">
				<item.icon class="size-4 shrink-0" aria-hidden="true" />{item.label}
			</li>
		{/each}
	</ol>
	{#if error}<p class="mb-2 text-destructive" role="alert">{error}</p>{/if}

	{#if step === 1 || step === 3}
		<p class="font-semibold">{sponsor.name} · {quote.packageName} · {money(quote.amountCents)} {quote.currency}</p>
		<ul class="my-2 overflow-hidden rounded border">
			{#each quote.benefits as benefit (benefit.id)}
				<li class="flex justify-between gap-3 p-2 odd:bg-muted even:bg-background">
					<span>{benefit.name}</span><span class="tabular-nums">{money(benefit.amountCents)}</span>
				</li>
			{/each}
		</ul>
	{/if}

	{#if step === 1}
		<Button type="button" class={blue} onclick={() => step = 2}>Continue to coverage</Button>
	{:else if step === 2}
		<form class="grid gap-3" onsubmit={(event) => { event.preventDefault(); if (ready) step = 3; }}>
			<label class="grid gap-1">
				Coverage
				<select required bind:value={coverage} class={field + ' ' + (coverage ? 'bg-background' : amber)}>
					<option value="" disabled>Choose coverage</option>
					{#each targets as target (target.value)}
						<option value={target.value}>{target.label}</option>
					{/each}
				</select>
			</label>
			<label class="grid gap-1">
				Signed on
				<input required type="date" bind:value={signedOn} class={field + ' ' + (signedOn ? 'bg-background' : amber)} />
			</label>
			<label class="grid gap-1">
				Payment due (optional)
				<input type="date" min={signedOn || undefined} bind:value={dueOn} class={field + ' bg-background'} />
			</label>
			<div class="flex flex-wrap gap-2">
				<Button type="button" variant="outline" onclick={() => step = 1}>Back</Button>
				<Button type="submit" class={blue} disabled={!ready}>Review agreement</Button>
			</div>
		</form>
	{:else}
		<p class="mb-2">{targets.find((target) => target.value === coverage)?.label} · Signed {signedOn}{dueOn ? ' · Due ' + dueOn : ''}</p>
		<form method="POST" action="?/saveSponsor" class="grid gap-3">
			<input type="hidden" name="intent" value="convert-quote" />
			<input type="hidden" name="sponsor" value={sponsor.id} />
			<input type="hidden" name="quote" value={quote.id} />
			<input type="hidden" name="reviewTerms" value={reviewTerms} />
			<input type="hidden" name="coverage" value={coverage} />
			<input type="hidden" name="signedOn" value={signedOn} />
			<input type="hidden" name="dueOn" value={dueOn} />
			<label class="flex items-center gap-2">
				<input type="checkbox" name="confirm" value="signed" required bind:checked={confirmed} />
				The sponsorship agreement has been signed.
			</label>
			<div class="flex flex-wrap gap-2">
				<Button type="button" variant="outline" onclick={() => step = 2}>Back</Button>
				<Button type="submit" disabled={!confirmed || !ready} class="bg-green-700 text-white hover:bg-green-800">
					Create agreement
				</Button>
			</div>
		</form>
	{/if}
</details>
