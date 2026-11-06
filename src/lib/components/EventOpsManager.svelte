<script lang="ts">
	import { CircleAlert, ClipboardCheck, Layers, Plus, UserMinus, Users } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	interface EventRow {
		id: string;
		season: string | null;
		seasonName: string | null;
		name: string;
		status: 'planned' | 'active' | 'completed' | 'archived';
	}
	interface Round {
		id: string;
		event: string;
		number: number;
		name: string | null;
		course: string | null;
		courseName: string | null;
		positionLabel: string | null;
		status: 'active' | 'archived';
	}
	interface Group {
		id: string;
		event: string;
		name: string;
		scorekeeper: string | null;
		scorekeeperName: string | null;
		status: 'active' | 'archived';
	}
	interface GroupTeam {
		id: string;
		group: string;
		event: string;
		entry: string;
		status: 'active' | 'archived';
	}
	interface GroupAthlete {
		id: string;
		group: string;
		event: string;
		entry: string;
		athlete: string;
		athleteName: string;
		status: 'active' | 'archived';
	}
	interface Entry {
		id: string;
		season: string;
		team: string;
		teamName: string;
		status: 'active' | 'archived';
	}
	interface RosterMembership {
		entry: string;
		athlete: string;
		athleteName: string;
		status: 'active' | 'archived';
	}
	interface Substitution {
		event: string;
		entry: string;
		athleteOut: string;
		athleteIn: string;
		athleteInName: string;
	}
	interface Member {
		userId: string;
		name: string;
		role: string;
	}
	interface CourseOption {
		id: string;
		name: string;
		/** Position labels on the course's active holes, with coverage. */
		labels: { label: string; total: number; missing: number[] }[];
	}

	interface Props {
		events: EventRow[];
		rounds: Round[];
		groups: Group[];
		groupTeams: GroupTeam[];
		groupAthletes: GroupAthlete[];
		entries: Entry[];
		rosterMemberships: RosterMembership[];
		substitutions: Substitution[];
		members: Member[];
		courses: CourseOption[];
		canManage: boolean;
		/** SvelteKit ActionData from the page's form actions (shape varies by action). */
		form: unknown;
	}

	let {
		events,
		rounds,
		groups,
		groupTeams,
		groupAthletes,
		entries,
		rosterMemberships,
		substitutions,
		members,
		courses,
		canManage,
		form
	}: Props = $props();

	let selectedEvent = $state('');
	let roundCourse = $state('');

	const roundCourseLabels = $derived(courses.find((c) => c.id === roundCourse)?.labels ?? []);

	const visibleEvents = $derived(events.filter((ev) => ev.status !== 'archived'));
	const event = $derived(
		visibleEvents.find((ev) => ev.id === selectedEvent) ?? visibleEvents[0] ?? null
	);

	const eventRounds = $derived(
		event ? rounds.filter((r) => r.event === event.id && r.status === 'active') : []
	);
	const eventGroups = $derived(event ? groups.filter((g) => g.event === event.id) : []);
	const activeGroupTeams = $derived(
		event ? groupTeams.filter((gt) => gt.event === event.id && gt.status === 'active') : []
	);
	const activeGroupAthletes = $derived(
		event ? groupAthletes.filter((ga) => ga.event === event.id && ga.status === 'active') : []
	);
	const seasonEntries = $derived(
		event && event.season
			? entries.filter((en) => en.season === event.season && en.status === 'active')
			: []
	);

	const entryName = (entryId: string) => entries.find((en) => en.id === entryId)?.teamName ?? '';
	const teamsOf = (groupId: string) => activeGroupTeams.filter((gt) => gt.group === groupId);
	const athletesOf = (groupId: string) => activeGroupAthletes.filter((ga) => ga.group === groupId);

	/** D15: a Viewer listed as a group's scorekeeper has no scoring access. */
	const scorekeeperRole = (userId: string | null) =>
		userId ? (members.find((m) => m.userId === userId)?.role ?? '') : '';
	const scorekeeperHasAccess = (userId: string | null) => {
		const role = scorekeeperRole(userId);
		return role === 'scorekeeper' || role === 'owner' || role === 'admin';
	};

	/** Entries not yet assigned to any active group of this event. */
	const unassignedEntries = $derived(
		seasonEntries.filter((en) => !activeGroupTeams.some((gt) => gt.entry === en.id))
	);

	/**
	 * Eligible athletes for a group, mirroring the server rule (D14): active
	 * roster members of the group's assigned entries, minus athletes
	 * substituted OUT for this event, plus reserves substituted IN for this
	 * event — minus anyone already in a group for this event. The hook
	 * re-enforces all of this on the backend.
	 */
	function eligibleFor(groupId: string) {
		if (!event) return [];
		const assignedEntryIds = teamsOf(groupId).map((gt) => gt.entry);
		const taken = new Set(activeGroupAthletes.map((ga) => ga.athlete));
		const out: { entry: string; athlete: string; name: string }[] = [];
		for (const entryId of assignedEntryIds) {
			const subbedOut = new Set(
				substitutions
					.filter((s) => s.event === event.id && s.entry === entryId)
					.map((s) => s.athleteOut)
			);
			for (const m of rosterMemberships) {
				if (m.entry !== entryId || m.status !== 'active') continue;
				if (subbedOut.has(m.athlete) || taken.has(m.athlete)) continue;
				out.push({ entry: entryId, athlete: m.athlete, name: m.athleteName });
			}
			for (const s of substitutions) {
				if (s.event !== event.id || s.entry !== entryId) continue;
				if (taken.has(s.athleteIn) || out.some((o) => o.athlete === s.athleteIn)) continue;
				out.push({ entry: entryId, athlete: s.athleteIn, name: `${s.athleteInName} (reserve)` });
			}
		}
		return out;
	}

	const formRecord = $derived(
		form && typeof form === 'object' ? (form as Record<string, unknown>) : null
	);
	const message = $derived(
		formRecord && 'message' in formRecord ? String(formRecord.message) : null
	);
