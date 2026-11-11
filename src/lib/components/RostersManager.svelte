<script lang="ts">
	import {
		ArchiveRestore,
		ArrowRightLeft,
		CircleAlert,
		ClipboardList,
		Plus,
		UserMinus,
		Users
	} from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	interface Season {
		id: string;
		name: string;
		status: 'planned' | 'active' | 'completed' | 'archived';
	}
	interface Entry {
		id: string;
		season: string;
		team: string;
		teamName: string;
		status: 'active' | 'archived';
	}
	interface Athlete {
		id: string;
		name: string;
		gender: string | null;
		status: 'active' | 'archived';
	}
	interface Membership {
		id: string;
		entry: string;
		season: string;
		athlete: string;
		athleteName: string;
		status: 'active' | 'archived';
	}
	interface Pool {
		id: string;
		season: string;
		name: string;
		gender: string | null;
		status: 'active' | 'archived';
	}
	interface ReserveMember {
		id: string;
		pool: string;
		season: string;
		athlete: string;
		athleteName: string;
		status: 'active' | 'archived';
	}
	interface Substitution {
		id: string;
		event: string;
		eventName: string;
		entry: string;
		teamName: string;
		athleteOutName: string;
		athleteInName: string;
		reason: string | null;
		created: string;
	}
	interface SeasonEvent {
		id: string;
		season: string;
		name: string;
	}

	interface Props {
		seasons: Season[];
		entries: Entry[];
		athletes: Athlete[];
		memberships: Membership[];
		pools: Pool[];
		reserves: ReserveMember[];
		substitutions: Substitution[];
		events: SeasonEvent[];
		canManage: boolean;
		/** SvelteKit ActionData from the page's form actions (shape varies by action). */
		form: unknown;
	}

	let {
		seasons,
		entries,
		athletes,
		memberships,
		pools,
		reserves,
		substitutions,
		events,
		canManage,
		form
	}: Props = $props();

	let selectedSeason = $state('');
	let subEntry = $state('');

	const visibleSeasons = $derived(seasons.filter((s) => s.status !== 'archived'));
	const season = $derived(
		visibleSeasons.find((s) => s.id === selectedSeason) ?? visibleSeasons[0] ?? null
	);

	const seasonEntries = $derived(season ? entries.filter((en) => en.season === season.id) : []);
	const seasonPools = $derived(season ? pools.filter((p) => p.season === season.id) : []);
	const seasonEvents = $derived(season ? events.filter((ev) => ev.season === season.id) : []);
	const seasonSubs = $derived(
		season ? substitutions.filter((s) => seasonEntries.some((en) => en.id === s.entry)) : []
	);

	const membersOf = (entryId: string) => memberships.filter((m) => m.entry === entryId);
	const reservesOf = (poolId: string) => reserves.filter((r) => r.pool === poolId);

	/** Athletes with no active spot (roster or reserve) in the shown season. */
	const availableAthletes = $derived(
		season
			? athletes.filter(
					(a) =>
						a.status === 'active' &&
						!memberships.some(
							(m) => m.season === season.id && m.athlete === a.id && m.status === 'active'
						) &&
						!reserves.some(
							(r) => r.season === season.id && r.athlete === a.id && r.status === 'active'
						)
				)
			: []
	);

	const poolCandidates = (pool: Pool) =>
		availableAthletes.filter((a) => !pool.gender || a.gender === pool.gender);

	const subRosterOptions = $derived(
		memberships.filter((m) => m.entry === subEntry && m.status === 'active')
	);
	const subReserveOptions = $derived(
		season ? reserves.filter((r) => r.season === season.id && r.status === 'active') : []
	);

	const formRecord = $derived(
		form && typeof form === 'object' ? (form as Record<string, unknown>) : null
	);
	const message = $derived(
		formRecord && 'message' in formRecord ? String(formRecord.message) : null
	);

	const rosterImportPrompt = [
		'Convert my team rosters into CSV for FliHub.',
		'Column order: team,firstName,lastName.',
		'Return one athlete assignment per line, without a header or Markdown fences.',
		'Repeat the team name for each athlete on that team.',
		'Use existing team and athlete names exactly. Do not invent athletes.',
		'Remove repeated copies of the same assignment.',
		'Do not put commas or quotes inside fields.',
		'These three rows show the format:',
		'Ace Makers,Simon,Lizotte',
		'Ace Makers,Kat,Mertsch',
		'Birdie Storm,Isaac,Robinson',
		'',
		'My team rosters:',
		'[Paste your teams and athletes here]'
	].join('\n');

	let rosterPromptField = $state<HTMLTextAreaElement>();
	let rosterCopyStatus = $state('');

	async function copyRosterImportPrompt() {
		try {
			await navigator.clipboard.writeText(rosterImportPrompt);
			rosterCopyStatus = 'Copied. Paste into chat and add your team rosters.';
		} catch {
			rosterPromptField?.focus();
			rosterPromptField?.select();
			rosterCopyStatus = 'Press Ctrl+C or Command+C to copy the selected prompt.';
		}
	}
