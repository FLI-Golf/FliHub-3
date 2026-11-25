<script lang="ts">
	import { enhance } from '$app/forms';
	import { beforeNavigate } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import { SvelteURL } from 'svelte/reactivity';
	import { getParticipantTerminology } from '$lib/organizations/profiles';
	type SubmitFunction = NonNullable<Parameters<typeof enhance>[1]>;
	import { ChevronDown as AthleteListChevron } from 'lucide-svelte';
	import { CircleAlert, Download, Pencil, Plus, UserRound, Archive, X } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

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
		profile?: string;
		athletes: Athlete[];
		canManage: boolean;
		myRole: string;
		/** SvelteKit ActionData from the page's form actions (shape varies by action). */
		form: unknown;
	}

	let { athletes, canManage, myRole, form, profile = '' }: Props = $props();

	const terminology = $derived(getParticipantTerminology(profile));

	let directoryOpen = $derived(terminology.isCharity);

	function profileEnhance(node: HTMLFormElement, submit: SubmitFunction) {
		if (!terminology.isCharity) return;

		return enhance(node, submit);
	}

	let participantSearch = $state('');
	let participantStatus = $state<'all' | 'active' | 'archived'>('all');

	const activeCount = $derived(athletes.filter((entry) => entry.status === 'active').length);

	const archivedCount = $derived(athletes.filter((entry) => entry.status === 'archived').length);

	const visibleAthletes = $derived.by(() => {
		if (!terminology.isCharity) return athletes;

		const terms = participantSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);

		return athletes.filter((entry) => {
			if (participantStatus !== 'all' && entry.status !== participantStatus) return false;

			const identity = [entry.firstName, entry.lastName, entry.displayName]
				.filter(Boolean)
				.join(' ')
				.toLowerCase();

			return terms.every((term) => identity.includes(term));
		});
	});

	function resetParticipantFilters() {
		participantSearch = '';
		participantStatus = 'all';
	}

	let editing = $state<Athlete | null>(null);
	let privateLoading = $state(false);
	let privateError = $state('');
	let privateRequest: AbortController | null = null;

	let createBusy = $state(false);
	let editBusy = $state(false);
	let createDirty = $state(false);
	let editDirty = $state(false);
	let createError = $state('');
	let editError = $state('');
	let participantSuccess = $state('');

	beforeNavigate((navigation) => {
		if (!terminology.isCharity) return;

		if (createBusy || editBusy) {
			navigation.cancel();
			return;
		}

		if (createDirty || editDirty) {
			if (navigation.type === 'leave') {
				navigation.cancel();
			} else if (!confirm('Discard unsaved participant changes?')) {
				navigation.cancel();
			}
		}
	});

	const enhanceCreate: SubmitFunction = ({ cancel }) => {
		if (!terminology.isCharity) return;

		if (createBusy || !canManage) {
			cancel();
			return;
		}

		createBusy = true;
		createError = '';
		participantSuccess = '';

		return async ({ result, update }) => {
			try {
				if (result.type === 'success' && result.data?.created === true) {
					createDirty = false;
					await update();
					participantSuccess = 'Participant created successfully.';
				} else if (result.type === 'failure') {
					createError = String(result.data?.message ?? 'Unable to create participant.');
				} else {
					createError =
						'Unable to confirm creation. Check the participant directory before retrying.';
				}
			} finally {
				createBusy = false;
			}
		};
	};

	const enhanceEdit: SubmitFunction = ({ cancel }) => {
		if (!terminology.isCharity) return;

		if (editBusy || !canManage || privateLoading || privateError) {
			cancel();
			return;
		}

		editBusy = true;
		editError = '';
		participantSuccess = '';

		return async ({ result, update }) => {
			try {
				if (result.type === 'success' && result.data?.updated === true) {
					editDirty = false;
					closeEdit();
					await update();
					participantSuccess = 'Participant updated successfully.';
				} else if (result.type === 'failure') {
					editError = String(result.data?.message ?? 'Unable to update participant.');
				} else {
					editError = 'Unable to confirm the update. Check the participant record before retrying.';
				}
			} finally {
				editBusy = false;
			}
		};
	};

	function requestCloseEdit() {
		if (terminology.isCharity) {
			if (editBusy) return;

			if (editDirty && !confirm('Discard unsaved participant changes?')) {
				return;
			}
		}

		closeEdit();
	}

	onDestroy(() => {
		privateRequest?.abort();
		privateRequest = null;
	});

	function closeEdit() {
		editDirty = false;
		editError = '';
		privateRequest?.abort();
		privateRequest = null;
		editing = null;
		privateLoading = false;
		privateError = '';
	}

	async function openEdit(athlete: Athlete) {
		if (!canManage) return;

		closeEdit();
		editing = { ...athlete };

		if (!terminology.isCharity) return;

		const request = new AbortController();
		privateRequest = request;
		privateLoading = true;

		try {
			const url = new SvelteURL(window.location.href);
			url.pathname =
				url.pathname.replace(/\/$/, '') +
				'/participants/' +
				encodeURIComponent(athlete.id) +
				'/private';
			url.search = '';
			url.hash = '';

			const response = await fetch(url, {
				signal: request.signal,
				cache: 'no-store'
			});

			if (!response.ok) {
				throw new Error('Unable to load private participant information.');
			}

			const contact = await response.json();

			if (
				!contact ||
				typeof contact.email !== 'string' ||
				typeof contact.phone !== 'string' ||
				typeof contact.eligibilityNotes !== 'string'
			) {
				throw new Error('Invalid private information response.');
			}

			if (privateRequest !== request || editing?.id !== athlete.id) return;

			editing = {
				...athlete,
				email: contact.email,
				phone: contact.phone,
				eligibilityNotes: contact.eligibilityNotes
			};
		} catch {
			if (request.signal.aborted || privateRequest !== request) return;

			privateError = 'Private information could not be loaded. Close this dialog and try again.';
		} finally {
			if (privateRequest === request) {
				privateLoading = false;
				privateRequest = null;
			}
		}
	}
	let showImport = $state(false);

	interface ImportWarning {
		key: string;
		row: number;
		type: 'batch' | 'existing';
		matchingRow?: number;
		participantId?: string;
		status?: string;
		fields: string[];
	}

	interface ImportReview {
		rowCount: number;
		fingerprint: string;
		warnings: ImportWarning[];
	}

	let importCsv = $state('');
	let reviewedCsv = $state('');
	let importReview = $state<ImportReview | null>(null);
	let confirmedWarnings = $state<string[]>([]);
	let importBusy = $state(false);
	let importError = $state('');

	const importReady = $derived(
		importReview !== null &&
			importCsv === reviewedCsv &&
			confirmedWarnings.length === importReview.warnings.length &&
			importReview.warnings.every((warning) => confirmedWarnings.includes(warning.key))
	);

	function clearImportReview() {
		importReview = null;
		reviewedCsv = '';
		confirmedWarnings = [];
		importError = '';
	}

	function closeImport() {
		showImport = false;
		importCsv = '';
		clearImportReview();
	}

	function existingMatchName(id?: string) {
		const athlete = athletes.find((entry) => entry.id === id);
		return athlete ? nameOf(athlete) : `Existing ${terminology.singularLower}`;
	}

	const enhanceImportPreview: SubmitFunction = ({ formData, cancel }) => {
		if (importBusy) {
			cancel();
			return;
		}

		const submittedCsv = String(formData.get('csv') ?? '');
		clearImportReview();
		importBusy = true;

		return async ({ result }) => {
			try {
				if (result.type === 'success' && result.data?.importPreview) {
					if (importCsv === submittedCsv && showImport) {
						importReview = result.data.importPreview as ImportReview;
						reviewedCsv = submittedCsv;
					}
				} else if (result.type === 'failure') {
					importError = String(result.data?.message ?? 'Unable to preview the CSV.');
				} else {
					importError = 'Unable to preview the CSV. Please try again.';
				}
			} finally {
				importBusy = false;
			}
		};
	};

	const enhanceImportCommit: SubmitFunction = ({ cancel }) => {
		if (importBusy || !importReady) {
			cancel();
			return;
		}

		importBusy = true;
		importError = '';

		return async ({ result, update }) => {
			try {
				if (result.type === 'success' && typeof result.data?.imported === 'number') {
					closeImport();
					await update();
				} else {
					const detail =
						result.type === 'failure'
							? String(result.data?.message ?? 'Import failed.')
							: `Unable to confirm the import result. Check the ${terminology.singularLower} list before retrying.`;

					clearImportReview();
					importError = detail;
				}
			} finally {
				importBusy = false;
			}
		};
	};
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

	const charityImportCsvRows = [
		'Riley,Chen,,riley@example.com,555-0101',
		'Jordan,Patel,JP,,',
		'Morgan,Reed,,,555-0103'
	].join('\n');

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

	const charityImportChatPrompt = [
		'Convert my participant identity list into CSV for the FliHub charity participant importer.',
		'Use this column order: firstName,lastName,displayName,email,phone.',
		'Return one participant per line, without a header or Markdown fences.',
		'First and last names are required. Display name, email and phone are optional.',
		'Leave missing optional fields blank and preserve their column positions.',
		'Do not invent contact information.',
		'Do not include private notes, gender or nationality.',
		'Quote fields containing commas and escape quotation marks by doubling them.',
		'Maximum 200 participants per import.',
		'Use only the participants in my list. These fictional rows show the format:',
		charityImportCsvRows,
		'',
		'My participant identity list:',
		'[Paste non-sensitive participant identity data here]'
	].join('\n');

	const importChatPrompt = $derived(
		terminology.isCharity ? charityImportChatPrompt : athleteImportChatPrompt
	);

	let athleteImportCopyStatus = $state('');
	let athleteImportPromptField = $state<HTMLTextAreaElement>();

	async function copyAthleteImportExample() {
		try {
			await navigator.clipboard.writeText(importChatPrompt);
			athleteImportCopyStatus = `Copied. Paste it into chat and add your ${terminology.singularLower} list.`;
		} catch {
			athleteImportPromptField?.focus();
			athleteImportPromptField?.select();
			athleteImportCopyStatus = 'Prompt selected. Press Ctrl+C or Command+C to copy it.';
		}
	}
