<script lang="ts">
	import { deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	const dev = import.meta.env.DEV;
	import { BadgeCheck, ClipboardList, DollarSign, Layers, Smartphone } from 'lucide-svelte';
	import { formatTournamentPurse } from '$lib/season-purse';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';

	interface ScoringEvent {
		id: string;
		name: string;
		seasonName: string | null;
		seasonId: string | null;
		tournamentPurseCents: number | null;
		roundCount: number;
		groupCount: number;
		submittedCount: number;
		scorecardCount: number;
		resultStatus: string | null;
		resultId: string | null;
		resultVersion: number | null;
	}

	interface Props {
		organizationId: string;
		scorekeepers: { id: string; name: string; email: string | null }[];
		pendingInvitations: { id: string; email: string; status: string }[];
		events: ScoringEvent[];
		canScore: boolean;
		myRole: string;
		form?: unknown;
	}

	let { organizationId, events, canScore, myRole, form, scorekeepers, pendingInvitations }: Props =
		$props();

	interface InvitationResult {
		email: string;
		link: string | null;
		message: string;
	}

	interface DemoScoringResult {
		id: string;
		message: string;
		ok: boolean;
	}

	const demoOperationLabels = {
		fill: 'Filling missing demo scores',
		submit: 'Submitting complete scorecards',
		undo: 'Undoing draft demo scores'
	};

	const invitationForm = $derived(
		form && typeof form === 'object'
			? (form as {
					scorekeeperInvitations?: InvitationResult[];
					scorekeeperInviteError?: string;
					scorekeeperActivationMessage?: string;
					demoScoringError?: string;
					demoScoringResults?: DemoScoringResult[];
				})
			: null
	);

	let demoSeason = $state('');
	let demoPanelOpen = $state(false);
	let demoPending = $state(false);
	let pendingResultEvent = $state('');
	let resultActionError = $state<{ id: string; message: string } | null>(null);
	const scoringBusy = $derived(demoPending || Boolean(pendingResultEvent));
	let batchResults = $state<DemoScoringResult[] | null>(null);
	let batchError = $state('');
	let progress = $state<{ label: string; total: number; currentEvent: string } | null>(null);
	const demoSeasons = $derived(
		new Map(events.flatMap((event) => event.seasonId && event.seasonName ? [[event.seasonId, event.seasonName] as const] : []))
	);
	const chosenDemoSeason = $derived(demoSeasons.has(demoSeason) ? demoSeason : demoSeasons.keys().next().value);
	const demoEvents = $derived(events.filter((event) => event.seasonId === chosenDemoSeason));
	const demoResults = $derived(new Map((batchResults ?? invitationForm?.demoScoringResults)?.map((row) => [row.id, row])));

	async function runDemoBatch(action: URL, formData: FormData, operation: keyof typeof demoOperationLabels) {
		const selected = [...demoEvents];
		const results: DemoScoringResult[] = [];
		batchResults = [];
		batchError = '';
		demoPending = true;
		progress = { label: demoOperationLabels[operation], total: selected.length, currentEvent: '' };

		try {
			for (const event of selected) {
				progress.currentEvent = event.name;
				formData.set('event', event.id);
				const response = await fetch(action, {
					method: 'POST',
					headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
					body: formData
				});
				const result = deserialize(await response.text());
				if (result.type === 'failure' && typeof result.data?.demoScoringError === 'string') {
					results.push({ id: event.id, ok: false, message: result.data.demoScoringError });
				} else if (result.type === 'success' && Array.isArray(result.data?.demoScoringResults)) {
					const outcome = result.data.demoScoringResults.find((row) => row.id === event.id);
					if (!outcome) throw new Error('Missing event outcome.');
					results.push(outcome);
				} else {
					throw new Error('Unexpected scoring response.');
				}
				batchResults = [...results];
			}
		} catch {
			batchError = `Couldn’t confirm the outcome for ${progress.currentEvent}. Remaining tournaments were skipped. Check its scorecards before retrying.`;
		} finally {
			progress.currentEvent = '';
			try {
				await invalidateAll();
			} catch {
				batchError += ' Refresh the page to update the scorecard counts.';
			} finally {
				demoPending = false;
			}
		}
	}

	const scorekeeperInvitePrompt = [
		'Extract scorekeeper email addresses from my list for FliHub.',
		'Return one email address per line, without a header, bullets, or Markdown fences.',
		'Remove duplicates. Do not invent missing email addresses.',
		'These three fictional addresses show the format:',
		'alex@example.com',
		'jordan@example.com',
		'sam@example.com',
		'',
		'My scorekeeper list:',
		'[Paste your list here]'
	].join('\n');

	let invitePromptField = $state<HTMLTextAreaElement>();
	let inviteCopyStatus = $state('');

	async function copyScorekeeperPrompt() {
		try {
			await navigator.clipboard.writeText(scorekeeperInvitePrompt);
			inviteCopyStatus = 'Copied. Paste into chat and add your scorekeeper list.';
		} catch {
			invitePromptField?.focus();
			invitePromptField?.select();
			inviteCopyStatus = 'Press Ctrl+C or Command+C to copy the selected prompt.';
		}
	}

	const demoEmails = [
		'alex@example.com',
		'jordan@example.com',
		'sam@example.com',
		'taylor@example.com',
		'casey@example.com',
		'morgan@example.com'
	];
</script>

<div class="flex flex-col gap-6">
	{#if invitationForm?.scorekeeperActivationMessage}
		<p role="status" class="text-sm">{invitationForm.scorekeeperActivationMessage}</p>
	{/if}

	{#if myRole === 'owner' || myRole === 'admin'}
		<details
			class="rounded-xl border-2 border-blue-200 bg-slate-50 p-4 shadow-sm"
			open={Boolean(
				invitationForm?.scorekeeperInviteError ||
				invitationForm?.scorekeeperInvitations ||
				invitationForm?.scorekeeperActivationMessage
			)}
		>
			<summary
				class="cursor-pointer rounded-lg bg-blue-900 px-4 py-3 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-4"
			>
				Bulk invite scorekeepers
			</summary>
			<div class="grid gap-4 pt-4">
				<Card.Root>
					<Card.Header>
						<Card.Description>
							Create Scorekeeper invitations for this organization. Copy each generated link and
							share it with its intended recipient. Each recipient needs a verified account with the
							invited email address and must accept before receiving access.
						</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-3">
						<textarea
							bind:this={invitePromptField}
							aria-label="Scorekeeper invitation chat prompt"
							readonly
							rows="9"
							value={scorekeeperInvitePrompt}
							class="w-full rounded-md border bg-background p-2 font-mono text-xs"></textarea>
						<Button type="button" onclick={copyScorekeeperPrompt}>Copy example for chat</Button>
						<p role="status" class="text-sm">{inviteCopyStatus}</p>

						<form
							method="POST"
							action="?/bulkInviteScorekeepers"
							class="flex flex-col items-start gap-2"
						>
							<label for="scorekeeper-emails" class="text-sm font-medium"
								>Paste scorekeeper emails</label
							>
							<p id="scorekeeper-email-help" class="text-sm text-muted-foreground">
								One email per line. Skip commas, bullets, and the header. Paste the chat reply
								as-is. Limit 50 emails per batch.
							</p>
							<textarea
								id="scorekeeper-emails"
								name="csv"
								required
								rows="6"
								aria-describedby="scorekeeper-email-help"
								placeholder="alex@example.com&#10;jordan@example.com&#10;sam@example.com"
								class="w-full rounded-md border bg-background p-2 font-mono text-sm"></textarea>
							<Button type="submit" class="bg-green-700 text-white hover:bg-green-800">Create scorekeeper invitations</Button>
						</form>

						{#if invitationForm?.scorekeeperInviteError}
							<p role="alert" class="text-sm text-destructive">
								{invitationForm.scorekeeperInviteError}
							</p>
						{/if}

						{#if invitationForm?.scorekeeperInvitations}
							<p role="status" class="text-sm">Batch complete. Review each result below.</p>
							<p class="text-sm text-muted-foreground">
								Copy the generated links before leaving this page. Invitation emails are not sent
								automatically. Assign accepted members to event groups on the Events page.
							</p>
							{#each invitationForm.scorekeeperInvitations as result (result.email)}
								<div class="space-y-2 rounded-md border p-3">
									<p class="text-sm font-medium">{result.email}</p>
									<p class="text-sm">{result.message}</p>
									{#if result.link}
										<label class="flex flex-col gap-1 text-sm">
											Invitation link — select and copy
											<input
												readonly
												value={result.link}
												onclick={(event) => event.currentTarget.select()}
												class="w-full rounded-md border bg-background p-2 text-sm"
											/>
										</label>
									{/if}
								</div>
							{/each}
						{/if}
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Header>
						<Card.Title>Scorekeepers ({scorekeepers.length})</Card.Title>
						<Card.Description>
							Active members can be assigned to event groups on the Events page. Invited people
							receive access after accepting their invitation.
						</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-4">
						{#if scorekeepers.length === 0}
							<p class="text-sm text-muted-foreground">No active scorekeepers yet.</p>
						{/if}
						{#each scorekeepers as keeper (keeper.id)}
							<div class="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
								<div class="text-sm">
									<p class="font-medium">{keeper.name}</p>
									{#if keeper.email}
										<p class="text-muted-foreground">{keeper.email}</p>
									{/if}
								</div>
								<Badge variant="secondary">Active member</Badge>
							</div>
						{/each}

						<h3 class="text-sm font-medium">Invitations ({pendingInvitations.length})</h3>
						{#if pendingInvitations.length === 0}
							<p class="text-sm text-muted-foreground">No pending or expired invitations.</p>
						{/if}
						{#each pendingInvitations as invitation (invitation.id)}
							<div class="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
								<span class="text-sm">{invitation.email}</span>

								<Badge variant="outline">{invitation.status}</Badge>
								{#if dev && organizationId === '4ksk16f64guhf21' && demoEmails.includes(invitation.email) && invitation.status === 'Pending invitation'}
									<form method="POST" action="?/activateDemoScorekeeper">
										<input type="hidden" name="invitation" value={invitation.id} />
										<Button type="submit" size="sm" variant="outline"
											>Activate demo scorekeeper</Button
										>
									</form>
								{/if}
							</div>
						{/each}
					</Card.Content>
				</Card.Root>
			</div>
		</details>
	{/if}

	{#if dev && (myRole === 'owner' || myRole === 'admin') && demoSeasons.size}
		<details
			class="rounded-md border-2 border-amber-300 bg-amber-50 text-amber-950"
			bind:open={demoPanelOpen}
		>
			<summary class="cursor-pointer rounded-md p-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">
				<Layers class="mr-1 size-5 inline-block align-middle" aria-hidden="true" />
				Demo testing — enter entire season scores
			</summary>
			<div class="space-y-4 px-4 pb-4">
				<p class="text-sm">
					Generate missing test scores for the selected season. Existing scores are preserved and
					submitted cards are skipped. Review the scorecards before submitting. Approval and
					publication remain separate. Undo clears untouched scores generated here while their scorecards
					are still drafts.
				</p>
				<form method="POST" action="?/scoreSeasonDemo" class="space-y-4" use:enhance={({ action, cancel, formData, submitter }) => {
					const operation = submitter?.getAttribute('value');
					if (scoringBusy) {
						cancel();
						return;
					}
					const resultEventId = submitter?.getAttribute('data-result-event');
					if (resultEventId) {
						const event = demoEvents.find((item) => item.id === resultEventId);
						const publishing = submitter?.getAttribute('name') === 'result';
						const verb = publishing ? 'Publish' : 'Approve';
						if (!event || !confirm(`${verb} the result for ${event.name}?`)) {
							cancel();
							return;
						}
						pendingResultEvent = event.id;
						resultActionError = null;
						return async ({ result }) => {
							try {
								if (result.type === 'success') {
									await invalidateAll();
								} else {
									resultActionError = {
										id: event.id,
										message: result.type === 'failure' && typeof result.data?.message === 'string'
											? result.data.message
											: `${verb} action could not be confirmed. Open Official results to check the event.`
									};
								}
							} catch {
								resultActionError = { id: event.id, message: 'Refresh the page to check the current result status.' };
							} finally {
								pendingResultEvent = '';
							}
						};
					}
					cancel();
					if (operation !== 'fill' && operation !== 'submit' && operation !== 'undo') return;
					if (operation === 'undo' && !confirm('Clear untouched draft scores generated by this season tool?')) return;
					formData.set('operation', operation);
					void runDemoBatch(action, formData, operation);
				}}>
					<label class="grid w-fit gap-1 text-sm font-medium">
						Season
						<select name="season" class="rounded-md border bg-white px-3 py-2" value={chosenDemoSeason} disabled={scoringBusy} onchange={(event) => {
							demoSeason = event.currentTarget.value;
							progress = null;
							batchResults = [];
							batchError = '';
						}}>
							{#each demoSeasons as [id, name] (id)}
								<option value={id}>{name}</option>
							{/each}
						</select>
					</label>
					<ul class="grid gap-2">
						{#each demoEvents as event (event.id)}
							{@const result = demoResults.get(event.id)}
							{@const resultsUrl = resolve('/(app)/organizations/[id]/events/[event]/results', { id: organizationId, event: event.id })}
							{@const expectedCards = event.roundCount * event.groupCount}
							<li class="grid gap-1 rounded-md border bg-white p-3 text-sm">
								<input type="hidden" name="event" value={event.id} />
								<a class="font-semibold text-blue-800 underline" href={resolve('/(app)/organizations/[id]/events/[event]/score', { id: organizationId, event: event.id })}>{event.name}</a>
								<span>{event.submittedCount}/{expectedCards} scorecards submitted</span>
								<div class="mt-1 flex flex-wrap items-center gap-2">
									<Button href={resultsUrl} variant="outline" size="sm">Review results</Button>
									{#if event.resultStatus}
										<Badge variant="outline" class="capitalize">
											{event.resultStatus === 'correcting' ? 'Under correction' : event.resultStatus}
										</Badge>
										{#if event.resultStatus === 'approved' && event.resultId}
											<Button
												type="submit"
												size="sm"
												name="result"
												value={event.resultId}
												formaction={resultsUrl + '?/publishResult'}
												data-result-event={event.id}
												class="bg-green-700 text-white hover:bg-green-800"
												disabled={scoringBusy}
											>
												{pendingResultEvent === event.id ? 'Publishing…' : 'Publish result'}
											</Button>
										{/if}
									{:else if expectedCards > 0 && event.submittedCount === expectedCards}
										<Button
											type="submit"
											size="sm"
											formaction={resultsUrl + '?/approveResult'}
											data-result-event={event.id}
											class="bg-blue-700 text-white hover:bg-blue-800"
											disabled={scoringBusy}
										>
											<BadgeCheck class="size-4" aria-hidden="true" />
											{pendingResultEvent === event.id ? 'Approving…' : 'Approve result'}
										</Button>
									{/if}
								</div>
								{#if resultActionError?.id === event.id}
									<p role="alert" class="text-red-800">{resultActionError.message}</p>
								{/if}
								{#if result}<span class={result.ok ? 'text-green-800' : 'text-red-800'}>{result.message}</span>{/if}
							</li>
						{/each}
					</ul>
					<div class="flex flex-wrap gap-2">
						<Button type="submit" name="operation" value="fill" disabled={scoringBusy} class="bg-blue-700 text-white hover:bg-blue-800">Fill missing demo scores</Button>
						<Button type="submit" name="operation" value="submit" disabled={scoringBusy} class="bg-green-700 text-white hover:bg-green-800">Submit complete scorecards</Button>
						<Button type="submit" name="operation" value="undo" disabled={scoringBusy} variant="outline" class="border-orange-400 text-orange-900 hover:bg-orange-100 hover:text-orange-950">Undo draft demo scores</Button>
					</div>
					{#if invitationForm?.demoScoringError}<p role="alert" class="text-sm text-red-800">{invitationForm.demoScoringError}</p>{/if}
					{#if progress}
						{@const finished = batchResults?.length ?? 0}
						<div class="space-y-2 rounded-lg border border-amber-300 bg-white p-3 text-sm">
							<label for="demo-scoring-progress" class="font-semibold">{progress.label}</label>
							<progress id="demo-scoring-progress" class="block h-3 w-full accent-blue-700" value={finished} max={progress.total}></progress>
							<p role="status">
								{finished} of {progress.total} tournaments processed.
								{#if progress.currentEvent}
									Working on {progress.currentEvent}…
								{:else if demoPending}
									Refreshing scorecard counts…
								{:else if finished === progress.total}
									{batchResults?.filter((result) => !result.ok).length ?? 0} need attention.
								{/if}
							</p>
						</div>
					{/if}
					{#if batchError}<p role="alert" class="text-sm text-red-800">{batchError}</p>{/if}
				</form>
			</div>
		</details>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<Smartphone class="size-5" />
				Mobile scorekeeping
			</Card.Title>
			<Card.Description>
				Phone-first stroke entry with a Draft → Submitted lifecycle. Entry needs the Scorekeeper
				role plus a group assignment in the event (Owners/Admins may also enter); missing scores
				never count as zero. Owners/Admins approve and publish official results — corrections reopen
				with a recorded reason and require reapproval.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-2">
			{#if events.length === 0}
				<p class="text-sm text-muted-foreground">
					No event is ready for scoring yet — an event needs at least one round (with a course) and
					one group, set up on the Events page.
				</p>
			{/if}
			{#each events as event (event.id)}
				<div class="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-white p-3 even:bg-slate-300">
					<div class="flex flex-col">
						<span class="flex items-center gap-2 font-medium">
							{event.name}
							{#if event.seasonName}
								<Badge variant="outline">{event.seasonName}</Badge>
							{/if}
							{#if event.resultStatus}
								<Badge variant={event.resultStatus === 'published' ? 'default' : 'secondary'}>
									{event.resultStatus === 'correcting'
										? 'result under correction'
										: `result ${event.resultStatus}`} · v{event.resultVersion}
								</Badge>
							{/if}
						</span>
						<span class="text-sm text-muted-foreground">
							{event.roundCount} round{event.roundCount === 1 ? '' : 's'} ·
							{event.groupCount} group{event.groupCount === 1 ? '' : 's'} ·
							{event.submittedCount}/{event.scorecardCount || event.roundCount * event.groupCount}
							scorecards submitted
							{#if event.tournamentPurseCents !== null}
								<Badge variant="outline" class="ml-1 gap-1 border-green-900 bg-green-900 font-extrabold text-white">
									<DollarSign class="size-3" aria-hidden="true" />
									<span class="sr-only">Tournament purse: </span>{formatTournamentPurse(event.tournamentPurseCents)}
								</Badge>
							{/if}
						</span>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic in-app path assembled from validated ids -->
						<Button
							size="sm"
							class="bg-blue-700 text-white hover:bg-blue-800"
							href={`/organizations/${organizationId}/events/${event.id}/score`}
						>
							<ClipboardList class="mr-1 size-4" />
							Open scoring
						</Button>
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic in-app path assembled from validated ids -->
						<Button
							size="sm"
							variant="outline"
							href={`/organizations/${organizationId}/events/${event.id}/results`}
							style="background-color: #16a34a; color: white;"
						>
							<BadgeCheck class="mr-1 size-4" />
							Official results
						</Button>
					</div>
				</div>
			{/each}
			{#if !canScore && events.length > 0}
				<p class="text-sm text-muted-foreground">
					Your role ({myRole}) can view scoring but not enter scores.
				</p>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