</script>

<div class="flex flex-col gap-6">
	{#if message}
		<Alert.Root variant="destructive">
			<CircleAlert class="size-4" />
			<Alert.Title>Action failed</Alert.Title>
			<Alert.Description>{message}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if visibleSeasons.length === 0}
		<Card.Root>
			<Card.Content class="pt-6">
				<p class="text-sm text-muted-foreground">
					Season rosters need a season first — create a league and season on the Leagues &amp;
					seasons page, then enter teams into it.
				</p>
			</Card.Content>
		</Card.Root>
	{:else if season}
		<div class="flex flex-wrap items-end gap-3">
			<div class="flex min-w-48 flex-col gap-1.5">
				<Label for="roster-season">Season</Label>
				<select
					id="roster-season"
					class="h-9 rounded-md border bg-background px-2 text-sm"
					value={season.id}
					onchange={(e) => (selectedSeason = e.currentTarget.value)}
				>
					{#each visibleSeasons as s (s.id)}
						<option value={s.id}>{s.name}</option>
					{/each}
				</select>
			</div>
		</div>


		{#if canManage}
			<Card.Root>
				<Card.Header>
					<Card.Title>Import season rosters — {season.name}</Card.Title>
					<Card.Description>
						Enter teams into this season and add athletes before importing.
						Copy the prompt into chat, add your roster list, then paste the reply below.
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-3">
					<textarea
						bind:this={rosterPromptField}
						aria-label="Roster import chat prompt"
						readonly
						rows="9"
						value={rosterImportPrompt}
						class="w-full rounded-md border bg-background p-2 font-mono text-xs"
					></textarea>
					<Button type="button" onclick={copyRosterImportPrompt}>Copy example for chat</Button>
					<p role="status" class="text-sm">{rosterCopyStatus}</p>
					<form method="POST" action="?/importRosters" class="flex flex-col items-start gap-2">
						<input type="hidden" name="season" value={season.id} />
						<Label for="roster-csv">Paste roster CSV</Label>
						<p id="roster-csv-help" class="text-sm text-muted-foreground">
							One athlete per line. Use team, first name, last name separated by commas.
							Repeat the team name for every athlete. Skip the header and paste the reply as-is.
							Existing matching assignments are skipped.
						</p>
						<textarea
							id="roster-csv"
							name="csv"
							required
							rows="10"
							aria-describedby="roster-csv-help"
							placeholder={'Ace Makers,Simon,Lizotte\nAce Makers,Kat,Mertsch\nBirdie Storm,Isaac,Robinson'}
							class="w-full rounded-md border bg-background p-2 font-mono text-sm"
						></textarea>
						<Button
							type="submit"
							disabled={!seasonEntries.some((entry) => entry.status === 'active')}
						>Import rosters</Button>
					</form>
					{#if formRecord && typeof formRecord.rostersImported === 'number'}
						<p role="status" class="text-sm">
							{formRecord.rostersImported} assignments added.
							{String(formRecord.rostersSkipped ?? 0)} existing assignments skipped.
						</p>
					{/if}
				</Card.Content>
			</Card.Root>
		{/if}

<!-- Season roster: one card section per team entry -->
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<ClipboardList class="size-5" />
					Season roster — {season.name}
				</Card.Title>
				<Card.Description>
					Athletes are assigned to a team's season entry, so participation history is kept per
					season. Removed members stay listed as past members — history is never rewritten.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				{#if seasonEntries.length === 0}
					<p class="text-sm text-muted-foreground">
						No teams are entered into this season yet. Enter teams on the Leagues &amp; seasons
						page.
					</p>
				{/if}
				{#each seasonEntries as entry (entry.id)}
					<div
						class="flex flex-col gap-2 rounded-md border p-3 {entry.status === 'archived'
							? 'opacity-60'
							: ''}"
					>
						<div class="flex items-center gap-2">
							<span class="font-medium">{entry.teamName}</span>
							{#if entry.status === 'archived'}
								<Badge variant="secondary">Withdrawn</Badge>
							{/if}
						</div>
						{#if membersOf(entry.id).length === 0}
							<p class="text-sm text-muted-foreground">No athletes on this roster yet.</p>
						{/if}
						{#each membersOf(entry.id) as member (member.id)}
							<div class="flex flex-wrap items-center justify-between gap-2 pl-2">
								<div
									class="flex items-center gap-2 text-sm {member.status === 'archived'
										? 'text-muted-foreground'
										: ''}"
								>
									<span>{member.athleteName}</span>
									{#if member.status === 'archived'}
										<Badge variant="outline">Past member</Badge>
									{/if}
								</div>
								{#if canManage && member.status === 'active'}
									<form method="POST" action="?/removeRosterMember">
										<input type="hidden" name="membership" value={member.id} />
										<Button variant="outline" size="sm" type="submit">
											<UserMinus class="mr-1 size-3.5" /> Remove
										</Button>
									</form>
								{:else if canManage}
									<form method="POST" action="?/restoreRosterMember">
										<input type="hidden" name="membership" value={member.id} />
										<Button variant="ghost" size="sm" type="submit">
											<ArchiveRestore class="mr-1 size-3.5" /> Restore
										</Button>
									</form>
								{/if}
							</div>
						{/each}
						{#if canManage && entry.status === 'active'}
							<form
								method="POST"
								action="?/addRosterMember"
								class="flex flex-wrap items-end gap-2 pt-1"
							>
								<input type="hidden" name="entry" value={entry.id} />
								<div class="flex min-w-44 flex-col gap-1.5">
									<Label for="roster-athlete-{entry.id}" class="text-xs">Add athlete</Label>
									<select
										id="roster-athlete-{entry.id}"
										name="athlete"
										required
										class="h-8 rounded-md border bg-background px-2 text-sm"
									>
										<option value="" disabled selected>Select an athlete</option>
										{#each availableAthletes as a (a.id)}
											<option value={a.id}>{a.name}</option>
										{/each}
									</select>
								</div>
								<Button variant="outline" size="sm" type="submit">
									<Plus class="mr-1 size-3.5" /> Add to roster
								</Button>
							</form>
						{/if}
					</div>
				{/each}
			</Card.Content>
		</Card.Root>

		<!-- Reserve pools -->
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<Users class="size-5" />
					Reserve pools — {season.name}
				</Card.Title>
				<Card.Description>
					Reserve pools are not teams: they never enter a season, so their athletes are excluded
					from ordinary scheduling. A pool's optional gender restriction is pilot configuration, not
					a universal rule. Reserve athletes join events only through a recorded substitution.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				{#if seasonPools.length === 0}
					<p class="text-sm text-muted-foreground">No reserve pools for this season yet.</p>
				{/if}
				{#each seasonPools as pool (pool.id)}
					<div
						class="flex flex-col gap-2 rounded-md border p-3 {pool.status === 'archived'
							? 'opacity-60'
							: ''}"
					>
						<div class="flex flex-wrap items-center justify-between gap-2">
							<div class="flex items-center gap-2">
								<span class="font-medium">{pool.name}</span>
								{#if pool.gender}
									<Badge variant="outline">{pool.gender} only</Badge>
								{/if}
								{#if pool.status === 'archived'}
									<Badge variant="secondary">Archived</Badge>
								{/if}
							</div>
							{#if canManage}
								{#if pool.status === 'active'}
									<form method="POST" action="?/archiveReservePool">
										<input type="hidden" name="pool" value={pool.id} />
										<Button variant="ghost" size="sm" type="submit">Archive pool</Button>
									</form>
								{:else}
									<form method="POST" action="?/unarchiveReservePool">
										<input type="hidden" name="pool" value={pool.id} />
										<Button variant="ghost" size="sm" type="submit">Restore pool</Button>
									</form>
								{/if}
							{/if}
						</div>
						{#if reservesOf(pool.id).length === 0}
							<p class="text-sm text-muted-foreground">No reserve athletes in this pool.</p>
						{/if}
						{#each reservesOf(pool.id) as member (member.id)}
							<div class="flex flex-wrap items-center justify-between gap-2 pl-2">
								<div
									class="flex items-center gap-2 text-sm {member.status === 'archived'
										? 'text-muted-foreground'
										: ''}"
								>
									<span>{member.athleteName}</span>
									{#if member.status === 'archived'}
										<Badge variant="outline">Past member</Badge>
									{/if}
								</div>
								{#if canManage && member.status === 'active'}
									<form method="POST" action="?/removeReserveMember">
										<input type="hidden" name="member" value={member.id} />
										<Button variant="outline" size="sm" type="submit">
											<UserMinus class="mr-1 size-3.5" /> Remove
										</Button>
									</form>
								{/if}
							</div>
						{/each}
						{#if canManage && pool.status === 'active'}
							<form
								method="POST"
								action="?/addReserveMember"
								class="flex flex-wrap items-end gap-2 pt-1"
							>
								<input type="hidden" name="pool" value={pool.id} />
								<div class="flex min-w-44 flex-col gap-1.5">
									<Label for="reserve-athlete-{pool.id}" class="text-xs">Add reserve athlete</Label>
									<select
										id="reserve-athlete-{pool.id}"
										name="athlete"
										required
										class="h-8 rounded-md border bg-background px-2 text-sm"
									>
										<option value="" disabled selected>Select an athlete</option>
										{#each poolCandidates(pool) as a (a.id)}
											<option value={a.id}>{a.name}</option>
										{/each}
									</select>
								</div>
								<Button variant="outline" size="sm" type="submit">
									<Plus class="mr-1 size-3.5" /> Add to pool
								</Button>
							</form>
						{/if}
					</div>
				{/each}

				{#if canManage}
					<form
						method="POST"
						action="?/createReservePool"
						class="flex flex-wrap items-end gap-3 border-t pt-4"
					>
						<input type="hidden" name="season" value={season.id} />
						<div class="flex min-w-44 flex-1 flex-col gap-1.5">
							<Label for="pool-name">New reserve pool</Label>
							<Input id="pool-name" name="name" required maxlength={120} placeholder="Pool name" />
						</div>
						<div class="flex min-w-36 flex-col gap-1.5">
							<Label for="pool-gender">Restriction (optional)</Label>
							<select
								id="pool-gender"
								name="gender"
								class="h-9 rounded-md border bg-background px-2 text-sm"
							>
								<option value="" selected>No restriction</option>
								<option value="male">Male only</option>
								<option value="female">Female only</option>
								<option value="other">Other only</option>
							</select>
						</div>
						<Button type="submit">
							<Plus class="mr-1 size-4" /> Create pool
						</Button>
					</form>
				{/if}
			</Card.Content>
		</Card.Root>

		<!-- Substitutions -->
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<ArrowRightLeft class="size-5" />
					Substitutions — {season.name}
				</Card.Title>
				<Card.Description>
					Append-only records of who replaced whom and for which event. A substitution never changes
					the season roster or the reserve pool — it applies to its event only.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				{#if seasonSubs.length === 0}
					<p class="text-sm text-muted-foreground">No substitutions recorded for this season.</p>
				{/if}
				{#each seasonSubs as sub (sub.id)}
					<div class="flex flex-col gap-1 rounded-md border p-3 text-sm">
						<div class="flex flex-wrap items-center gap-2">
							<span class="font-medium">{sub.eventName}</span>
							<Badge variant="outline">{sub.teamName}</Badge>
						</div>
						<p>
							{sub.athleteOutName}
							<span class="text-muted-foreground">replaced by</span>
							{sub.athleteInName}
						</p>
						{#if sub.reason}
							<p class="text-muted-foreground">Reason: {sub.reason}</p>
						{/if}
					</div>
				{/each}

				{#if canManage}
					{#if seasonEvents.length === 0}
						<p class="border-t pt-4 text-sm text-muted-foreground">
							Recording a substitution needs a season-linked event — create one on the Events page.
						</p>
					{:else}
						<form
							method="POST"
							action="?/recordSubstitution"
							class="flex flex-col gap-3 border-t pt-4"
						>
							<p class="text-sm font-medium">Record a substitution</p>
							<div class="flex flex-wrap items-end gap-3">
								<div class="flex min-w-40 flex-col gap-1.5">
									<Label for="sub-event" class="text-xs">Event</Label>
									<select
										id="sub-event"
										name="event"
										required
										class="h-9 rounded-md border bg-background px-2 text-sm"
									>
										<option value="" disabled selected>Select an event</option>
										{#each seasonEvents as ev (ev.id)}
											<option value={ev.id}>{ev.name}</option>
										{/each}
									</select>
								</div>
								<div class="flex min-w-40 flex-col gap-1.5">
									<Label for="sub-entry" class="text-xs">Team entry</Label>
									<select
										id="sub-entry"
										name="entry"
										required
										bind:value={subEntry}
										class="h-9 rounded-md border bg-background px-2 text-sm"
									>
										<option value="" disabled selected>Select a team</option>
										{#each seasonEntries.filter((en) => en.status === 'active') as en (en.id)}
											<option value={en.id}>{en.teamName}</option>
										{/each}
									</select>
								</div>
								<div class="flex min-w-40 flex-col gap-1.5">
									<Label for="sub-out" class="text-xs">Replaced (roster)</Label>
									<select
										id="sub-out"
										name="athleteOut"
										required
										class="h-9 rounded-md border bg-background px-2 text-sm"
									>
										<option value="" disabled selected>
											{subEntry ? 'Select an athlete' : 'Select a team first'}
										</option>
										{#each subRosterOptions as m (m.id)}
											<option value={m.athlete}>{m.athleteName}</option>
										{/each}
									</select>
								</div>
								<div class="flex min-w-40 flex-col gap-1.5">
									<Label for="sub-in" class="text-xs">Replacement (reserve)</Label>
									<select
										id="sub-in"
										name="athleteIn"
										required
										class="h-9 rounded-md border bg-background px-2 text-sm"
									>
										<option value="" disabled selected>Select a reserve athlete</option>
										{#each subReserveOptions as r (r.id)}
											<option value={r.athlete}>{r.athleteName}</option>
										{/each}
									</select>
								</div>
								<div class="flex min-w-44 flex-1 flex-col gap-1.5">
									<Label for="sub-reason" class="text-xs">Reason (optional)</Label>
									<Input id="sub-reason" name="reason" maxlength={500} />
								</div>
								<Button type="submit">
									<ArrowRightLeft class="mr-1 size-4" /> Record substitution
								</Button>
							</div>
						</form>
					{/if}
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
