<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { Check, ChevronRight } from 'lucide-svelte';
	import { parseSeasonPurse } from '$lib/season-purse';

	interface League {
		id: string;
		name: string;
		status: 'active' | 'archived';
	}
	interface InputValues {
		mode: string;
		leagueName: string;
		leagueId: string;
		seasonName: string;
		startsOn: string;
		endsOn: string;
		purseAmount: string;
	}
	let {
		leagues,
		form,
		action = '?/setupLeagueSeason',
		onSaved
	}: {
		leagues: League[];
		form: unknown;
		action?: string;
		onSaved?: (season: { id: string; name: string; leagueName: string }) => void;
	} = $props();
	let inlineFeedback = $state<Record<string, unknown> | null>(null);
	const feedback = $derived(
		inlineFeedback ?? (form && typeof form === 'object' && 'setupLeagueSeason' in form
			? (form as Record<string, unknown>)
			: null)
	);
	const initial = untrack(() => {
		const input = feedback?.input;
		return input && typeof input === 'object' ? (input as InputValues) : null;
	});
	function leagueDefaults(available: League[]) {
		const active = available.filter((league) => league.status === 'active');
		return {
			mode: active.length ? 'existing' : 'new',
			leagueId: active.length === 1 ? active[0].id : ''
		};
	}
	const defaults = untrack(() => leagueDefaults(leagues));
	let step = $state(initial ? 2 : 0);
	let mode = $state(initial?.mode ?? defaults.mode);
	let leagueName = $state(initial?.leagueName ?? '');
	let leagueId = $state(initial?.leagueId ?? defaults.leagueId);
	let seasonName = $state(initial?.seasonName ?? '');
	let startsOn = $state(initial?.startsOn ?? '');
	let endsOn = $state(initial?.endsOn ?? '');
	let purseAmount = $state(initial?.purseAmount ?? '');
	let validation = $state('');
	let pending = $state(false);
	let heading = $state<HTMLHeadingElement>();
	let errorMessage = $state<HTMLParagraphElement>();
	const activeLeagues = $derived(leagues.filter((league) => league.status === 'active'));
	const selectedLeague = $derived(activeLeagues.find((league) => league.id === leagueId));
	const steps = ['League', 'Season', 'Review'];
	const leagueNameLength = $derived(leagueName.trim().length);
	const validLeagueName = $derived(leagueNameLength >= 3 && leagueNameLength <= 120);
	const canAdvanceLeague = $derived(mode === 'new' ? validLeagueName : Boolean(selectedLeague));

	async function move(next: number) {
		step = next;
		validation = '';
		await tick();
		heading?.focus();
	}
	async function advance() {
		validation = '';
		if (step === 0) {
			if (mode === 'new' && !validLeagueName)
				validation = 'Enter a league name of 3–120 characters.';
			else if (mode === 'existing' && !selectedLeague) validation = 'Choose an active league.';
		} else if (step === 1) {
			if (!seasonName.trim() || seasonName.trim().length > 120)
				validation = 'Enter a season name of 1–120 characters.';
			else if (startsOn && endsOn && startsOn > endsOn)
				validation = 'The season start must be on or before its end.';
			else {
				const purse = parseSeasonPurse(purseAmount);
				if (!purse.ok) validation = purse.message;
			}
		}
		if (validation) {
			await tick();
			errorMessage?.focus();
			return;
		}
		await move(step + 1);
	}
	function clearAfterSuccess() {
		step = 0;
		const next = leagueDefaults(leagues);
		mode = next.mode;
		leagueName = '';
		leagueId = next.leagueId;
		seasonName = '';
		startsOn = '';
		endsOn = '';
		purseAmount = '';
		validation = '';
	}
</script>

<section
	class="flex flex-col gap-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4 sm:p-6"
	aria-label="League and season setup"
