<script lang="ts">
	import { enhance } from '$app/forms';
	import { CalendarDays, RotateCcw, Wallet } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { Sponsor, SponsorshipAgreement, SponsorshipFundingEntry } from '$lib/sponsorships/model';

	let { sponsor, agreement, entries, form }: {
		sponsor: Sponsor;
		agreement: SponsorshipAgreement;
		entries: SponsorshipFundingEntry[];
		form: unknown;
	} = $props();
	const feedback = $derived(form as {
		fundingAgreement?: string;
		fundingKind?: string;
		fundingMessage?: string;
		fundingError?: string;
		reversalError?: string;
		reversalPayment?: string;
		reversalReason?: string;
		fundingValues?: Record<string, string>;
	} | null);
	const result = $derived(feedback?.fundingAgreement === agreement.id ? feedback : null);
	const scheduled = $derived(entries.filter((entry) => entry.kind === 'installment'));
	const payments = $derived(entries.filter((entry) => entry.kind === 'payment'));
	const sum = (rows: SponsorshipFundingEntry[]) => rows.reduce((amount, entry) => amount + entry.amountCents, 0);
	const received = $derived(sum(payments.filter((payment) => !payment.reversal)));
	const unscheduled = $derived(agreement.amountCents - sum(scheduled));
	const outstanding = $derived(Math.max(agreement.amountCents - received, 0));
	const money = (cents: number) => new Intl.NumberFormat('en-US', {
		style: 'currency', currency: agreement.currency
	}).format(cents / 100);
	const methods = [
		{ value: 'bank-transfer', label: 'Bank transfer' },
		{ value: 'check', label: 'Check' },
		{ value: 'card', label: 'Card' },
		{ value: 'cash', label: 'Cash' },
		{ value: 'other', label: 'Other' }
	];
	let pending = $state(false);
</script>

<p class="text-sm"><strong>Sponsor</strong> · {sponsor.name}</p>
<dl class="grid gap-2 rounded-lg border bg-blue-50 p-3 text-blue-950 sm:grid-cols-2 dark:bg-blue-950 dark:text-blue-100">
	<div><dt>Scheduled</dt><dd class="font-semibold tabular-nums">{money(sum(scheduled))}</dd></div>
	<div><dt>Unscheduled</dt><dd class="font-semibold tabular-nums">{money(unscheduled)}</dd></div>
	<div><dt>Received</dt><dd class="font-semibold tabular-nums">{money(received)}</dd></div>
	<div>
		<dt>{received > agreement.amountCents ? 'Overpaid' : 'Outstanding'}</dt>
		<dd class="font-semibold tabular-nums">{money(received > agreement.amountCents ? received - agreement.amountCents : outstanding)}</dd>
	</div>
