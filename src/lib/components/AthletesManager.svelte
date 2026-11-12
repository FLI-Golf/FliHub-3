<script lang="ts">
	import { CircleAlert, Download, Pencil, Plus, UserRound, Archive } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';

	interface Athlete {
		id: string;
		firstName: string;
		lastName: string;
		displayName: string | null;
		gender: string | null;
		nationality: string | null;
		// Omitted entirely from server page data for non-manager roles; only
		// present (and only read) when canManage is true.
		email?: string | null;
		phone?: string | null;
		eligibilityNotes?: string | null;
		hasPrivateRecord: boolean;
		status: 'active' | 'archived';
	}

	interface Props {
		athletes: Athlete[];
		canManage: boolean;
		myRole: string;
		/** SvelteKit ActionData from the page's form actions (shape varies by action). */
		form: unknown;
	}

	let { athletes, canManage, myRole, form }: Props = $props();

	let editing = $state<Athlete | null>(null);
	let showImport = $state(false);
	const athleteCsvExample = [
		'Riley,Chen,female,USA,',
		'Jordan,Patel,male,Canada,',
		'Morgan,Reed,female,USA,'
	].join('\n');

	const athleteCsvPrompt = [
		'Convert my athlete list below into CSV for the FliHub athlete importer.',
		'Use this column order: firstName,lastName,gender,nationality,email.',
		'Return only the CSV rows, with one athlete per line and no header or Markdown.',
		'First and last name are required. Leave missing optional fields blank and keep their commas.',
		'Use only the athletes in my list. The three rows below are examples.',
		'',
		athleteCsvExample,
		'',
		'My athlete list:',
		'[Paste your list here]'
	].join('\n');

	let athleteCsvCopyStatus = $state('');

	async function copyAthleteCsvPrompt() {
		try {
			await navigator.clipboard.writeText(athleteCsvPrompt);
			athleteCsvCopyStatus = 'Copied. Paste the prompt into chat and add your athlete list.';
		} catch {
			athleteCsvCopyStatus = 'Select and copy the prompt from the box below.';
		}
	}

	const formRecord = $derived(
		form && typeof form === 'object' ? (form as Record<string, unknown>) : null
	);
	const message = $derived(
		formRecord && 'message' in formRecord ? String(formRecord.message) : null
	);
	const importedCount = $derived(
		formRecord && 'imported' in formRecord ? Number(formRecord.imported) : null
	);

	function nameOf(a: Athlete): string {
		return a.displayName?.trim() || `${a.firstName} ${a.lastName}`;
	}

	const athleteImportCsvRows = [
		'Riley,Chen,female,USA,',
		'Jordan,Patel,male,Canada,',
		'Morgan,Reed,female,USA,'
	].join('\n');

	const athleteImportChatPrompt = [
		'Convert my athlete list into CSV for the FliHub athlete importer.',
		'Use this column order: firstName,lastName,gender,nationality,email.',
		'Return one athlete per line, with no header and no Markdown fences.',
		'First and last name are required. Leave missing optional fields blank and keep their commas.',
		'Use only the athletes in my list. These three fictional rows show the format:',
		athleteImportCsvRows,
		'',
		'My athlete list:',
		'[Paste your list here]'
	].join('\n');

	let athleteImportCopyStatus = $state('');
	let athleteImportPromptField = $state<HTMLTextAreaElement>();

	async function copyAthleteImportExample() {
		try {
			await navigator.clipboard.writeText(athleteImportChatPrompt);
			athleteImportCopyStatus = 'Copied. Paste it into chat and add your athlete list.';
		} catch {
			athleteImportPromptField?.focus();
			athleteImportPromptField?.select();
			athleteImportCopyStatus = 'Prompt selected. Press Ctrl+C or Command+C to copy it.';
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
	{#if importedCount !== null}
		<Alert.Root>
			<Download class="size-4" />
			<Alert.Title>Import complete</Alert.Title>
			<Alert.Description>
				{importedCount} athlete{importedCount === 1 ? '' : 's'} imported. Rows are added as new records
				— duplicate matching is a documented open decision and is not performed yet.
			</Alert.Description>
		</Alert.Root>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<UserRound class="size-5" />
				Athletes ({athletes.length})
			</Card.Title>
			<Card.Description>
				Sport-neutral identity records scoped to this organization. Fields marked
				<Badge variant="outline" class="mx-1 text-xs">private</Badge> are contact/eligibility data visible
				only to Owners and Admins; the rest are approved display fields readable by all organization members.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col">
			{#if athletes.length === 0}
				<p class="text-sm text-muted-foreground">
					No athletes yet. Create one below{#if canManage}&nbsp;or import a CSV list{/if}.
				</p>
			{/if}
			{#each athletes as athlete, index (athlete.id)}
				{#if index > 0}
					<Separator class="my-3" />
				{/if}
				<div class="flex flex-wrap items-center gap-2">
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="truncate font-medium">{nameOf(athlete)}</span>
						<span class="truncate text-sm text-muted-foreground">
							{[athlete.gender, athlete.nationality].filter(Boolean).join(' · ') || '—'}
						</span>
						{#if canManage && (athlete.email || athlete.phone || athlete.eligibilityNotes)}
							<span class="truncate text-sm text-muted-foreground">
								{[athlete.email, athlete.phone].filter(Boolean).join(' · ')}
								<Badge variant="outline" class="ml-1 text-[10px]">private</Badge>
							</span>
						{/if}
					</div>
					{#if athlete.status === 'archived'}
						<Badge variant="outline">Archived</Badge>
					{:else}
						<Badge variant="secondary">Active</Badge>
					{/if}
					{#if canManage}
						<div class="flex flex-wrap gap-1">
							<Button
								variant="ghost"
								size="xs"
								onclick={() => {
									editing = athlete;
								}}
							>
								<Pencil class="size-3.5" />
								Edit
							</Button>
							{#if athlete.status === 'active'}
								<form method="POST" action="?/archiveAthlete">
									<input type="hidden" name="athlete" value={athlete.id} />
									<Button
										type="submit"
										variant="ghost"
										size="xs"
										onclick={(e) => {
											if (!confirm(`Archive ${nameOf(athlete)}? Records are preserved.`))
												e.preventDefault();
										}}
									>
										<Archive class="size-3.5" />
										Archive
									</Button>
								</form>
							{:else}
								<form method="POST" action="?/unarchiveAthlete">
									<input type="hidden" name="athlete" value={athlete.id} />
									<Button type="submit" variant="ghost" size="xs">Restore</Button>
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
				<Card.Title class="flex items-center gap-2 text-base">
					<Plus class="size-5" />
					Add an athlete
				</Card.Title>
				<Card.Description
					>Accounts are not required — athletes are records, not users.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<form method="POST" action="?/createAthlete" class="grid gap-3 sm:grid-cols-2">
					<div class="flex flex-col gap-1.5">
						<Label for="firstName">First name</Label>
						<Input id="firstName" name="firstName" required maxlength={60} />
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="lastName">Last name</Label>
						<Input id="lastName" name="lastName" required maxlength={60} />
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="displayName">Display name (optional)</Label>
						<Input id="displayName" name="displayName" maxlength={120} />
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="gender">Gender (optional)</Label>
						<select
							id="gender"
							name="gender"
							class="rounded-md border bg-background px-2 py-1.5 text-sm"
						>
							<option value="unspecified">Unspecified</option>
							<option value="female">Female</option>
							<option value="male">Male</option>
							<option value="other">Other</option>
						</select>
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="nationality">Nationality (optional)</Label>
						<Input id="nationality" name="nationality" maxlength={60} />
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="email">
							Contact email <Badge variant="outline" class="ml-1 text-xs">private</Badge>
						</Label>
						<Input id="email" name="email" type="email" maxlength={254} />
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="phone">
							Phone <Badge variant="outline" class="ml-1 text-xs">private</Badge>
						</Label>
						<Input id="phone" name="phone" maxlength={40} />
					</div>
					<div class="flex flex-col gap-1.5 sm:col-span-2">
						<Label for="eligibilityNotes">
							Eligibility notes <Badge variant="outline" class="ml-1 text-xs">private</Badge>
						</Label>
						<Input id="eligibilityNotes" name="eligibilityNotes" maxlength={2000} />
					</div>
					<div>
						<Button type="submit">Add athlete</Button>
					</div>
				</form>
			</Card.Content>
			<Card.Footer>
				<Button variant="outline" onclick={() => (showImport = true)}>
					<Download class="size-4" />
					Import CSV
				</Button>
			</Card.Footer>
		</Card.Root>
	{:else}
		<p class="text-sm text-muted-foreground">
			Your role ({myRole}) can view athletes but not manage them.
		</p>
	{/if}
</div>

<!-- Edit dialog -->
<Dialog.Root open={editing !== null} onOpenChange={(open) => !open && (editing = null)}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Edit athlete</Dialog.Title>
			<Dialog.Description>Changes are saved to this organization's record.</Dialog.Description>
			<details class="rounded-md border p-3 text-sm">
				<summary class="cursor-pointer font-medium">See a three-athlete example</summary>
				<div class="mt-3 flex flex-col gap-2">
					<p>Copy this prompt into chat, add your athlete list, then paste the CSV reply below.</p>
					<textarea
						aria-label="Athlete CSV chat prompt"
						readonly
						rows="6"
						value={athleteCsvPrompt}
						class="w-full rounded-md border bg-background p-2 font-mono text-xs"></textarea>
					<div>
						<Button type="button" onclick={copyAthleteCsvPrompt}>Copy example for chat</Button>
					</div>
					<p role="status">{athleteCsvCopyStatus}</p>
				</div>
			</details>
		</Dialog.Header>
		{#if editing}
			<form method="POST" action="?/updateAthlete" class="flex flex-col gap-3">
				<input type="hidden" name="athlete" value={editing.id} />
				<div class="grid gap-3 sm:grid-cols-2">
					<div class="flex flex-col gap-1.5">
						<Label for="edit-firstName">First name</Label>
						<Input
							id="edit-firstName"
							name="firstName"
							required
							maxlength={60}
							value={editing.firstName}
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="edit-lastName">Last name</Label>
						<Input
							id="edit-lastName"
							name="lastName"
							required
							maxlength={60}
							value={editing.lastName}
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="edit-displayName">Display name</Label>
						<Input
							id="edit-displayName"
							name="displayName"
							maxlength={120}
							value={editing.displayName ?? ''}
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="edit-nationality">Nationality</Label>
						<Input
							id="edit-nationality"
							name="nationality"
							maxlength={60}
							value={editing.nationality ?? ''}
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="edit-email">Contact email (private)</Label>
						<Input
							id="edit-email"
							name="email"
							type="email"
							maxlength={254}
							value={editing.email ?? ''}
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="edit-phone">Phone (private)</Label>
						<Input id="edit-phone" name="phone" maxlength={40} value={editing.phone ?? ''} />
					</div>
					<div class="flex flex-col gap-1.5 sm:col-span-2">
						<Label for="edit-eligibility">Eligibility notes (private)</Label>
						<Input
							id="edit-eligibility"
							name="eligibilityNotes"
							maxlength={2000}
							value={editing.eligibilityNotes ?? ''}
						/>
					</div>
				</div>
				<Dialog.Footer>
					<Button type="submit">Save changes</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>

{#if canManage}
	<section class="mt-4 space-y-3 rounded-md border p-4" aria-label="Athlete CSV example">
		<h3 class="font-semibold">Bulk add athletes</h3>
		<p class="text-sm text-muted-foreground">
			Copy the prompt into chat, replace the placeholder with your athlete list, then paste the CSV
			reply into Import CSV.
		</p>
		<textarea
			bind:this={athleteImportPromptField}
			aria-label="Athlete CSV chat prompt with three example rows"
			readonly
			rows="8"
			value={athleteImportChatPrompt}
			class="w-full rounded-md border bg-background p-2 font-mono text-xs"></textarea>
		<Button type="button" onclick={copyAthleteImportExample}>Copy example for chat</Button>
		<p role="status" class="text-sm">{athleteImportCopyStatus}</p>
	</section>
{/if}

<!-- Import dialog -->
<Dialog.Root open={showImport} onOpenChange={(open) => !open && (showImport = false)}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Import athletes from CSV</Dialog.Title>
			<Dialog.Description>
				One athlete per row: firstName,lastName,gender,nationality,email. Only first and last name
				are required. Every row becomes a new record — duplicate matching is not implemented yet
				(open product decision).
			</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/importAthletes" class="flex flex-col gap-3">
			<textarea
				name="csv"
				rows="8"
				class="w-full rounded-md border bg-background p-2 font-mono text-sm"
				placeholder="Riley,Chen,female,USA,\nJordan,Patel,male,Canada,jordan@example.com"
			></textarea>
			<Dialog.Footer>
				<Button type="submit">Import</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
