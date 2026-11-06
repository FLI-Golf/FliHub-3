<script lang="ts">
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
		events: ScoringEvent[];
		canScore: boolean;
		myRole: string;
	}

	let { organizationId, events, canScore, myRole }: Props = $props();
</script>

<div class="flex flex-col gap-6">
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
