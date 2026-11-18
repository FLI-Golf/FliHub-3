<script lang="ts">
	import { resolve } from '$app/paths';
	import { Clock, Lock, Minus, Plus, ToggleRight } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import ExpensesManager from '$lib/components/ExpensesManager.svelte';
	import SponsorsManager from '$lib/components/SponsorsManager.svelte';
	import AthletesManager from '$lib/components/AthletesManager.svelte';
	import TeamsManager from '$lib/components/TeamsManager.svelte';
	import RostersManager from '$lib/components/RostersManager.svelte';
	import CompetitionsManager from '$lib/components/CompetitionsManager.svelte';
	import EventsManager from '$lib/components/EventsManager.svelte';
	import GuidedEventSetup from '$lib/components/GuidedEventSetup.svelte';
	import EventOpsManager from '$lib/components/EventOpsManager.svelte';
	import CoursesManager from '$lib/components/CoursesManager.svelte';
	import ScoringManager from '$lib/components/ScoringManager.svelte';
	import StandingsTables from '$lib/components/StandingsTables.svelte';
	import FantasyManager from '$lib/components/FantasyManager.svelte';
	import { availabilityMeta } from '$lib/capabilities/catalog';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const meta = $derived(availabilityMeta[data.capability.availability]);
</script>

<svelte:head>
	<title>{data.capability.label} — {data.organization.name} — FliHub</title>
</svelte:head>