</script>

<div class="flex flex-col gap-6">
	{#if message}
		<Alert.Root variant="destructive">
			<CircleAlert class="size-4" />
			<Alert.Title>Action failed</Alert.Title>
			<Alert.Description>{message}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if !event}
		<Card.Root>
			<Card.Content class="pt-6">
				<p class="text-sm text-muted-foreground">
					Rounds and groups attach to an event — create one above first.
				</p>
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="flex flex-wrap items-end gap-3">
			<div class="flex min-w-48 flex-col gap-1.5">
				<Label for="ops-event">Event operations for</Label>
				<select
					id="ops-event"
					class="h-9 rounded-md border bg-background px-2 text-sm"
					value={event.id}
					onchange={(e) => (selectedEvent = e.currentTarget.value)}
				>
					{#each visibleEvents as ev (ev.id)}
						<option value={ev.id}>{ev.name}{ev.seasonName ? ` · ${ev.seasonName}` : ''}</option>
					{/each}
				</select>
			</div>
		</div>

		<!-- Rounds -->
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<Layers class="size-5" />
					Rounds — {event.name}
				</Card.Title>
				<Card.Description>
					Ordered rounds distinguish round one from round two, with an optional course and position
					label (the demo plays red positions, an intermission, then blue).
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-2">
				{#if eventRounds.length === 0}
					<p class="text-sm text-muted-foreground">No rounds for this event yet.</p>
				{/if}
				{#each eventRounds as round, index (round.id)}
					{#if index > 0}
						<p class="pl-2 text-xs text-muted-foreground">— intermission —</p>
					{/if}
					<div class="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
						<div class="flex flex-wrap items-center gap-2 text-sm">
							<span class="font-medium">Round {round.number}</span>
							{#if round.name}<span>{round.name}</span>{/if}
							{#if round.positionLabel}
								<Badge variant="secondary">{round.positionLabel} positions</Badge>
							{/if}
							{#if round.courseName}
								<Badge variant="outline">{round.courseName}</Badge>
							{/if}
						</div>
						{#if canManage}
							<form method="POST" action="?/archiveRound">
								<input type="hidden" name="round" value={round.id} />
								<Button variant="ghost" size="sm" type="submit">Remove</Button>
							</form>
						{/if}
					</div>
				{/each}
				{#if canManage}
					<form
						method="POST"
						action="?/addRound"
						class="flex flex-wrap items-end gap-2 border-t pt-3"
					>
						<input type="hidden" name="event" value={event.id} />
						<div class="flex w-24 flex-col gap-1">
							<Label for="round-number" class="text-xs">Round #</Label>
							<Input
								id="round-number"
								name="number"
								type="number"
								min="1"
								step="1"
								required
								class="h-8"
							/>
						</div>
						<div class="flex min-w-36 flex-1 flex-col gap-1">
							<Label for="round-name" class="text-xs">Name (optional)</Label>
							<Input id="round-name" name="name" maxlength={120} class="h-8" />
						</div>
						<div class="flex min-w-36 flex-col gap-1">
							<Label for="round-course" class="text-xs">Course (optional)</Label>
							<select
								id="round-course"
								name="course"
								bind:value={roundCourse}
								class="h-8 rounded-md border bg-background px-2 text-sm"
							>
								<option value="" selected>No course</option>
								{#each courses as c (c.id)}
									<option value={c.id}>{c.name}</option>
								{/each}
							</select>
						</div>
						<div class="flex min-w-44 flex-col gap-1">
							<Label for="round-poslabel" class="text-xs">Positions (optional)</Label>
							{#if roundCourseLabels.length > 0}
								<!-- The organizer chooses from the positions that actually exist
								     on the selected course's holes. A named position must cover
								     EVERY active hole; incomplete labels are shown with their
								     coverage and missing holes, and cannot be selected. -->
								<select
									id="round-poslabel"
									name="positionLabel"
									class="h-8 rounded-md border bg-background px-2 text-sm"
								>
									<option value="" selected>Any / not specified</option>
									{#each roundCourseLabels as l (l.label)}
										{#if l.missing.length === 0}
											<option value={l.label}>{l.label} — all {l.total} holes</option>
										{:else}
											<option value={l.label} disabled>
												{l.label} — {l.total - l.missing.length}/{l.total} holes (missing hole {l.missing.join(
													', '
												)})
											</option>
										{/if}
									{/each}
								</select>
							{:else}
								<Input
									id="round-poslabel"
									name="positionLabel"
									maxlength={40}
									placeholder="red"
									class="h-8"
								/>
							{/if}
						</div>
						<Button variant="outline" size="sm" type="submit">
							<Plus class="mr-1 size-3.5" /> Add round
						</Button>
					</form>
				{/if}
			</Card.Content>
		</Card.Root>

		<!-- Groups -->
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<Users class="size-5" />
					Groups — {event.name}
				</Card.Title>
				<Card.Description>
					Teams join a group through their season entries; athletes come from those teams' season
					rosters plus this event's substitutions — a reserve appears only for the event where the
					substitution applies, and assignments never change the season roster. One scorekeeper per
					group (any member — score entry permissions arrive in Phase 1G).
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				{#if !event.season}
					<p class="text-sm text-muted-foreground">
						This is an independent event: groups can exist, but team and athlete assignment needs a
						season-linked event (season rosters are what assignments draw from).
					</p>
				{/if}
				{#if eventGroups.filter((g) => g.status === 'active').length === 0}
					<p class="text-sm text-muted-foreground">No groups for this event yet.</p>
				{/if}
				{#each eventGroups.filter((g) => g.status === 'active') as group (group.id)}
					<div class="flex flex-col gap-2 rounded-md border p-3">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<div class="flex items-center gap-2">
								<span class="font-medium">{group.name}</span>
								{#if group.scorekeeperName}
									<Badge variant="outline">
										<ClipboardCheck class="mr-1 size-3" />
										{group.scorekeeperName}
									</Badge>
									{#if !scorekeeperHasAccess(group.scorekeeper)}
										<Badge variant="secondary"
											>no scoring access ({scorekeeperRole(group.scorekeeper) ||
												'not a member'})</Badge
										>
									{/if}
								{:else}
									<Badge variant="secondary">No scorekeeper assigned</Badge>
								{/if}
							</div>
							<div class="flex flex-wrap items-center gap-2">
								{#if canManage}
									<form
										method="POST"
										action="?/setGroupScorekeeper"
										class="flex items-center gap-1"
									>
										<input type="hidden" name="group" value={group.id} />
										<select
											name="scorekeeper"
											class="h-8 rounded-md border bg-background px-2 text-sm"
											aria-label="Assign scorekeeper"
										>
											<option value="" selected={!group.scorekeeper}>No scorekeeper</option>
											{#each members as member (member.userId)}
												<option
													value={member.userId}
													selected={group.scorekeeper === member.userId}
												>
													{member.name} ({member.role})
												</option>
											{/each}
										</select>
										<Button variant="outline" size="sm" type="submit">Assign</Button>
									</form>
									<form method="POST" action="?/archiveGroup">
										<input type="hidden" name="group" value={group.id} />
										<Button variant="ghost" size="sm" type="submit">Archive group</Button>
									</form>
								{/if}
							</div>
						</div>

						<!-- Teams in this group -->
						<div class="flex flex-col gap-1 pl-2">
							{#each teamsOf(group.id) as gt (gt.id)}
								<div class="flex flex-wrap items-center justify-between gap-2 text-sm">
									<span>{entryName(gt.entry)}</span>
									{#if canManage}
										<form method="POST" action="?/removeGroupTeam">
											<input type="hidden" name="assignment" value={gt.id} />
											<Button variant="ghost" size="sm" type="submit">
												<UserMinus class="mr-1 size-3.5" /> Remove team
											</Button>
										</form>
									{/if}
								</div>
							{/each}
							{#if teamsOf(group.id).length === 0}
								<p class="text-sm text-muted-foreground">No teams in this group yet.</p>
							{/if}
							{#if canManage && event.season}
								{#if unassignedEntries.length > 0}
									<form
										method="POST"
										action="?/addGroupTeam"
										class="flex flex-wrap items-end gap-2"
									>
										<input type="hidden" name="group" value={group.id} />
										<div class="flex min-w-40 flex-col gap-1">
											<Label for="group-team-{group.id}" class="text-xs">Add team</Label>
											<select
												id="group-team-{group.id}"
												name="entry"
												required
												class="h-8 rounded-md border bg-background px-2 text-sm"
											>
												<option value="" disabled selected>Select a team</option>
												{#each unassignedEntries as en (en.id)}
													<option value={en.id}>{en.teamName}</option>
												{/each}
											</select>
										</div>
										<Button variant="outline" size="sm" type="submit">
											<Plus class="mr-1 size-3.5" /> Add team
										</Button>
									</form>
								{:else}
									<p class="text-xs text-muted-foreground">
										Every entered team is already assigned to a group for this event.
									</p>
								{/if}
							{/if}
						</div>

						<!-- Athletes in this group -->
						<div class="flex flex-col gap-1 border-t pt-2 pl-2">
							{#each athletesOf(group.id) as ga (ga.id)}
								<div class="flex flex-wrap items-center justify-between gap-2 text-sm">
									<span
										>{ga.athleteName}
										<span class="text-muted-foreground">({entryName(ga.entry)})</span></span
									>
									{#if canManage}
										<form method="POST" action="?/removeGroupAthlete">
											<input type="hidden" name="assignment" value={ga.id} />
											<Button variant="ghost" size="sm" type="submit">
												<UserMinus class="mr-1 size-3.5" /> Remove
											</Button>
										</form>
									{/if}
								</div>
							{/each}
							{#if athletesOf(group.id).length === 0}
								<p class="text-sm text-muted-foreground">No athletes in this group yet.</p>
							{/if}
							{#if canManage && event.season}
								{#if teamsOf(group.id).length === 0}
									<p class="text-xs text-muted-foreground">
										Assign a team first — athletes come from team rosters.
									</p>
								{:else if eligibleFor(group.id).length > 0}
									<form
										method="POST"
										action="?/addGroupAthlete"
										class="flex flex-wrap items-end gap-2"
									>
										<input type="hidden" name="group" value={group.id} />
										<div class="flex min-w-44 flex-col gap-1">
											<Label for="group-athlete-{group.id}" class="text-xs">Add athlete</Label>
											<select
												id="group-athlete-{group.id}"
												name="athlete-with-entry"
												required
												class="h-8 rounded-md border bg-background px-2 text-sm"
												onchange={(e) => {
													const [entryId, athleteId] = e.currentTarget.value.split('|');
													const f = e.currentTarget.form;
													(f?.querySelector('input[name="entry"]') as HTMLInputElement).value =
														entryId ?? '';
													(f?.querySelector('input[name="athlete"]') as HTMLInputElement).value =
														athleteId ?? '';
												}}
											>
												<option value="" disabled selected>Select an athlete</option>
												{#each eligibleFor(group.id) as option (option.entry + option.athlete)}
													<option value={`${option.entry}|${option.athlete}`}>
														{option.name} — {entryName(option.entry)}
													</option>
												{/each}
											</select>
										</div>
										<input type="hidden" name="entry" value="" />
										<input type="hidden" name="athlete" value="" />
										<Button variant="outline" size="sm" type="submit">
											<Plus class="mr-1 size-3.5" /> Add athlete
										</Button>
									</form>
								{:else}
									<p class="text-xs text-muted-foreground">
										No eligible athletes: only rostered athletes of assigned teams, or reserves
										brought in by a substitution for this event, can be assigned.
									</p>
								{/if}
							{/if}
						</div>
					</div>
				{/each}

				{#if canManage}
					<form
						method="POST"
						action="?/createGroup"
						class="flex flex-wrap items-end gap-3 border-t pt-4"
					>
						<input type="hidden" name="event" value={event.id} />
						<div class="flex min-w-44 flex-1 flex-col gap-1.5">
							<Label for="group-name">New group</Label>
							<Input id="group-name" name="name" required maxlength={80} placeholder="Group 1" />
						</div>
						<div class="flex min-w-44 flex-col gap-1.5">
							<Label for="group-scorekeeper">Scorekeeper (optional)</Label>
							<select
								id="group-scorekeeper"
								name="scorekeeper"
								class="h-9 rounded-md border bg-background px-2 text-sm"
							>
								<option value="" selected>No scorekeeper yet</option>
								{#each members as member (member.userId)}
									<option value={member.userId}>{member.name} ({member.role})</option>
								{/each}
							</select>
						</div>
						<Button type="submit">
							<Plus class="mr-1 size-4" /> Create group
						</Button>
					</form>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