</script>

<div class="flex flex-col gap-6">
	{#if terminology.isCharity && participantSuccess}
		<Alert.Root>
			<Alert.Title>Participant saved</Alert.Title>
			<Alert.Description>{participantSuccess}</Alert.Description>
		</Alert.Root>
	{/if}
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
				{importedCount}
				{importedCount === 1 ? terminology.singularLower : terminology.pluralLower} imported successfully.
				All reviewed rows were saved together.
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if canManage}
		<details class="group/add-athlete rounded-xl border bg-card p-4">
			<summary class="cursor-pointer list-none font-semibold [&::-webkit-details-marker]:hidden">
				<span class="flex items-center gap-2 group-open/add-athlete:hidden">
					<span
						class="inline-flex size-8 items-center justify-center rounded-full bg-green-700 text-white"
					>
						<Plus class="size-4" aria-hidden="true" />
					</span>
					Add {terminology.indefinite}
				</span>
				<span class="hidden items-center gap-2 group-open/add-athlete:flex">
					<span
						class="inline-flex size-8 items-center justify-center rounded-full bg-red-700 text-white"
					>
						<X class="size-4" aria-hidden="true" />
					</span>
					Close {terminology.singularLower} form
				</span>
			</summary>
			<div class="mt-4">
				<Card.Root>
					<Card.Header>
						<Card.Description
							>Accounts are not required — {terminology.pluralLower} are records, not users.</Card.Description
						>
					</Card.Header>
					<Card.Content>
						{#if terminology.isCharity && createError}
							<Alert.Root variant="destructive" class="mb-3">
								<CircleAlert class="size-4" />
								<Alert.Title>Unable to create participant</Alert.Title>
								<Alert.Description>{createError}</Alert.Description>
							</Alert.Root>
						{/if}
						<form
							method="POST"
							action="?/createAthlete"
							use:profileEnhance={enhanceCreate}
							oninput={() => {
								if (terminology.isCharity) createDirty = true;
							}}
							class="grid gap-3 sm:grid-cols-2"
						>
							<div class="flex flex-col gap-1.5">
								<Label for="firstName">First name</Label>
								<Input
									id="firstName"
									readonly={terminology.isCharity && createBusy}
									name="firstName"
									required
									maxlength={60}
								/>
							</div>
							<div class="flex flex-col gap-1.5">
								<Label for="lastName">Last name</Label>
								<Input
									id="lastName"
									readonly={terminology.isCharity && createBusy}
									name="lastName"
									required
									maxlength={60}
								/>
							</div>
							<div class="flex flex-col gap-1.5">
								<Label for="displayName">Display name (optional)</Label>
								<Input
									id="displayName"
									readonly={terminology.isCharity && createBusy}
									name="displayName"
									maxlength={120}
								/>
							</div>
							{#if !terminology.isCharity}
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
							{/if}
							{#if !terminology.isCharity}
								<div class="flex flex-col gap-1.5">
									<Label for="nationality">Nationality (optional)</Label>
									<Input id="nationality" name="nationality" maxlength={60} />
								</div>
							{/if}
							<div class="flex flex-col gap-1.5">
								<Label for="email">
									Contact email <Badge variant="outline" class="ml-1 text-xs">private</Badge>
								</Label>
								<Input
									id="email"
									readonly={terminology.isCharity && createBusy}
									name="email"
									type="email"
									maxlength={254}
								/>
							</div>
							<div class="flex flex-col gap-1.5">
								<Label for="phone">
									Phone <Badge variant="outline" class="ml-1 text-xs">private</Badge>
								</Label>
								<Input
									id="phone"
									readonly={terminology.isCharity && createBusy}
									name="phone"
									maxlength={40}
								/>
							</div>
							<div class="flex flex-col gap-1.5 sm:col-span-2">
								<Label for="eligibilityNotes">
									{terminology.isCharity ? 'Private participant notes' : 'Eligibility notes'}
									<Badge variant="outline" class="ml-1 text-xs">private</Badge>
								</Label>
								<Input
									id="eligibilityNotes"
									readonly={terminology.isCharity && createBusy}
									name="eligibilityNotes"
									maxlength={2000}
								/>
							</div>
							<div>
								<Button
									type="submit"
									disabled={terminology.isCharity && createBusy}
									class="bg-green-700 text-white hover:bg-green-800"
									>{terminology.isCharity && createBusy
										? 'Saving…'
										: `Add ${terminology.singularLower}`}</Button
								>
							</div>
						</form>
					</Card.Content>
					<section
						class="mt-4 space-y-3 rounded-md border p-4"
						aria-label={`${terminology.singular} CSV example`}
					>
						<h3 class="font-semibold">Bulk add {terminology.pluralLower}</h3>
						<p class="text-sm text-muted-foreground">
							Copy the prompt into chat, replace the placeholder with your {terminology.singularLower}
							list, then paste the CSV reply into Import CSV.
						</p>
						{#if terminology.isCharity}
							<p class="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
								Protect participant privacy. Do not share real contact information or private notes
								with external AI services. Add sensitive contact fields directly in FliHub.
							</p>
						{/if}
						<textarea
							bind:this={athleteImportPromptField}
							aria-label={`${terminology.singular} CSV chat prompt with three example rows`}
							readonly
							rows="8"
							value={importChatPrompt}
							class="w-full rounded-md border bg-background p-2 font-mono text-xs"></textarea>
						<Button
							type="button"
							class="bg-black text-white hover:bg-slate-800"
							onclick={copyAthleteImportExample}>Copy example for chat</Button
						>
						<p role="status" class="text-sm">{athleteImportCopyStatus}</p>
					</section>
					<Card.Footer>
						<Button variant="outline" onclick={() => (showImport = true)}>
							<Download class="size-4" />
							Import CSV
						</Button>
					</Card.Footer>
				</Card.Root>
			</div>
		</details>
	{:else}
		<p class="text-sm text-muted-foreground">
			Your role ({myRole}) can view {terminology.pluralLower} but not manage them.
		</p>
	{/if}

	<details bind:open={directoryOpen} class="group/athlete-list rounded-xl border bg-card">
		<summary
			class="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden"
		>
			<UserRound class="size-5 shrink-0 text-blue-700 dark:text-blue-300" aria-hidden="true" />
			<span>{terminology.plural} ({terminology.isCharity ? activeCount : athletes.length})</span>
			<AthleteListChevron
				class="ml-auto size-4 shrink-0 transition-transform group-open/athlete-list:rotate-180"
				aria-hidden="true"
			/>
		</summary>
		<Card.Root class="gap-4 rounded-none border-0 border-t bg-transparent py-4 shadow-none">
			<Card.Header>
				<Card.Description>
					{#if terminology.isCharity}
						Participant identity records scoped to this organization. Contact information and
						private notes are available only to authorized Owners and Admins through participant
						management.
					{:else}
						Sport-neutral identity records scoped to this organization. Fields marked
						<Badge variant="outline" class="mx-1 text-xs">private</Badge> are contact/eligibility data
						visible only to Owners and Admins; the rest are approved display fields readable by all organization
						members.
					{/if}
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col">
				{#if terminology.isCharity}
					<section class="mb-4 space-y-3" aria-label="Participant filters">
						<div class="grid grid-cols-3 gap-2">
							<div class="min-w-0 rounded-md border p-2">
								<p class="text-xs font-medium text-muted-foreground">Total</p>
								<p class="text-xl font-semibold">{athletes.length}</p>
							</div>
							<div class="min-w-0 rounded-md border p-2">
								<p class="text-xs font-medium text-muted-foreground">Active</p>
								<p class="text-xl font-semibold text-blue-700">{activeCount}</p>
							</div>
							<div class="min-w-0 rounded-md border p-2">
								<p class="text-xs font-medium text-muted-foreground">Archived</p>
								<p class="text-xl font-semibold">{archivedCount}</p>
							</div>
						</div>

						<div class="flex flex-col gap-2">
							<Label for="participant-search">Search participants</Label>
							<Input
								id="participant-search"
								placeholder="Search by name..."
								bind:value={participantSearch}
							/>
						</div>

						<div class="flex flex-wrap items-center gap-2">
							<Label for="participant-status">Status</Label>
							<select
								id="participant-status"
								bind:value={participantStatus}
								class="min-w-0 rounded-md border bg-background px-3 py-2 text-sm"
							>
								<option value="all">All participants</option>
								<option value="active">Active</option>
								<option value="archived">Archived</option>
							</select>

							<Button
								type="button"
								variant="outline"
								size="sm"
								onclick={resetParticipantFilters}
								disabled={!participantSearch && participantStatus === 'all'}
							>
								Reset
							</Button>
						</div>

						<p class="text-sm text-muted-foreground" role="status">
							Showing {visibleAthletes.length} of {athletes.length} participants
						</p>
					</section>
				{/if}
				{#if athletes.length === 0}
					<p class="text-sm text-muted-foreground">
						No {terminology.pluralLower} yet.{#if canManage}
							Use Add {terminology.indefinite} above to create one or import a CSV list.{/if}
					</p>
				{/if}
				{#if terminology.isCharity && athletes.length > 0 && visibleAthletes.length === 0}
					<p class="rounded-md border p-4 text-sm text-muted-foreground">
						No participants match your search and status filters.
					</p>
				{/if}

				{#each visibleAthletes as athlete (athlete.id)}
					<div
						class="flex flex-wrap items-center gap-2 rounded-md bg-white px-3 py-3 even:bg-slate-300"
					>
						<div class="flex min-w-0 flex-1 flex-col">
							<span class="truncate font-medium">{nameOf(athlete)}</span>
							{#if !terminology.isCharity}
								<span class="truncate text-sm text-muted-foreground">
									{[athlete.gender, athlete.nationality].filter(Boolean).join(' · ') || '—'}
								</span>
							{/if}
							{#if !terminology.isCharity && canManage && (athlete.email || athlete.phone || athlete.eligibilityNotes)}
								<span class="truncate text-sm text-muted-foreground">
									{[athlete.email, athlete.phone].filter(Boolean).join(' · ')}
									<Badge variant="outline" class="ml-1 text-[10px]">private</Badge>
								</span>
							{/if}
						</div>
						{#if athlete.status === 'archived'}
							<Badge variant="outline">Archived</Badge>
						{:else}
							<Badge variant="secondary" class="bg-blue-700 text-white">Active</Badge>
						{/if}
						{#if canManage}
							<div class="flex flex-wrap gap-1">
								<Button
									variant="ghost"
									size="xs"
									class="bg-red-700 text-white hover:bg-red-800 hover:text-white"
									onclick={() => openEdit(athlete)}
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
											class="text-orange-800 hover:bg-orange-100 hover:text-orange-900"
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
	</details>
</div>

<!-- Edit dialog -->
<Dialog.Root
	open={editing !== null}
	onOpenChange={(open) => {
		if (!open) requestCloseEdit();
	}}
>
	<Dialog.Content class={terminology.isCharity ? 'max-h-[90vh] overflow-y-auto' : ''}>
		<Dialog.Header>
			<Dialog.Title>Edit {terminology.singularLower}</Dialog.Title>
			<Dialog.Description>Changes are saved to this organization's record.</Dialog.Description>
			{#if !terminology.isCharity}
				<details class="rounded-md border p-3 text-sm">
					<summary class="cursor-pointer font-medium">See a three-athlete example</summary>
					<div class="mt-3 flex flex-col gap-2">
						<p>
							Copy this prompt into chat, add your athlete list, then paste the CSV reply below.
						</p>
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
			{/if}
		</Dialog.Header>
		{#if privateLoading}
			<p role="status" class="py-4 text-sm text-muted-foreground">
				Loading private participant information…
			</p>
		{:else if privateError}
			<Alert.Root variant="destructive">
				<CircleAlert class="size-4" />
				<Alert.Title>Unable to open participant</Alert.Title>
				<Alert.Description>{privateError}</Alert.Description>
			</Alert.Root>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={closeEdit}>Close</Button>
			</Dialog.Footer>
		{:else if editing && canManage}
			{#if terminology.isCharity && editError}
				<Alert.Root variant="destructive">
					<CircleAlert class="size-4" />
					<Alert.Title>Unable to update participant</Alert.Title>
					<Alert.Description>{editError}</Alert.Description>
				</Alert.Root>
			{/if}
			<form
				method="POST"
				action="?/updateAthlete"
				use:profileEnhance={enhanceEdit}
				oninput={() => {
					if (terminology.isCharity) editDirty = true;
				}}
				class="flex flex-col gap-3"
			>
				<input type="hidden" name="athlete" value={editing.id} />
				<div class="grid gap-3 sm:grid-cols-2">
					<div class="flex flex-col gap-1.5">
						<Label for="edit-firstName">First name</Label>
						<Input
							id="edit-firstName"
							readonly={terminology.isCharity && editBusy}
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
							readonly={terminology.isCharity && editBusy}
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
							readonly={terminology.isCharity && editBusy}
							name="displayName"
							maxlength={120}
							value={editing.displayName ?? ''}
						/>
					</div>
					{#if !terminology.isCharity}
						<div class="flex flex-col gap-1.5">
							<Label for="edit-nationality">Nationality</Label>
							<Input
								id="edit-nationality"
								name="nationality"
								maxlength={60}
								value={editing.nationality ?? ''}
							/>
						</div>
					{/if}
					<div class="flex flex-col gap-1.5">
						<Label for="edit-email">Contact email (private)</Label>
						<Input
							id="edit-email"
							readonly={terminology.isCharity && editBusy}
							name="email"
							type="email"
							maxlength={254}
							value={editing.email ?? ''}
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="edit-phone">Phone (private)</Label>
						<Input
							id="edit-phone"
							readonly={terminology.isCharity && editBusy}
							name="phone"
							maxlength={40}
							value={editing.phone ?? ''}
						/>
					</div>
					<div class="flex flex-col gap-1.5 sm:col-span-2">
						<Label for="edit-eligibility"
							>{terminology.isCharity
								? 'Private participant notes'
								: 'Eligibility notes (private)'}</Label
						>
						<Input
							id="edit-eligibility"
							readonly={terminology.isCharity && editBusy}
							name="eligibilityNotes"
							maxlength={2000}
							value={editing.eligibilityNotes ?? ''}
						/>
					</div>
				</div>
				<Dialog.Footer>
					{#if terminology.isCharity}
						<Button type="button" variant="outline" disabled={editBusy} onclick={requestCloseEdit}
							>Cancel</Button
						>
					{/if}
					<Button type="submit" disabled={terminology.isCharity && editBusy}>
						{terminology.isCharity && editBusy ? 'Saving…' : 'Save changes'}
					</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<!-- Import dialog -->
<Dialog.Root
	open={showImport}
	onOpenChange={(open) => {
		if (!open && !importBusy) closeImport();
	}}
>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Import {terminology.pluralLower} from CSV</Dialog.Title>
			<Dialog.Description>
				{#if terminology.isCharity}
					One participant per row: firstName,lastName,displayName,email,phone. Only first and last
					names are required. Leave optional fields blank. Maximum 200 rows, without a header.
					Preview the CSV before saving.
				{:else}
					One athlete per row: firstName,lastName,gender,nationality,email. Only first and last name
					are required. Maximum 200 rows, without a header. Preview the CSV before saving.
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		{#if importError}
			<Alert.Root variant="destructive">
				<CircleAlert class="size-4" />
				<Alert.Title>Import needs attention</Alert.Title>
				<Alert.Description>{importError}</Alert.Description>
			</Alert.Root>
		{/if}

		<form
			method="POST"
			action="?/previewAthleteImport"
			use:enhance={enhanceImportPreview}
			class="flex flex-col gap-3"
		>
			<Label for="athlete-import-csv">CSV rows</Label>
			<textarea
				id="athlete-import-csv"
				name="csv"
				rows="8"
				required
				maxlength={262144}
				readonly={importBusy}
				bind:value={importCsv}
				oninput={clearImportReview}
				class="w-full rounded-md border bg-background p-2 font-mono text-sm"
				placeholder={terminology.isCharity
					? charityImportCsvRows
					: 'Riley,Chen,female,USA,\\nJordan,Patel,male,Canada,jordan@example.com'}></textarea>

			<Button type="submit" variant="outline" disabled={importBusy || !importCsv.trim()}>
				{importBusy ? 'Please wait…' : 'Preview CSV'}
			</Button>
		</form>

		{#if importReview && reviewedCsv === importCsv}
			<section class="space-y-3 rounded-md border p-3" aria-label="Import review">
				<p class="font-semibold">
					{importReview.rowCount} valid row{importReview.rowCount === 1 ? '' : 's'}
				</p>

				{#if importReview.warnings.length === 0}
					<p class="text-sm text-green-700">No potential duplicates found.</p>
				{:else}
					<div class="flex items-center gap-2 text-amber-800">
						<CircleAlert class="size-4 shrink-0" />
						<p class="font-medium">
							{importReview.warnings.length} potential duplicate match{importReview.warnings
								.length === 1
								? ''
								: 'es'}
						</p>
					</div>

					<p class="text-sm text-muted-foreground">
						Review each match. Confirm only if the row should be imported as a new {terminology.singularLower}.
						Existing records will not be merged or overwritten. To exclude a row, edit the CSV and
						preview again.
					</p>

					<div class="max-h-64 space-y-2 overflow-y-auto">
						{#each importReview.warnings as warning (warning.key)}
							<label class="flex items-start gap-3 rounded-md border p-3 text-sm">
								<input
									type="checkbox"
									class="mt-1 size-4 shrink-0"
									value={warning.key}
									bind:group={confirmedWarnings}
									disabled={importBusy}
								/>
								<span class="min-w-0">
									<span class="block font-medium">
										Row {warning.row}:
										{#if warning.type === 'batch'}
											matches row {warning.matchingRow}
										{:else}
											matches {existingMatchName(warning.participantId)}
											({warning.status ?? 'existing'})
										{/if}
									</span>
									<span class="block text-muted-foreground">
										Matching fields: {warning.fields.join(', ')}
									</span>
									<span class="block">Import as a separate {terminology.singularLower}.</span>
								</span>
							</label>
						{/each}
					</div>

					<p class="text-sm" role="status">
						{confirmedWarnings.length} of {importReview.warnings.length} matches reviewed
					</p>
				{/if}
			</section>

			<form method="POST" action="?/importAthletes" use:enhance={enhanceImportCommit}>
				<input type="hidden" name="csv" value={reviewedCsv} />
				<input type="hidden" name="fingerprint" value={importReview.fingerprint} />

				{#each confirmedWarnings as warning (warning)}
					<input type="hidden" name="confirmedWarnings" value={warning} />
				{/each}

				<Dialog.Footer>
					<Button type="button" variant="outline" disabled={importBusy} onclick={closeImport}>
						Cancel
					</Button>
					<Button type="submit" disabled={importBusy || !importReady}>Confirm import</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
