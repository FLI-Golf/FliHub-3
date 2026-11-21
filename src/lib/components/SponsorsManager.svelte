<script lang="ts">
	import {
		Banknote,
		ChartNoAxesCombined,
		CalendarCheck,
		CalendarDays,
		ClipboardList,
		Coins,
		FileSignature,
		FileText,
		Save,
		Target,
		CircleCheck,
		CircleX,
		Eye,
		EyeOff,
		MessageCircle,
		Plus,
		Search,
		Send
	} from 'lucide-svelte';
	import SponsorshipFundingCondition from '$lib/components/SponsorshipFundingCondition.svelte';
	import SponsorshipFunding from '$lib/components/SponsorshipFunding.svelte';
	import SponsorshipQuoteBuilder from '$lib/components/SponsorshipQuoteBuilder.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { sponsorStages, type Sponsor, type SponsorshipAgreement, type SponsorshipQuote, type SponsorshipFundingEntry } from '$lib/sponsorships/model';

	import { previewFundingThreshold, type SponsorshipFundingCondition as FundingCondition } from '$lib/sponsorships/funding-threshold';

	import { summarizeSponsorshipFunding } from '$lib/sponsorships/funding-summary';

	type SponsorFields = Omit<Sponsor, 'id' | 'archived'>;
	interface SponsorForm {
		message?: string;
		sponsorMessage?: string;
		sponsorError?: string;
		sponsorId?: string;
		sponsorValues?: SponsorFields;
		agreementSponsor?: string;
		agreementMessage?: string;
		agreementError?: string;
		agreementValues?: Record<string, string>;
		conditionAgreement?: string;
	}
	let { sponsors, agreements, quotes, funding, conditions, asOf, targets, form }: {
		sponsors: Sponsor[];
		agreements: SponsorshipAgreement[];
		quotes: SponsorshipQuote[];
		funding: SponsorshipFundingEntry[];
		conditions: FundingCondition[];
		asOf: string;
		targets: { value: string; label: string }[];
		form: unknown;
	} = $props();

	const conditionsByAgreement = $derived(new Map(conditions.map((row) => [row.agreement, row])));
	const fundingSummary = $derived(summarizeSponsorshipFunding(agreements, funding, conditionsByAgreement, asOf));
	const result = $derived(form as SponsorForm | null);
	const active = $derived(sponsors.filter((sponsor) => !sponsor.archived));
	const archived = $derived(sponsors.filter((sponsor) => sponsor.archived));
	const empty: SponsorFields = {
		name: '',
		contactName: '',
		contactEmail: '',
		stage: 'prospect',
		followUpOn: '',
		nextAction: '',
		notes: ''
	};
	const agreementRequiredHighlight = 'invalid:border-amber-400 invalid:bg-amber-50 invalid:ring-2 invalid:ring-amber-200 dark:invalid:bg-amber-950 dark:invalid:ring-amber-800';
	const agreementRequiredField = 'rounded border bg-background p-2 ' + agreementRequiredHighlight;
	const agreementSelect = 'rounded border border-blue-400 bg-blue-50 p-2 text-blue-950 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100';
	const inputClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
	const stageGuide = {
		prospect: {
			icon: Search,
			color: 'bg-slate-100 text-slate-800',
			description: 'Research a potential sponsor, prepare outreach, or wait for their first reply.'
		},
		'in-discussion': {
			icon: MessageCircle,
			color: 'bg-blue-100 text-blue-900',
			description:
				'Talk with the sponsor about their goals, budget, timing, and what FLI Golf can offer.'
		},
		'proposal-sent': {
			icon: Send,
			color: 'bg-amber-100 text-amber-900',
			description: 'You’ve sent an offer with pricing and benefits. Set a follow-up date.'
		},
		signed: {
			icon: CircleCheck,
			color: 'bg-green-100 text-green-900',
			description: 'Both sides have signed the sponsorship agreement.'
		},
		closed: {
			icon: CircleX,
			color: 'bg-red-100 text-red-900',
			description: 'The opportunity ended without a signed agreement. Record the reason in Notes.'
		}
	};
</script>

