<script lang="ts">
	import {
		CircleCheck,
		CircleX,
		Eye,
		EyeOff,
		MessageCircle,
		Plus,
		Search,
		Send
	} from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { sponsorStages, type Sponsor } from '$lib/sponsorships/model';

	type SponsorFields = Omit<Sponsor, 'id' | 'archived'>;
	interface SponsorForm {
		message?: string;
		sponsorMessage?: string;
		sponsorError?: string;
		sponsorId?: string;
		sponsorValues?: SponsorFields;
	}
	let { sponsors, form }: { sponsors: Sponsor[]; form: unknown } = $props();

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
				<Button type="submit">Save changes</Button>
			{/if}
		</div>
	</form>
{/snippet}

{#snippet archiveForm(sponsor: Sponsor)}
	<form method="POST" action="?/saveSponsor">
		<input type="hidden" name="sponsor" value={sponsor.id} />
		<input type="hidden" name="intent" value={sponsor.archived ? 'restore' : 'archive'} />
		<Button type="submit" variant="outline" size="sm">
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

<section aria-labelledby="active-sponsors" class="grid gap-3">
	<h2 id="active-sponsors" class="text-lg font-semibold">Active sponsors</h2>
	{#each active as sponsor (sponsor.id)}
		{@const stage = sponsorStages.find(({ value }) => value === sponsor.stage)}
		<article class="grid gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground">
			<div class="flex flex-wrap items-center gap-2">
				<h3 class="font-semibold">{sponsor.name}</h3>
				{#if stage}<Badge variant="secondary">{stage.label}</Badge>{/if}
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
				{@render editor('edit', sponsor, sponsor.id)}
			</details>
			{@render archiveForm(sponsor)}
		</article>
	{:else}
		<p class="text-sm text-muted-foreground">No active sponsors yet.</p>
	{/each}
</section>

{#if archived.length}
	<details class="group/archived rounded-xl border border-border bg-muted p-4">
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
					{@render archiveForm(sponsor)}
				</li>
			{/each}
		</ul>
	</details>
{/if}
