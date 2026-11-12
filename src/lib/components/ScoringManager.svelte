<script lang="ts">
	const dev = import.meta.env.DEV;
	import { BadgeCheck, ClipboardList, Smartphone } from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';

	interface ScoringEvent {
		id: string;
		name: string;
		seasonName: string | null;
		roundCount: number;
		groupCount: number;
		submittedCount: number;
		scorecardCount: number;
		resultStatus: string | null;
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

	const invitationForm = $derived(
		form && typeof form === 'object'
			? (form as {
					scorekeeperInvitations?: InvitationResult[];
					scorekeeperInviteError?: string;
					scorekeeperActivationMessage?: string;
				})
			: null
	);

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
		<Card.Root>
			<Card.Header>
				<Card.Title>Bulk invite scorekeepers</Card.Title>
				<Card.Description>
					Create Scorekeeper invitations for this organization. Copy each generated link and share
					it with its intended recipient. Each recipient needs a verified account with the invited
					email address and must accept before receiving access.
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
						One email per line. Skip commas, bullets, and the header. Paste the chat reply as-is.
						Limit 50 emails per batch.
					</p>
					<textarea
						id="scorekeeper-emails"
						name="csv"
						required
						rows="6"
						aria-describedby="scorekeeper-email-help"
						placeholder="alex@example.com&#10;jordan@example.com&#10;sam@example.com"
						class="w-full rounded-md border bg-background p-2 font-mono text-sm"></textarea>
					<Button type="submit">Create scorekeeper invitations</Button>
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
	{/if}

	{#if myRole === 'owner' || myRole === 'admin'}
		<Card.Root>
			<Card.Header>
				<Card.Title>Scorekeepers ({scorekeepers.length})</Card.Title>
				<Card.Description>
					Active members can be assigned to event groups on the Events page. Invited people receive
					access after accepting their invitation.
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
								<Button type="submit" size="sm" variant="outline">Activate demo scorekeeper</Button>
							</form>
						{/if}
					</div>
				{/each}
			</Card.Content>
		</Card.Root>
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
				<div class="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
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
						</span>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic in-app path assembled from validated ids -->
						<Button size="sm" href={`/organizations/${organizationId}/events/${event.id}/score`}>
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
