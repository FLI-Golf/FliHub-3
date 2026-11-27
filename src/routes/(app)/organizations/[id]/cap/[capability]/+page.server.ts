import {
	parseFundingTarget,
	type SponsorshipFundingCondition
} from '$lib/sponsorships/funding-threshold';
import { createHash } from 'node:crypto';
import {
	DemoFillError,
	fillEventDemoScores,
	submitEventDemoScorecards
} from '$lib/server/fill-event-demo-scores';
import type { Expense } from '$lib/expenses/model';
import { submitExpense, reviewExpense, replaceExpenseReceipt } from '$lib/server/expenses';
import {
	sponsorStages,
	type Sponsor,
	type SponsorshipAgreement,
	type SponsorshipQuote,
	type SponsorshipFundingEntry
} from '$lib/sponsorships/model';
import { prepareGuidedTeeTimes } from '$lib/event-setup/schedule';
import type { GuidedEventInput } from '$lib/event-setup/types';
import { allocateTournamentPurses, parseSeasonPurse } from '$lib/season-purse';
import { toTeeInstant, type TeeSchedule } from '$lib/tee-times';
import { error, fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { OrgRole } from '$lib/server/auth';
import { pbErrorMessage, pbErrorStatus, toOrganizationDTO } from '$lib/server/auth';
import { getCapability } from '$lib/capabilities/catalog';
import type { StandingsTable } from '$lib/public-page';

const ID_PATTERN = /^[a-z0-9]{15}$/;

function sponsorshipSeedId(organization: string, key: string): string {
	return createHash('sha256')
		.update('flihub-sponsorship-demo:' + organization + ':' + key)
		.digest('hex')
		.slice(0, 15);
}

function eventDateMessage(
	startsAt: string,
	season: { startsOn?: unknown; endsOn?: unknown } | null
): string | null {
	if (!startsAt) return null;
	const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/.exec(startsAt);
	if (!match) return 'Enter a valid event date and time.';
	const day = match[1];
	const parsed = new Date(day + 'T00:00:00Z');
	if (
		!Number.isFinite(parsed.getTime()) ||
		parsed.toISOString().slice(0, 10) !== day ||
		Number(match[2]) > 23 ||
		Number(match[3]) > 59 ||
		Number(match[4] ?? 0) > 59
	) {
		return 'Enter a valid event date and time.';
	}
	const first = String(season?.startsOn ?? '').slice(0, 10);
	const last = String(season?.endsOn ?? '').slice(0, 10);
	if ((first && day < first) || (last && day > last)) {
		return `Choose a start date within the season: ${first || 'no start limit'} to ${last || 'no end limit'}.`;
	}
	return null;
}

/**
 * Capability destination pages. Access rules, enforced server-side here and
 * by collection rules on the data itself:
 * - non-members never see the page (404);
 * - members see an honest "not enabled" state when the capability is off;
 * - enabled planned/upcoming capabilities show their honest status — no fake
 *   CRUD screens, no working-looking buttons.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const pb = locals.pb;
	const user = locals.user;
	if (!pb || !user) {
		error(503, 'PocketBase is not configured.');
	}
	if (!ID_PATTERN.test(params.id)) {
		error(404, 'Organization not found.');
	}

	const capability = getCapability(params.capability);
	if (!capability) {
		error(404, 'Unknown capability.');
	}

	const memberships = await pb.collection('memberships').getFullList({
		filter: `organization = "${params.id}" && user = "${user.id}"`
	});
	const mine = memberships[0];
	if (!mine) {
		error(404, 'Organization not found.');
	}
	const myRole = String(mine.role) as OrgRole;

	const organization = await pb.collection('organizations').getOne(params.id);
	const dto = toOrganizationDTO(organization);
	const enabled = dto.capabilities.includes(capability.id);

	let expenses: Expense[] | null = null;
	if (capability.id === 'reimbursements' && enabled) {
		const records = await pb.collection('expenses').getFullList({
			filter:
				myRole === 'owner' || myRole === 'admin'
					? pb.filter('organization = {:organization}', { organization: params.id })
					: pb.filter('organization = {:organization} && submitter = {:submitter}', {
							organization: params.id,
							submitter: user.id
						}),
			sort: '-created,id',
			fields:
				'id,expenseOn,vendor,category,purpose,amountCents,receipt,status,reviewNote,returnHistory,submitter,submitterName'
		});
		expenses = records.map((record) => ({
			id: record.id,
			expenseOn: String(record.expenseOn),
			vendor: String(record.vendor),
			category: String(record.category),
			purpose: String(record.purpose),
			amountCents: Number(record.amountCents),
			hasReceipt: Boolean(record.receipt),
			status: record.status as Expense['status'],
			reviewNote: String(record.reviewNote ?? ''),
			returnHistory: Array.isArray(record.returnHistory) ? record.returnHistory : [],
			submitter: String(record.submitter),
			submitterName: String(record.submitterName ?? '')
		}));
	}

	let sponsors: Sponsor[] | null = null;
	let sponsorshipFunding: SponsorshipFundingEntry[] = [];
	let sponsorshipConditions: SponsorshipFundingCondition[] = [];
	let sponsorshipQuotes: SponsorshipQuote[] = [];
	let sponsorshipAgreements: SponsorshipAgreement[] = [];
	const sponsorshipSeasons: { id: string; label: string }[] = [];
	const sponsorshipEvents: { id: string; label: string; season: string }[] = [];
	const sponsorshipTargets: { value: string; label: string }[] = [
		{ value: 'organization', label: 'Organization' }
	];
	if (capability.id === 'sponsorships' && enabled && (myRole === 'owner' || myRole === 'admin')) {
		sponsors = await pb.collection('sponsors').getFullList<Sponsor>({
			filter: pb.filter('organization = {:organization}', { organization: params.id }),
			sort: 'name,id',
			fields: 'id,name,contactName,contactEmail,stage,followUpOn,nextAction,notes,archived'
		});
		const orgFilter = pb.filter('organization = {:org}', { org: params.id });
		const activeFilter = pb.filter('organization = {:org} && status != "archived"', {
			org: params.id
		});
		const [agreements, leagues, seasons, teams, events, rounds, holes] = await Promise.all([
			pb.collection('sponsorship_agreements').getFullList<SponsorshipAgreement>({
				filter: pb.filter('organization = {:org}', { org: params.id }),
				sort: '-signedOn,id'
			}),
			pb.collection('leagues').getFullList({ filter: activeFilter, sort: 'name' }),
			pb.collection('seasons').getFullList({ filter: orgFilter, sort: 'name' }),
			pb.collection('teams').getFullList({ filter: activeFilter, sort: 'name' }),
			pb.collection('events').getFullList({ filter: orgFilter, sort: 'name' }),
			pb.collection('rounds').getFullList({ filter: activeFilter, sort: 'number' }),
			pb.collection('course_holes').getFullList({ filter: activeFilter, sort: 'number' })
		]);
		sponsorshipAgreements = agreements;
		for (const season of seasons)
			sponsorshipSeasons.push({ id: season.id, label: String(season.name) });
		for (const event of events)
			sponsorshipEvents.push({
				id: event.id,
				label: String(event.name),
				season: String(event.season ?? '')
			});
		const fundingFilter = pb.filter('organization = {:org}', { org: params.id });
		const [funding, reversals, conditions] = await Promise.all([
			pb.collection('sponsorship_funding_entries').getFullList<SponsorshipFundingEntry>({
				filter: fundingFilter,
				sort: 'entryDate,id',
				fields: 'id,agreement,kind,amountCents,entryDate,method,reference'
			}),
			pb
				.collection('sponsorship_payment_reversals')
				.getFullList<NonNullable<SponsorshipFundingEntry['reversal']> & { payment: string }>({
					filter: fundingFilter,
					fields: 'payment,reason,recordedByName,recordedBy,created'
				}),
			pb.collection('sponsorship_funding_conditions').getFullList<SponsorshipFundingCondition>({
				filter: fundingFilter,
				fields:
					'agreement,targetCents,percentage,currency,deadline,selectedIds,releasedAt,releasedBy,releasedByName,releasedCommittedCents'
			})
		]);
		sponsorshipConditions = conditions;
		const reversalsByPayment = new Map(reversals.map((reversal) => [reversal.payment, reversal]));
		sponsorshipFunding = funding.map((entry) => ({
			...entry,
			reversal: reversalsByPayment.get(entry.id)
		}));
		sponsorshipQuotes = await pb.collection('sponsorship_quotes').getFullList<SponsorshipQuote>({
			filter: pb.filter('organization = {:org}', { org: params.id }),
			sort: '-created,id',
			fields: 'id,sponsor,packageName,currency,amountCents,benefits'
		});
		for (const [kind, label, rows] of [
			['league', 'League', leagues],
			['season', 'Season', seasons.filter((row) => row.status !== 'archived')],
			['team', 'Team', teams],
			['event', 'Event', events.filter((row) => row.status !== 'archived')]
		] as const) {
			for (const row of rows)
				sponsorshipTargets.push({
					value: kind + ':' + row.id,
					label: label + ' · ' + String(row.name)
				});
		}
		const eventsById = new Map(events.map((event) => [event.id, event]));
		for (const round of rounds) {
			const event = eventsById.get(String(round.event));
			if (!event || event.status === 'archived') continue;
			for (const hole of holes.filter((hole) => hole.course === round.course)) {
				sponsorshipTargets.push({
					value: ['hole', event.id, round.id, hole.id].join(':'),
					label:
						String(event.name) +
						' · Round ' +
						String(round.number) +
						' · Hole ' +
						String(hole.number)
				});
			}
		}
	}

	// Phase 1C: the athletes capability is implemented software — load its records.
	// Identity fields live on `athletes` (all member roles); contact/eligibility
	// fields live on `athlete_private` (Owner/Admin-only by collection rule —
	// Scorekeepers/Viewers simply get an empty list back).
	let athletes = null;
	if (capability.id === 'athletes' && enabled) {
		const canSeePrivate =
			dto.profile !== 'charity-run-walk' && (myRole === 'owner' || myRole === 'admin');
		const records = await pb.collection('athletes').getFullList({
			filter: `organization = "${params.id}"`,
			sort: 'lastName,firstName'
		});
		const privateByAthlete = new Map();
		if (canSeePrivate) {
			const privates = await pb.collection('athlete_private').getFullList({
				filter: `organization = "${params.id}"`
			});
			for (const p of privates) privateByAthlete.set(String(p.athlete), p);
		}
		athletes = records.map((r) => {
			const base = {
				id: r.id,
				firstName: String(r.firstName ?? ''),
				lastName: String(r.lastName ?? ''),
				displayName: String(r.displayName ?? '') || null,
				gender: String(r.gender ?? '') || null,
				nationality: String(r.nationality ?? '') || null,
				hasPrivateRecord: privateByAthlete.has(r.id),
				status: (String(r.status) || 'active') as 'active' | 'archived'
			};
			// Charity directories and non-manager roles omit private keys from the page
			// data entirely — not just nulled — so the payload cannot carry them.
			if (!canSeePrivate) return base;
			const priv = privateByAthlete.get(r.id);
			return {
				...base,
				email: priv ? String(priv.email ?? '') || null : null,
				phone: priv ? String(priv.phone ?? '') || null : null,
				eligibilityNotes: priv ? String(priv.eligibilityNotes ?? '') || null : null
			};
		});
	}

	// Phase 1D: competition structure (decisions recorded as D12). Identity and
	// relationships are readable by every organization member; only Owners and
	// Admins write (collection rules), with the capability gate and same-org /
	// division-in-season integrity enforced by the flihub_competitions hook.
	// Phase 1E (D13) adds season rosters, reserve pools, and substitutions to
	// the same capability, enforced by the flihub_rosters hook.
	let teams = null;
	let rosters = null;
	if (capability.id === 'teams' && enabled) {
		const filter = `organization = "${params.id}"`;
		const [
			teamRows,
			seasonRows,
			entryRows,
			athleteRows,
			membershipRows,
			poolRows,
			reserveRows,
			substitutionRows,
			eventRows
		] = await Promise.all([
			pb.collection('teams').getFullList({ filter, sort: 'name' }),
			pb
				.collection('seasons')
				.getFullList({ filter, sort: 'name' })
				.catch(() => []),
			pb
				.collection('season_entries')
				.getFullList({ filter, sort: 'id' })
				.catch((err) => {
					console.error('Unable to load season entries', err);
					error(502, 'Unable to load season entries. Check the dev-server terminal for details.');
				}),
			pb
				.collection('athletes')
				.getFullList({ filter, sort: 'lastName,firstName' })
				.catch(() => []),
			pb.collection('roster_memberships').getFullList({ filter, sort: 'created' }),
			pb.collection('reserve_pools').getFullList({ filter, sort: 'name' }),
			pb.collection('reserve_members').getFullList({ filter, sort: 'created' }),
			pb.collection('substitutions').getFullList({ filter, sort: '-created' }),
			pb.collection('events').getFullList({ filter: `${filter} && season != ""`, sort: 'name' })
		]);
		teams = teamRows.map((t) => ({
			id: t.id,
			name: String(t.name ?? ''),
			status: (String(t.status) || 'active') as 'active' | 'archived'
		}));
		const teamName = new Map(teamRows.map((t) => [t.id, String(t.name ?? '')]));
		const athleteName = new Map(
			athleteRows.map((a) => [
				a.id,
				String(a.displayName ?? '') ||
					`${String(a.firstName ?? '')} ${String(a.lastName ?? '')}`.trim()
			])
		);
		const eventName = new Map(eventRows.map((ev) => [ev.id, String(ev.name ?? '')]));
		const entryTeam = new Map(entryRows.map((en) => [en.id, String(en.team ?? '')]));
		rosters = {
			seasons: seasonRows.map((s) => ({
				id: s.id,
				name: String(s.name ?? ''),
				status: (String(s.status) || 'planned') as 'planned' | 'active' | 'completed' | 'archived'
			})),
			entries: entryRows.map((en) => ({
				id: en.id,
				season: String(en.season ?? ''),
				team: String(en.team ?? ''),
				teamName: teamName.get(String(en.team ?? '')) ?? '',
				status: (String(en.status) || 'active') as 'active' | 'archived'
			})),
			athletes: athleteRows.map((a) => ({
				id: a.id,
				name: athleteName.get(a.id) ?? '',
				gender: String(a.gender ?? '') || null,
				status: (String(a.status) || 'active') as 'active' | 'archived'
			})),
			memberships: membershipRows.map((m) => ({
				id: m.id,
				entry: String(m.entry ?? ''),
				season: String(m.season ?? ''),
				athlete: String(m.athlete ?? ''),
				athleteName: athleteName.get(String(m.athlete ?? '')) ?? '',
				status: (String(m.status) || 'active') as 'active' | 'archived'
			})),
			pools: poolRows.map((p) => ({
				id: p.id,
				season: String(p.season ?? ''),
				name: String(p.name ?? ''),
				gender: String(p.gender ?? '') || null,
				status: (String(p.status) || 'active') as 'active' | 'archived'
			})),
			reserves: reserveRows.map((r) => ({
				id: r.id,
				pool: String(r.pool ?? ''),
				season: String(r.season ?? ''),
				athlete: String(r.athlete ?? ''),
				athleteName: athleteName.get(String(r.athlete ?? '')) ?? '',
				status: (String(r.status) || 'active') as 'active' | 'archived'
			})),
			substitutions: substitutionRows.map((s) => ({
				id: s.id,
				event: String(s.event ?? ''),
				eventName: eventName.get(String(s.event ?? '')) ?? '',
				entry: String(s.entry ?? ''),
				teamName: teamName.get(entryTeam.get(String(s.entry ?? '')) ?? '') ?? '',
				athleteOutName: athleteName.get(String(s.athleteOut ?? '')) ?? '',
				athleteInName: athleteName.get(String(s.athleteIn ?? '')) ?? '',
				reason: String(s.reason ?? '') || null,
				created: String(s.created ?? '')
			})),
			events: eventRows.map((ev) => ({
				id: ev.id,
				season: String(ev.season ?? ''),
				name: String(ev.name ?? '')
			}))
		};
	}

	let competition = null;
	if (capability.id === 'leagues-seasons' && enabled) {
		const filter = `organization = "${params.id}"`;
		const [leagueRows, seasonRows, divisionRows, entryRows, teamRows] = await Promise.all([
			pb.collection('leagues').getFullList({ filter, sort: 'name' }),
			pb.collection('seasons').getFullList({ filter, sort: 'name' }),
			pb.collection('divisions').getFullList({ filter, sort: 'name' }),
			// NB: 1C/1D collections have no created/updated autodate fields (only the
			// 1A collections do), so sorting by 'created' would 400 — use stable id.
			pb.collection('season_entries').getFullList({ filter, sort: 'id' }),
			pb.collection('teams').getFullList({ filter, sort: 'name' })
		]);
		const leagueName = new Map(leagueRows.map((l) => [l.id, String(l.name ?? '')]));
		const teamName = new Map(teamRows.map((t) => [t.id, String(t.name ?? '')]));
		const divisionName = new Map(divisionRows.map((d) => [d.id, String(d.name ?? '')]));
		competition = {
			leagues: leagueRows.map((l) => ({
				id: l.id,
				name: String(l.name ?? ''),
				status: (String(l.status) || 'active') as 'active' | 'archived'
			})),
			seasons: seasonRows.map((s) => ({
				id: s.id,
				league: String(s.league ?? ''),
				leagueName: leagueName.get(String(s.league ?? '')) ?? '',
				name: String(s.name ?? ''),
				status: (String(s.status) || 'planned') as 'planned' | 'active' | 'completed' | 'archived',
				startsOn: String(s.startsOn ?? '') || null,
				endsOn: String(s.endsOn ?? '') || null,
				purseAmountCents: String(s.purseCurrency ?? '') ? Number(s.purseAmountCents ?? 0) : null,
				purseCurrency: String(s.purseCurrency ?? ''),
				fantasyEnabled: Boolean(s.fantasyEnabled)
			})),
			divisions: divisionRows.map((d) => ({
				id: d.id,
				season: String(d.season ?? ''),
				name: String(d.name ?? ''),
				status: (String(d.status) || 'active') as 'active' | 'archived'
			})),
			entries: entryRows.map((en) => ({
				id: en.id,
				season: String(en.season ?? ''),
				team: String(en.team ?? ''),
				teamName: teamName.get(String(en.team ?? '')) ?? '',
				division: String(en.division ?? '') || null,
				divisionName: divisionName.get(String(en.division ?? '')) ?? null,
				status: (String(en.status) || 'active') as 'active' | 'archived'
			})),
			teams: teamRows.map((t) => ({
				id: t.id,
				name: String(t.name ?? ''),
				status: (String(t.status) || 'active') as 'active' | 'archived'
			}))
		};
	}

	let eventsData = null;
	if (capability.id === 'events' && enabled) {
		let wizardReadFailure = false;
		const filter = `organization = "${params.id}"`;
		const [
			eventRows,
			seasonRows,
			roundRows,
			groupRows,
			groupTeamRows,
			groupAthleteRows,
			entryRows,
			teamRows,
			athleteRows,
			membershipRows,
			rosterRows,
			substitutionRows,
			courseRows,
			courseHoleRows,
			holePositionRows
		] = await Promise.all([
			pb.collection('events').getFullList({ filter, sort: 'startsAt,name' }),
			pb.collection('seasons').getFullList({ filter, sort: 'name' }),
			pb.collection('rounds').getFullList({ filter, sort: 'number' }),
			pb.collection('event_groups').getFullList({ filter, sort: 'name' }),
			pb.collection('group_teams').getFullList({ filter, sort: 'created' }),
			pb.collection('group_athletes').getFullList({ filter, sort: 'created' }),
			pb
				.collection('season_entries')
				.getFullList({ filter, sort: 'id' })
				.catch(() => {
					wizardReadFailure = true;
					return [];
				}),
			pb
				.collection('teams')
				.getFullList({ filter, sort: 'name' })
				.catch(() => {
					wizardReadFailure = true;
					return [];
				}),
			pb
				.collection('athletes')
				.getFullList({ filter, sort: 'lastName,firstName' })
				.catch(() => {
					wizardReadFailure = true;
					return [];
				}),
			pb.collection('memberships').getFullList({ filter, expand: 'user' }),
			pb
				.collection('roster_memberships')
				.getFullList({ filter, sort: 'created' })
				.catch(() => {
					wizardReadFailure = true;
					return [];
				}),
			pb
				.collection('substitutions')
				.getFullList({ filter, sort: '-created' })
				.catch(() => {
					wizardReadFailure = true;
					return [];
				}),
			pb
				.collection('courses')
				.getFullList({ filter, sort: 'name' })
				.catch(() => {
					wizardReadFailure = true;
					return [];
				}),
			pb
				.collection('course_holes')
				.getFullList({ filter, sort: 'number' })
				.catch(() => {
					wizardReadFailure = true;
					return [];
				}),
			pb
				.collection('hole_positions')
				.getFullList({ filter, sort: 'label' })
				.catch(() => {
					wizardReadFailure = true;
					return [];
				})
		]);
		const seasonName = new Map(seasonRows.map((s) => [s.id, String(s.name ?? '')]));
		const teamName = new Map(teamRows.map((t) => [t.id, String(t.name ?? '')]));
		const athleteName = new Map(
			athleteRows.map((a) => [
				a.id,
				String(a.displayName ?? '') ||
					`${String(a.firstName ?? '')} ${String(a.lastName ?? '')}`.trim()
			])
		);
		const courseName = new Map(courseRows.map((c) => [c.id, String(c.name ?? '')]));
		const memberName = new Map(
			membershipRows.map((m) => [
				String(m.user),
				String((m.expand?.user as { name?: unknown } | undefined)?.name ?? '') || String(m.user)
			])
		);
		eventsData = {
			currentUserId: user.id,
			setupLoadError: wizardReadFailure
				? 'Some setup records could not be loaded. Refresh before using guided creation.'
				: null,
			events: eventRows.map((ev) => ({
				id: ev.id,
				venueName: String(ev.venueName ?? ''),
				venueAddress: String(ev.venueAddress ?? ''),
				season: String(ev.season ?? '') || null,
				seasonName: seasonName.get(String(ev.season ?? '')) ?? null,
				name: String(ev.name ?? ''),
				startsAt: String(ev.startsAt ?? '') || null,
				endsAt: String(ev.endsAt ?? '') || null,
				status: (String(ev.status) || 'planned') as 'planned' | 'active' | 'completed' | 'archived'
			})),
			seasons: seasonRows.map((s) => ({
				id: s.id,
				status: String(s.status ?? ''),
				name: String(s.name ?? ''),
				startsOn: String(s.startsOn ?? '') || null,
				endsOn: String(s.endsOn ?? '') || null
			})),
			// Phase 1F event operations (D14).
			rounds: roundRows.map((r) => ({
				teeSchedule: (r.teeSchedule || null) as TeeSchedule | null,
				id: r.id,
				event: String(r.event ?? ''),
				number: Number(r.number ?? 0),
				name: String(r.name ?? '') || null,
				course: String(r.course ?? '') || null,
				courseName: courseName.get(String(r.course ?? '')) ?? null,
				positionLabel: String(r.positionLabel ?? '') || null,
				status: (String(r.status) || 'active') as 'active' | 'archived'
			})),
			groups: groupRows.map((g) => ({
				id: g.id,
				event: String(g.event ?? ''),
				name: String(g.name ?? ''),
				scorekeeper: String(g.scorekeeper ?? '') || null,
				scorekeeperName: memberName.get(String(g.scorekeeper ?? '')) ?? null,
				status: (String(g.status) || 'active') as 'active' | 'archived'
			})),
			groupTeams: groupTeamRows.map((gt) => ({
				id: gt.id,
				group: String(gt.group ?? ''),
				event: String(gt.event ?? ''),
				entry: String(gt.entry ?? ''),
				status: (String(gt.status) || 'active') as 'active' | 'archived'
			})),
			groupAthletes: groupAthleteRows.map((ga) => ({
				id: ga.id,
				group: String(ga.group ?? ''),
				event: String(ga.event ?? ''),
				entry: String(ga.entry ?? ''),
				athlete: String(ga.athlete ?? ''),
				athleteName: athleteName.get(String(ga.athlete ?? '')) ?? '',
				status: (String(ga.status) || 'active') as 'active' | 'archived'
			})),
			entries: entryRows.map((en) => ({
				id: en.id,
				teamActive: teamRows.some(
					(team) => team.id === String(en.team) && team.status === 'active'
				),
				season: String(en.season ?? ''),
				team: String(en.team ?? ''),
				teamName: teamName.get(String(en.team ?? '')) ?? '',
				status: (String(en.status) || 'active') as 'active' | 'archived'
			})),
			rosterMemberships: rosterRows.map((m) => ({
				entry: String(m.entry ?? ''),
				athleteActive: athleteRows.some(
					(athlete) => athlete.id === String(m.athlete) && athlete.status === 'active'
				),
				athlete: String(m.athlete ?? ''),
				athleteName: athleteName.get(String(m.athlete ?? '')) ?? '',
				status: (String(m.status) || 'active') as 'active' | 'archived'
			})),
			substitutions: substitutionRows.map((s) => ({
				event: String(s.event ?? ''),
				entry: String(s.entry ?? ''),
				athleteOut: String(s.athleteOut ?? ''),
				athleteIn: String(s.athleteIn ?? ''),
				athleteInName: athleteName.get(String(s.athleteIn ?? '')) ?? ''
			})),
			members: membershipRows.map((m) => ({
				userId: String(m.user),
				name: memberName.get(String(m.user)) ?? String(m.user),
				role: String(m.role ?? '')
			})),
			// Active courses with each position label's coverage across the
			// course's active holes, so the round form offers complete labels and
			// shows exactly which holes are missing from incomplete ones.
			courses: courseRows
				.filter((c) => String(c.status) === 'active')
				.map((c) => {
					const activeHoles = courseHoleRows.filter(
						(h) => String(h.course) === c.id && String(h.status) === 'active'
					);
					const holeIds = new Set(activeHoles.map((h) => h.id));
					const holeNumber = new Map(activeHoles.map((h) => [h.id, Number(h.number ?? 0)]));
					const holesByLabel = new Map<string, Set<string>>();
					for (const p of holePositionRows) {
						if (!holeIds.has(String(p.hole)) || String(p.status) !== 'active') continue;
						const label = String(p.label ?? '');
						if (!label) continue;
						if (!holesByLabel.has(label)) holesByLabel.set(label, new Set());
						holesByLabel.get(label)?.add(String(p.hole));
					}
					const labels = [...holesByLabel.entries()]
						.map(([label, covered]) => ({
							label,
							total: activeHoles.length,
							missing: activeHoles
								.filter((h) => !covered.has(h.id))
								.map((h) => holeNumber.get(h.id) ?? 0)
								.sort((a, b) => a - b)
						}))
						.sort((a, b) => a.label.localeCompare(b.label));
					return {
						id: c.id,
						name: String(c.name ?? ''),
						labels,
						holeIds: activeHoles.map((hole) => hole.id)
					};
				})
		};
	}

	// Phase 1F: course layouts (D14). Courses only — venue records remain
	// planned. Any member reads; Owners/Admins write (collection rules), with
	// the capability gate and same-org integrity in the flihub_event_ops hook.
	let coursesData = null;
	if (capability.id === 'venues-courses' && enabled) {
		const filter = `organization = "${params.id}"`;
		const [courseRows, holeRows, positionRows] = await Promise.all([
			pb.collection('courses').getFullList({ filter, sort: 'name' }),
			pb.collection('course_holes').getFullList({ filter, sort: 'number' }),
			pb.collection('hole_positions').getFullList({ filter, sort: 'label' })
		]);
		coursesData = {
			courses: courseRows.map((c) => ({
				id: c.id,
				name: String(c.name ?? ''),
				status: (String(c.status) || 'active') as 'active' | 'archived'
			})),
			holes: holeRows.map((h) => ({
				id: h.id,
				course: String(h.course ?? ''),
				number: Number(h.number ?? 0),
				name: String(h.name ?? ''),
				par: Number(h.par ?? 0),
				status: (String(h.status) || 'active') as 'active' | 'archived'
			})),
			positions: positionRows.map((p) => ({
				id: p.id,
				hole: String(p.hole ?? ''),
				label: String(p.label ?? ''),
				distance: Number(p.distance ?? 0),
				unit: String(p.unit ?? ''),
				status: (String(p.status) || 'active') as 'active' | 'archived'
			}))
		};
	}

	// Phase 1G: scoring entry points (D15). Score entry itself lives on the
	// phone scorecard route; this page lists which events are ready.
	let scoringData = null;
	if (capability.id === 'scoring-results' && enabled) {
		const filter = `organization = "${params.id}"`;
		const [eventRows, seasonRows, roundRows, groupRows, scorecardRows, resultRows] =
			await Promise.all([
				pb.collection('events').getFullList({ filter, sort: 'name' }),
				pb
					.collection('seasons')
					.getFullList({ filter, sort: 'name' })
					.catch(() => []),
				pb.collection('rounds').getFullList({ filter, sort: 'number' }),
				pb.collection('event_groups').getFullList({ filter, sort: 'name' }),
				pb.collection('scorecards').getFullList({ filter, sort: 'created' }),
				pb.collection('event_results').getFullList({ filter })
			]);
		const seasonName = new Map(seasonRows.map((s) => [s.id, String(s.name ?? '')]));
		const tournamentPurses = new Map(
			seasonRows
				.filter((season) => season.purseCurrency === 'USD')
				.flatMap((season) =>
					Array.from(
						allocateTournamentPurses(
							Number(season.purseAmountCents),
							eventRows
								.filter((event) => event.season === season.id && event.status !== 'archived')
								.map((event) => ({
									id: event.id,
									startsAt: String(event.startsAt ?? '')
								}))
						)
					)
				)
		);
		const resultByEvent = new Map(resultRows.map((r) => [String(r.event), r]));

		const scorekeeperDirectory: {
			id: string;
			name: string;
			email: string | null;
		}[] = [];
		const scorekeeperInvitations: {
			id: string;
			email: string;
			status: string;
		}[] = [];

		if (myRole === 'owner' || myRole === 'admin') {
			const [memberRows, invitationRows] = await Promise.all([
				pb.collection('memberships').getFullList({
					filter: pb.filter('organization = {:org} && role = "scorekeeper"', {
						org: params.id
					}),
					expand: 'user',
					sort: 'created'
				}),
				pb.collection('invitations').getFullList({
					filter: pb.filter('organization = {:org} && role = "scorekeeper" && status = "pending"', {
						org: params.id
					}),
					sort: '-created'
				})
			]);

			for (const member of memberRows) {
				const person = member.expand?.user;
				scorekeeperDirectory.push({
					id: member.id,
					name: String(person?.name ?? '') || 'Unnamed scorekeeper',
					email: String(person?.email ?? '') || null
				});
			}
			for (const invitation of invitationRows) {
				const expiry = Date.parse(String(invitation.expires_at ?? '').replace(' ', 'T'));
				scorekeeperInvitations.push({
					id: invitation.id,
					email: String(invitation.email ?? ''),
					status:
						Number.isFinite(expiry) && expiry > Date.now()
							? 'Pending invitation'
							: 'Expired invitation'
				});
			}
		}

		scoringData = {
			scorekeeperDirectory,
			scorekeeperInvitations,
			events: eventRows
				.filter((ev) => String(ev.status) !== 'archived')
				.map((ev) => {
					const roundCount = roundRows.filter(
						(r) =>
							String(r.event) === ev.id && String(r.status) === 'active' && String(r.course ?? '')
					).length;
					const groupCount = groupRows.filter(
						(g) => String(g.event) === ev.id && String(g.status) === 'active'
					).length;
					const cards = scorecardRows.filter((c) => String(c.event) === ev.id);
					const result = resultByEvent.get(ev.id) ?? null;
					return {
						id: ev.id,
						name: String(ev.name ?? ''),
						seasonId: String(ev.season ?? '') || null,
						isPast:
							ev.status === 'archived' ||
							seasonRows.some(
								(season) =>
									season.id === ev.season &&
									['completed', 'archived'].includes(String(season.status))
							),
						seasonName: seasonName.get(String(ev.season ?? '')) ?? null,
						tournamentPurseCents: tournamentPurses.get(ev.id) ?? null,
						roundCount,
						groupCount,
						scorecardCount: cards.length,
						submittedCount: cards.filter((c) => String(c.status) === 'submitted').length,
						resultStatus: result ? String(result.status) : null,
						resultId: result?.id ?? null,
						resultVersion: result ? Number(result.currentVersion) : null
					};
				})
				.filter((ev) => ev.roundCount > 0 && ev.groupCount > 0),
			canScore:
				myRole === 'owner' ||
				myRole === 'admin' ||
				(myRole === 'scorekeeper' &&
					groupRows.some((g) => String(g.scorekeeper) === user.id && String(g.status) === 'active'))
		};
	}

	// Phases 2A–2B: fantasy leagues. The caller's own fantasy memberships are
	// readable by collection rule; league visibility comes from membership,
	// never from organization staff roles.
	let fantasyData = null;
	if (capability.id === 'fantasy' && enabled) {
		const memberships = await pb.collection('fantasy_members').getFullList({
			filter: `user = "${user.id}"`,
			expand: 'league',
			sort: 'created'
		});
		const rows = memberships
			.map((m) => ({
				membership: m,
				league: (m.expand as { league?: Record<string, unknown> } | undefined)?.league
			}))
			.filter((x) => x.league && String(x.league.organization) === params.id);
		fantasyData = {
			leagues: rows
				.filter((x) => !['declined', 'removed'].includes(String(x.membership.status)))
				.map((x) => ({
					id: String(x.league!.id),
					name: String(x.league!.name ?? ''),
					participantLimit: Number(x.league!.participantLimit ?? 0),
					role: String(x.membership.role),
					status: String(x.membership.status),
					membershipId: String(x.membership.id)
				}))
		};
	}

	// Phase 1I: competition standings from published official results, computed
	// by the shared publication-rule layer. Members see standings over ALL
	// events with a currently published official result; the per-record public
	// flag gates only the public surfaces.
	let standingsData = null;
	if (capability.id === 'standings' && enabled) {
		try {
			const response = (await pb.send(`/api/flihub/organizations/${params.id}/standings`, {
				method: 'GET'
			})) as { standings: StandingsTable[] };
			standingsData = { standings: response.standings };
			try {
				const filter = pb.filter('organization = {:org}', { org: params.id });
				const [seasons, events, leagues] = await Promise.all([
					pb
						.collection('seasons')
						.getFullList({ filter, fields: 'id,league,purseAmountCents,purseCurrency' }),
					pb.collection('events').getFullList({
						filter: `${filter} && status != "archived"`,
						fields: 'id,season,startsAt'
					}),
					pb.collection('leagues').getFullList({
						filter,
						fields:
							'id,name,payoutTopWeight,payoutLowerWeight,payoutPerTournament,payoutEventCurves'
					})
				]);
				const purses = new Map(
					seasons
						.filter((season) => season.purseCurrency === 'USD')
						.map((season) => [
							season.id,
							allocateTournamentPurses(
								Number(season.purseAmountCents),
								events
									.filter((event) => event.season === season.id)
									.map((event) => ({ id: event.id, startsAt: String(event.startsAt ?? '') }))
							)
						])
				);
				const seasonLeague = new Map(
					seasons.map((season) => [season.id, String(season.league ?? '')])
				);
				const leagueById = new Map(leagues.map((league) => [league.id, league]));
				for (const table of standingsData.standings) {
					const seasonPurses = table.season ? purses.get(table.season) : undefined;
					const league = table.season
						? leagueById.get(seasonLeague.get(table.season) ?? '')
						: undefined;
					for (const event of table.payoutEvents ?? []) {
						event.purseCents = seasonPurses?.get(event.event) ?? null;
						if (league && typeof league.payoutTopWeight === 'number') {
							event.leagueId = league.id;
							event.leagueName = String(league.name);
							event.topWeight = league.payoutTopWeight;
							event.lowerWeight = Number(league.payoutLowerWeight ?? 0);
							event.perTournament = league.payoutPerTournament === true;
							const eventCurve = parseEventCurves(league.payoutEventCurves)[event.event];
							if (eventCurve) event.eventCurve = eventCurve;
						}
					}
				}
			} catch {
				// Published stroke standings remain available if purse data cannot be loaded.
			}
		} catch {
			standingsData = { standings: [] };
		}
	}

	return {
		organization: dto,
		myRole,
		canManage: myRole === 'owner' || myRole === 'admin',
		capability,
		enabled,
		expenses,
		expenseUserId: expenses ? user.id : null,
		sponsors,
		sponsorshipAgreements,
		sponsorshipQuotes,
		sponsorshipFunding,
		sponsorshipConditions,
		sponsorshipAsOf: new Date().toISOString().slice(0, 10),
		sponsorshipTargets,
		sponsorshipSeasons,
		sponsorshipEvents,
		seedAgreementCount: sponsorshipAgreements.filter(
			(agreement) =>
				agreement.sponsor === sponsorshipSeedId(params.id, 'sponsor') &&
				agreement.id === sponsorshipSeedId(params.id, 'agreement:' + agreement.coverage)
		).length,
		canSeedSponsorships:
			import.meta.env.DEV &&
			['127.0.0.1', 'localhost', '[::1]'].includes(new URL(pb.baseURL).hostname),
		athletes,
		teams,
		rosters,
		competition,
		eventsData,
		coursesData,
		scoringData,
		standingsData,
		fantasyData
	};
};

/** Parses one CSV line, honoring simple double-quoted fields. */

/**
 * Athlete writes. The collection API rules enforce Owner/Admin; the
 * flihub_athletes hook enforces the capability being enabled. Both are
 * re-checked here so failures surface as form errors, not surprises.
 */
export const actions: Actions = {
	saveLeaguePayoutCurve: async ({ locals: { pb, user }, params, request }) => {
		if (!pb || !user) return fail(401, { message: 'Sign in to save a payout curve.' });
		const form = await request.formData();
		const leagueId = String(form.get('league') ?? '');
		const weight = String(form.get('topWeight') ?? '');
		const lowerWeight = String(form.get('lowerWeight') ?? '0');
		const perTournament = form.get('perTournament') === '1';
		const eventId = String(form.get('event') ?? '');
		if (
			params.capability !== 'standings' ||
			!ID_PATTERN.test(params.id) ||
			!ID_PATTERN.test(leagueId)
		)
			return fail(404, { message: 'League not found.' });
		if (
			!/^\d{1,3}$/.test(weight) ||
			Number(weight) > 100 ||
			!/^\d{1,3}$/.test(lowerWeight) ||
			Number(lowerWeight) > 100
		)
			return fail(400, { message: 'Choose an emphasis between 0 and 100.' });
		try {
			const owner = await pb
				.collection('memberships')
				.getFirstListItem(
					pb.filter('organization = {:org} && user = {:user} && role = "owner"', {
						org: params.id,
						user: user.id
					})
				)
				.catch(() => null);
			if (!owner)
				return fail(403, { message: 'Only the organization Owner can save a payout curve.' });
			const league = await pb.collection('leagues').getOne(leagueId);
			if (league.organization !== params.id) return fail(404, { message: 'League not found.' });
			if (perTournament) {
				if (!ID_PATTERN.test(eventId)) return fail(400, { message: 'Choose a tournament.' });
				const tournament = await pb.collection('events').getOne(eventId, { fields: 'id,season' });
				const season = await pb
					.collection('seasons')
					.getOne(String(tournament.season), { fields: 'id,league' });
				if (season.league !== leagueId) return fail(404, { message: 'Tournament not found.' });
				const curves = parseEventCurves(league.payoutEventCurves);
				curves[eventId] = { top: Number(weight), lower: Number(lowerWeight) };
				await pb.collection('leagues').update(leagueId, {
					payoutPerTournament: true,
					payoutEventCurves: JSON.stringify(curves)
				});
			} else {
				await pb.collection('leagues').update(leagueId, {
					payoutTopWeight: Number(weight),
					payoutLowerWeight: Number(lowerWeight),
					payoutPerTournament: false
				});
			}
			return { payoutCurveSaved: true };
		} catch (err) {
			return fail(pbErrorStatus(err), {
				message: pbErrorMessage(err, 'Unable to save the payout curve.')
			});
		}
	},

	resetLeaguePayoutCurve: async ({ locals: { pb, user }, params, request }) => {
		if (!pb || !user) return fail(401, { message: 'Sign in to reset the payout curve.' });
		const form = await request.formData();
		const leagueId = String(form.get('league') ?? '');
		if (
			params.capability !== 'standings' ||
			!ID_PATTERN.test(params.id) ||
			!ID_PATTERN.test(leagueId)
		)
			return fail(404, { message: 'League not found.' });
		try {
			const owner = await pb
				.collection('memberships')
				.getFirstListItem(
					pb.filter('organization = {:org} && user = {:user} && role = "owner"', {
						org: params.id,
						user: user.id
					})
				)
				.catch(() => null);
			if (!owner)
				return fail(403, { message: 'Only the organization Owner can reset a payout curve.' });
			const league = await pb.collection('leagues').getOne(leagueId);
			if (league.organization !== params.id) return fail(404, { message: 'League not found.' });
			await pb.collection('leagues').update(leagueId, {
				payoutTopWeight: 0,
				payoutLowerWeight: 0,
				payoutPerTournament: false,
				payoutEventCurves: ''
			});
			return { payoutCurveReset: true };
		} catch (err) {
			return fail(pbErrorStatus(err), {
				message: pbErrorMessage(err, 'Unable to reset the payout curve.')
			});
		}
	},

	scoreSeasonDemo: async ({ locals, params, request }) => {
		if (!import.meta.env.DEV || params.capability !== 'scoring-results')
			return fail(404, { demoScoringError: 'Not found.' });
		const { pb, user } = locals;
		if (!pb || !user) return fail(503, { demoScoringError: 'PocketBase is not configured.' });
		if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(pb.baseURL).hostname))
			return fail(403, {
				demoScoringError: 'Season scoring tools require local development PocketBase.'
			});

		const form = await request.formData();
		const season = String(form.get('season') ?? '');
		const operation = form.get('operation');
		const ids = [...new Set(form.getAll('event').map(String))];
		if (
			![params.id, season, ...ids].every((id) => ID_PATTERN.test(id)) ||
			!ids.length ||
			(operation !== 'fill' && operation !== 'submit' && operation !== 'undo')
		)
			return fail(400, { demoScoringError: 'Choose a season and scoring action.' });

		try {
			const membership = await pb
				.collection('memberships')
				.getFirstListItem(
					pb.filter(
						'organization = {:org} && user = {:user} && (role = "owner" || role = "admin")',
						{ org: params.id, user: user.id }
					)
				)
				.catch(() => null);
			if (!membership)
				return fail(403, {
					demoScoringError: 'Only Owners and Admins can use season scoring tools.'
				});
			const rows = await pb.collection('events').getFullList({
				filter: pb.filter('organization = {:org} && season = {:season} && status != "archived"', {
					org: params.id,
					season
				}),
				sort: 'startsAt,id'
			});
			const events = rows.filter((row) => ids.includes(row.id));
			if (events.length !== ids.length)
				return fail(400, { demoScoringError: 'All selected events must belong to this season.' });

			const demoScoringResults = [];
			for (const event of events) {
				try {
					let message: string;
					if (operation === 'fill') {
						const { added } = await fillEventDemoScores(
							pb,
							params.id,
							event.id,
							user.id,
							Math.random,
							true
						);
						message = added ? `Added ${added} demo scores.` : 'No missing demo scores.';
					} else if (operation === 'undo') {
						const { removed, locked } = await pb.send<{ removed: number; locked: number }>(
							`/api/flihub/demo/organizations/${params.id}/seasons/${season}/events/${event.id}/undo-scores`,
							{ method: 'POST' }
						);
						message = `Removed ${removed} generated draft scores. ${locked} submitted or previously submitted scores kept.`;
					} else {
						const { submitted, skipped } = await submitEventDemoScorecards(
							pb,
							params.id,
							event.id,
							user.id
						);
						message = `Submitted ${submitted} cards. ${skipped} already submitted.`;
					}
					demoScoringResults.push({ id: event.id, ok: true, message });
				} catch (err) {
					demoScoringResults.push({
						id: event.id,
						ok: false,
						message: err instanceof DemoFillError ? err.message : pbErrorMessage(err)
					});
				}
			}
			return { demoScoringResults };
		} catch (err) {
			return fail(pbErrorStatus(err), {
				demoScoringError: pbErrorMessage(err, 'Unable to process season scores.')
			});
		}
	},

	submitExpense,
	reviewExpense,
	replaceExpenseReceipt,
	saveSponsor: async ({ locals, params, request }) => {
		const { pb, user } = locals;
		if (!pb || !user) return fail(503, { message: 'PocketBase is not configured.' });
		if (params.capability !== 'sponsorships' || !ID_PATTERN.test(params.id)) {
			return fail(404, { message: 'Sponsorships page not found.' });
		}

		const form = await request.formData();
		const read = (key: string) => String(form.get(key) ?? '').trim();
		const id = read('sponsor');
		const intent = read('intent');
		const seeding = intent === 'seed-agreement';
		const clearing = intent === 'clear-seed-agreements';
		if (
			(seeding || clearing) &&
			(!import.meta.env.DEV ||
				!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(pb.baseURL).hostname))
		) {
			return fail(404, {
				message: 'Sponsorship seed tools are available only in local development.'
			});
		}
		if (
			![
				'create',
				'edit',
				'archive',
				'restore',
				'agreement',
				'seed-agreement',
				'clear-seed-agreements',
				'quote',
				'convert-quote',
				'funding-entry',
				'reverse-payment',
				'funding-condition',
				'release-installments'
			].includes(intent) ||
			(intent !== 'create' && !seeding && !clearing && !ID_PATTERN.test(id))
		) {
			return fail(400, { message: 'Choose a valid sponsor action.' });
		}

		try {
			const organization = await pb.collection('organizations').getOne(params.id);
			const memberships = await pb.collection('memberships').getFullList({
				filter: pb.filter('organization = {:organization} && user = {:user}', {
					organization: params.id,
					user: user.id
				})
			});
			if (
				!memberships.some(({ role }) => role === 'owner' || role === 'admin') ||
				!toOrganizationDTO(organization).capabilities.includes('sponsorships')
			) {
				return fail(403, {
					message: 'Sponsorships must be enabled and managed by an Owner or Admin.'
				});
			}

			if (intent === 'release-installments') {
				const agreement = read('agreement');
				if (!ID_PATTERN.test(agreement)) return fail(400, { message: 'Choose an agreement.' });
				try {
					await pb.send('/api/flihub/sponsorships/' + params.id + '/release-installments', {
						method: 'POST',
						body: { sponsor: id, agreement }
					});
				} catch (err) {
					return fail(pbErrorStatus(err), {
						conditionAgreement: agreement,
						releaseError: pbErrorMessage(err)
					});
				}
				redirect(
					303,
					'/organizations/' + params.id + '/cap/sponsorships#sponsorship-agreement-' + agreement
				);
			}

			if (intent === 'funding-condition') {
				const agreement = read('agreement');
				const conditionValues = {
					target: read('target'),
					percentage: read('percentage'),
					currency: read('currency'),
					deadline: read('deadline'),
					selectedIds: form.getAll('selectedIds').map(String)
				};
				const targetCents = parseFundingTarget(conditionValues.target);
				const invalid = (conditionError: string, status = 400) =>
					fail(status, { conditionAgreement: agreement, conditionError, conditionValues });
				if (!ID_PATTERN.test(agreement)) return invalid('Choose a dependent agreement.');
				if (!targetCents) return invalid('Enter a valid funding target.');
				try {
					await pb.send('/api/flihub/sponsorships/' + params.id + '/funding-condition', {
						method: 'POST',
						body: {
							...conditionValues,
							sponsor: id,
							agreement,
							targetCents,
							percentage: Number(conditionValues.percentage)
						}
					});
				} catch (err) {
					return invalid(pbErrorMessage(err), pbErrorStatus(err));
				}
				redirect(
					303,
					'/organizations/' + params.id + '/cap/sponsorships#sponsorship-agreement-' + agreement
				);
			}

			if (intent === 'reverse-payment') {
				const paymentId = read('payment');
				const agreementId = read('agreement');
				const reason = read('reason');
				const invalid = (message: string, status = 400) =>
					fail(status, {
						reversalError: message,
						fundingAgreement: agreementId,
						reversalPayment: paymentId,
						reversalReason: reason
					});
				if (!ID_PATTERN.test(paymentId) || !ID_PATTERN.test(agreementId))
					return invalid('Choose a payment to reverse.');
				if (!reason || reason.length > 500)
					return invalid('Enter a reversal reason of 1–500 characters.');
				try {
					const payment = await pb.collection('sponsorship_funding_entries').getOne(paymentId);
					const agreement = await pb.collection('sponsorship_agreements').getOne(agreementId);
					if (
						payment.organization !== params.id ||
						payment.agreement !== agreementId ||
						payment.kind !== 'payment' ||
						agreement.organization !== params.id ||
						agreement.sponsor !== id
					)
						return invalid('Payment not found for this sponsor.', 404);
					await pb.collection('sponsorship_payment_reversals').create({
						organization: params.id,
						payment: paymentId,
						reason
					});
					return {
						fundingMessage: 'Payment reversed.',
						fundingAgreement: agreementId,
						reversalPayment: paymentId
					};
				} catch (err) {
					return invalid(pbErrorMessage(err), pbErrorStatus(err));
				}
			}

			if (intent === 'funding-entry') {
				const agreementId = read('agreement');
				const kind = read('kind');
				const values = {
					amount: read('amount'),
					entryDate: read('entryDate'),
					method: read('method'),
					reference: read('reference')
				};
				const invalid = (message: string, status = 400) =>
					fail(status, {
						fundingError: message,
						fundingAgreement: agreementId,
						fundingKind: kind,
						fundingValues: values
					});
				if (!ID_PATTERN.test(agreementId) || !['installment', 'payment'].includes(kind))
					return invalid('Choose an agreement and funding entry type.');
				const amount = /^(\d{1,9}|\d{1,3}(?:,\d{3}){1,2})(?:\.(\d{1,2}))?$/.exec(values.amount);
				if (!amount) return invalid('Enter an amount with at most two decimal places.');
				const amountCents =
					Number(amount[1].replaceAll(',', '')) * 100 + Number((amount[2] ?? '').padEnd(2, '0'));
				if (amountCents < 1) return invalid('Enter an amount greater than zero.');
				try {
					const agreement = await pb.collection('sponsorship_agreements').getOne(agreementId);
					if (agreement.organization !== params.id || agreement.sponsor !== id)
						return invalid('Agreement not found for this sponsor.', 404);
					await pb.collection('sponsorship_funding_entries').create({
						organization: params.id,
						agreement: agreementId,
						kind,
						amountCents,
						entryDate: values.entryDate,
						method: values.method,
						reference: values.reference
					});
					return {
						fundingMessage: kind === 'payment' ? 'Payment recorded.' : 'Installment added.',
						fundingAgreement: agreementId
					};
				} catch (err) {
					return invalid(pbErrorMessage(err), pbErrorStatus(err));
				}
			}

			if (intent === 'convert-quote') {
				const quoteId = read('quote');
				const coverage = read('coverage');
				const signedOn = read('signedOn');
				const dueOn = read('dueOn');
				const invalid = (message: string, status = 400) =>
					fail(status, {
						conversionError: message,
						conversionQuote: quoteId,
						coverage,
						signedOn,
						dueOn
					});
				if (!ID_PATTERN.test(quoteId) || read('confirm') !== 'signed')
					return invalid('Confirm the sponsorship agreement has been signed.');
				try {
					const quote = await pb.collection('sponsorship_quotes').getOne<SponsorshipQuote>(quoteId);
					const reviewTerms = JSON.stringify([
						quote.packageName,
						quote.currency,
						quote.amountCents,
						quote.benefits.map((benefit) => [benefit.id, benefit.name, benefit.amountCents])
					]);
					if (quote.sponsor !== id) return invalid('Quote not found for this sponsor.', 404);
					if (read('reviewTerms') !== reviewTerms)
						return invalid('The quote changed. Review the latest draft and try again.');
					await pb.collection('sponsorship_agreements').create({
						organization: params.id,
						sponsor: id,
						quote: quoteId,
						title: quote.packageName,
						amountCents: quote.amountCents,
						currency: quote.currency,
						coverage,
						signedOn,
						dueOn,
						benefits: quote.benefits.map((benefit) => benefit.name).join('\n')
					});
					return { conversionMessage: 'Sponsorship agreement created.', conversionQuote: quoteId };
				} catch (err) {
					return invalid(pbErrorMessage(err), pbErrorStatus(err));
				}
			}

			if (intent === 'quote') {
				const selected = form.getAll('benefit').map(String);
				const quotePackage = read('package');
				const quoteId = read('quote');
				const quotes = pb.collection('sponsorship_quotes');
				const selection = { packageName: quotePackage, selectedBenefits: selected };
				try {
					if (quoteId) {
						if (!ID_PATTERN.test(quoteId))
							return fail(400, { quoteError: 'Invalid draft quote.', quoteSponsor: id });
						const existing = await quotes.getOne(quoteId);
						if (existing.organization !== params.id || existing.sponsor !== id)
							return fail(404, {
								quoteError: 'Draft quote not found for this sponsor.',
								quoteSponsor: id
							});
						await quotes.update(quoteId, selection);
					} else {
						await quotes.create({ organization: params.id, sponsor: id, ...selection });
					}
					return {
						quoteMessage: quoteId ? 'Draft quote updated.' : 'Draft quote saved.',
						quoteSponsor: id
					};
				} catch (err) {
					return fail(pbErrorStatus(err), {
						quoteError: pbErrorMessage(err),
						quoteSponsor: id,
						quoteId,
						quotePackage,
						quoteSelected: selected
					});
				}
			}

			if (clearing) {
				const expectedCount = Number(read('expectedCount'));
				if (
					read('confirm') !== 'CLEAR' ||
					!Number.isSafeInteger(expectedCount) ||
					expectedCount < 1
				)
					return fail(400, { seedError: 'Confirm which demo agreements to clear.' });
				try {
					const { cleared } = await pb.send<{ cleared: number }>(
						'/api/flihub/demo/sponsorships/' + params.id + '/clear',
						{ method: 'POST', body: { confirm: 'CLEAR', expectedCount } }
					);
					return { seedMessage: 'Cleared ' + cleared + ' seeded agreement(s).' };
				} catch (err) {
					return fail(pbErrorStatus(err), { seedError: pbErrorMessage(err) });
				}
			}

			if (seeding) {
				const coverage = read('coverage');
				const targetId = '[a-z0-9]{15}';
				const targetPattern = new RegExp(
					'^(?:(?:league|season|team|event):' +
						targetId +
						'|hole:' +
						targetId +
						':' +
						targetId +
						':' +
						targetId +
						')$'
				);
				if (coverage !== 'organization' && !targetPattern.test(coverage)) {
					return fail(400, { seedError: 'Choose a sponsorship target.', seedCoverage: coverage });
				}

				const sponsorId = sponsorshipSeedId(params.id, 'sponsor');
				const agreementId = sponsorshipSeedId(params.id, 'agreement:' + coverage);
				const sponsors = pb.collection('sponsors');
				const agreements = pb.collection('sponsorship_agreements');
				try {
					const prior = await agreements.getOne(agreementId).catch((err) => {
						if (pbErrorStatus(err) === 404) return null;
						throw err;
					});
					if (prior) {
						if (
							prior.organization !== params.id ||
							prior.sponsor !== sponsorId ||
							prior.coverage !== coverage
						)
							throw new Error('The demo agreement ID is already in use.');
						return {
							seedMessage: 'A demo agreement already exists for this target.',
							seedCoverage: coverage
						};
					}

					const sponsor = await sponsors.getOne(sponsorId).catch((err) => {
						if (pbErrorStatus(err) === 404) return null;
						throw err;
					});
					if (sponsor?.archived) {
						return fail(400, {
							seedError: 'Restore the demo sponsor before adding more deals.',
							seedCoverage: coverage
						});
					}
					if (sponsor && (sponsor.organization !== params.id || sponsor.name !== 'Demo Sponsor')) {
						return fail(400, {
							seedError: 'The demo sponsor was renamed or its ID is in use.',
							seedCoverage: coverage
						});
					}
					if (!sponsor) {
						await sponsors.create({
							id: sponsorId,
							organization: params.id,
							name: 'Demo Sponsor',
							stage: 'signed',
							notes: 'Sample data created by Quick seed deal.'
						});
					}

					await agreements.create({
						id: agreementId,
						organization: params.id,
						sponsor: sponsorId,
						title: 'Demo sponsorship agreement',
						coverage,
						amountCents: 100000,
						currency: 'USD',
						signedOn: new Date().toISOString().slice(0, 10),
						benefits: 'Sample sponsorship placement for development testing.'
					});
					return {
						seedMessage: 'Demo agreement added under Demo Sponsor.',
						seedCoverage: coverage
					};
				} catch (err) {
					return fail(pbErrorStatus(err), {
						seedError: pbErrorMessage(err),
						seedCoverage: coverage
					});
				}
			}

			if (intent === 'agreement') {
				const values = {
					title: read('title'),
					coverage: read('coverage'),
					amount: read('amount'),
					currency: read('currency'),
					signedOn: read('signedOn'),
					dueOn: read('dueOn'),
					benefits: read('benefits')
				};
				const invalid = (message: string) =>
					fail(400, {
						agreementError: message,
						agreementSponsor: id,
						agreementValues: values
					});
				const amount = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(values.amount);
				if (!amount) return invalid('Enter an amount with at most two decimal places.');
				const amountCents = Number(amount[1]) * 100 + Number((amount[2] ?? '').padEnd(2, '0'));
				if (amountCents < 1) return invalid('Enter an amount greater than zero.');
				try {
					await pb.collection('sponsorship_agreements').create({
						organization: params.id,
						sponsor: id,
						title: values.title,
						coverage: values.coverage,
						amountCents,
						currency: values.currency,
						signedOn: values.signedOn,
						dueOn: values.dueOn,
						benefits: values.benefits
					});
					return { agreementMessage: 'Sponsorship agreement added.', agreementSponsor: id };
				} catch (err) {
					return fail(pbErrorStatus(err), {
						agreementError: pbErrorMessage(err),
						agreementSponsor: id,
						agreementValues: values
					});
				}
			}

			const collection = pb.collection('sponsors');
			if (intent !== 'create') {
				const sponsor = await collection.getOne(id);
				if (sponsor.organization !== params.id) {
					return fail(404, { message: 'Sponsor not found in this organization.' });
				}
				if (intent === 'archive' || intent === 'restore') {
					await collection.update(id, { archived: intent === 'archive' });
					return {
						sponsorMessage: intent === 'archive' ? 'Sponsor archived.' : 'Sponsor restored.'
					};
				}
			}

			const values = {
				name: read('name'),
				contactName: read('contactName'),
				contactEmail: read('contactEmail'),
				stage: read('stage'),
				followUpOn: read('followUpOn'),
				nextAction: read('nextAction'),
				notes: read('notes')
			};
			const invalid = (message: string) =>
				fail(400, { sponsorError: message, sponsorId: id, sponsorValues: values });
			if (!values.name || values.name.length > 120) {
				return invalid('Enter a sponsor name of 1–120 characters.');
			}
			if (!sponsorStages.some(({ value }) => value === values.stage)) {
				return invalid('Choose a sales stage.');
			}
			if (values.followUpOn) {
				const date = new Date(values.followUpOn + 'T00:00:00Z');
				if (
					!/^\d{4}-\d{2}-\d{2}$/.test(values.followUpOn) ||
					!Number.isFinite(date.getTime()) ||
					date.toISOString().slice(0, 10) !== values.followUpOn
				) {
					return invalid('Enter a valid follow-up date.');
				}
			}

			try {
				if (intent === 'create') {
					await collection.create({ ...values, organization: params.id });
				} else {
					await collection.update(id, values);
				}
			} catch (err) {
				return fail(pbErrorStatus(err), {
					sponsorError: pbErrorMessage(err),
					sponsorId: id,
					sponsorValues: values
				});
			}
			return { sponsorMessage: intent === 'create' ? 'Sponsor added.' : 'Sponsor updated.' };
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
	},

	randomizeTestGroups: async ({ locals, request, params }) => {
		if (!import.meta.env.DEV)
			return fail(403, { message: 'Test grouping is available only in development.' });
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const eventId = String((await request.formData()).get('event') ?? '');
		if (params.capability !== 'events' || !ID_PATTERN.test(eventId))
			return fail(400, { message: 'Choose an event on the Events page.' });
		try {
			const event = await locals.pb.collection('events').getOne(eventId);
			if (event.organization !== params.id) return fail(404, { message: 'Event not found.' });
			const result = await locals.pb.send<{
				eventId: string;
				groups: number;
				teams: number;
				athletes: number;
				males: number;
				females: number;
				other: number;
			}>(`/api/flihub/demo/events/${eventId}/randomize-groups`, { method: 'POST', body: {} });
			return {
				randomizedEventId: result.eventId,
				randomizedSummary: `Built ${result.groups} randomized groups with ${result.teams} teams and ${result.athletes} roster athletes. Pool: ${result.males} MPO / ${result.females} FPO${result.other ? ` / ${result.other} without a draft division` : ''}. Review the groups and expanded tee schedules before continuing.`
			};
		} catch (error) {
			return fail(pbErrorStatus(error), {
				teeScheduleEvent: eventId,
				message: pbErrorMessage(error)
			});
		}
	},

	seedDemoSeasonEvents: async ({ locals, request, params }) => {
		const denied = (status: number, message: string) =>
			fail(status, { demoSeasonEventsError: message });
		if (!locals.pb || !locals.user) return denied(503, 'PocketBase is not configured.');
		if (params.capability !== 'events' || !ID_PATTERN.test(params.id))
			return denied(400, 'Use the Events setup page.');
		const form = await request.formData();
		const source = String(form.get('sourceSeason') ?? '');
		const destination = String(form.get('destinationSeason') ?? '');
		try {
			const result = await locals.pb.send<{
				created: number;
				skipped: number;
				scheduledRounds: number;
				copiedTeams: number;
			}>(`/api/flihub/demo/organizations/${params.id}/season-events`, {
				method: 'POST',
				body: {
					source,
					destination,
					teeTime: String(form.get('demoTeeTime') ?? ''),
					secondTeeTime: String(form.get('demoSecondTeeTime') ?? '')
				}
			});
			return { demoSeasonEvents: result };
		} catch (err) {
			return denied(pbErrorStatus(err), pbErrorMessage(err));
		}
	},

	createGuidedEvent: async ({ locals, request, params }) => {
		const raw = String((await request.formData()).get('guidedEvent') ?? '');
		const denied = (status: number, message: string) =>
			fail(status, {
				guidedEventSetup: true,
				message,
				payload: raw.length <= 2000000 ? raw : ''
			});
		if (!locals.pb || !locals.user) return denied(503, 'PocketBase is not configured.');
		if (params.capability !== 'events' || !ID_PATTERN.test(params.id))
			return denied(400, 'Use the Events setup page.');
		if (!raw || raw.length > 2000000)
			return denied(400, 'The guided setup payload is missing or too large.');
		let input: unknown;
		try {
			input = prepareGuidedTeeTimes(JSON.parse(raw) as GuidedEventInput);
		} catch (err) {
			return denied(400, err instanceof Error ? err.message : 'Invalid guided event input.');
		}
		try {
			const result = await locals.pb.send<{ eventId: string; name: string }>(
				`/api/flihub/organizations/${params.id}/guided-event`,
				{ method: 'POST', body: input as Record<string, unknown> }
			);
			return {
				guidedEventSetup: true,
				guidedEventCreated: true,
				guidedEventId: result.eventId,
				guidedEventName: result.name
			};
		} catch (err) {
			return denied(pbErrorStatus(err), pbErrorMessage(err));
		}
	},

	saveTeeSchedule: async ({ locals, request, params }) => {
		const pb = locals.pb;
		if (!pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			const round = await pb.collection('rounds').getOne(String(form.get('round') ?? ''));
			if (round.organization !== params.id || round.status !== 'active')
				return fail(400, {
					message: 'Choose an active round in this organization.'
				});
			const timeZone = String(form.get('timeZone') ?? '');
			const intervalMinutes = Number(form.get('interval'));
			if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 240)
				return fail(400, {
					message: 'Use an interval from 1 to 240 whole minutes.'
				});
			const ids = form.getAll('group').map(String);
			const times = form.getAll('teeTime').map(String);
			if (!ids.length || ids.length !== times.length)
				return fail(400, { message: 'Provide a tee time for each group.' });
			const schedule: TeeSchedule = {
				timeZone,
				intervalMinutes,
				slots: ids.map((group, index) => ({
					group,
					startsAt: toTeeInstant(times[index], timeZone)
				}))
			};
			const event = await pb.collection('events').getOne(String(round.event));
			const firstDay = String(event.startsAt ?? '').slice(0, 10);
			const lastDay = String(event.endsAt || event.startsAt || '').slice(0, 10);
			if (
				times.some(
					(time) =>
						(firstDay && time.slice(0, 10) < firstDay) || (lastDay && time.slice(0, 10) > lastDay)
				)
			)
				return fail(400, {
					message: 'Tee times must fall on the event dates. Update the event dates first if needed.'
				});
			await pb.collection('rounds').update(round.id, { teeSchedule: schedule });
			return { teeScheduleSaved: true, teeScheduleEvent: String(round.event) };
		} catch (err) {
			return fail(pbErrorStatus(err), {
				message: err instanceof Error ? err.message : pbErrorMessage(err)
			});
		}
	},

	activateDemoScorekeeper: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) {
			return fail(503, {
				scorekeeperInviteError: 'PocketBase is not configured.'
			});
		}
		if (params.id !== '4ksk16f64guhf21') {
			return fail(403, {
				scorekeeperInviteError: 'Demo activation is limited to Bobs Org.'
			});
		}
		const form = await request.formData();
		const invitationId = String(form.get('invitation') ?? '');
		if (!ID_PATTERN.test(invitationId)) {
			return fail(400, { scorekeeperInviteError: 'Invalid invitation.' });
		}
		try {
			await locals.pb.send(`/api/flihub/demo/scorekeepers/${invitationId}/activate`, {
				method: 'POST'
			});
			return { scorekeeperActivationMessage: 'Demo scorekeeper activated.' };
		} catch (err) {
			return fail(pbErrorStatus(err), {
				scorekeeperInviteError: pbErrorMessage(err)
			});
		}
	},

	bulkInviteScorekeepers: async ({ locals, request, params, url }) => {
		const pb = locals.pb;
		if (!pb || !locals.user) {
			return fail(503, {
				scorekeeperInviteError: 'PocketBase is not configured.'
			});
		}
		const form = await request.formData();
		const lines = String(form.get('csv') ?? '')
			.split(/\r?\n/)
			.map((line) => line.trim().toLowerCase())
			.filter(Boolean);

		if (!lines.length || lines.length > 50) {
			return fail(400, {
				scorekeeperInviteError: 'Enter between 1 and 50 email rows.'
			});
		}
		const invalid = lines.findIndex(
			(email) => email.length > 254 || !/^[^\s@,;"<>]+@[^\s@,;"<>]+\.[^\s@,;"<>]+$/.test(email)
		);
		if (invalid !== -1) {
			return fail(400, {
				scorekeeperInviteError: `Check row ${invalid + 1}. Enter one valid email per line without a header.`
			});
		}

		try {
			const memberships = await pb.collection('memberships').getFullList({
				filter: pb.filter('organization = {:org} && user = {:user}', {
					org: params.id,
					user: locals.user.id
				})
			});
			if (
				!memberships.some(
					(membership) => membership.role === 'owner' || membership.role === 'admin'
				)
			) {
				return fail(403, {
					scorekeeperInviteError: 'Only Owners and Admins can invite scorekeepers.'
				});
			}
		} catch (err) {
			return fail(pbErrorStatus(err), {
				scorekeeperInviteError: pbErrorMessage(err)
			});
		}

		const results: { email: string; link: string | null; message: string }[] = [];
		for (const email of new Set(lines)) {
			try {
				const invitation = await pb.send<{
					token: string;
					email: string;
					expiresAt: string;
				}>('/api/flihub/invitations', {
					method: 'POST',
					body: { organization: params.id, email, role: 'scorekeeper' }
				});
				results.push({
					email,
					link: `${url.origin}/invitations/accept?token=${encodeURIComponent(invitation.token)}`,
					message: `Invitation created. Expires ${invitation.expiresAt}.`
				});
			} catch (err) {
				results.push({
					email,
					link: null,
					message: pbErrorMessage(err)
				});
			}
		}
		return { scorekeeperInvitations: results };
	},

	/** Phases 2A–2B: fantasy league creation through the trusted hook. */
	createFantasyLeague: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const participantLimit = Number(form.get('participantLimit') ?? 6);
		try {
			const created = (await locals.pb.send('/api/flihub/fantasy/leagues', {
				method: 'POST',
				body: { organization: params.id, name, participantLimit }
			})) as { id: string };
			redirect(303, `/organizations/${params.id}/fantasy/${created.id}`);
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
	},

	/** Responding to a fantasy invitation (accept/decline) via the hook. */
	respondInvite: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		const membershipId = String(form.get('membership') ?? '');
		const accept = String(form.get('accept') ?? '') === 'true';
		try {
			await locals.pb.send(`/api/flihub/fantasy/members/${membershipId}/respond`, {
				method: 'POST',
				body: { accept }
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { responded: true };
	},

	// Shared participant operations. The PocketBase endpoint enforces
	// organization scope, permissions, capability access and atomic writes.
	createAthlete: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		if (params.capability !== 'athletes' || !ID_PATTERN.test(params.id)) {
			return fail(404, { message: 'Participant destination not found.' });
		}

		const form = await request.formData();

		const identity: Record<string, string> = {
			firstName: String(form.get('firstName') ?? '').trim(),
			lastName: String(form.get('lastName') ?? '').trim()
		};

		for (const field of ['displayName', 'gender', 'nationality']) {
			if (form.has(field)) {
				identity[field] = String(form.get(field) ?? '').trim();
			}
		}

		const contact: Record<string, string> = {};

		for (const field of ['email', 'phone', 'eligibilityNotes']) {
			if (form.has(field)) {
				contact[field] = String(form.get(field) ?? '').trim();
			}
		}

		try {
			await locals.pb.send(`/api/flihub/organizations/${params.id}/participants`, {
				method: 'POST',
				body: {
					operation: 'create',
					identity,
					...(Object.keys(contact).length ? { contact } : {})
				}
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}

		return { created: true };
	},

	updateAthlete: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		if (params.capability !== 'athletes' || !ID_PATTERN.test(params.id)) {
			return fail(404, { message: 'Participant destination not found.' });
		}

		const form = await request.formData();
		const athleteId = String(form.get('athlete') ?? '');

		if (!ID_PATTERN.test(athleteId)) {
			return fail(400, { message: 'Invalid participant identifier.' });
		}

		const identity: Record<string, string> = {
			firstName: String(form.get('firstName') ?? '').trim(),
			lastName: String(form.get('lastName') ?? '').trim()
		};

		for (const field of ['displayName', 'gender', 'nationality']) {
			if (form.has(field)) {
				identity[field] = String(form.get(field) ?? '').trim();
			}
		}

		const contact: Record<string, string> = {};

		for (const field of ['email', 'phone', 'eligibilityNotes']) {
			if (form.has(field)) {
				contact[field] = String(form.get(field) ?? '').trim();
			}
		}

		try {
			await locals.pb.send(`/api/flihub/organizations/${params.id}/participants`, {
				method: 'POST',
				body: {
					operation: 'update',
					athleteId,
					identity,
					...(Object.keys(contact).length ? { contact } : {})
				}
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}

		return { updated: true };
	},

	archiveAthlete: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		if (params.capability !== 'athletes' || !ID_PATTERN.test(params.id)) {
			return fail(404, { message: 'Participant destination not found.' });
		}

		const athleteId = String((await request.formData()).get('athlete') ?? '');

		if (!ID_PATTERN.test(athleteId)) {
			return fail(400, { message: 'Invalid participant identifier.' });
		}

		try {
			await locals.pb.send(`/api/flihub/organizations/${params.id}/participants`, {
				method: 'POST',
				body: { operation: 'archive', athleteId }
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}

		return { archived: true };
	},

	unarchiveAthlete: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		if (params.capability !== 'athletes' || !ID_PATTERN.test(params.id)) {
			return fail(404, { message: 'Participant destination not found.' });
		}

		const athleteId = String((await request.formData()).get('athlete') ?? '');

		if (!ID_PATTERN.test(athleteId)) {
			return fail(400, { message: 'Invalid participant identifier.' });
		}

		try {
			await locals.pb.send(`/api/flihub/organizations/${params.id}/participants`, {
				method: 'POST',
				body: { operation: 'restore', athleteId }
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}

		return { restored: true };
	},

	// Athlete writes. The collection API rules enforce Owner/Admin; the
	// flihub_athletes hook enforces the capability being enabled. Both are
	// re-checked here so failures surface as form errors, not surprises.
	// There is no deleteAthlete action: permanent delete is not part of the
	// Phase 1C lifecycle (archive/restore only) and the delete rule is locked.

	/** Review CSV rows and potential duplicates without creating records. */
	previewAthleteImport: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		if (params.capability !== 'athletes' || !ID_PATTERN.test(params.id)) {
			return fail(404, { message: 'Participant destination not found.' });
		}

		const form = await request.formData();
		const csv = form.get('csv');

		if (typeof csv !== 'string' || !csv.trim()) {
			return fail(400, { message: 'Paste at least one CSV row.' });
		}

		if (csv.length > 262144) {
			return fail(400, { message: 'CSV input is too large.' });
		}

		try {
			const review = await locals.pb.send<{
				operation: 'previewImport';
				rowCount: number;
				fingerprint: string;
				warnings: {
					key: string;
					row: number;
					type: 'batch' | 'existing';
					matchingRow?: number;
					participantId?: string;
					status?: string;
					fields: string[];
				}[];
			}>(`/api/flihub/organizations/${params.id}/participants`, {
				method: 'POST',
				body: {
					operation: 'previewImport',
					csv
				}
			});

			return {
				importPreview: {
					rowCount: review.rowCount,
					fingerprint: review.fingerprint,
					warnings: review.warnings
				}
			};
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
	},

	/** Save a reviewed CSV import as one atomic participant operation. */
	importAthletes: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		if (params.capability !== 'athletes' || !ID_PATTERN.test(params.id)) {
			return fail(404, { message: 'Participant destination not found.' });
		}

		const form = await request.formData();
		const csv = form.get('csv');
		const fingerprint = form.get('fingerprint');
		const confirmedWarnings = form.getAll('confirmedWarnings');

		if (typeof csv !== 'string' || !csv.trim()) {
			return fail(400, { message: 'Paste at least one CSV row.' });
		}

		if (csv.length > 262144) {
			return fail(400, { message: 'CSV input is too large.' });
		}

		if (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)) {
			return fail(400, { message: 'Preview the import before saving.' });
		}

		if (
			confirmedWarnings.length > 2000 ||
			!confirmedWarnings.every((warning) => typeof warning === 'string')
		) {
			return fail(400, { message: 'Invalid duplicate confirmations.' });
		}

		try {
			const result = await locals.pb.send<{
				operation: 'import';
				importedCount: number;
				participants: { row: number; id: string }[];
			}>(`/api/flihub/organizations/${params.id}/participants`, {
				method: 'POST',
				body: {
					operation: 'import',
					csv,
					fingerprint,
					confirmedWarnings
				}
			});

			return { imported: result.importedCount };
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
	},

	// --- Phase 1D: teams ------------------------------------------------------
	// Collection rules enforce Owner/Admin; the flihub_competitions hook
	// enforces the capability gate. Failures surface as form errors.
	createTeam: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('teams').create({
				organization: params.id,
				name: String(form.get('name') ?? '').trim(),
				status: 'active'
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	importTeams: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });

		const csv = String((await request.formData()).get('csv') ?? '');
		const names = csv
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean);

		if (!names.length || names.length > 100) {
			return fail(400, { message: 'Enter between 1 and 100 team names.' });
		}
		if (names.some((name) => name.length > 120 || /[",]/.test(name))) {
			return fail(400, {
				message: 'Enter one team name per line, up to 120 characters, without commas or quotes.'
			});
		}
		if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
			return fail(400, {
				message: 'Remove duplicate team names from the import and try again.'
			});
		}

		let imported = 0;
		for (const name of names) {
			try {
				await locals.pb.collection('teams').create({
					organization: params.id,
					name,
					status: 'active'
				});
				imported += 1;
			} catch (err) {
				return fail(pbErrorStatus(err), {
					message: `${imported} of ${names.length} teams added. Import stopped at "${name}". ${pbErrorMessage(err)}`
				});
			}
		}
		return { created: true };
	},

	renameTeam: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('teams').update(String(form.get('team') ?? ''), {
				name: String(form.get('name') ?? '').trim()
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { updated: true };
	},

	archiveTeam: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('team') ?? '');
		try {
			await locals.pb.collection('teams').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	unarchiveTeam: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('team') ?? '');
		try {
			await locals.pb.collection('teams').update(id, { status: 'active' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { restored: true };
	},

	/** Final wizard submission; PocketBase creates both records transactionally. */
	setupLeagueSeason: async ({ locals, request, params }) => {
		const form = await request.formData();
		const input = {
			mode: String(form.get('mode') ?? ''),
			leagueName: String(form.get('leagueName') ?? ''),
			leagueId: String(form.get('leagueId') ?? ''),
			seasonName: String(form.get('seasonName') ?? ''),
			startsOn: String(form.get('startsOn') ?? ''),
			endsOn: String(form.get('endsOn') ?? ''),
			purseAmount: String(form.get('purseAmount') ?? '')
		};
		const denied = (status: number, message: string) =>
			fail(status, { setupLeagueSeason: true, message, input });
		if (!locals.pb || !locals.user) return denied(503, 'PocketBase is not configured.');
		if (params.capability !== 'leagues-seasons' || !ID_PATTERN.test(params.id))
			return denied(400, 'Use the Leagues & seasons setup page.');
		try {
			const created = await locals.pb.send<{
				leagueId: string;
				leagueName: string;
				seasonId: string;
				seasonName: string;
			}>(`/api/flihub/organizations/${params.id}/league-season-setup`, {
				method: 'POST',
				body: input
			});
			return {
				setupLeagueSeason: true,
				setupLeagueSeasonCreated: true,
				leagueName: created.leagueName,
				seasonName: created.seasonName,
				seasonId: created.seasonId
			};
		} catch (err) {
			return denied(pbErrorStatus(err), pbErrorMessage(err));
		}
	},

	// --- Phase 1D: leagues ----------------------------------------------------
	createLeague: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('leagues').create({
				organization: params.id,
				name: String(form.get('name') ?? '').trim(),
				status: 'active'
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	deleteLeague: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) {
			return fail(503, { message: 'PocketBase is not configured.' });
		}
		const form = await request.formData();
		const leagueId = String(form.get('league') ?? '');
		if (!ID_PATTERN.test(leagueId)) return fail(400, { message: 'Invalid league.' });
		try {
			const league = await locals.pb.collection('leagues').getOne(leagueId);
			if (league.organization !== params.id) {
				return fail(403, { message: 'Choose a league in this organization.' });
			}
			await locals.pb.send(`/api/flihub/leagues/${leagueId}/delete-empty`, {
				method: 'POST'
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { deleted: true };
	},

	renameLeague: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('leagues').update(String(form.get('league') ?? ''), {
				name: String(form.get('name') ?? '').trim()
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { updated: true };
	},

	archiveLeague: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('league') ?? '');
		try {
			await locals.pb.collection('leagues').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	unarchiveLeague: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('league') ?? '');
		try {
			await locals.pb.collection('leagues').update(id, { status: 'active' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { restored: true };
	},

	// --- Phase 1D: seasons ----------------------------------------------------
	createSeason: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		const purse = parseSeasonPurse(String(form.get('purseAmount') ?? ''));
		if (!purse.ok) return fail(400, { message: purse.message });
		try {
			await locals.pb.collection('seasons').create({
				organization: params.id,
				league: String(form.get('league') ?? ''),
				name: String(form.get('name') ?? '').trim(),
				status: 'planned',
				startsOn: String(form.get('startsOn') ?? '') || null,
				endsOn: String(form.get('endsOn') ?? '') || null,
				...(form.has('purseAmount') ? purse.value : {})
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	updateSeason: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		const purse = parseSeasonPurse(String(form.get('purseAmount') ?? ''));
		if (!purse.ok) return fail(400, { message: purse.message });
		const status = String(form.get('status') ?? 'planned');
		if (!['planned', 'active', 'completed'].includes(status)) {
			return fail(400, {
				message: 'Season status must be planned, active, or completed.'
			});
		}
		try {
			await locals.pb.collection('seasons').update(String(form.get('season') ?? ''), {
				name: String(form.get('name') ?? '').trim(),
				status,
				startsOn: String(form.get('startsOn') ?? '') || null,
				endsOn: String(form.get('endsOn') ?? '') || null,
				fantasyEnabled: form.get('fantasyEnabled') === 'yes',
				...(form.has('purseAmount') ? purse.value : {})
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { updated: true };
	},

	archiveSeason: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('season') ?? '');
		try {
			await locals.pb.collection('seasons').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	// Restoring returns an archived season to 'planned' — the least-committed
	// state; the organizer advances it explicitly.
	unarchiveSeason: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('season') ?? '');
		try {
			await locals.pb.collection('seasons').update(id, { status: 'planned' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { restored: true };
	},

	// --- Phase 1D: divisions --------------------------------------------------
	createDivision: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('divisions').create({
				organization: params.id,
				season: String(form.get('season') ?? ''),
				name: String(form.get('name') ?? '').trim(),
				status: 'active'
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	archiveDivision: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('division') ?? '');
		try {
			await locals.pb.collection('divisions').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	unarchiveDivision: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('division') ?? '');
		try {
			await locals.pb.collection('divisions').update(id, { status: 'active' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { restored: true };
	},

	// --- Phase 1D: season entries (D12: one entry per team per season; -----
	// optional division must belong to the entry's season — hook-enforced) ---
	addEntry: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('season_entries').create({
				organization: params.id,
				season: String(form.get('season') ?? ''),
				team: String(form.get('team') ?? ''),
				division: String(form.get('division') ?? '') || null,
				status: 'active'
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	assignEntryDivision: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('season_entries').update(String(form.get('entry') ?? ''), {
				division: String(form.get('division') ?? '') || null
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { updated: true };
	},

	withdrawEntry: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('entry') ?? '');
		try {
			await locals.pb.collection('season_entries').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	restoreEntry: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('entry') ?? '');
		try {
			await locals.pb.collection('season_entries').update(id, { status: 'active' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { restored: true };
	},

	// --- Phase 1D: events (D12: one optional season; empty = independent) -----
	createEvent: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user)
			return fail(503, { eventCreationMessage: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			const seasonId = String(form.get('season') ?? '');
			const startsAt = String(form.get('startsAt') ?? '');
			const selectedSeason = seasonId
				? await locals.pb.collection('seasons').getOne(seasonId)
				: null;
			if (selectedSeason && selectedSeason.organization !== params.id) {
				return fail(400, { eventCreationMessage: 'Choose a season in this organization.' });
			}
			const dateMessage = eventDateMessage(
				startsAt,
				selectedSeason
					? {
							startsOn: selectedSeason.startsOn,
							endsOn: selectedSeason.endsOn
						}
					: null
			);
			if (dateMessage) return fail(400, { eventCreationMessage: dateMessage });

			const multiDay = form.get('multiDay') === 'yes';
			const endsAt = multiDay ? String(form.get('endsAt') ?? '') : '';
			if (multiDay) {
				if (!startsAt || !endsAt) {
					return fail(400, {
						eventCreationMessage: 'Multi-day events require a start and end.'
					});
				}
				const endMessage = eventDateMessage(
					endsAt,
					selectedSeason
						? {
								startsOn: selectedSeason.startsOn,
								endsOn: selectedSeason.endsOn
							}
						: null
				);
				if (endMessage) return fail(400, { eventCreationMessage: endMessage });
				if (new Date(endsAt + 'Z').getTime() <= new Date(startsAt + 'Z').getTime()) {
					return fail(400, {
						eventCreationMessage: 'The event end must be after its start.'
					});
				}
			}

			await locals.pb.collection('events').create({
				organization: params.id,
				season: String(form.get('season') ?? '') || null,
				name: String(form.get('name') ?? '').trim(),
				...(form.has('venueName') ? { venueName: String(form.get('venueName') ?? '').trim() } : {}),
				...(form.has('venueAddress')
					? { venueAddress: String(form.get('venueAddress') ?? '').trim() }
					: {}),
				status: 'planned',
				startsAt: startsAt ? new Date(startsAt + 'Z').toISOString() : null,
				endsAt: endsAt ? new Date(endsAt + 'Z').toISOString() : null
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { eventCreationMessage: pbErrorMessage(err) });
		}
		return { created: true };
	},

	updateEvent: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		console.log('[event-date-debug] submitted', {
			event: form.get('event'),
			season: form.get('season'),
			startsAt: form.get('startsAt'),
			endsAt: form.get('endsAt'),
			multiDay: form.get('multiDay')
		});
		const status = String(form.get('status') ?? 'planned');
		if (!['planned', 'active', 'completed'].includes(status)) {
			return fail(400, {
				message: 'Event status must be planned, active, or completed.'
			});
		}
		try {
			const seasonId = String(form.get('season') ?? '');
			const startsAt = String(form.get('startsAt') ?? '');
			const selectedSeason = seasonId
				? await locals.pb.collection('seasons').getOne(seasonId)
				: null;
			if (selectedSeason && selectedSeason.organization !== params.id) {
				return fail(400, { message: 'Choose a season in this organization.' });
			}
			const dateMessage = eventDateMessage(
				startsAt,
				selectedSeason
					? {
							startsOn: selectedSeason.startsOn,
							endsOn: selectedSeason.endsOn
						}
					: null
			);
			if (dateMessage) return fail(400, { message: dateMessage });

			const multiDay = form.get('multiDay') === 'yes';
			const endsAt = multiDay ? String(form.get('endsAt') ?? '') : '';
			if (multiDay) {
				if (!startsAt || !endsAt) {
					return fail(400, {
						message: 'Multi-day events require a start and end.'
					});
				}
				const endMessage = eventDateMessage(
					endsAt,
					selectedSeason
						? {
								startsOn: selectedSeason.startsOn,
								endsOn: selectedSeason.endsOn
							}
						: null
				);
				if (endMessage) return fail(400, { message: endMessage });
				if (new Date(endsAt + 'Z').getTime() <= new Date(startsAt + 'Z').getTime()) {
					return fail(400, {
						message: 'The event end must be after its start.'
					});
				}
			}

			const savedEvent = await locals.pb
				.collection('events')
				.update(String(form.get('event') ?? ''), {
					name: String(form.get('name') ?? '').trim(),
					...(form.has('venueName')
						? { venueName: String(form.get('venueName') ?? '').trim() }
						: {}),
					...(form.has('venueAddress')
						? { venueAddress: String(form.get('venueAddress') ?? '').trim() }
						: {}),
					season: String(form.get('season') ?? '') || null,
					startsAt: startsAt ? new Date(startsAt + 'Z').toISOString() : null,
					endsAt: endsAt ? new Date(endsAt + 'Z').toISOString() : null,
					status
				});
			console.log('[event-date-debug] saved', {
				id: savedEvent.id,
				startsAt: savedEvent.startsAt,
				endsAt: savedEvent.endsAt
			});
		} catch (err) {
			console.error('[event-date-debug] update failed', {
				status: pbErrorStatus(err),
				message: pbErrorMessage(err)
			});
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { updated: true };
	},

	archiveEvent: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('event') ?? '');
		try {
			await locals.pb.collection('events').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	unarchiveEvent: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('event') ?? '');
		try {
			await locals.pb.collection('events').update(id, { status: 'planned' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { restored: true };
	},

	// --- Phase 1E: season rosters (D13: roster rows belong to the entry; ------
	// the flihub_rosters hook derives season and enforces exclusivity) --------
	importRosters: async ({ locals, request, params }) => {
		const pb = locals.pb;
		if (!pb || !locals.user) {
			return fail(503, { message: 'PocketBase is not configured.' });
		}
		const form = await request.formData();
		const seasonId = String(form.get('season') ?? '');
		const rows = String(form.get('csv') ?? '')
			.split(/\r?\n/)
			.filter((line) => line.trim())
			.map((line) => line.split(',').map((field) => field.trim()));

		if (!rows.length || rows.length > 500) {
			return fail(400, { message: 'Enter between 1 and 500 roster rows.' });
		}
		if (rows.some((row) => row.length !== 3 || row.some((field) => !field || /["]/.test(field)))) {
			return fail(400, {
				message: 'Use team,firstName,lastName on every line, without a header or quotes.'
			});
		}

		const normalize = (value: unknown) =>
			String(value ?? '')
				.normalize('NFC')
				.trim()
				.toLowerCase();

		let imported = 0;
		let skipped = 0;
		try {
			const season = await pb.collection('seasons').getOne(seasonId);
			if (season.organization !== params.id || season.status === 'archived') {
				return fail(400, {
					message: 'Select a current season in this organization.'
				});
			}

			const orgFilter = pb.filter('organization = {:org}', { org: params.id });
			const seasonFilter = pb.filter(
				'organization = {:org} && season = {:season} && status = "active"',
				{ org: params.id, season: seasonId }
			);
			const [teams, entries, athletes, memberships, reserves] = await Promise.all([
				pb.collection('teams').getFullList({ filter: orgFilter }),
				pb.collection('season_entries').getFullList({ filter: seasonFilter }),
				pb.collection('athletes').getFullList({ filter: orgFilter }),
				pb.collection('roster_memberships').getFullList({ filter: seasonFilter }),
				pb.collection('reserve_members').getFullList({ filter: seasonFilter })
			]);

			const planned: { entry: string; athlete: string }[] = [];
			const requested = new Map<string, string>();
			const issues: string[] = [];

			for (const [index, [teamName, firstName, lastName]] of rows.entries()) {
				const matchingTeams = teams.filter(
					(team) => team.status === 'active' && normalize(team.name) === normalize(teamName)
				);
				const matchingAthletes = athletes.filter(
					(athlete) =>
						athlete.status === 'active' &&
						normalize(athlete.firstName) === normalize(firstName) &&
						normalize(athlete.lastName) === normalize(lastName)
				);
				if (matchingTeams.length !== 1 || matchingAthletes.length !== 1) {
					issues.push(
						`Row ${index + 1}: "${teamName}" and "${firstName} ${lastName}" must each match exactly one active record.`
					);
					continue;
				}

				const athlete = matchingAthletes[0];
				const matchingEntries = entries.filter((entry) => entry.team === matchingTeams[0].id);
				if (matchingEntries.length !== 1) {
					issues.push(`Row ${index + 1}: enter "${teamName}" into the selected season first.`);
					continue;
				}
				const entry = matchingEntries[0];
				const previous = requested.get(athlete.id);
				const existing = memberships.filter((member) => member.athlete === athlete.id);

				if (
					(previous && previous !== entry.id) ||
					existing.some((member) => member.entry !== entry.id) ||
					reserves.some((reserve) => reserve.athlete === athlete.id)
				) {
					issues.push(
						`Row ${index + 1}: "${firstName} ${lastName}" has another team or reserve assignment in this season.`
					);
					continue;
				}

				requested.set(athlete.id, entry.id);
				if (previous || existing.length) {
					skipped += 1;
					continue;
				}
				planned.push({ entry: entry.id, athlete: athlete.id });
			}

			if (issues.length) {
				return fail(400, { message: issues.join(' ') });
			}

			for (const assignment of planned) {
				await pb.collection('roster_memberships').create({
					organization: params.id,
					entry: assignment.entry,
					athlete: assignment.athlete,
					status: 'active'
				});
				imported += 1;
			}
		} catch (err) {
			return fail(pbErrorStatus(err), {
				message: `${imported} assignments added before the import stopped. Retry the same CSV to skip saved assignments. ${pbErrorMessage(err)}`
			});
		}
		return { rostersImported: imported, rostersSkipped: skipped };
	},

	addRosterMember: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('roster_memberships').create({
				organization: params.id,
				entry: String(form.get('entry') ?? ''),
				athlete: String(form.get('athlete') ?? ''),
				status: 'active'
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	// Removal is an archive: the row is the preserved participation history.
	removeRosterMember: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('membership') ?? '');
		try {
			await locals.pb.collection('roster_memberships').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	restoreRosterMember: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('membership') ?? '');
		try {
			await locals.pb.collection('roster_memberships').update(id, { status: 'active' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { restored: true };
	},

	// --- Phase 1E: reserve pools (optional gender restriction is pilot --------
	// configuration, enforced at join time by the hook) ------------------------
	createReservePool: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('reserve_pools').create({
				organization: params.id,
				season: String(form.get('season') ?? ''),
				name: String(form.get('name') ?? '').trim(),
				gender: String(form.get('gender') ?? '') || null,
				status: 'active'
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	archiveReservePool: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('pool') ?? '');
		try {
			await locals.pb.collection('reserve_pools').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	unarchiveReservePool: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('pool') ?? '');
		try {
			await locals.pb.collection('reserve_pools').update(id, { status: 'active' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { restored: true };
	},

	addReserveMember: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('reserve_members').create({
				organization: params.id,
				pool: String(form.get('pool') ?? ''),
				athlete: String(form.get('athlete') ?? ''),
				status: 'active'
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	removeReserveMember: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('member') ?? '');
		try {
			await locals.pb.collection('reserve_members').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	// --- Phase 1E: substitutions (append-only; the hook validates the event, --
	// roster spot, and reserve membership, and records the author) -------------
	recordSubstitution: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('substitutions').create({
				organization: params.id,
				event: String(form.get('event') ?? ''),
				entry: String(form.get('entry') ?? ''),
				athleteOut: String(form.get('athleteOut') ?? ''),
				athleteIn: String(form.get('athleteIn') ?? ''),
				reason: String(form.get('reason') ?? '').trim()
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	// --- Phase 1F: courses (D14: courses only; venues remain planned) ---------
	createCourse: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('courses').create({
				organization: params.id,
				name: String(form.get('name') ?? '').trim(),
				status: 'active'
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	archiveCourse: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('course') ?? '');
		try {
			await locals.pb.collection('courses').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	unarchiveCourse: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('course') ?? '');
		try {
			await locals.pb.collection('courses').update(id, { status: 'active' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { restored: true };
	},

	importHoles: async ({ locals, request, params }) => {
		const pb = locals.pb;
		if (!pb || !locals.user) {
			return fail(503, { message: 'PocketBase is not configured.' });
		}

		const form = await request.formData();
		const courseId = String(form.get('course') ?? '');
		const rows = String(form.get('csv') ?? '')
			.split(/\r?\n/)
			.filter((line) => line.trim())
			.map((line) => line.split(',').map((field) => field.trim()));

		if (!rows.length || rows.length > 500) {
			return fail(400, { message: 'Enter between 1 and 500 rows.' });
		}

		const playingNumbers = new Set<number>();
		const positionKeys = new Set<string>();
		const details = new Map<number, string>();
		const positiveInteger = (value: string) =>
			Number.isSafeInteger(Number(value)) && Number(value) > 0;

		for (const [index, row] of rows.entries()) {
			const [playing, physical, name, par, label, distance, unit] = row;
			if (
				row.length !== 7 ||
				row.some((field) => field.includes('"')) ||
				!positiveInteger(playing) ||
				!positiveInteger(physical) ||
				!name ||
				name.length > 120 ||
				!positiveInteger(par) ||
				!label ||
				label.length > 40 ||
				!Number.isFinite(Number(distance)) ||
				Number(distance) <= 0 ||
				!['feet', 'meters', 'yards'].includes(unit)
			) {
				return fail(400, {
					message: `Check row ${index + 1}. Use playingHole,courseHole,name,par,position,distance,unit. Do not include a header, quotes, or commas inside fields.`
				});
			}

			const number = Number(physical);
			const key = `${number}:${label.toLowerCase()}`;
			const description = JSON.stringify([name, Number(par)]);
			if (
				playingNumbers.has(Number(playing)) ||
				positionKeys.has(key) ||
				(details.has(number) && details.get(number) !== description)
			) {
				return fail(400, {
					message: `Check row ${index + 1}. Playing numbers and hole/position pairs must be unique. Names and pars must match for repeated physical holes.`
				});
			}
			playingNumbers.add(Number(playing));
			positionKeys.add(key);
			details.set(number, description);
		}

		let completed = 0;
		try {
			const course = await pb.collection('courses').getOne(courseId);
			if (course.organization !== params.id || course.status !== 'active') {
				return fail(400, {
					message: 'Select an active course in this organization.'
				});
			}

			const holes = await pb.collection('course_holes').getFullList({
				filter: pb.filter('course = {:course} && status = "active"', {
					course: courseId
				})
			});
			const positions = await pb.collection('hole_positions').getFullList({
				filter: pb.filter('hole.course = {:course} && status = "active"', {
					course: courseId
				})
			});

			for (const [, physical, name, par, label, distance, unit] of rows) {
				const hole = holes.find((item) => item.number === Number(physical));
				if (hole && (hole.name !== name || hole.par !== Number(par))) {
					return fail(400, {
						message: `Physical hole ${physical} already has a different name or par.`
					});
				}
				const position = positions.find(
					(item) =>
						item.hole === hole?.id && String(item.label).toLowerCase() === label.toLowerCase()
				);
				if (
					position &&
					(position.label !== label ||
						position.distance !== Number(distance) ||
						position.unit !== unit)
				) {
					return fail(400, {
						message: `Physical hole ${physical} already has different details for position "${label}".`
					});
				}
			}

			for (const [, physical, name, par, label, distance, unit] of rows) {
				const existingHole = holes.find((item) => item.number === Number(physical));
				const hole =
					existingHole ??
					(await pb.collection('course_holes').create({
						organization: params.id,
						course: courseId,
						number: Number(physical),
						name,
						par: Number(par),
						status: 'active'
					}));
				if (!hole) {
					throw new Error('PocketBase did not return the saved hole.');
				}
				if (!existingHole) {
					holes.push(hole);
				}
				if (!positions.some((item) => item.hole === hole.id && item.label === label)) {
					const position = await pb.collection('hole_positions').create({
						organization: params.id,
						hole: hole.id,
						label,
						distance: Number(distance),
						unit,
						status: 'active'
					});
					positions.push(position);
				}
				completed += 1;
			}
		} catch (err) {
			return fail(pbErrorStatus(err), {
				message: `${completed} rows completed. Earlier records remain saved. Retry the same CSV to complete matching rows. ${pbErrorMessage(err)}`
			});
		}
		return { holesImported: completed };
	},

	addHole: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('course_holes').create({
				organization: params.id,
				course: String(form.get('course') ?? ''),
				number: Number(form.get('number') ?? 0),
				name: String(form.get('name') ?? '').trim(),
				par: Number(form.get('par') ?? 3),
				status: 'active'
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	updateHole: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('course_holes').update(String(form.get('hole') ?? ''), {
				name: String(form.get('name') ?? '').trim(),
				par: Number(form.get('par') ?? 3)
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { updated: true };
	},

	archiveHole: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('hole') ?? '');
		try {
			await locals.pb.collection('course_holes').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	addPosition: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('hole_positions').create({
				organization: params.id,
				hole: String(form.get('hole') ?? ''),
				label: String(form.get('label') ?? '').trim(),
				distance: Number(form.get('distance') ?? 0),
				unit: String(form.get('unit') ?? 'feet'),
				status: 'active'
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	archivePosition: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('position') ?? '');
		try {
			await locals.pb.collection('hole_positions').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	// --- Phase 1F: rounds ------------------------------------------------------
	addRound: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('rounds').create({
				organization: params.id,
				event: String(form.get('event') ?? ''),
				number: Number(form.get('number') ?? 0),
				name: String(form.get('name') ?? '').trim(),
				course: String(form.get('course') ?? '') || null,
				positionLabel: String(form.get('positionLabel') ?? '').trim(),
				status: 'active'
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	archiveRound: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('round') ?? '');
		try {
			await locals.pb.collection('rounds').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	// --- Phase 1F: groups and assignments (D14 eligibility is hook-enforced) ---
	createGroup: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('event_groups').create({
				organization: params.id,
				event: String(form.get('event') ?? ''),
				name: String(form.get('name') ?? '').trim(),
				scorekeeper: String(form.get('scorekeeper') ?? '') || null,
				status: 'active'
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	setGroupScorekeeper: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('event_groups').update(String(form.get('group') ?? ''), {
				scorekeeper: String(form.get('scorekeeper') ?? '') || null
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { updated: true };
	},

	archiveGroup: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('group') ?? '');
		try {
			await locals.pb.collection('event_groups').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	addGroupTeam: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) {
			return fail(503, { message: 'PocketBase is not configured.' });
		}
		const form = await request.formData();
		const groupId = String(form.get('group') ?? '');
		const entryId = String(form.get('entry') ?? '');
		if (!ID_PATTERN.test(groupId) || !ID_PATTERN.test(entryId)) {
			return fail(400, { message: 'Choose a group and season team.' });
		}
		try {
			const group = await locals.pb.collection('event_groups').getOne(groupId);
			if (group.organization !== params.id) {
				return fail(400, { message: 'Choose a group in this organization.' });
			}
			await locals.pb.send(`/api/flihub/groups/${groupId}/add-team-roster`, {
				method: 'POST',
				body: { entry: entryId }
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	// Removal is an archive: assignment rows are the change record (D14).
	removeGroupTeam: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('assignment') ?? '');
		try {
			await locals.pb.collection('group_teams').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	addGroupAthlete: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('group_athletes').create({
				organization: params.id,
				group: String(form.get('group') ?? ''),
				entry: String(form.get('entry') ?? ''),
				athlete: String(form.get('athlete') ?? ''),
				status: 'active'
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	removeGroupAthlete: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('assignment') ?? '');
		try {
			await locals.pb.collection('group_athletes').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	}
};

function parseEventCurves(raw: unknown): Record<string, { top: number; lower: number }> {
	const curves: Record<string, { top: number; lower: number }> = {};
	try {
		const parsed = JSON.parse(String(raw ?? '') || '{}');
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return curves;
		for (const [id, value] of Object.entries(
			parsed as Record<string, { top?: unknown; lower?: unknown }>
		)) {
			const top = Number(value?.top);
			const lower = Number(value?.lower);
			if (
				ID_PATTERN.test(id) &&
				Number.isInteger(top) &&
				Number.isInteger(lower) &&
				top >= 0 &&
				top <= 100 &&
				lower >= 0 &&
				lower <= 100
			)
				curves[id] = { top, lower };
		}
	} catch {
		// Ignore malformed saved curves; the league curve applies instead.
	}
	return curves;
}
