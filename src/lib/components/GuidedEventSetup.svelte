<script lang="ts">
	import { shuffled } from '$lib/event-setup/shuffle';
	import { tick, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { prepareGuidedTeeTimes, GUIDED_TEE_ZONES as timeZones } from '$lib/event-setup/schedule';
	import { teeDisplay } from '$lib/tee-times';
	import type {
		GuidedEventInput,
		SetupSeason,
		SetupCourse,
		SetupEntry,
		SetupRoster,
		SetupMember,
		SetupRound
	} from '$lib/event-setup/types';
	interface GroupDraft {
		key: string;
		name: string;
		entries: string[];
		scorekeeper: string;
	}
	interface Props {
		seasons: SetupSeason[];
		courses: SetupCourse[];
		entries: SetupEntry[];
		roster: SetupRoster[];
		members: SetupMember[];
		currentUserId: string;
		capabilities: string[];
		loadError: string | null;
		form: unknown;
	}
	let {
		seasons,
		courses,
		entries,
		roster,
		members,
		currentUserId,
		capabilities,
		loadError,
		form
	}: Props = $props();
	const feedback = $derived(
		form && typeof form === 'object' && 'guidedEventSetup' in form
			? (form as Record<string, unknown>)
			: null
	);
	const initial = untrack(() => {
		try {
			const value = typeof feedback?.payload === 'string' ? JSON.parse(feedback.payload) : null;
			if (
				!value ||
				value.version !== 1 ||
				!['name', 'season', 'date'].every((key) => typeof value[key] === 'string') ||
				!Array.isArray(value.rounds) ||
				!Array.isArray(value.groups)
			)
				return null;
			if (
				value.rounds.length > 12 ||
				value.groups.length > 64 ||
				!value.rounds.every(
					(round: SetupRound) =>
						round &&
						typeof round.name === 'string' &&
						typeof round.course === 'string' &&
						typeof round.position === 'string' &&
						Array.isArray(round.holeIds)
				)
			)
				return null;
			if (
				!value.groups.every(
					(group: GuidedEventInput['groups'][number]) =>
						group &&
						typeof group.name === 'string' &&
						typeof group.scorekeeper === 'string' &&
						Array.isArray(group.entries) &&
						group.entries.every(
							(entry) => entry && typeof entry.entry === 'string' && Array.isArray(entry.athletes)
						)
				)
			)
				return null;
			return value as GuidedEventInput;
		} catch {
			return null;
		}
	});
	const defaults = untrack(() => {
		const course = courses.length === 1 ? courses[0] : undefined;
		return ['Red', 'Blue'].map((label, index) => ({
			name: `Round ${index + 1} · ${label}`,
			course: course?.id ?? '',
			position: course?.labels.some((item) => item.label === label && item.missing.length === 0)
				? label
				: '',
			holeIds: course?.holeIds ?? []
		}));
	});
	let step = $state(initial ? 5 : 0);
	let name = $state(initial?.name ?? '');
	let venueName = $state(typeof initial?.venueName === 'string' ? initial.venueName : '');
	let venueAddress = $state(typeof initial?.venueAddress === 'string' ? initial.venueAddress : '');
	let seasonId = $state(
		initial?.season ??
			untrack(() =>
				seasons.filter((season) => ['planned', 'active'].includes(season.status)).length === 1
					? (seasons.find((season) => ['planned', 'active'].includes(season.status))?.id ?? '')
					: ''
			)
	);
	let date = $state(initial?.date ?? '');
	let multiDay = $state(initial?.multiDay === true);
	let endDate = $state(typeof initial?.endDate === 'string' ? initial.endDate : '');
	let teeTimeZone = $state(
		typeof initial?.teeTimeZone === 'string' ? initial.teeTimeZone : 'America/Los_Angeles'
	);
	let teeIntervalMinutes = $state(initial?.teeIntervalMinutes ?? 10);
	let rounds = $state<SetupRound[]>(initial?.rounds ?? defaults);
	let selectedEntries = $state<string[]>(
		initial?.groups?.flatMap((group) => group.entries.map((entry) => entry.entry)) ?? []
	);
	let groups = $state<GroupDraft[]>(
		initial?.groups?.map((group, index) => ({
			key: String(index),
			name: group.name,
			scorekeeper: group.scorekeeper,
			entries: group.entries.map((entry) => entry.entry)
		})) ?? []
	);
	let teamsPerGroup = $state(2);
	let validation = $state('');
	let pending = $state(false);
	let consumedSuccess = $state('');
	let heading = $state<HTMLHeadingElement>();
	let errorMessage = $state<HTMLParagraphElement>();
	const steps = ['Event', 'Rounds', 'Groups', 'Lineups', 'Scorekeepers', 'Review'];
	const requiredCaps = [
		'events',
		'athletes',
		'teams',
		'leagues-seasons',
		'venues-courses',
		'scoring-results'
	];
	const missingCaps = $derived(requiredCaps.filter((id) => !capabilities.includes(id)));
	const season = $derived(seasons.find((item) => item.id === seasonId));
	const activeSeasons = $derived(
		seasons.filter((item) => ['planned', 'active'].includes(item.status))
	);
	const seasonEntries = $derived(
		entries
			.filter((entry) => entry.season === seasonId && entry.status === 'active' && entry.teamActive)
			.sort((a, b) => a.teamName.localeCompare(b.teamName))
	);
	const keepers = $derived(
		members.filter((member) => ['owner', 'admin', 'scorekeeper'].includes(member.role))
	);
	const created = $derived(
		Boolean(feedback?.guidedEventCreated && feedback.guidedEventId !== consumedSuccess)
	);
	const playingHoles = $derived(
		rounds.reduce(
			(total, round) =>
				total + (courses.find((course) => course.id === round.course)?.holeIds.length ?? 0),
			0
		)
	);
	const payload = $derived<GuidedEventInput>({
		version: 1,
		teeTimeZone,
		teeIntervalMinutes,
		name: name.trim(),
		venueName: venueName.trim(),
		venueAddress: venueAddress.trim(),
		season: seasonId,
		date,
		multiDay,
		endDate: multiDay ? endDate : '',
		rounds: rounds.map((round) => ({
			...round,
			holeIds: courses.find((course) => course.id === round.course)?.holeIds ?? []
		})),
		groups: groups.map((group) => ({
			name: group.name.trim(),
			scorekeeper: group.scorekeeper,
			entries: group.entries.map((entry) => ({
				entry,
				athletes: rosterFor(entry).map((item) => item.athlete)
			}))
		}))
	});
	const teePreview = $derived.by(() => {
		try {
			return { value: prepareGuidedTeeTimes(payload), error: '' };
		} catch (error) {
			return { value: null, error: error instanceof Error ? error.message : 'Check tee times.' };
		}
	});
	function groupTeeTime(roundIndex: number, groupIndex: number) {
		const round = teePreview.value?.rounds[roundIndex];
		return round?.teeStartsAt
			? teeDisplay(
					new Date(
						Date.parse(round.teeStartsAt) +
							groupIndex * (teePreview.value?.teeIntervalMinutes ?? 10) * 60000
					).toISOString(),
					teeTimeZone
				)
			: '';
	}
	function rosterFor(entry: string) {
		return roster.filter((item) => item.entry === entry && item.status === 'active');
	}
	function usableRoster(entry: string) {
		const rows = rosterFor(entry);
		return rows.length > 0 && rows.every((row) => row.athleteActive);
	}
	function entryName(id: string) {
		return entries.find((item) => item.id === id)?.teamName ?? 'Unavailable team';
	}
	function keeperName(id: string) {
		const member = members.find((item) => item.userId === id);
		return member ? `${member.name} · ${member.role}` : 'Unavailable scorekeeper';
	}
	function changeSeason(value: string) {
		seasonId = value;
		selectedEntries = [];
		groups = [];
		validation = '';
	}
	function selectEntry(id: string, checked: boolean) {
		selectedEntries = checked
			? [...selectedEntries, id]
			: selectedEntries.filter((item) => item !== id);
		groups = [];
		validation = '';
	}
	function generateGroups() {
		validation = '';
		if (!Number.isInteger(teamsPerGroup) || teamsPerGroup < 1 || teamsPerGroup > 12) {
			validation = 'Use 1–12 teams per suggested group.';
			return;
		}
		if (!selectedEntries.length || Math.ceil(selectedEntries.length / teamsPerGroup) > 64) {
			validation = 'Select teams and keep this wizard setup within 64 groups.';
			return;
		}
		const ordered = shuffled(
			seasonEntries.filter((entry) => selectedEntries.includes(entry.id)).map((entry) => entry.id)
		);
		groups = Array.from({ length: Math.ceil(ordered.length / teamsPerGroup) }, (_, index) => ({
			key: String(index),
			name: `Group ${index + 1}`,
			scorekeeper: keepers.some((member) => member.userId === currentUserId) ? currentUserId : '',
			entries: ordered.slice(index * teamsPerGroup, (index + 1) * teamsPerGroup)
		}));
	}
	function moveTeam(entryId: string, target: number) {
		groups = groups.map((group, index) => ({
			...group,
			entries:
				index === target
					? [...group.entries.filter((id) => id !== entryId), entryId]
					: group.entries.filter((id) => id !== entryId)
		}));
	}
	function changeCourse(index: number, courseId: string) {
		rounds[index] = {
			...rounds[index],
			course: courseId,
			position: '',
			holeIds: courses.find((course) => course.id === courseId)?.holeIds ?? []
		};
	}
	async function move(next: number) {
		step = next;
		validation = '';
		await tick();
		heading?.focus();
	}
	function validateStage(index: number): string {
		if (index === 0) {
			if (venueName.trim().length > 120 || venueAddress.trim().length > 500)
				return 'Use at most 120 characters for the venue name and 500 for its address.';
			if (
				!name.trim() ||
				name.trim().length > 120 ||
				!season ||
				!['planned', 'active'].includes(season.status)
			)
				return 'Enter an event name and choose a planned or active season.';
			const parsed = new Date(date + 'T00:00:00.000Z');
			if (
				!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
				!Number.isFinite(parsed.getTime()) ||
				parsed.toISOString().slice(0, 10) !== date
			)
				return 'Choose a valid event date.';
			if (
				(season.startsOn && date < season.startsOn.slice(0, 10)) ||
				(season.endsOn && date > season.endsOn.slice(0, 10))
			)
				return 'Choose a date within the season dates.';
			if (multiDay) {
				const end = new Date(endDate + 'T00:00:00.000Z');
				if (
					!/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
					!Number.isFinite(end.getTime()) ||
					end.toISOString().slice(0, 10) !== endDate
				)
					return 'Choose a valid end date for the multi-day event.';
				if (endDate <= date) return 'The end date must be after the start date.';
				if (
					(season.startsOn && endDate < season.startsOn.slice(0, 10)) ||
					(season.endsOn && endDate > season.endsOn.slice(0, 10))
				)
					return 'Choose an end date within the season dates.';
			}
		}
		if (
			index === 1 &&
			(!rounds.length ||
				rounds.length > 12 ||
				rounds.some(
					(round) =>
						round.name.length > 120 ||
						!courses.some(
							(course) =>
								course.id === round.course &&
								course.holeIds.length > 0 &&
								course.labels.some(
									(label) => label.label === round.position && label.missing.length === 0
								)
						)
				))
		)
			return 'Every round needs an active course with a complete named position. This wizard supports up to 12 rounds.';
		if (index === 2) {
			const assigned = groups.flatMap((group) => group.entries);
			if (
				!groups.length ||
				groups.length > 64 ||
				groups.some(
					(group) => !group.name.trim() || group.name.trim().length > 80 || !group.entries.length
				) ||
				new Set(groups.map((group) => group.name.trim())).size !== groups.length
			)
				return 'Generate nonempty groups with unique names of 1–80 characters.';
			if (
				assigned.length !== selectedEntries.length ||
				new Set(assigned).size !== assigned.length ||
				!assigned.every(
					(id) => selectedEntries.includes(id) && seasonEntries.some((entry) => entry.id === id)
				)
			)
				return 'Every selected season team must appear in exactly one group.';
		}
		if (index === 3) {
			if (
				!Number.isInteger(teeIntervalMinutes) ||
				teeIntervalMinutes < 1 ||
				teeIntervalMinutes > 240
			)
				return 'Use a tee interval from 1 to 240 whole minutes.';
			const rows = selectedEntries.flatMap(rosterFor);
			if (
				selectedEntries.some((id) => !usableRoster(id)) ||
				new Set(rows.map((row) => row.athlete)).size !== rows.length
			)
				return 'Each team needs an active, valid season roster; an athlete can appear only once. Fix the roster before continuing.';
			if (teePreview.error) return teePreview.error;
		}
		if (
			index === 4 &&
			groups.some((group) => !keepers.some((member) => member.userId === group.scorekeeper))
		)
			return 'Choose an authorized scorekeeper for every group. Viewers cannot enter scores.';
		return '';
	}
	const needsGenerate = $derived(selectedEntries.length > 0 && groups.length === 0);
	const groupsReady = $derived(validateStage(2) === '');
	const teesReady = $derived(validateStage(3) === '');
	const firstUnsetRound = $derived(rounds.findIndex((round) => !round.teeStartLocal));
	async function advance() {
		validation = validateStage(step);
		if (validation) {
			await tick();
			errorMessage?.focus();
			return;
		}
		if (step === 2 && rounds[0] && !rounds[0].teeStartLocal)
			rounds[0].teeStartLocal = `${date}T09:00`;
		await move(Math.min(step + 1, 5));
	}
	function startAnother() {
		consumedSuccess = String(feedback?.guidedEventId ?? '');
		name = '';
		venueName = '';
		venueAddress = '';
		date = '';
		multiDay = false;
		endDate = '';
		rounds = rounds.map((round) => ({ ...round, teeStartLocal: '', teeStartsAt: undefined }));
		selectedEntries = [];
		groups = [];
		step = 0;
		validation = '';
	}
</script>

<section
	id="guided-event-setup"
	class="flex flex-col gap-5 rounded-xl border border-blue-200 bg-blue-50/40 p-4 sm:p-6"
	aria-label="Guided team golf event setup"
>
	<div>
		<h2 class="text-xl font-semibold">Set up a team golf event</h2>
		<p class="mt-2 text-sm text-muted-foreground">
			Use existing season teams, rosters, and courses. Next and Back save nothing; refreshing clears
			unfinished answers. One final submission creates a new Planned event and its setup. Existing
			events and scores are unchanged.
		</p>
	</div>
	<noscript
		><p>
			The guided form requires JavaScript. Existing event tools remain available below.
		</p></noscript
	>
	{#if created}
		<div role="status" class="rounded-lg border border-green-200 bg-green-50 p-4 text-green-950">
			<strong>Created {String(feedback?.guidedEventName)}.</strong>
			<p class="mt-2 text-sm">
				Its rounds, groups, teams, roster athletes, scorekeeper assignments, and tee schedules are
				saved. Use the existing event operations below for schedule changes and later substitutions.
				No scores or results were created.
			</p>
			<button type="button" onclick={startAnother} class="mt-3 min-h-11 rounded-md border px-4 py-2"
				>Start another event</button
			>
		</div>
	{/if}
	{#if loadError || missingCaps.length}
		<p
			role="alert"
			class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
		>
			{loadError ?? `Enable these capabilities in Settings first: ${missingCaps.join(', ')}.`}
		</p>
	{:else if !created}
		{#if feedback?.message}<p
				role="alert"
				class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-950"
			>
				{String(feedback.message)}
			</p>{/if}
		<ol
			class="grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 lg:grid-cols-6"
			aria-label="Event setup progress"
		>
			{#each steps as label, index (label)}<li
					aria-current={step === index ? 'step' : undefined}
					class={`rounded-md border px-3 py-2 text-sm ${step === index ? 'border-blue-600 bg-blue-100 font-semibold text-blue-950' : 'bg-white'}`}
				>
					{index + 1}. {label}
				</li>{/each}
		</ol>
		<h3 bind:this={heading} tabindex="-1" class="text-lg font-semibold focus:outline-none">
			{steps[step]}
		</h3>
		{#if validation}<p
				bind:this={errorMessage}
				tabindex="-1"
				role="alert"
				class="rounded-md border border-red-200 bg-red-50 p-3 text-red-950"
			>
				{validation}
			</p>{/if}
		{#if step === 0}
			<div class="grid gap-4 sm:grid-cols-2">
				<div class="flex flex-col gap-2 sm:col-span-2">
					<label for="guided-name" class="font-medium">Event name</label><input
						id="guided-name"
						bind:value={name}
						maxlength="120"
						class="min-h-11 rounded-md border bg-background px-3 py-2"
						placeholder="Coastal Spring Open"
					/>
				</div>
				<div class="flex flex-col gap-2">
					<label for="guided-season" class="font-medium">Season</label><select
						id="guided-season"
						value={seasonId}
						onchange={(event) => changeSeason(event.currentTarget.value)}
						class="min-h-11 rounded-md border bg-background px-3 py-2"
						><option value="">Choose a season</option
						>{#each activeSeasons as option (option.id)}<option value={option.id}
								>{option.name}</option
							>{/each}</select
					>
				</div>
				<div class="flex flex-col gap-2">
					<label for="guided-date" class="font-medium"
						>{multiDay ? 'Start date' : 'Event date'}</label
					><input
						id="guided-date"
						type="date"
						bind:value={date}
						min={season?.startsOn?.slice(0, 10)}
						max={season?.endsOn?.slice(0, 10)}
						class="min-h-11 rounded-md border bg-background px-3 py-2"
					/>
				</div>
			</div>
			<div class="flex flex-col gap-3 rounded-lg border bg-white p-4">
				<label class="flex min-h-11 items-center gap-2 font-medium"
					><input
						type="checkbox"
						bind:checked={multiDay}
						aria-controls="guided-end-date-fields"
						aria-expanded={multiDay}
					/>Multi-day event</label
				>
				{#if multiDay}<div id="guided-end-date-fields" class="flex flex-col gap-2">
						<label for="guided-end-date">End date</label><input
							id="guided-end-date"
							type="date"
							bind:value={endDate}
							min={date || season?.startsOn?.slice(0, 10)}
							max={season?.endsOn?.slice(0, 10)}
							aria-describedby="guided-end-date-help"
							class="min-h-11 rounded-md border bg-background px-3 py-2"
						/>
						<p id="guided-end-date-help" class="text-sm text-muted-foreground">
							Choose a later day within the season. Schedule each round's local tee times separately
							after creation.
						</p>
					</div>{/if}
			</div>
			<fieldset class="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
				<legend class="px-1 font-semibold">Event venue / location (optional)</legend>
				<p id="guided-venue-help" class="text-sm text-muted-foreground">
					Where will the event take place? These details are saved on this event. Choose its playing
					courses separately in Rounds.
				</p>
				<div class="flex flex-col gap-2">
					<label for="guided-venue-name">Venue name</label><input
						id="guided-venue-name"
						bind:value={venueName}
						maxlength="120"
						aria-describedby="guided-venue-help"
						class="min-h-11 rounded-md border bg-background px-3 py-2"
						placeholder="Facility or park name"
					/>
				</div>
				<div class="flex flex-col gap-2">
					<label for="guided-venue-address">Venue address</label><input
						id="guided-venue-address"
						bind:value={venueAddress}
						maxlength="500"
						class="min-h-11 rounded-md border bg-background px-3 py-2"
						placeholder="Street address, city, state and postal code"
					/>
				</div>
			</fieldset>
			<p class="text-sm text-muted-foreground">
				This flow creates a season-linked team event for one or more days. The start date is saved
				at midnight UTC; a multi-day end date covers that day through 23:59:59.999 UTC. These are
				planning dates, not local tee times. Set each round’s first tee time in Lineups. Independent
				event planning remains below.
			</p>
		{:else if step === 1}
			<p class="text-sm">
				Choose each round’s course and complete position. Replaying nine holes in two rounds
				produces 18 playing holes.
			</p>
			{#each rounds as round, index (index)}
				<div class="grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-2">
					<div class="flex flex-col gap-2 sm:col-span-2">
						<label for={`guided-round-name-${index}`}>Round {index + 1} name</label><input
							id={`guided-round-name-${index}`}
							bind:value={rounds[index].name}
							maxlength="120"
							class="min-h-11 rounded-md border px-3 py-2"
						/>
					</div>
					<div class="flex flex-col gap-2">
						<label for={`guided-course-${index}`}>Course</label><select
							id={`guided-course-${index}`}
							value={round.course}
							onchange={(event) => changeCourse(index, event.currentTarget.value)}
							class="min-h-11 rounded-md border px-3 py-2"
							><option value="">Choose a course</option>{#each courses as course (course.id)}<option
									value={course.id}>{course.name} · {course.holeIds.length} holes</option
								>{/each}</select
						>
					</div>
					<div class="flex flex-col gap-2">
						<label for={`guided-position-${index}`}>Basket position / tee set</label><select
							id={`guided-position-${index}`}
							bind:value={rounds[index].position}
							class="min-h-11 rounded-md border px-3 py-2"
							><option value="">Choose a complete position</option
							>{#each courses.find((course) => course.id === round.course)?.labels ?? [] as label (label.label)}<option
									value={label.label}
									disabled={label.missing.length > 0}
									>{label.label} · {label.total} holes{label.missing.length
										? ` · missing ${label.missing.join(', ')}`
										: ''}</option
								>{/each}</select
						>
					</div>
					{#if rounds.length > 1}<button
							type="button"
							onclick={() => (rounds = rounds.filter((_, i) => i !== index))}
							class="min-h-11 w-fit rounded-md border px-3 py-2 text-sm text-red-900"
							>Remove round</button
						>{/if}
				</div>
			{/each}
			<button
				type="button"
				disabled={rounds.length >= 12}
				onclick={() =>
					(rounds = [
						...rounds,
						{
							name: `Round ${rounds.length + 1}`,
							course: '',
							position: '',
							holeIds: []
						}
					])}
				class="min-h-11 w-fit rounded-md border bg-white px-4 py-2">Add round</button
			>
			<p class="text-sm font-medium">Total playing holes: {playingHoles}</p>
		{:else if step === 2}
			<p class="text-sm">
				Choose existing season teams, then generate an editable grouping. Regenerating resets group
				names and scorekeeper selections.
			</p>
			<div class="flex flex-wrap gap-3">
				<button
					type="button"
					onclick={() => {
						selectedEntries = seasonEntries
							.filter((entry) => usableRoster(entry.id))
							.map((entry) => entry.id);
						groups = [];
					}}
					class="min-h-11 rounded-md border bg-white px-4 py-2"
					>Select all teams with valid rosters</button
				><span class="self-center text-sm"
					>{selectedEntries.length} selected of {seasonEntries.length} active entries</span
				>
			</div>
			<div class="grid gap-2 sm:grid-cols-2">
				{#each seasonEntries as entry (entry.id)}<label
						class="flex items-start gap-3 rounded-lg border bg-white p-3"
						><input
							class="mt-1"
							type="checkbox"
							checked={selectedEntries.includes(entry.id)}
							disabled={!usableRoster(entry.id)}
							onchange={(event) => selectEntry(entry.id, event.currentTarget.checked)}
						/><span
							><strong class="block">{entry.teamName}</strong><span class="text-sm"
								>{rosterFor(entry.id).length} roster athletes{usableRoster(entry.id)
									? ''
									: ' · fix missing/inactive roster athletes first'}</span
							></span
						></label
					>{/each}
			</div>
			<div class="flex flex-wrap items-end gap-3">
				<div class="flex flex-col gap-2">
					<label for="guided-group-size">Teams per suggested group</label><input
						id="guided-group-size"
						type="number"
						min="1"
						max="12"
						bind:value={teamsPerGroup}
						class="min-h-11 w-28 rounded-md border bg-white px-3 py-2"
					/>
				</div>
				<button
					type="button"
					onclick={generateGroups}
					class={`min-h-11 rounded-md px-5 py-2 font-semibold ${
						needsGenerate
							? 'bg-red-600 text-white ring-2 ring-red-300 hover:bg-red-700'
							: groups.length
								? 'bg-green-600 text-white hover:bg-green-700'
								: 'border bg-white'
					}`}>Generate suggested groups</button
				>
			</div>
			{#if needsGenerate}<p class="text-sm font-medium text-red-700" role="status">
					Next step: press “Generate suggested groups” to build the groups. Next stays locked until
					you do.
				</p>{:else if !selectedEntries.length}<p
					class="text-sm font-medium text-amber-800"
					role="status"
				>
					Select at least one team to continue.
				</p>{:else if !groupsReady}<p class="text-sm font-medium text-amber-800" role="status">
					{validateStage(2)}
				</p>{:else}<p class="text-sm font-medium text-green-700" role="status">
					Groups are ready. Press Next to continue.
				</p>{/if}
			{#each groups as group, index (group.key)}<div
					class="flex flex-col gap-3 rounded-lg border bg-white p-4"
				>
					<label for={`guided-group-${group.key}`} class="font-medium">Group {index + 1}</label
					><input
						id={`guided-group-${group.key}`}
						bind:value={groups[index].name}
						maxlength="80"
						class="min-h-11 rounded-md border px-3 py-2"
					/>{#each group.entries as entry (entry)}<div
							class="flex flex-wrap items-center justify-between gap-2"
						>
							<span>{entryName(entry)}</span><select
								aria-label={`Group for ${entryName(entry)}`}
								value={index}
								onchange={(event) => moveTeam(entry, Number(event.currentTarget.value))}
								class="min-h-11 rounded-md border px-3 py-2"
								>{#each groups as target, targetIndex (target.key)}<option value={targetIndex}
										>{target.name || `Group ${targetIndex + 1}`}</option
									>{/each}</select
							>
						</div>{/each}{#if group.entries.length === 0}<button
							type="button"
							onclick={() => (groups = groups.filter((item) => item.key !== group.key))}
							class="min-h-11 w-fit rounded-md border px-3 py-2 text-red-900"
							>Remove empty group</button
						>{/if}
				</div>{/each}
			{#if seasonEntries.length === 0}<p class="text-sm text-amber-950">
					Enter teams into this season on Leagues & seasons, then add their season rosters before
					continuing.
				</p>{/if}
		{:else if step === 3}
			<fieldset class="flex flex-col gap-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
				<legend class="px-1 font-semibold">First group tee times</legend>
				<p class="text-sm">
					Set the first group's date and time for each round. Following groups tee off at the
					interval shown, in the group order above. Next and Back save nothing.
				</p>
				<div class="grid gap-3 sm:grid-cols-2">
					<div class="flex flex-col gap-2">
						<label for="guided-tee-zone">Event timezone</label><input
							id="guided-tee-zone"
							list="guided-tee-zones"
							bind:value={teeTimeZone}
							class="min-h-11 rounded-md border bg-background px-3 py-2"
						/><datalist id="guided-tee-zones"
							>{#each timeZones as zone (zone)}<option value={zone}></option>{/each}</datalist
						>
					</div>
					<div class="flex flex-col gap-2">
						<label for="guided-tee-interval">Minutes between groups</label><input
							id="guided-tee-interval"
							type="number"
							min="1"
							max="240"
							step="1"
							bind:value={teeIntervalMinutes}
							class="min-h-11 rounded-md border bg-background px-3 py-2"
						/>
					</div>
				</div>
				{#each rounds as round, index (index)}<div class="flex flex-col gap-2">
						<label for={`guided-first-tee-${index}`}
							>Round {index + 1} · {round.name || round.position} · First group date and time</label
						><input
							id={`guided-first-tee-${index}`}
							type="datetime-local"
							bind:value={rounds[index].teeStartLocal}
							min={date ? date + 'T00:00' : undefined}
							max={(multiDay ? endDate : date) ? (multiDay ? endDate : date) + 'T23:59' : undefined}
							class={`min-h-11 rounded-md border-2 bg-background px-3 py-2 ${
								!round.teeStartLocal
									? 'border-red-500 ring-2 ring-red-200'
									: teePreview.error
										? 'border-amber-500'
										: 'border-green-600'
							}`}
						/>
					</div>{/each}
				{#if firstUnsetRound >= 0}<p class="text-sm font-medium text-red-700" role="status">
						Next step: set the first group’s date and time for Round {firstUnsetRound + 1}. Next
						stays locked until every round has a start time.
					</p>{:else if !teesReady}<p class="text-sm font-medium text-amber-800" role="status">
						{validateStage(3)}
					</p>{:else}<p class="text-sm font-medium text-green-700" role="status">
						Tee times are set. Press Next to continue.
					</p>{/if}
				<p class="text-sm text-muted-foreground">
					The default interval is 10 minutes: 09:00, 09:10, 09:20 and so on. Set a separate start
					for the next round, allowing enough time to play the preceding round. Changing the
					timezone reinterprets these local clock times.
				</p>
				{#if teePreview.value}{#each rounds as round, index (index)}<div
							class="rounded-md border bg-white p-3 text-sm"
						>
							<h4 class="font-semibold">Round {index + 1} · {round.name}</h4>
							<ul class="mt-2 space-y-1">
								{#each groups as group, groupIndex (group.key)}<li>
										{group.name} · {groupTeeTime(index, groupIndex)}
									</li>{/each}
							</ul>
						</div>{/each}{/if}
			</fieldset>
			<p class="text-sm">
				These lineups come from the selected teams’ active season rosters. Reserve pools are
				excluded. Make roster corrections in Teams & rosters and refresh before creating the event.
			</p>
			{#each groups as group (group.key)}<div class="rounded-lg border bg-white p-4">
					<h4 class="font-semibold">{group.name}</h4>
					{#each group.entries as entry (entry)}<p class="mt-2 text-sm">
							<strong>{entryName(entry)}:</strong>
							{rosterFor(entry)
								.map((row) => row.athleteName + (row.athleteActive ? '' : ' (inactive)'))
								.join(', ') || 'No active roster'}
						</p>{/each}
				</div>{/each}
		{:else if step === 4}
			<p class="text-sm">
				One assigned scorekeeper per group. Owners/Admins can score; Scorekeepers also need an event
				assignment. Viewers are not offered. The same authorized person may cover several groups.
			</p>
			{#each groups as group, index (group.key)}<div
					class="flex flex-col gap-2 rounded-lg border bg-white p-4"
				>
					<label for={`guided-keeper-${group.key}`} class="font-semibold">{group.name}</label
					><select
						id={`guided-keeper-${group.key}`}
						bind:value={groups[index].scorekeeper}
						class="min-h-11 rounded-md border px-3 py-2"
						><option value="">Choose a scorekeeper</option
						>{#each keepers as member (member.userId)}<option value={member.userId}
								>{member.name} · {member.role}</option
							>{/each}</select
					>
				</div>{/each}
		{:else}
			<dl class="grid gap-3 rounded-lg border bg-white p-4 text-sm sm:grid-cols-2">
				<div>
					<dt class="font-medium">Event</dt>
					<dd>{name.trim()}</dd>
				</div>
				<div>
					<dt class="font-medium">Season / {multiDay ? 'dates' : 'date'}</dt>
					<dd>
						{season?.name} · {date}{#if multiDay}
							→ {endDate} (multi-day){/if}
					</dd>
				</div>
				<div>
					<dt class="font-medium">Event venue / location</dt>
					<dd>
						{venueName.trim() || 'Not specified'}{#if venueAddress.trim()}<span
								class="mt-1 block whitespace-pre-wrap">{venueAddress.trim()}</span
							>{/if}
					</dd>
				</div>
				<div>
					<dt class="font-medium">Setup</dt>
					<dd>
						{rounds.length} rounds · {playingHoles} playing holes · {groups.length}
						groups
					</dd>
				</div>
				<div>
					<dt class="font-medium">Participation</dt>
					<dd>
						{selectedEntries.length} teams · {selectedEntries.flatMap(rosterFor).length} roster athletes
					</dd>
				</div>
			</dl>
			{#each rounds as round, index (index)}<p class="text-sm">
					Round {index + 1}: {round.name} · {courses.find((course) => course.id === round.course)
						?.name} · {round.position}
				</p>{/each}
			{#each groups as group (group.key)}<div class="rounded-lg border bg-white p-3 text-sm">
					<strong>{group.name}</strong>{#each group.entries as entry (entry)}<p class="mt-2">
							<strong>{entryName(entry)}:</strong>
							{rosterFor(entry)
								.map((row) => row.athleteName)
								.join(', ')}
						</p>{/each}
					<p class="mt-2">Scorekeeper: {keeperName(group.scorekeeper)}</p>
				</div>{/each}
			<div class="rounded-lg border border-blue-200 bg-blue-50 p-4">
				<h4 class="font-semibold">
					Tee schedule · {teeIntervalMinutes}-minute intervals · {teeTimeZone}
				</h4>
				{#if teePreview.error}<p role="alert" class="mt-2 text-red-900">
						{teePreview.error}
					</p>{:else}{#each rounds as round, index (index)}<div class="mt-3 text-sm">
							<strong>Round {index + 1} · {round.name}</strong>
							<ul class="mt-1 space-y-1">
								{#each groups as group, groupIndex (group.key)}<li>
										{group.name} · {groupTeeTime(index, groupIndex)}
									</li>{/each}
							</ul>
						</div>{/each}{/if}
			</div>
			<p class="rounded-lg bg-amber-50 p-4 text-sm text-amber-950">
				One submission creates the Planned event, rounds, groups, team assignments, tee schedules,
				and the roster lineups reviewed above. All are saved together or none are saved. Planning
				dates use UTC (start of the first day through the end of the selected last day), not local
				tee times. The reviewed tee schedules are saved with this setup. No scores, official
				results, fantasy draft, or reserve substitutions are created.
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
			{#if step < 5}<button
					type="button"
					onclick={advance}
					disabled={(step === 2 && !groupsReady) || (step === 3 && !teesReady)}
					class="min-h-11 rounded-md bg-blue-700 px-5 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
					>{step === 4 ? 'Review setup' : 'Next'}</button
				>
			{:else}<form
					method="POST"
					action="?/createGuidedEvent"
					use:enhance={({ cancel }) => {
						validation = [0, 1, 2, 3, 4].map(validateStage).find(Boolean) ?? '';
						if (pending || validation) {
							cancel();
							return;
						}
						pending = true;
						return async ({ update }) => {
							try {
								await update({ reset: false });
							} finally {
								pending = false;
							}
						};
					}}
				>
					<input type="hidden" name="guidedEvent" value={JSON.stringify(payload)} /><button
						type="submit"
						disabled={pending}
						class="min-h-11 rounded-md bg-blue-700 px-5 py-2 font-medium text-white disabled:opacity-50"
						>{pending ? 'Creating…' : 'Create event and setup'}</button
					>
				</form>{/if}
		</div>
	{/if}
</section>
