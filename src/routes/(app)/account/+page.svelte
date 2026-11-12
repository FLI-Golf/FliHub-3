<script lang="ts">
	import { resolve } from '$app/paths';
	import { Trophy, Building2, Mail } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Your activities — FliHub</title></svelte:head>

<section class="mx-auto flex max-w-2xl flex-col gap-6 py-4">
	{#if !data.activity}
		<div class="flex flex-col gap-2">
			<p class="text-sm text-muted-foreground">Step 1 · Choose an activity</p>
			<h1 class="text-2xl font-semibold">
				Welcome to FliHub{data.user?.name ? `, ${data.user.name}` : ''}
			</h1>
			<p>What would you like to do? You can add other activities later.</p>
		</div>
		<form method="GET" action={resolve('/(app)/account')} class="flex flex-col gap-4">
			<fieldset class="flex flex-col gap-3">
				<legend class="mb-3 font-medium">Choose how you want to get started</legend>
				<label
					class="flex cursor-pointer items-start gap-3 rounded-lg border p-4"
					style="background-color: #eff6ff; border-color: #93c5fd; color: #172554;"
				>
					<input type="radio" name="activity" value="fantasy" required class="mt-1" />
					<Trophy class="mt-0.5 size-6 shrink-0" aria-hidden="true" />
					<span
						><strong class="block">Play fantasy</strong><span
							class="text-sm"
							style="color: inherit;"
							>Create or join a fantasy league and follow the competition.</span
						></span
					>
				</label>
				<label
					class="flex cursor-pointer items-start gap-3 rounded-lg border p-4"
					style="background-color: #f0fdf4; border-color: #86efac; color: #14532d;"
				>
					<input type="radio" name="activity" value="organization" required class="mt-1" />
					<Building2 class="mt-0.5 size-6 shrink-0" aria-hidden="true" />
					<span
						><strong class="block">Start or manage a sports organization</strong><span
							class="text-sm"
							style="color: inherit;">Manage seasons, teams, events, and scoring.</span
						></span
					>
				</label>
				<label
					class="flex cursor-pointer items-start gap-3 rounded-lg border p-4"
					style="background-color: #fffbeb; border-color: #fcd34d; color: #78350f;"
				>
					<input type="radio" name="activity" value="invitation" required class="mt-1" />
					<Mail class="mt-0.5 size-6 shrink-0" aria-hidden="true" />
					<span
						><strong class="block">Join through an invitation</strong><span
							class="text-sm"
							style="color: inherit;"
							>Find your next step for an organization or fantasy invitation.</span
						></span
					>
				</label>
			</fieldset>
			<Button type="submit" class="self-start">Continue</Button>
		</form>
	{:else}
		<Button variant="outline" href={`${resolve('/(app)/account')}?choose=1`} class="self-start"
			>Back to activities</Button
		>
		{#if data.activity === 'organization'}
			<h1 class="text-2xl font-semibold">Your sports organization</h1>
			<p>Open your organizations or create one. Creating an organization makes you its Owner.</p>
			<Button href={`${resolve('/(app)/organizations')}?create=1`} class="self-start"
				>Continue to organizations</Button
			>
		{:else if data.activity === 'invitation'}
			<h1 class="text-2xl font-semibold">Join an invitation</h1>
			<p>
				For an organization invitation, open the invitation link shared with you. Use the invited
				email address and complete email verification before accepting.
			</p>
			<p>
				Fantasy invitations currently appear in your account after the commissioner invites your
				registered email address.
			</p>
			<Button href={`${resolve('/(app)/account')}?activity=fantasy`} class="self-start"
				>View fantasy leagues and invitations</Button
			>
		{:else}
			<h1 class="text-2xl font-semibold">My fantasy leagues</h1>
			<p>Fantasy participation is separate from managing a sports organization.</p>
			{#each data.leagues as league (league.id)}
				<div class="flex flex-col gap-2 rounded-lg border p-4">
					<h2 class="font-semibold">{league.name}</h2>
					<p class="text-sm text-muted-foreground">Membership: {league.status}</p>
					<Button
						variant="outline"
						class="self-start"
						href={resolve('/(app)/organizations/[id]/fantasy/[league]', {
							id: league.organization,
							league: league.id
						})}>Open league</Button
					>
				</div>
			{:else}
				<p class="rounded-lg border p-4">You do not have any fantasy leagues or invitations yet.</p>
			{/each}
			<section class="flex flex-col gap-4 rounded-lg border p-4">
				{#if form?.message}<p role="alert" class="text-red-700">{form.message}</p>{/if}
				{#if data.selectedSeason}
					<h2 class="text-xl font-semibold">Create your fantasy league</h2>
					<p>{data.selectedSeason.sportsLeagueName} · {data.selectedSeason.name}</p>
					<p class="text-sm text-muted-foreground">
						You become the commissioner. Invite participants after creating your league.
					</p>
					<form
						method="POST"
						action={`?activity=fantasy&organization=${encodeURIComponent(data.organizationSlug)}&sportsLeague=${encodeURIComponent(data.sportsLeague)}&season=${encodeURIComponent(data.selectedSeason.id)}&/createFantasy`}
						class="flex flex-col gap-3"
					>
						<input type="hidden" name="season" value={data.selectedSeason.id} />
						<label class="flex flex-col gap-1"
							>Fantasy league name<input
								name="name"
								required
								minlength="2"
								maxlength="80"
								value={form?.name ?? ''}
								class="rounded-md border bg-background p-2"
							/></label
						>
						<label class="flex flex-col gap-1"
							>Participant limit (including you)<input
								name="participantLimit"
								type="number"
								required
								min="2"
								max="12"
								value={form?.participantLimit ?? 6}
								class="rounded-md border bg-background p-2"
							/></label
						>
						<Button type="submit" class="self-start">Create fantasy league</Button>
					</form>
					<!-- eslint-disable svelte/no-navigation-without-resolve -- Pathname already uses resolve(); query parameters are appended. -->
					<a
						class="underline"
						href={resolve('/(app)/account') +
							`?activity=fantasy&organization=${encodeURIComponent(data.organizationSlug)}&sportsLeague=${encodeURIComponent(data.sportsLeague)}`}
						>Choose another season</a
					>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{:else if data.sportsLeague}
					<h2 class="text-xl font-semibold">Choose a season</h2>
					{#each data.availableSeasons as season (season.id)}
						<!-- eslint-disable svelte/no-navigation-without-resolve -- Pathname already uses resolve(); query parameters are appended. -->
						<a
							class="rounded-md border p-3 hover:bg-muted"
							href={resolve('/(app)/account') +
								`?activity=fantasy&organization=${encodeURIComponent(data.organizationSlug)}&sportsLeague=${encodeURIComponent(data.sportsLeague)}&season=${encodeURIComponent(season.id)}`}
						>
							<strong class="block">{season.name}</strong><span class="text-sm"
								>{season.startsOn || 'Start date to be announced'}{season.endsOn
									? ` to ${season.endsOn}`
									: ''}</span
							>
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{:else}<p>No seasons are currently open for fantasy in this sports league.</p>{/each}
					<!-- eslint-disable svelte/no-navigation-without-resolve -- Pathname already uses resolve(); query parameters are appended. -->
					<a
						class="underline"
						href={resolve('/(app)/account') +
							`?activity=fantasy&organization=${encodeURIComponent(data.organizationSlug)}`}
						>Back to sports leagues</a
					>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{:else}
					<h2 class="text-xl font-semibold">Choose a sports league</h2>
					<p>Choose the competition your fantasy league will follow.</p>
					{#each data.sportsLeagues as league (league.id)}
						<!-- eslint-disable svelte/no-navigation-without-resolve -- Pathname already uses resolve(); query parameters are appended. -->
						<a
							class="rounded-md border p-3 hover:bg-muted"
							href={resolve('/(app)/account') +
								`?activity=fantasy&organization=${encodeURIComponent(data.organizationSlug)}&sportsLeague=${encodeURIComponent(league.id)}`}
						>
							<strong class="block">{league.name}</strong><span
								class="text-sm text-muted-foreground">{league.organizationName}</span
							>
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{:else}<p>
							No sports leagues are open for fantasy yet. Their organization must publish its page,
							enable Fantasy, and open at least one season for fantasy.
						</p>{/each}
				{/if}
			</section>
		{/if}
	{/if}
</section>