>
	<div>
		<h2 class="text-xl font-semibold">Set up a league and season</h2>
		<p class="mt-2 text-sm text-muted-foreground">
			Enter the league, then its season, and review before saving. Next and Back save nothing.
			Refreshing resets unfinished answers. Add another season by choosing an existing league.
		</p>
	</div>
	<noscript
		><p>
			This step-by-step form requires JavaScript. Existing records can still be viewed below.
		</p></noscript
	>
	{#if feedback?.setupLeagueSeasonCreated}
		<p
			role="status"
			class="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-950"
		>
			Saved: {String(feedback.leagueName)} → {String(feedback.seasonName)}. The lists below have
			updated. Return to the organization overview to refresh its setup guide.
		</p>
	{/if}
	{#if feedback?.message}<p
			role="alert"
			class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-950"
		>
			{String(feedback.message)}
		</p>{/if}
	<ol class="grid list-none grid-cols-3 gap-1 p-0 sm:gap-2" aria-label="Setup progress">
		{#each steps as label, index (label)}
			<li
				aria-current={step === index ? 'step' : undefined}
				class="flex min-w-0 items-center justify-between gap-1 rounded-lg border px-2 py-2 text-xs font-medium sm:px-3 sm:text-sm {step === index
					? 'border-blue-700 bg-linear-to-r from-blue-800 to-indigo-700 text-white shadow-sm'
					: step > index
						? 'border-blue-200 bg-blue-100 text-blue-950'
						: 'border-slate-200 bg-slate-50 text-slate-600'}"
			>
				<span class="inline-flex items-center gap-1">
					{#if step > index}
						<Check class="size-3.5 shrink-0" aria-hidden="true" />
						<span class="sr-only">Completed:</span>
					{:else}
						<span class="tabular-nums">{index + 1}.</span>
					{/if}
					{label}
				</span>
				{#if index < steps.length - 1}
					<ChevronRight class="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
				{/if}
			</li>
		{/each}
	</ol>
	<h3 bind:this={heading} tabindex="-1" class="text-lg font-semibold focus:outline-none">
		{step === 0 ? 'Which league?' : step === 1 ? 'Set up the season' : 'Review before saving'}
	</h3>
	{#if validation}<p
			bind:this={errorMessage}
			tabindex="-1"
			role="alert"
			class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-950"
		>
			{validation}
		</p>{/if}
	{#if step === 0}
		{#if activeLeagues.length > 0}
			<fieldset class="grid gap-3">
				<legend class="mb-2 text-sm font-medium">New or existing league</legend>
				<div class="grid gap-3 rounded-lg border bg-violet-50 p-4 {mode === 'existing' ? 'ring-2 ring-blue-600' : ''}">
					<label class="flex cursor-pointer items-start gap-3">
						<input class="mt-1" type="radio" name="league-setup-mode" value="existing" bind:group={mode} />
						<strong>Add a season to an existing league</strong>
					</label>
					{#if mode === 'existing'}
						<label for="setup-existing-league" class="text-sm font-medium">Existing league</label>
						<select
							id="setup-existing-league"
							bind:value={leagueId}
							class="min-h-11 w-full rounded-md border bg-background px-3 py-2"
						>
							<option value="">Select an active league</option>
							{#each activeLeagues as league (league.id)}
								<option value={league.id}>{league.name}</option>
							{/each}
						</select>
					{/if}
				</div>
				<label class="flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-4 {mode === 'new' ? 'ring-2 ring-blue-600' : ''}">
					<input class="mt-1" type="radio" name="league-setup-mode" value="new" bind:group={mode} />
					<span>
						<strong class="block">Create a new league and its first season</strong>
						<span class="text-sm">Both will be saved together after review.</span>
					</span>
				</label>
			</fieldset>
		{:else}
			<div>
				<p class="font-medium">Create a league and its first season</p>
				<p class="text-sm text-muted-foreground">Both will be saved together after review.</p>
			</div>
		{/if}
		{#if mode === 'new'}
			<label for="setup-league-name" class="font-medium">League name</label>
			<input
				id="setup-league-name"
				bind:value={leagueName}
				minlength="3"
				maxlength="120"
				aria-describedby="setup-league-name-help"
				class="min-h-11 w-full rounded-md border bg-background px-3 py-2"
				placeholder="Coastal Disc Golf League"
			/>
			<p id="setup-league-name-help" class="text-sm text-muted-foreground">Use 3–120 characters.</p>
		{/if}
	{:else if step === 1}
		<p class="text-sm">
			League: <strong>{mode === 'new' ? leagueName.trim() : selectedLeague?.name}</strong>
		</p>
		<div class="grid gap-4 sm:grid-cols-2">
			<div class="flex flex-col gap-2 sm:col-span-2">
				<label for="setup-season-name" class="font-medium">Season name</label><input
					id="setup-season-name"
					bind:value={seasonName}
					maxlength="120"
					class="min-h-11 rounded-md border bg-background px-3 py-2"
					placeholder="Spring 2027"
				/>
			</div>
			<div class="flex flex-col gap-2">
				<label for="setup-season-start" class="font-medium">Start date (optional)</label><input
					id="setup-season-start"
					type="date"
					bind:value={startsOn}
					class="min-h-11 rounded-md border bg-background px-3 py-2"
				/>
			</div>
			<div class="flex flex-col gap-2">
				<label for="setup-season-end" class="font-medium">End date (optional)</label><input
					id="setup-season-end"
					type="date"
					bind:value={endsOn}
					class="min-h-11 rounded-md border bg-background px-3 py-2"
				/>
			</div>
			<div class="flex flex-col gap-2 sm:col-span-2">
				<label for="setup-season-purse" class="font-medium">Season purse (USD, optional)</label
				><input
					id="setup-season-purse"
					inputmode="decimal"
					type="text"
					bind:value={purseAmount}
					aria-describedby="setup-purse-help"
					class="min-h-11 rounded-md border bg-background px-3 py-2"
					placeholder="Leave blank for no purse"
				/>
				<p id="setup-purse-help" class="text-xs text-muted-foreground">
					Use dollars with up to two decimals and no commas. Fantasy enrollment remains off.
				</p>
			</div>
		</div>
	{:else}
		<dl class="grid gap-3 rounded-lg border bg-white p-4 text-sm sm:grid-cols-2">
			<div>
				<dt class="font-medium">League</dt>
				<dd>
					{mode === 'new' ? leagueName.trim() : selectedLeague?.name} · {mode === 'new'
						? 'New league'
						: 'Existing league'}
				</dd>
			</div>
			<div>
				<dt class="font-medium">Season</dt>
				<dd>{seasonName.trim()} · Planned</dd>
			</div>
			<div>
				<dt class="font-medium">Dates</dt>
				<dd>{startsOn || 'No start date'} → {endsOn || 'No end date'}</dd>
			</div>
			<div>
				<dt class="font-medium">Purse</dt>
				<dd>{purseAmount.trim() ? `USD $${purseAmount.trim()}` : 'Not set'}</dd>
			</div>
		</dl>
		<p class="text-sm">
			{mode === 'new'
				? 'One submission creates the league and season together. If either cannot be saved, neither is created.'
				: 'This adds a season to the selected league without changing the league.'} No teams, events,
			or fantasy leagues will be created.
		</p>
	{/if}
	<div class="flex flex-wrap justify-between gap-3 border-t pt-4">
		<button
			type="button"
			disabled={step === 0 || pending}
			onclick={() => move(step - 1)}
			class="min-h-11 rounded-md border bg-white px-5 py-2 font-medium disabled:opacity-40"
			>Back</button
		>
		{#if step < 2}
			<button
				type="button"
				onclick={advance}
				disabled={step === 0 && !canAdvanceLeague}
				class="min-h-11 rounded-md bg-blue-700 px-5 py-2 font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-600"
				>{step === 1 ? 'Review' : 'Next'}</button
			>
		{:else}
			<form
				method="POST"
				{action}
				use:enhance={({ cancel }) => {
					if (pending) {
						cancel();
						return;
					}
					pending = true;
					return async ({ result, update }) => {
						try {
							if (onSaved) {
										const payload = result.type === 'success' || result.type === 'failure'
											? result.data : null;
										if (result.type === 'success' && payload?.setupLeagueSeasonCreated &&
											typeof payload.seasonId === 'string') {
											onSaved({
												id: payload.seasonId,
												name: String(payload.seasonName),
												leagueName: String(payload.leagueName)
											});
										} else {
											inlineFeedback = {
												message: payload?.message ?? 'Could not confirm the season was saved.'
											};
										}
										return;
									}
									await update({ reset: false });
							if (result.type === 'success' && result.data?.setupLeagueSeasonCreated) {
								clearAfterSuccess();
								await tick();
								heading?.focus();
							}
						} finally {
							pending = false;
						}
					};
				}}
			>
				<input type="hidden" name="mode" value={mode} /><input
					type="hidden"
					name="leagueName"
					value={leagueName.trim()}
				/><input type="hidden" name="leagueId" value={leagueId} /><input
					type="hidden"
					name="seasonName"
					value={seasonName.trim()}
				/><input type="hidden" name="startsOn" value={startsOn} /><input
					type="hidden"
					name="endsOn"
					value={endsOn}
				/><input type="hidden" name="purseAmount" value={purseAmount.trim()} />
				<button
					type="submit"
					disabled={pending}
					class="min-h-11 rounded-md bg-blue-700 px-5 py-2 font-medium text-white disabled:opacity-50"
					>{pending
						? 'Saving…'
						: mode === 'new'
							? 'Create league and season'
							: 'Create season'}</button
				>
			</form>
		{/if}
	</div>
</section>
