<script lang="ts">
 import { formatSeasonPurse, seasonPurseInput } from '$lib/season-purse';
	import {
		CircleAlert,
		Pencil,
		Plus,
		Trophy,
		CalendarRange,
		Archive,
		ArchiveRestore
	} from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';

	interface League {
		id: string;
		name: string;
		status: 'active' | 'archived';
	}
	interface Season {
		id: string;
		league: string;
		leagueName: string;
		name: string;
		status: 'planned' | 'active' | 'completed' | 'archived';
		startsOn: string | null;
		endsOn: string | null;
 purseAmountCents: number | null;
 purseCurrency: string;
	}
	interface Division {
		id: string;
		season: string;
		name: string;
		status: 'active' | 'archived';
	}
	interface Entry {
		id: string;
		season: string;
		team: string;
		teamName: string;
		division: string | null;
		divisionName: string | null;
		status: 'active' | 'archived';
	}
	interface Team {
		id: string;
		name: string;
		status: 'active' | 'archived';
	}

	interface Props {
		leagues: League[];
		seasons: Season[];
		divisions: Division[];
		entries: Entry[];
		teams: Team[];
		canManage: boolean;
		myRole: string;
		/** SvelteKit ActionData from the page's form actions (shape varies by action). */
		form: unknown;
	}

	let { leagues, seasons, divisions, entries, teams, canManage, myRole, form }: Props = $props();

	let editingSeason = $state<Season | null>(null);
	let renamingLeague = $state<League | null>(null);

	const formRecord = $derived(
		form && typeof form === 'object' ? (form as Record<string, unknown>) : null
	);
	const message = $derived(
		formRecord && 'message' in formRecord ? String(formRecord.message) : null
	);

	const activeTeams = $derived(teams.filter((t) => t.status === 'active'));

	function divisionsOf(seasonId: string): Division[] {
		return divisions.filter((d) => d.season === seasonId);
	}
	function entriesOf(seasonId: string): Entry[] {
		return entries.filter((e) => e.season === seasonId);
	}
	function dateOnly(iso: string | null): string {
		return iso ? iso.slice(0, 10) : '';
	}
	function scheduleOf(season: Season): string {
		const s = dateOnly(season.startsOn);
		const e = dateOnly(season.endsOn);
		if (!s && !e) return 'No dates scheduled';
		return `${s || '—'} to ${e || '—'}`;
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

	<!-- Leagues -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<Trophy class="size-5" />
				Leagues ({leagues.length})
			</Card.Title>
			<Card.Description>
				Leagues contain seasons; seasons contain divisions and team entries.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-2">
			{#if leagues.length === 0}
				<p class="text-sm text-muted-foreground">No leagues yet.</p>
			{/if}
			{#each leagues as league (league.id)}
				<div
					class="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 {league.status ===
					'archived'
						? 'opacity-60'
						: ''}"
				>
					<div class="flex items-center gap-2">
						<span class="font-medium">{league.name}</span>
						{#if league.status === 'archived'}
							<Badge variant="secondary">Archived</Badge>
						{/if}
					</div>
					{#if canManage}
						<div class="flex items-center gap-2">
							<Button variant="outline" size="sm" onclick={() => (renamingLeague = league)}>
								<Pencil class="mr-1 size-3.5" /> Rename
							</Button>
 <form method="POST" action="?/deleteLeague"
  onsubmit={(event) => {
   if (!confirm(`Permanently delete the empty league "${league.name}"?`)) {
    event.preventDefault();
   }
  }}>
  <input type="hidden" name="league" value={league.id} />
  <Button type="submit" size="sm" variant="outline"
   disabled={seasons.some((season) => season.league === league.id)}
   title={seasons.some((season) => season.league === league.id)
    ? 'This league contains seasons and cannot be deleted.' : 'Permanently delete this empty league'}
   style="color: #dc2626; border-color: #dc2626;">
   Delete
  </Button>
 </form>

							{#if league.status === 'active'}
								<form method="POST" action="?/archiveLeague">
									<input type="hidden" name="league" value={league.id} />
									<Button variant="outline" size="sm" type="submit">
										<Archive class="mr-1 size-3.5" /> Archive
									</Button>
								</form>
							{:else}
								<form method="POST" action="?/unarchiveLeague">
									<input type="hidden" name="league" value={league.id} />
									<Button variant="outline" size="sm" type="submit">
										<ArchiveRestore class="mr-1 size-3.5" /> Restore
									</Button>
								</form>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</Card.Content>
		{#if canManage}
			<Card.Footer>
				<form method="POST" action="?/createLeague" class="flex w-full flex-wrap items-end gap-3">
					<div class="flex min-w-48 flex-1 flex-col gap-1.5">
						<Label for="league-name">New league</Label>
						<Input id="league-name" name="name" required maxlength={120} />
					</div>
					<Button type="submit">
						<Plus class="mr-1 size-4" /> Add league
					</Button>
				</form>
			</Card.Footer>
		{/if}
	</Card.Root>

	<!-- Seasons (with divisions and team entries) -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<CalendarRange class="size-5" />
				Seasons ({seasons.length})
			</Card.Title>
			<Card.Description>
				Teams enter a season directly; a division can be assigned now or later. Seasons may run
				without divisions.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			{#if seasons.length === 0}
				<p class="text-sm text-muted-foreground">No seasons yet.</p>
			{/if}
			{#each seasons as season (season.id)}
				<section
					class="flex flex-col gap-3 rounded-md border p-4 {season.status === 'archived'
						? 'opacity-60'
						: ''}"
					data-season={season.id}
				>
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div class="flex flex-wrap items-center gap-2">
							<span class="font-medium">{season.name}</span>
							<Badge variant="outline">{season.leagueName}</Badge>
							<Badge variant={season.status === 'archived' ? 'secondary' : 'default'}>
								{season.status}
							</Badge>
							<span class="text-sm text-muted-foreground">{scheduleOf(season)}</span>
 <span class="text-sm font-medium">{formatSeasonPurse(season)}</span>
						</div>
						{#if canManage}
							<div class="flex items-center gap-2">
								<Button variant="outline" size="sm" onclick={() => (editingSeason = season)}>
									<Pencil class="mr-1 size-3.5" /> Edit
								</Button>
								{#if season.status === 'archived'}
									<form method="POST" action="?/unarchiveSeason">
										<input type="hidden" name="season" value={season.id} />
										<Button variant="outline" size="sm" type="submit">
											<ArchiveRestore class="mr-1 size-3.5" /> Restore
										</Button>
									</form>
								{:else}
									<form method="POST" action="?/archiveSeason">
										<input type="hidden" name="season" value={season.id} />
										<Button variant="outline" size="sm" type="submit">
											<Archive class="mr-1 size-3.5" /> Archive
										</Button>
									</form>
								{/if}
							</div>
						{/if}
					</div>

					<Separator />

					<!-- Divisions of this season -->
					<div class="flex flex-col gap-2">
						<h4 class="text-sm font-medium">Divisions ({divisionsOf(season.id).length})</h4>
						{#if divisionsOf(season.id).length === 0}
							<p class="text-sm text-muted-foreground">
								No divisions — this season runs division-less.
							</p>
						{/if}
						<div class="flex flex-wrap gap-2">
							{#each divisionsOf(season.id) as division (division.id)}
								<div class="flex items-center gap-1 rounded-md border px-2 py-1">
									<span class="text-sm">{division.name}</span>
									{#if division.status === 'archived'}
										<Badge variant="secondary">Archived</Badge>
									{/if}
									{#if canManage}
										{#if division.status === 'active'}
											<form method="POST" action="?/archiveDivision">
												<input type="hidden" name="division" value={division.id} />
												<Button variant="ghost" size="sm" type="submit">Archive</Button>
											</form>
										{:else}
											<form method="POST" action="?/unarchiveDivision">
												<input type="hidden" name="division" value={division.id} />
												<Button variant="ghost" size="sm" type="submit">Restore</Button>
											</form>
										{/if}
									{/if}
								</div>
							{/each}
						</div>
						{#if canManage && season.status !== 'archived'}
							<form method="POST" action="?/createDivision" class="flex flex-wrap items-end gap-2">
								<input type="hidden" name="season" value={season.id} />
								<div class="flex min-w-40 flex-col gap-1.5">
									<Label for="division-name-{season.id}">Add division</Label>
									<Input id="division-name-{season.id}" name="name" required maxlength={80} />
								</div>
								<Button variant="outline" size="sm" type="submit">
									<Plus class="mr-1 size-3.5" /> Add division
								</Button>
							</form>
						{/if}
					</div>

					<Separator />

					<!-- Team entries of this season -->
					<div class="flex flex-col gap-2">
						<h4 class="text-sm font-medium">Team entries ({entriesOf(season.id).length})</h4>
						{#if entriesOf(season.id).length === 0}
							<p class="text-sm text-muted-foreground">No teams entered yet.</p>
						{/if}
						{#each entriesOf(season.id) as entry (entry.id)}
							<div
								class="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 {entry.status ===
								'archived'
									? 'opacity-60'
									: ''}"
							>
								<div class="flex flex-wrap items-center gap-2">
									<span class="text-sm font-medium">{entry.teamName}</span>
									{#if entry.divisionName}
										<Badge variant="outline">{entry.divisionName}</Badge>
									{:else}
										<Badge variant="secondary">No division assigned</Badge>
									{/if}
									{#if entry.status === 'archived'}
										<Badge variant="secondary">Withdrawn</Badge>
									{/if}
								</div>
								{#if canManage && entry.status === 'active'}
									<div class="flex items-center gap-2">
										<form
											method="POST"
											action="?/assignEntryDivision"
											class="flex items-center gap-2"
										>
											<input type="hidden" name="entry" value={entry.id} />
											<select
												name="division"
												class="h-8 rounded-md border bg-background px-2 text-sm"
												aria-label="Assign division"
											>
												<option value="" selected={!entry.division}>No division</option>
												{#each divisionsOf(season.id).filter((d) => d.status === 'active') as d (d.id)}
													<option value={d.id} selected={entry.division === d.id}>{d.name}</option>
												{/each}
											</select>
											<Button variant="outline" size="sm" type="submit">Assign</Button>
										</form>
										<form method="POST" action="?/withdrawEntry">
											<input type="hidden" name="entry" value={entry.id} />
											<Button variant="ghost" size="sm" type="submit">Withdraw</Button>
										</form>
									</div>
								{:else if canManage}
									<form method="POST" action="?/restoreEntry">
										<input type="hidden" name="entry" value={entry.id} />
										<Button variant="ghost" size="sm" type="submit">Restore</Button>
									</form>
								{/if}
							</div>
						{/each}
						{#if canManage && season.status !== 'archived'}
							{#if activeTeams.length === 0}
								<p class="text-sm text-muted-foreground">
									Create a team on the Teams &amp; rosters page first.
								</p>
							{:else}
								<form method="POST" action="?/addEntry" class="flex flex-wrap items-end gap-2">
									<input type="hidden" name="season" value={season.id} />
									<div class="flex min-w-40 flex-col gap-1.5">
										<Label for="entry-team-{season.id}">Enter a team</Label>
										<select
											id="entry-team-{season.id}"
											name="team"
											required
											class="h-9 rounded-md border bg-background px-2 text-sm"
										>
											<option value="" disabled selected>Select a team</option>
											{#each activeTeams as team (team.id)}
												<option value={team.id}>{team.name}</option>
											{/each}
										</select>
									</div>
									<div class="flex min-w-40 flex-col gap-1.5">
										<Label for="entry-division-{season.id}">Division (optional)</Label>
										<select
											id="entry-division-{season.id}"
											name="division"
											class="h-9 rounded-md border bg-background px-2 text-sm"
										>
											<option value="" selected>No division yet</option>
											{#each divisionsOf(season.id).filter((d) => d.status === 'active') as d (d.id)}
												<option value={d.id}>{d.name}</option>
											{/each}
										</select>
									</div>
									<Button variant="outline" size="sm" type="submit">
										<Plus class="mr-1 size-3.5" /> Enter team
									</Button>
								</form>
							{/if}
						{/if}
					</div>
				</section>
			{/each}
		</Card.Content>
		{#if canManage}
			<Card.Footer>
				<form method="POST" action="?/createSeason" class="grid w-full gap-3 sm:grid-cols-2">
					<div class="flex flex-col gap-1.5">
						<Label for="season-league">League</Label>
						<select
							id="season-league"
							name="league"
							required
							class="h-9 rounded-md border bg-background px-2 text-sm"
						>
							<option value="" disabled selected>Select a league</option>
							{#each leagues.filter((l) => l.status === 'active') as league (league.id)}
								<option value={league.id}>{league.name}</option>
							{/each}
						</select>
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="season-name">Season name</Label>
						<Input id="season-name" name="name" required maxlength={120} />
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="season-starts">Starts on (optional)</Label>
						<Input id="season-starts" name="startsOn" type="date" />
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="season-ends">Ends on (optional)</Label>
						<Input id="season-ends" name="endsOn" type="date" />
					</div>

 <div class="flex flex-col gap-1.5">
  <Label for="season-purse">Season purse (USD, optional)</Label>
  <Input id="season-purse" name="purseAmount" type="text" inputmode="decimal"
   pattern={'[0-9]+([.][0-9]{1,2})?'} placeholder="6000000.00"
   aria-describedby="season-purse-help" />
  <p id="season-purse-help" class="text-xs text-muted-foreground">
   Enter dollars with up to two decimal places, without commas. Leave blank for no purse set.
  </p>
 </div>
<div>
						<Button type="submit">
							<Plus class="mr-1 size-4" /> Add season
						</Button>
					</div>
				</form>
			</Card.Footer>
		{/if}
	</Card.Root>

	{#if !canManage}
		<p class="text-sm text-muted-foreground">
			Your role ({myRole}) can view leagues, seasons, divisions, and entries but not manage them.
		</p>
	{/if}
</div>

<!-- Season edit dialog -->
<Dialog.Root open={editingSeason !== null} onOpenChange={(open) => !open && (editingSeason = null)}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Edit season</Dialog.Title>
			<Dialog.Description>
				Status is a scheduling foundation — it never changes records or relationships.
			</Dialog.Description>
		</Dialog.Header>
		{#if editingSeason}
			<form method="POST" action="?/updateSeason" class="flex flex-col gap-3">
				<input type="hidden" name="season" value={editingSeason.id} />
				<div class="flex flex-col gap-1.5">
					<Label for="edit-season-name">Season name</Label>
					<Input
						id="edit-season-name"
						name="name"
						required
						maxlength={120}
						value={editingSeason.name}
					/>
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="edit-season-status">Status</Label>
					<select
						id="edit-season-status"
						name="status"
						class="h-9 rounded-md border bg-background px-2 text-sm"
					>
						{#each ['planned', 'active', 'completed'] as s (s)}
							<option value={s} selected={editingSeason.status === s}>{s}</option>
						{/each}
					</select>
				</div>
				<div class="grid gap-3 sm:grid-cols-2">
					<div class="flex flex-col gap-1.5">
						<Label for="edit-season-starts">Starts on</Label>
						<Input
							id="edit-season-starts"
							name="startsOn"
							type="date"
							value={dateOnly(editingSeason.startsOn)}
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="edit-season-ends">Ends on</Label>
						<Input
							id="edit-season-ends"
							name="endsOn"
							type="date"
							value={dateOnly(editingSeason.endsOn)}
						/>
					</div>
				</div>

 <div class="flex flex-col gap-1.5">
  <Label for="edit-season-purse">Season purse (USD, optional)</Label>
  <Input id="edit-season-purse" name="purseAmount" type="text" inputmode="decimal"
   pattern={'[0-9]+([.][0-9]{1,2})?'} placeholder="6000000.00" value={seasonPurseInput(editingSeason)}
   aria-describedby="edit-season-purse-help" />
  <p id="edit-season-purse-help" class="text-xs text-muted-foreground">
   Enter dollars with up to two decimal places, without commas. Leave blank for no purse set.
  </p>
 </div>

<Dialog.Footer>
					<Button type="submit">Save changes</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<!-- League rename dialog -->
<Dialog.Root
	open={renamingLeague !== null}
	onOpenChange={(open) => !open && (renamingLeague = null)}
>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Rename league</Dialog.Title>
			<Dialog.Description>Renaming keeps every season and relationship.</Dialog.Description>
		</Dialog.Header>
		{#if renamingLeague}
			<form method="POST" action="?/renameLeague" class="flex flex-col gap-3">
				<input type="hidden" name="league" value={renamingLeague.id} />
				<div class="flex flex-col gap-1.5">
					<Label for="edit-league-name">League name</Label>
					<Input
						id="edit-league-name"
						name="name"
						required
						maxlength={120}
						value={renamingLeague.name}
					/>
				</div>
				<Dialog.Footer>
					<Button type="submit">Save changes</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