{#snippet editor(intent: 'create' | 'edit', original: SponsorFields, id = '')}
	{@const values = result?.sponsorId === id ? (result.sponsorValues ?? original) : original}
	<form method="POST" action="?/saveSponsor" class="mt-4 grid gap-3 sm:grid-cols-2">
		<input type="hidden" name="intent" value={intent} />
		<input type="hidden" name="sponsor" value={id} />
		{#if result?.sponsorId === id && result.sponsorError}
			<p role="alert" class="text-sm text-red-700 sm:col-span-2">
				{result.sponsorError}
			</p>
		{/if}
		<label class="grid gap-1 text-sm font-medium">
			Company name
			<input class={inputClass} name="name" value={values.name} required maxlength="120" />
		</label>
		<label class="grid gap-1 text-sm font-medium">
			Sales stage
			<select class={inputClass} name="stage" value={values.stage} required>
				{#each sponsorStages as stage (stage.value)}
					<option value={stage.value}>{stage.label}</option>
				{/each}
			</select>
		</label>
		<label class="grid gap-1 text-sm font-medium">
			Contact name
			<input class={inputClass} name="contactName" value={values.contactName} maxlength="120" />
		</label>
		<label class="grid gap-1 text-sm font-medium">
			Contact email
			<input
				class={inputClass}
				name="contactEmail"
				type="email"
				value={values.contactEmail}
				maxlength="254"
			/>
		</label>
		<label class="grid gap-1 text-sm font-medium">
			Follow-up date
			<input class={inputClass} name="followUpOn" type="date" value={values.followUpOn} />
		</label>
		<label class="grid gap-1 text-sm font-medium">
			Next action
			<input class={inputClass} name="nextAction" value={values.nextAction} maxlength="240" />
		</label>
		<label class="grid gap-1 text-sm font-medium sm:col-span-2">
			Notes
			<textarea class={inputClass} name="notes" value={values.notes} maxlength="2000" rows="3"
			></textarea>
		</label>
		<div class="sm:col-span-2">
			{#if intent === 'create'}
				<Button type="submit" class="bg-green-700 text-white hover:bg-green-800">
					<Plus class="size-4" /> Add sponsor
				</Button>
			{:else}
				<Button type="submit" class="bg-green-700 text-white hover:bg-green-800">Save changes</Button>
			{/if}
		</div>
	</form>
{/snippet}

{#snippet sponsorAgreements(sponsor: Sponsor)}
	{@const rows = agreements.filter((agreement) => agreement.sponsor === sponsor.id)}
	{@const ownResult = result?.agreementSponsor === sponsor.id ? result : null}
	{@const values = ownResult?.agreementValues}
	{#if ownResult?.agreementMessage}
		<p role="status" class="text-sm">{ownResult.agreementMessage}</p>
	{/if}
	{#if rows.length}
		<div class="grid gap-2">
			<h4 class="text-sm font-semibold">Sponsorship agreements</h4>
			<ul class="divide-y rounded-lg border">
				{#each rows as agreement (agreement.id)}
					{@const condition = conditionsByAgreement.get(agreement.id)}
					<li id={`sponsorship-agreement-${agreement.id}`} class="space-y-1 p-3 text-sm target:bg-emerald-100 dark:target:bg-emerald-950">
						<div class="flex flex-wrap justify-between gap-2">
							<strong>{agreement.title}</strong>
							<span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: agreement.currency }).format(agreement.amountCents / 100)} {agreement.currency} agreed</span>
						</div>
						<p>{agreement.coverageLabel}</p>
						<p class="text-muted-foreground">
							Signed {agreement.signedOn}{#if agreement.dueOn} · Due {agreement.dueOn}{/if}
						</p>
						{#if agreement.benefits}<p class="whitespace-pre-wrap">{agreement.benefits}</p>{/if}
						<SponsorshipFundingCondition {sponsor} {agreement} {sponsors} {agreements} {asOf} {condition} {form} />
						<SponsorshipFunding {sponsor} {agreement} {asOf} {condition} canRelease={Boolean(condition && previewFundingThreshold({ ...condition, asOf, agreements }).status === 'Met')} entries={funding.filter((entry) => entry.agreement === agreement.id)} {form} />
					</li>
				{/each}
			</ul>
		</div>
	{/if}
	{#if !sponsor.archived}
		<details open={Boolean(ownResult?.agreementError)} class="rounded-lg border p-3">
			<summary class="cursor-pointer rounded-md bg-white px-3 py-2 text-sm font-semibold dark:bg-slate-900">
				<FileSignature class="mr-1 inline-block size-4 text-blue-700 dark:text-blue-300" aria-hidden="true" />
				Record a signed agreement
			</summary>
			{#if ownResult?.agreementError}<p role="alert" class="mt-3 text-sm text-destructive">{ownResult.agreementError}</p>{/if}
			<form method="POST" action="?/saveSponsor" class="mt-3 grid gap-3 sm:grid-cols-2">
				<input type="hidden" name="intent" value="agreement" />
				<input type="hidden" name="sponsor" value={sponsor.id} />
				<label class="grid gap-1 text-sm">
					<span><FileText class="mr-1 inline-block size-4" aria-hidden="true" /> Agreement title</span>
					<input name="title" value={values?.title ?? ''} required maxlength="120" pattern={/.*\S.*/.source} class={agreementRequiredField} />
				</label>
				<label class="grid gap-1 text-sm">
					<span><Target class="mr-1 inline-block size-4" aria-hidden="true" /> Covers</span>
					<select name="coverage" value={values?.coverage ?? ''} required class={agreementSelect + ' min-w-0 ' + agreementRequiredHighlight}>
						<option value="">Select coverage</option>
						{#each targets as target (target.value)}
							<option value={target.value}>{target.label}</option>
						{/each}
					</select>
				</label>
				<label class="grid gap-1 text-sm">
					<span><Banknote class="mr-1 inline-block size-4" aria-hidden="true" /> Agreed amount</span>
					<input name="amount" inputmode="decimal" value={values?.amount ?? ''} required maxlength="12" class={agreementRequiredField} />
				</label>
				<label class="grid gap-1 text-sm">
					<span><Coins class="mr-1 inline-block size-4" aria-hidden="true" /> Currency</span>
					<select name="currency" value={values?.currency ?? 'USD'} class={agreementSelect}>
						{#each ['USD', 'CAD', 'EUR', 'GBP'] as currency (currency)}
							<option value={currency}>{currency}</option>
						{/each}
					</select>
				</label>
				<label class="grid gap-1 text-sm">
					<span><CalendarCheck class="mr-1 inline-block size-4" aria-hidden="true" /> Signed on</span>
					<input type="date" name="signedOn" value={values?.signedOn ?? ''} required class={agreementRequiredField} />
				</label>
				<label class="grid gap-1 text-sm">
					<span><CalendarDays class="mr-1 inline-block size-4" aria-hidden="true" /> Payment due (optional)</span>
					<input type="date" name="dueOn" value={values?.dueOn ?? ''} class="rounded border bg-background p-2" />
				</label>
				<label class="grid gap-1 text-sm sm:col-span-2">
					<span><ClipboardList class="mr-1 inline-block size-4" aria-hidden="true" /> Promised benefits (optional)</span>
					<textarea name="benefits" maxlength="2000" value={values?.benefits ?? ''} class="rounded border bg-background p-2"></textarea>
				</label>
				<div><Button type="submit" class="bg-green-700 text-white hover:bg-green-800"><Save aria-hidden="true" /> Save agreement</Button></div>
			</form>
		</details>
	{/if}
{/snippet}

{#snippet archiveForm(sponsor: Sponsor)}
	<form method="POST" action="?/saveSponsor">
		<input type="hidden" name="sponsor" value={sponsor.id} />
		<input type="hidden" name="intent" value={sponsor.archived ? 'restore' : 'archive'} />
		<Button type="submit" size="sm" class="bg-green-700 text-white hover:bg-green-800">
			{sponsor.archived ? 'Restore' : 'Archive'}
		</Button>
	</form>
{/snippet}

{#if result?.message}
	<p role="alert" class="text-sm text-red-700">{result.message}</p>
{/if}
{#if result?.sponsorMessage}
	<p role="status" class="text-sm text-green-800">{result.sponsorMessage}</p>
{/if}

<details
	class="group/add-sponsor rounded-xl border border-green-200 bg-green-50 p-4 text-green-950"
	open={result?.sponsorId === ''}
>
	<summary
		class="cursor-pointer list-none font-semibold [&::-webkit-details-marker]:hidden"
	>
		<span class="inline-flex items-center gap-2 group-open/add-sponsor:hidden">
			<span
				class="inline-flex size-8 items-center justify-center rounded-full bg-green-700 text-white"
			>
				<Plus aria-hidden="true" class="size-4" />
			</span>
			Add sponsor
		</span>
		<span class="hidden items-center gap-2 text-slate-700 group-open/add-sponsor:inline-flex">
			<span class="inline-flex size-8 items-center justify-center rounded-full bg-red-700 text-white">
				<EyeOff aria-hidden="true" class="size-4" />
			</span>
			Close sponsor form
		</span>
	</summary>
	<details class="group/form-help mt-4 rounded-lg border border-slate-200 bg-white p-3 text-slate-950">
	<summary
		class="flex cursor-pointer list-none items-center gap-2 rounded-md bg-blue-500 px-3 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 [&::-webkit-details-marker]:hidden"
	>
			<Eye aria-hidden="true" class="size-4 group-open/form-help:hidden" />
			<EyeOff aria-hidden="true" class="hidden size-4 group-open/form-help:block" />
			How to use this form
			<span class="ml-auto text-xs font-medium text-slate-600 group-open/form-help:hidden">
				More info
			</span>
			<span class="ml-auto hidden text-xs font-medium text-slate-600 group-open/form-help:inline">
				Hide info
			</span>
		</summary>

		<table class="mt-3 w-full border-collapse text-left text-sm">
			<caption class="sr-only">When to use each sponsorship sales stage</caption>
			<thead class="border-b border-slate-200">
				<tr>
					<th scope="col" class="px-2 py-2">Stage</th>
					<th scope="col" class="px-2 py-2">When to use it</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#each sponsorStages as stage (stage.value)}
					{@const entry = stageGuide[stage.value]}
					{@const Icon = entry.icon}
					<tr>
						<th scope="row" class="px-2 py-2 align-top">
							<span
								class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium {entry.color}"
							>
								<Icon aria-hidden="true" class="size-4 shrink-0" />
								{stage.label}
							</span>
						</th>
						<td class="px-2 py-2 align-top text-slate-700">{entry.description}</td>
					</tr>
				{/each}
			</tbody>
		</table>


	<details
		class="group/next-action mt-3 rounded-lg border border-slate-200 bg-white p-3 text-slate-950"
	>
	<summary
		class="flex cursor-pointer list-none items-center gap-2 rounded-md bg-red-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 [&::-webkit-details-marker]:hidden"
	>
			<Eye aria-hidden="true" class="size-4 group-open/next-action:hidden" />
			<EyeOff aria-hidden="true" class="hidden size-4 group-open/next-action:block" />
			Next action cheat sheet
		</summary>

		<p class="mt-3 text-sm text-slate-700">
			Write one concrete step, starting with a verb. Put the deadline in
			<strong>Follow-up date</strong> and conversation history in <strong>Notes</strong>.
		</p>

		<table class="mt-3 w-full border-collapse text-left text-sm">
			<caption class="sr-only">Example next actions by sponsorship sales stage</caption>
			<thead class="border-b border-slate-200">
				<tr>
					<th scope="col" class="px-2 py-2">Stage</th>
					<th scope="col" class="px-2 py-2">Example next action</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#each sponsorStages as stage (stage.value)}
					{@const entry = stageGuide[stage.value]}
					{@const Icon = entry.icon}
					{@const example = {
						prospect: 'Find the partnerships contact and send an introductory email.',
						'in-discussion': 'Schedule a call to confirm their budget and sponsorship goals.',
						'proposal-sent': 'Follow up on the proposal and ask when they expect to decide.',
						signed: 'Request their logo files and confirm the announcement date.',
						closed: 'Leave this blank if there’s nothing left to do. Record why it ended in Notes.'
					}[stage.value]}
					<tr>
						<th scope="row" class="px-2 py-2 align-top">
							<span
								class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium {entry.color}"
							>
								<Icon aria-hidden="true" class="size-4 shrink-0" />
								{stage.label}
							</span>
						</th>
						<td class="px-2 py-2 align-top text-slate-700">{example}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		</details>
	</details>

	{@render editor('create', empty)}
</details>

<section aria-labelledby="funding-summary" class="grid gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-800 dark:bg-blue-950/35">
	<h2 id="funding-summary" class="flex items-center gap-2 text-lg font-semibold">
		<ChartNoAxesCombined class="size-5 text-blue-700 dark:text-blue-300" aria-hidden="true" />
		Organization funding summary
	</h2>
	{#if fundingSummary.length}
		<p class="text-sm text-muted-foreground">Due now covers installments due on {asOf} (UTC). Overdue covers earlier dates.</p>
		<div class="overflow-x-auto rounded-lg border bg-background">
			<table class="w-full text-sm" aria-labelledby="funding-summary">
				<thead class="bg-muted text-left">
					<tr>
						<th scope="col" class="p-3">Currency</th>
						<th scope="col" class="p-3 text-right">Signed commitments</th>
						<th scope="col" class="p-3 text-right">Scheduled installments</th>
						<th scope="col" class="p-3 text-right">Payments received</th>
						<th scope="col" class="p-3 text-right">Outstanding balance</th>
						<th scope="col" class="p-3 text-right">Due now</th>
						<th scope="col" class="p-3 text-right">Overdue</th>
					</tr>
				</thead>
				<tbody>
					{#each fundingSummary as total (total.currency)}
						{@const format = new Intl.NumberFormat('en-US', { style: 'currency', currency: total.currency })}
						<tr class="border-t even:bg-muted/50">
							<th scope="row" class="p-3 text-left font-semibold">{total.currency}</th>
							{#each [total.committed, total.scheduled, total.received, total.outstanding, total.dueNow, total.overdue] as amount}
								<td class="whitespace-nowrap p-3 text-right tabular-nums">{format.format(amount / 100)}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="text-sm text-muted-foreground">No signed sponsorship agreements yet.</p>
	{/if}
</section>

<section aria-labelledby="active-sponsors" class="grid gap-3">
	<h2 id="active-sponsors" class="text-lg font-semibold">Active sponsors</h2>
	{#each active as sponsor (sponsor.id)}
		{@const stage = sponsorStages.find(({ value }) => value === sponsor.stage)}
		<article class="grid gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-card-foreground dark:border-blue-800 dark:bg-blue-950/35">
			<div class="flex flex-wrap items-center gap-2">
				<h3 class="font-semibold">{sponsor.name}</h3>
				{#if stage}<Badge variant="secondary" class={sponsor.stage === 'signed' ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100' : ''}>{stage.label}</Badge>{/if}
			</div>
			{#if sponsor.followUpOn || sponsor.nextAction}
				<p class="text-sm">
					{#if sponsor.followUpOn}
						Follow up <time datetime={sponsor.followUpOn}>{sponsor.followUpOn}</time>
					{/if}
					{#if sponsor.nextAction}
						<span class="block">{sponsor.nextAction}</span>
					{/if}
				</p>
			{/if}
			<details class="group/sponsor" open={result?.sponsorId === sponsor.id}>
				<summary
					class="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden"
				>
					<Eye aria-hidden="true" class="size-4 group-open/sponsor:hidden" />
					<EyeOff aria-hidden="true" class="hidden size-4 group-open/sponsor:block" />
					<span class="group-open/sponsor:hidden">Show details</span>
					<span class="hidden group-open/sponsor:inline">Hide details</span>
				</summary>
				<div>{@render editor('edit', sponsor, sponsor.id)}</div>
			</details>
			<div class="grid gap-3">{@render sponsorAgreements(sponsor)}</div>
			<div class="grid gap-3"><SponsorshipQuoteBuilder {sponsor} quotes={quotes.filter((quote) => quote.sponsor === sponsor.id)} {agreements} {targets} {form} /></div>
			{@render archiveForm(sponsor)}
		</article>
	{:else}
		<p class="text-sm text-muted-foreground">No active sponsors yet.</p>
	{/each}
</section>

{#if archived.length}
	<details class="group/archived rounded-xl border border-border bg-muted p-4" open={archived.some((sponsor) => agreements.some((agreement) => agreement.sponsor === sponsor.id && agreement.id === result?.conditionAgreement))}>
		<summary
			class="flex cursor-pointer list-none items-center gap-2 font-semibold [&::-webkit-details-marker]:hidden"
		>
			<Eye aria-hidden="true" class="size-4 group-open/archived:hidden" />
			<EyeOff aria-hidden="true" class="hidden size-4 group-open/archived:block" />
			Archived sponsors ({archived.length})
		</summary>
		<ul class="mt-3 grid gap-2">
			{#each archived as sponsor (sponsor.id)}
				<li class="flex flex-wrap items-center justify-between gap-2">
					{sponsor.name}
					<div class="grid gap-3">{@render sponsorAgreements(sponsor)}</div>
			<div class="grid gap-3"><SponsorshipQuoteBuilder {sponsor} quotes={quotes.filter((quote) => quote.sponsor === sponsor.id)} {agreements} {targets} {form} /></div>
			{@render archiveForm(sponsor)}
				</li>
			{/each}
		</ul>
	</details>
{/if}