</dl>
{#if result?.fundingMessage}<p role="status" class="rounded bg-emerald-50 p-2 text-emerald-950">{result.fundingMessage}</p>{/if}

{#each [
	{ kind: 'installment', title: 'Installments', rows: scheduled, action: 'Add installment', date: 'Due date', icon: CalendarDays },
	{ kind: 'payment', title: 'Payments received', rows: payments, action: 'Record payment', date: 'Received on', icon: Wallet }
] as section (section.kind)}
	{@const matching = result?.fundingKind === section.kind ? result : null}
	{@const values = matching?.fundingValues}
	<details class="rounded-lg border bg-card p-3" open={Boolean(matching?.fundingError || (section.kind === 'payment' && result?.reversalPayment))}>
		<summary class="cursor-pointer font-semibold">
			<section.icon aria-hidden="true" class="mr-1 inline-block size-4" />
			{section.title} ({section.rows.length})
		</summary>
		{#if section.rows.length}
			<ul class="mt-2 overflow-hidden rounded border">
				{#each section.rows as entry (entry.id)}
					{@const reversalError = result?.reversalPayment === entry.id ? result?.reversalError : null}
					<li class="grid gap-2 p-2 odd:bg-muted even:bg-background">
						<div class="flex flex-wrap justify-between gap-2">
							<span>{entry.entryDate}{entry.method ? ' · ' + (methods.find((method) => method.value === entry.method)?.label ?? entry.method) : ''}{entry.reference ? ' · ' + entry.reference : ''}</span>
							<strong class="tabular-nums">{money(entry.amountCents)}</strong>
						</div>
						{#if entry.reversal}
							<div class="rounded border border-amber-300 bg-amber-50 p-2 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
								<p class="font-semibold"><RotateCcw aria-hidden="true" class="mr-1 inline-block size-4" />Reversed</p>
								<p>{entry.reversal.reason}</p>
								<p class="text-xs">
									{entry.reversal.recordedByName || 'Account ' + entry.reversal.recordedBy} · {entry.reversal.created}
								</p>
							</div>
						{:else if section.kind === 'payment' && !sponsor.archived}
							<details open={Boolean(reversalError)} class="rounded border p-2">
								<summary class="cursor-pointer font-semibold text-amber-800 dark:text-amber-300">
									<RotateCcw aria-hidden="true" class="mr-1 inline-block size-4" />Reverse payment
								</summary>
								<form method="POST" action="?/saveSponsor" class="mt-2 grid gap-2"
									use:enhance={({ cancel }) => {
										if (pending) { cancel(); return; }
										pending = true;
										return async ({ update }) => { try { await update(); } finally { pending = false; } };
									}}>
									<input type="hidden" name="intent" value="reverse-payment" />
									<input type="hidden" name="sponsor" value={sponsor.id} />
									<input type="hidden" name="agreement" value={agreement.id} />
									<input type="hidden" name="payment" value={entry.id} />
									<p>This removes {money(entry.amountCents)} from the received balance and keeps the original payment in the history.</p>
									<label class="grid gap-1">Reason
										<input name="reason" required maxlength="500" pattern={/.*\S.*/.source}
											value={reversalError ? result?.reversalReason ?? '' : ''}
											class="rounded border bg-background p-2 invalid:border-amber-400 invalid:bg-amber-50 invalid:ring-2 invalid:ring-amber-200 dark:invalid:bg-amber-950 dark:invalid:ring-amber-800" />
									</label>
									{#if reversalError}<p role="alert" class="text-destructive">{reversalError}</p>{/if}
									<div><Button type="submit" variant="destructive" disabled={pending}>Confirm reversal</Button></div>
								</form>
							</details>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		{#if matching?.fundingError}<p role="alert" class="mt-2 text-destructive">{matching.fundingError}</p>{/if}
		{#if !sponsor.archived && (section.kind === 'payment' || unscheduled > 0)}
			<form method="POST" action="?/saveSponsor" class="mt-3 grid gap-2 sm:grid-cols-2"
				use:enhance={({ cancel }) => {
					if (pending) { cancel(); return; }
					pending = true;
					return async ({ update }) => { try { await update(); } finally { pending = false; } };
				}}>
				<input type="hidden" name="intent" value="funding-entry" />
				<input type="hidden" name="sponsor" value={sponsor.id} />
				<input type="hidden" name="agreement" value={agreement.id} />
				<input type="hidden" name="kind" value={section.kind} />
				<label class="grid gap-1">Amount ({agreement.currency})
					<input class="rounded border bg-background p-2 invalid:border-amber-400 invalid:bg-amber-50 invalid:ring-2 invalid:ring-amber-200 dark:invalid:bg-amber-950 dark:invalid:ring-amber-800" name="amount" inputmode="decimal" pattern={'(?=[0-9,.]*[1-9])(?:[0-9]{1,9}|[0-9]{1,3}(?:,[0-9]{3}){1,2})(?:[.][0-9]{1,2})?'} title="Enter a positive amount with up to two decimal places" required maxlength="14" value={values?.amount ?? ''} />
				</label>
				<label class="grid gap-1">{section.date}
					<input class="rounded border bg-background p-2 invalid:border-amber-400 invalid:bg-amber-50 invalid:ring-2 invalid:ring-amber-200 dark:invalid:bg-amber-950 dark:invalid:ring-amber-800" type="date" name="entryDate" required value={values?.entryDate ?? ''} />
				</label>
				{#if section.kind === 'payment'}
					<label class="grid gap-1">Payment method
						<select name="method" required class="rounded border bg-background p-2 invalid:border-amber-400 invalid:bg-amber-50 invalid:ring-2 invalid:ring-amber-200 dark:invalid:bg-amber-950 dark:invalid:ring-amber-800" value={values?.method ?? ''}>
							<option value="" disabled>Choose a method</option>
							{#each methods as method (method.value)}<option value={method.value}>{method.label}</option>{/each}
						</select>
					</label>
				{/if}
				<label class="grid gap-1">Reference (optional)
					<input class="rounded border bg-background p-2" name="reference" maxlength="200" value={values?.reference ?? ''} />
				</label>
				<div class="sm:col-span-2"><Button type="submit" disabled={pending} class="bg-green-700 text-white hover:bg-green-800">{section.action}</Button></div>
			</form>
		{/if}
	</details>
{/each}