<section class="flex flex-col gap-6 py-4">
	<div class="flex flex-col gap-2">
		<h1 class="text-2xl font-semibold tracking-tight">
			{data.organization.name} — {data.capability.label}
		</h1>
	</div>

	{#if !data.enabled}
		<Alert.Root>
			<ToggleRight class="size-4" />
			<Alert.Title>{data.capability.label} is not enabled</Alert.Title>
			<Alert.Description>
				This capability is disabled for {data.organization.name}, so its workflows are hidden.
				{#if data.canManage}
					Enable it in organization settings — nothing is created until the software exists.
				{:else}
					Ask an Owner or Admin to enable it. Your role ({data.myRole}) cannot change configuration.
				{/if}
			</Alert.Description>
		</Alert.Root>
		{#if data.canManage}
			<div>
				<Button
					href={resolve('/(app)/organizations/[id]/settings', {
						id: data.organization.id
					})}
				>
					Open settings
				</Button>
			</div>
		{/if}
	{:else if data.expenses && data.expenseUserId}
		<ExpensesManager
			expenses={data.expenses}
			organizationId={data.organization.id}
			userId={data.expenseUserId}
			canManage={data.canManage}
			{form}
		/>
	{:else if data.capability.id === 'sponsorships'}
		{#if data.sponsors}
			<SponsorsManager sponsors={data.sponsors} {form} />
		{:else}
			<Alert.Root>
				<Lock class="size-4" />
				<Alert.Title>Owner or Admin access required</Alert.Title>
			</Alert.Root>
		{/if}
	{:else if data.capability.id === 'athletes' && data.capability.availability === 'available' && data.athletes}
		<AthletesManager
			athletes={data.athletes}
			canManage={data.canManage}
			myRole={data.myRole}
			{form}
		/>
	{:else if data.capability.id === 'teams' && data.capability.availability === 'available' && data.teams && data.rosters}
		<TeamsManager teams={data.teams} canManage={data.canManage} myRole={data.myRole} {form} />
		<RostersManager
			seasons={data.rosters.seasons}
			entries={data.rosters.entries}
			athletes={data.rosters.athletes}
			memberships={data.rosters.memberships}
			pools={data.rosters.pools}
			reserves={data.rosters.reserves}
			substitutions={data.rosters.substitutions}
			events={data.rosters.events}
			canManage={data.canManage}
			{form}
		/>
	{:else if data.capability.id === 'leagues-seasons' && data.capability.availability === 'available' && data.competition}
		<CompetitionsManager
			leagues={data.competition.leagues}
			seasons={data.competition.seasons}
			divisions={data.competition.divisions}
			entries={data.competition.entries}
			teams={data.competition.teams}
			canManage={data.canManage}
			myRole={data.myRole}
			{form}
		/>
	{:else if data.capability.id === 'events' && data.capability.availability === 'available' && data.eventsData}
		{#if data.canManage}
			<details class="group/create rounded-xl border-2 border-blue-200 bg-blue-50/50 p-4">
				<summary
					class="flex cursor-pointer list-none items-center gap-3 font-semibold text-blue-950 focus-visible:outline-2 focus-visible:outline-offset-4 [&::-webkit-details-marker]:hidden"
				>
					<span
						class="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-green-700 bg-green-600 text-white"
					>
						<Plus class="size-5 group-open/create:hidden" aria-hidden="true" />
						<Minus class="hidden size-5 group-open/create:block" aria-hidden="true" />
					</span>
					<span>
						{data.eventsData.events.filter((event) => event.status !== 'archived').length > 0
							? 'Create another event'
							: 'Set up your first event'}
					</span>
				</summary>
				<div class="pt-4">
					<GuidedEventSetup
						seasons={data.eventsData.seasons}
						courses={data.eventsData.courses}
						entries={data.eventsData.entries}
						roster={data.eventsData.rosterMemberships}
						members={data.eventsData.members}
						currentUserId={data.eventsData.currentUserId}
						capabilities={data.organization.capabilities}
						loadError={data.eventsData.setupLoadError}
						{form}
					/>
				</div>
			</details>
		{/if}
		<EventsManager
			setupData={data.eventsData}
			events={data.eventsData.events}
			seasons={data.eventsData.seasons}
			canManage={data.canManage}
			myRole={data.myRole}
			{form}
		/>
		<EventOpsManager
			events={data.eventsData.events}
			rounds={data.eventsData.rounds}
			groups={data.eventsData.groups}
			groupTeams={data.eventsData.groupTeams}
			groupAthletes={data.eventsData.groupAthletes}
			entries={data.eventsData.entries}
			rosterMemberships={data.eventsData.rosterMemberships}
			substitutions={data.eventsData.substitutions}
			members={data.eventsData.members}
			courses={data.eventsData.courses}
			canManage={data.canManage}
			{form}
		/>
	{:else if data.capability.id === 'venues-courses' && data.capability.availability === 'available' && data.coursesData}
		<CoursesManager
			courses={data.coursesData.courses}
			holes={data.coursesData.holes}
			positions={data.coursesData.positions}
			canManage={data.canManage}
			myRole={data.myRole}
			{form}
		/>
	{:else if data.capability.id === 'scoring-results' && data.capability.availability === 'available' && data.scoringData}
		<ScoringManager
			organizationId={data.organization.id}
			events={data.scoringData.events}
			scorekeepers={data.scoringData.scorekeeperDirectory}
			pendingInvitations={data.scoringData.scorekeeperInvitations}
			canScore={data.scoringData.canScore}
			myRole={data.myRole}
			{form}
		/>
	{:else if data.capability.id === 'standings' && data.capability.availability === 'available' && data.standingsData}
		<div class="flex flex-col gap-4" data-testid="member-standings">
			<p class="text-sm text-muted-foreground">
				Standings use only published official results (D16): seasons sum total strokes across their
				events with a published result — lowest total leads, teams and athletes are ranked only
				after a result in every counted event (others show Unranked with their strokes), and equal
				totals among ranked rows share a position. Pending corrections never count until
				republished.
			</p>
			<StandingsTables standings={data.standingsData.standings} testid="member-standings" />
		</div>
	{:else if data.capability.id === 'fantasy' && data.capability.availability === 'available' && data.fantasyData}
		<FantasyManager
			organizationId={data.organization.id}
			leagues={data.fantasyData.leagues}
			{form}
		/>
	{:else}
		<Card.Root class="max-w-2xl">
			<Card.Header>
				<div class="flex items-center justify-between gap-2">
					<Card.Title class="text-base">{data.capability.label}</Card.Title>
					<Badge variant="secondary" class={meta.badgeClass}>
						{meta.label}
					</Badge>
				</div>
				<Card.Description>{data.capability.description}</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				<p class="text-sm text-muted-foreground">
					{#if data.capability.availability === 'planned'}
						This capability is enabled for {data.organization.name} and will appear here when it is implemented
						({data.capability.milestone}). It is selected for planning and navigation — nothing on
						this screen is functional yet.
					{:else}
						This area is deferred to a later phase ({data.capability.milestone}) and is shown for
						planning visibility only.
					{/if}
				</p>
				{#if data.myRole === 'viewer' || data.myRole === 'scorekeeper'}
					<p class="flex items-center gap-2 text-sm text-muted-foreground">
						<Lock class="size-4" />
						Your role ({data.myRole}) is read-oriented here regardless of capability selection.
					</p>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}

	<p class="flex items-center gap-2 text-xs text-muted-foreground">
		<Clock class="size-3.5" />
		Membership, organization switching, and settings stay available regardless of capability selection.
	</p>
</section>
