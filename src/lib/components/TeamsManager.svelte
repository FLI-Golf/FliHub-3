<script lang="ts">
	import { CircleAlert, Pencil, Plus, Users, Archive, ArchiveRestore } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	interface Team {
		id: string;
		name: string;
		status: 'active' | 'archived';
	}

	interface Props {
		teams: Team[];
		canManage: boolean;
		myRole: string;
		/** SvelteKit ActionData from the page's form actions (shape varies by action). */
		form: unknown;
	}

	let { teams, canManage, myRole, form }: Props = $props();

	let renaming = $state<Team | null>(null);

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

	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<Users class="size-5" />
				Teams ({teams.length})
			</Card.Title>
			<Card.Description>
				Organization teams. Teams are entered into seasons from the Leagues &amp; seasons page;
				their season rosters and reserve pools are managed below.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-2">
			{#if teams.length === 0}
				<p class="text-sm text-muted-foreground">No teams yet.</p>
			{/if}
			{#each teams as team (team.id)}
				<div
					class="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 {team.status ===
					'archived'
						? 'opacity-60'
						: ''}"
				>
					<div class="flex items-center gap-2">
						<span class="font-medium">{team.name}</span>
						{#if team.status === 'archived'}
							<Badge variant="secondary">Archived</Badge>
						{/if}
					</div>
					{#if canManage}
						<div class="flex items-center gap-2">
							<Button variant="outline" size="sm" onclick={() => (renaming = team)}>
								<Pencil class="mr-1 size-3.5" /> Rename
							</Button>
							{#if team.status === 'active'}
								<form method="POST" action="?/archiveTeam">
									<input type="hidden" name="team" value={team.id} />
									<Button variant="outline" size="sm" type="submit">
										<Archive class="mr-1 size-3.5" /> Archive
									</Button>
								</form>
							{:else}
								<form method="POST" action="?/unarchiveTeam">
									<input type="hidden" name="team" value={team.id} />
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
	</Card.Root>

	{#if canManage}
		<Card.Root>
			<Card.Header>
				<Card.Title>Add a team</Card.Title>
				<Card.Description>Team names must be unique within the organization.</Card.Description>
			</Card.Header>
			<Card.Content>
				<form method="POST" action="?/createTeam" class="flex flex-wrap items-end gap-3">
					<div class="flex min-w-48 flex-1 flex-col gap-1.5">
						<Label for="team-name">Team name</Label>
						<Input id="team-name" name="name" required maxlength={120} />
					</div>
					<Button type="submit">
						<Plus class="mr-1 size-4" /> Add team
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{:else}
		<p class="text-sm text-muted-foreground">
			Your role ({myRole}) can view teams but not manage them.
		</p>
	{/if}
</div>

<Dialog.Root open={renaming !== null} onOpenChange={(open) => !open && (renaming = null)}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Rename team</Dialog.Title>
			<Dialog.Description>Renaming keeps every season entry and relationship.</Dialog.Description>
		</Dialog.Header>
		{#if renaming}
			<form method="POST" action="?/renameTeam" class="flex flex-col gap-3">
				<input type="hidden" name="team" value={renaming.id} />
				<div class="flex flex-col gap-1.5">
					<Label for="edit-team-name">Team name</Label>
					<Input id="edit-team-name" name="name" required maxlength={120} value={renaming.name} />
				</div>
				<Dialog.Footer>
					<Button type="submit">Save changes</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
