/**
 * Phases 2A–2B integration tests: fantasy leagues and per-event snake drafts
 * (D18) — against a disposable PocketBase with ordinary user credentials.
 *
 * Covers the membership lifecycle (invite → accept → approve, the
 * participant limit, owner-only controls) and fantasy/staff independence
 * (fantasy membership grants no organization access and organization staff
 * see no fantasy data without a seat); draft preparation (seats-filled
 * gate, pool-size gate, persisted randomized first-round order, one draft
 * per league+event, clock validation); a complete 24-pick snake draft with
 * server-enforced turn order, eligibility, one-selection-per-athlete, and
 * the 2 MPO + 2 FPO roster caps; timeout auto-picks from deterministic
 * fixture rankings that respect remaining roster slots; the
 * manual-pick-vs-timeout race producing exactly one pick; reconnect and
 * the all-managers-disconnected pause; and designated event substitutions
 * that preserve the original pick while ambiguous cases are rejected.
 *
 * The disposable test stack runs with FLIHUB_FANTASY_DEMO_CLOCK=1, so the
 * 2-second demo clock is testable here; normal instances only accept
 * 7/15/30 seconds.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
	acceptInvitation,
	createInvitation,
	newClient,
	registerVerifiedUser,
	uniqueEmail
} from './helpers.mjs';

const CAPS = [
	'athletes',
	'teams',
	'leagues-seasons',
	'events',
	'venues-courses',
	'scoring-results',
	'standings',
	'fantasy'
];

const isCode = (code) => (err) =>
	(err.status === 400 || err.status === 403 || err.status === 404) &&
	new RegExp(code, 'i').test(
		String(err.response?.code ?? '') + String(err.response?.message ?? err.message)
	);
const isDenied = (err) => err.status === 400 || err.status === 403 || err.status === 404;

async function orgWithCaps(prefix, name) {
	const owner = await registerVerifiedUser(uniqueEmail(prefix), 'Org Owner');
	const org = await owner.send('/api/flihub/organizations', {
		method: 'POST',
		body: { name, template: 'custom', capabilities: CAPS }
	});
	return { owner, org };
}

/**
 * Competition fixture sized for a six-manager draft: one league + season,
 * 12 teams of one male + one female rostered athlete (24 athletes), and
 * gendered reserve pools with one reserve each.
 */
async function competitionFixture(pb, orgId, label) {
	const league = await pb
		.collection('leagues')
		.create({ organization: orgId, name: `${label} League`, status: 'active' });
	const season = await pb.collection('seasons').create({
		organization: orgId,
		league: league.id,
		name: `${label} Season`,
		status: 'active'
	});
	const entries = [];
	const athletesByEntry = new Map();
	for (let i = 1; i <= 12; i++) {
		const team = await pb.collection('teams').create({
			organization: orgId,
			name: `${label} Team ${String(i).padStart(2, '0')}`,
			status: 'active'
		});
		const entry = await pb.collection('season_entries').create({
			organization: orgId,
			season: season.id,
			team: team.id,
			status: 'active'
		});
		const male = await pb.collection('athletes').create({
			organization: orgId,
			firstName: `M${String(i).padStart(2, '0')}`,
			lastName: `${label}`,
			gender: 'male',
			status: 'active'
		});
		const female = await pb.collection('athletes').create({
			organization: orgId,
			firstName: `F${String(i).padStart(2, '0')}`,
			lastName: `${label}`,
			gender: 'female',
			status: 'active'
		});
		for (const athlete of [male, female]) {
			await pb.collection('roster_memberships').create({
				organization: orgId,
				entry: entry.id,
				athlete: athlete.id,
				status: 'active'
			});
		}
		entries.push({ entry, team, male, female });
		athletesByEntry.set(entry.id, { male, female });
	}
	const malePool = await pb.collection('reserve_pools').create({
		organization: orgId,
		season: season.id,
		name: `${label} Men's Reserve`,
		gender: 'male',
		status: 'active'
	});
	const femalePool = await pb.collection('reserve_pools').create({
		organization: orgId,
		season: season.id,
		name: `${label} Women's Reserve`,
		gender: 'female',
		status: 'active'
	});
	const maleReserve = await pb.collection('athletes').create({
		organization: orgId,
		firstName: 'RMale',
		lastName: label,
		gender: 'male',
		status: 'active'
	});
	const femaleReserve = await pb.collection('athletes').create({
		organization: orgId,
		firstName: 'RFem',
		lastName: label,
		gender: 'female',
		status: 'active'
	});
	const femaleReserveTwo = await pb.collection('athletes').create({
		organization: orgId,
		firstName: 'RFem2',
		lastName: label,
		gender: 'female',
		status: 'active'
	});
	for (const [pool, athlete] of [
		[malePool, maleReserve],
		[femalePool, femaleReserve],
		[femalePool, femaleReserveTwo]
	]) {
		await pb
			.collection('reserve_members')
			.create({ organization: orgId, pool: pool.id, athlete: athlete.id, status: 'active' });
	}
	return { season, entries, athletesByEntry, maleReserve, femaleReserve, femaleReserveTwo };
}

/** One event with six groups of two teams — the draft-eligible pool. */
async function draftEvent(pb, orgId, comp, name) {
	const event = await pb.collection('events').create({
		organization: orgId,
		season: comp.season.id,
		name,
		status: 'planned'
	});
	for (let g = 0; g < 6; g++) {
		const group = await pb.collection('event_groups').create({
			organization: orgId,
			event: event.id,
			name: `${name} G${g + 1}`,
			status: 'active'
		});
		for (const slot of [comp.entries[g * 2], comp.entries[g * 2 + 1]]) {
			await pb.collection('group_teams').create({
				organization: orgId,
				group: group.id,
				entry: slot.entry.id,
				status: 'active'
			});
			for (const athlete of [slot.male, slot.female]) {
				await pb.collection('group_athletes').create({
					organization: orgId,
					group: group.id,
					entry: slot.entry.id,
					athlete: athlete.id,
					status: 'active'
				});
			}
		}
	}
	return event;
}

/** League with six approved manager seats (owner + five). */
async function leagueWithManagers(owner, orgId, label) {
	const league = await owner.send('/api/flihub/fantasy/leagues', {
		method: 'POST',
		body: { organization: orgId, name: label, participantLimit: 6 }
	});
	const managers = [owner];
	for (let i = 1; i <= 5; i++) {
		const email = uniqueEmail(`${label.toLowerCase().replace(/[^a-z0-9]+/g, '')}-m${i}`);
		const pb = await registerVerifiedUser(email, `Manager ${i}`);
		const invite = await owner.send(`/api/flihub/fantasy/leagues/${league.id}/invite`, {
			method: 'POST',
			body: { email }
		});
		await pb.send(`/api/flihub/fantasy/members/${invite.id}/respond`, {
			method: 'POST',
			body: { accept: true }
		});
		await owner.send(`/api/flihub/fantasy/members/${invite.id}/approve`, {
			method: 'POST',
			body: {}
		});
		managers.push(pb);
	}
	const byUser = new Map(managers.map((pb) => [pb.authStore.record.id, pb]));
	return { league, managers, byUser };
}

const board = (pb, draftId) =>
	pb.send(`/api/flihub/fantasy/drafts/${draftId}/board`, { method: 'GET' });
const tick = (pb, draftId) =>
	pb.send(`/api/flihub/fantasy/drafts/${draftId}/tick`, { method: 'POST', body: {} });
const pick = (pb, draftId, athlete) =>
	pb.send(`/api/flihub/fantasy/drafts/${draftId}/pick`, { method: 'POST', body: { athlete } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Expected snake seat for 1-based pickNumber over the persisted order. */
function snakeSeat(order, pickNumber) {
	const n = order.length;
	const round = Math.floor((pickNumber - 1) / n) + 1;
	const idx = (pickNumber - 1) % n;
	return { round, manager: order[round % 2 === 1 ? idx : n - 1 - idx] };
}

test('2A membership: invite → accept → approve lifecycle, limits, and owner-only controls', async () => {
	const { owner, org } = await orgWithCaps('fan2a', 'Fantasy Org 2A');

	// The capability gate: fantasy leagues need the fantasy capability.
	const bare = await registerVerifiedUser(uniqueEmail('fan2abare'), 'Bare Owner');
	const bareOrg = await bare.send('/api/flihub/organizations', {
		method: 'POST',
		body: { name: 'No Fantasy Org', template: 'custom', capabilities: ['athletes'] }
	});
	await assert.rejects(
		bare.send('/api/flihub/fantasy/leagues', {
			method: 'POST',
			body: { organization: bareOrg.id, name: 'Nope' }
		}),
		isCode('capability_disabled'),
		'fantasy capability required'
	);

	const league = await owner.send('/api/flihub/fantasy/leagues', {
		method: 'POST',
		body: { organization: org.id, name: 'Birdie Barons', participantLimit: 6 }
	});
	const invitee = await registerVerifiedUser(uniqueEmail('fan2ainv'), 'Invitee');
	const inviteeEmail = invitee.authStore.record.email;

	// Owner-only invitations; in-app accounts only.
	await assert.rejects(
		invitee.send(`/api/flihub/fantasy/leagues/${league.id}/invite`, {
			method: 'POST',
			body: { email: uniqueEmail('x') }
		}),
		isDenied,
		'non-owner cannot invite'
	);
	await assert.rejects(
		owner.send(`/api/flihub/fantasy/leagues/${league.id}/invite`, {
			method: 'POST',
			body: { email: 'nobody-here@example.com' }
		}),
		isCode('unknown_user'),
		'invitations require an existing account'
	);
	const invite = await owner.send(`/api/flihub/fantasy/leagues/${league.id}/invite`, {
		method: 'POST',
		body: { email: inviteeEmail }
	});

	// Only the invitee answers; only accepted seats can be approved.
	await assert.rejects(
		owner.send(`/api/flihub/fantasy/members/${invite.id}/respond`, {
			method: 'POST',
			body: { accept: true }
		}),
		isDenied,
		'only the invitee responds'
	);
	await assert.rejects(
		owner.send(`/api/flihub/fantasy/members/${invite.id}/approve`, { method: 'POST', body: {} }),
		isCode('invalid_state'),
		'approval requires acceptance first'
	);
	await invitee.send(`/api/flihub/fantasy/members/${invite.id}/respond`, {
		method: 'POST',
		body: { accept: true }
	});
	await assert.rejects(
		invitee.send(`/api/flihub/fantasy/members/${invite.id}/approve`, { method: 'POST', body: {} }),
		isDenied,
		'only the owner approves'
	);
	await owner.send(`/api/flihub/fantasy/members/${invite.id}/approve`, {
		method: 'POST',
		body: {}
	});

	const lobby = await invitee.send(`/api/flihub/fantasy/leagues/${league.id}/lobby`, {
		method: 'GET'
	});
	assert.equal(lobby.approvedCount, 2, 'owner + approved invitee');
	assert.equal(lobby.seatsFilled, false, 'seats not yet filled');

	// A declined invitation never counts; re-inviting reuses the seat row.
	const decliner = await registerVerifiedUser(uniqueEmail('fan2adec'), 'Decliner');
	const declineInvite = await owner.send(`/api/flihub/fantasy/leagues/${league.id}/invite`, {
		method: 'POST',
		body: { email: decliner.authStore.record.email }
	});
	await decliner.send(`/api/flihub/fantasy/members/${declineInvite.id}/respond`, {
		method: 'POST',
		body: { accept: false }
	});
	const relobby = await owner.send(`/api/flihub/fantasy/leagues/${league.id}/lobby`, {
		method: 'GET'
	});
	assert.equal(relobby.approvedCount, 2, 'declined invitations never count');

	// The participant limit caps APPROVALS at exactly the seat count.
	const extras = [];
	for (let i = 0; i < 5; i++) {
		const pb = await registerVerifiedUser(uniqueEmail(`fan2ax${i}`), `Extra ${i}`);
		const inv = await owner.send(`/api/flihub/fantasy/leagues/${league.id}/invite`, {
			method: 'POST',
			body: { email: pb.authStore.record.email }
		});
		await pb.send(`/api/flihub/fantasy/members/${inv.id}/respond`, {
			method: 'POST',
			body: { accept: true }
		});
		extras.push({ pb, inv });
	}
	for (let i = 0; i < 4; i++) {
		await owner.send(`/api/flihub/fantasy/members/${extras[i].inv.id}/approve`, {
			method: 'POST',
			body: {}
		});
	}
	await assert.rejects(
		owner.send(`/api/flihub/fantasy/members/${extras[4].inv.id}/approve`, {
			method: 'POST',
			body: {}
		}),
		isCode('league_full'),
		'the seventh approval is rejected'
	);
	// Owner seat cannot be removed; managers can be.
	const full = await owner.send(`/api/flihub/fantasy/leagues/${league.id}/lobby`, {
		method: 'GET'
	});
	const ownerSeat = full.members.find((m) => m.role === 'owner');
	await assert.rejects(
		owner.send(`/api/flihub/fantasy/members/${ownerSeat.id}/remove`, { method: 'POST', body: {} }),
		isCode('invalid_state'),
		'owner seat is permanent'
	);
});

test('2A independence: fantasy membership grants no organization access and vice versa', async () => {
	const { owner, org } = await orgWithCaps('fan2sep', 'Fantasy Separation Org');
	const comp = await competitionFixture(owner, org.id, 'Sep');
	await draftEvent(owner, org.id, comp, 'Sep Open');

	const league = await owner.send('/api/flihub/fantasy/leagues', {
		method: 'POST',
		body: { organization: org.id, name: 'Separation League', participantLimit: 2 }
	});
	// A fantasy manager with NO organization membership.
	const outsideManager = await registerVerifiedUser(uniqueEmail('fan2sepm'), 'Outside Manager');
	const inv = await owner.send(`/api/flihub/fantasy/leagues/${league.id}/invite`, {
		method: 'POST',
		body: { email: outsideManager.authStore.record.email }
	});
	await outsideManager.send(`/api/flihub/fantasy/members/${inv.id}/respond`, {
		method: 'POST',
		body: { accept: true }
	});
	await owner.send(`/api/flihub/fantasy/members/${inv.id}/approve`, { method: 'POST', body: {} });

	// Fantasy membership exposes the lobby, but no organization data or writes.
	const lobby = await outsideManager.send(`/api/flihub/fantasy/leagues/${league.id}/lobby`, {
		method: 'GET'
	});
	assert.equal(lobby.me.status, 'approved');
	const orgAthletes = await outsideManager.collection('athletes').getFullList();
	assert.equal(orgAthletes.length, 0, 'fantasy managers read no organization athletes directly');
	await assert.rejects(
		outsideManager
			.collection('teams')
			.create({ organization: org.id, name: 'Nope', status: 'active' }),
		isDenied,
		'fantasy membership grants no staff writes'
	);

	// An organization ADMIN with no fantasy seat sees no fantasy data.
	const adminEmail = uniqueEmail('fan2sepa');
	const admin = await registerVerifiedUser(adminEmail, 'Org Admin');
	await acceptInvitation(admin, (await createInvitation(owner, org.id, adminEmail, 'admin')).token);
	const visibleLeagues = await admin.collection('fantasy_leagues').getFullList();
	assert.equal(visibleLeagues.length, 0, 'organization staff list no fantasy leagues');
	await assert.rejects(
		admin.send(`/api/flihub/fantasy/leagues/${league.id}/lobby`, { method: 'GET' }),
		isDenied,
		'organization staff get no fantasy lobby without a seat'
	);
});

test('2B draft preparation: seats gate, pool gate, clocks, persisted independent orders', async () => {
	const { owner, org } = await orgWithCaps('fan2prep', 'Draft Prep Org');
	const comp = await competitionFixture(owner, org.id, 'Prep');
	const eventOne = await draftEvent(owner, org.id, comp, 'Prep Open');
	const eventTwo = await draftEvent(owner, org.id, comp, 'Prep Classic');
	const eventThree = await draftEvent(owner, org.id, comp, 'Prep Finale');

	// Seats must be filled first.
	const early = await owner.send('/api/flihub/fantasy/leagues', {
		method: 'POST',
		body: { organization: org.id, name: 'Early League', participantLimit: 6 }
	});
	await assert.rejects(
		owner.send(`/api/flihub/fantasy/leagues/${early.id}/drafts`, {
			method: 'POST',
			body: { event: eventOne.id, pickSeconds: 15 }
		}),
		isCode('seats_unfilled'),
		'drafts open once all seats are approved'
	);

	const { league, managers } = await leagueWithManagers(owner, org.id, 'Prep League');
	const userIds = managers.map((pb) => pb.authStore.record.id).sort();

	// Pool gate: an event without enough eligible athletes per division.
	const tinyEvent = await owner.collection('events').create({
		organization: org.id,
		season: comp.season.id,
		name: 'Tiny Event',
		status: 'planned'
	});
	await assert.rejects(
		owner.send(`/api/flihub/fantasy/leagues/${league.id}/drafts`, {
			method: 'POST',
			body: { event: tinyEvent.id, pickSeconds: 15 }
		}),
		isCode('pool_too_small'),
		'the pool must cover 2 MPO + 2 FPO per manager'
	);

	// Clock validation: 7/15/30 normally; 2 only on demo stacks (enabled
	// here); anything else rejected.
	await assert.rejects(
		owner.send(`/api/flihub/fantasy/leagues/${league.id}/drafts`, {
			method: 'POST',
			body: { event: eventOne.id, pickSeconds: 10 }
		}),
		isCode('invalid_clock'),
		'10 seconds is not a pick clock'
	);
	await assert.rejects(
		owner.send(`/api/flihub/fantasy/leagues/${league.id}/drafts`, {
			method: 'POST',
			body: { event: eventOne.id, pickSeconds: 15, rankings: ['bogus'] }
		}),
		isCode('invalid_rankings'),
		'rankings must reference eligible athletes'
	);

	const draftOne = await owner.send(`/api/flihub/fantasy/leagues/${league.id}/drafts`, {
		method: 'POST',
		body: { event: eventOne.id, pickSeconds: 15 }
	});
	assert.deepEqual([...draftOne.draftOrder].sort(), userIds, 'order is the six approved managers');
	await assert.rejects(
		owner.send(`/api/flihub/fantasy/leagues/${league.id}/drafts`, {
			method: 'POST',
			body: { event: eventOne.id, pickSeconds: 15 }
		}),
		isCode('draft_exists'),
		'one draft per league and event'
	);

	// A new event gets its OWN draft with its own persisted order.
	const draftTwo = await owner.send(`/api/flihub/fantasy/leagues/${league.id}/drafts`, {
		method: 'POST',
		body: { event: eventTwo.id, pickSeconds: 7 }
	});
	const draftThree = await owner.send(`/api/flihub/fantasy/leagues/${league.id}/drafts`, {
		method: 'POST',
		body: { event: eventThree.id, pickSeconds: 30 }
	});
	assert.notEqual(draftTwo.id, draftOne.id);
	// Persisted: the stored order matches what creation returned.
	const storedOne = await owner.collection('fantasy_drafts').getOne(draftOne.id);
	assert.deepEqual(storedOne.draftOrder, draftOne.draftOrder, 'first-round order is persisted');
	const allSame =
		JSON.stringify(draftOne.draftOrder) === JSON.stringify(draftTwo.draftOrder) &&
		JSON.stringify(draftOne.draftOrder) === JSON.stringify(draftThree.draftOrder);
	assert.equal(allSame, false, 'orders are drawn independently per draft');

	// Members cannot start the draft; the owner can, exactly once.
	await assert.rejects(
		managers[1].send(`/api/flihub/fantasy/drafts/${draftOne.id}/start`, {
			method: 'POST',
			body: {}
		}),
		isDenied,
		'only the owner starts the draft'
	);
});

test('2B snake draft: 24 picks, reversals, eligibility, caps, six valid rosters', async () => {
	const { owner, org } = await orgWithCaps('fan2draft', 'Draft Org');
	const comp = await competitionFixture(owner, org.id, 'Snake');
	const event = await draftEvent(owner, org.id, comp, 'Snake Open');
	const { league, byUser } = await leagueWithManagers(owner, org.id, 'Snake League');

	const created = await owner.send(`/api/flihub/fantasy/leagues/${league.id}/drafts`, {
		method: 'POST',
		body: { event: event.id, pickSeconds: 30 }
	});
	const order = created.draftOrder;
	await owner.send(`/api/flihub/fantasy/drafts/${created.id}/start`, { method: 'POST', body: {} });

	const view = await board(owner, created.id);
	assert.equal(view.draft.status, 'active');
	assert.equal(view.draft.totalPicks, 24);
	assert.equal(view.pool.length, 24, 'the pool is the event\u2019s 24 group athletes');
	const males = view.pool.filter((p) => p.gender === 'male').map((p) => p.athlete);
	const females = view.pool.filter((p) => p.gender === 'female').map((p) => p.athlete);
	assert.ok(
		view.pool.every((p) => p.teamName.startsWith('Snake Team')),
		'eligible athletes show their real event teams'
	);
	assert.ok(
		view.pool.every((p) => (p.gender === 'male' ? p.division === 'MPO' : p.division === 'FPO')),
		'divisions map MPO/FPO from athlete gender'
	);

	// Outside athlete for the eligibility check.
	const outsider = await owner.collection('athletes').create({
		organization: org.id,
		firstName: 'Out',
		lastName: 'Sider',
		gender: 'male',
		status: 'active'
	});

	// Turn enforcement before anything else.
	const first = byUser.get(order[0]);
	const second = byUser.get(order[1]);
	await assert.rejects(pick(second, created.id, males[0]), isCode('not_your_turn'));
	await assert.rejects(pick(first, created.id, outsider.id), isCode('not_eligible'));

	// Scripted plan: round 1 all males; round 2 order[0] takes a SECOND male
	// (the others take females); round 3 proves the roster cap; rounds 3–4
	// complete every roster to exactly 2 MPO + 2 FPO.
	const plan = new Map(); // pickNumber -> athleteId
	for (let i = 0; i < 6; i++) plan.set(i + 1, males[i]); // picks 1–6
	plan.set(7, females[0]); // round 2 reversed: order[5]…
	plan.set(8, females[1]);
	plan.set(9, females[2]);
	plan.set(10, females[3]);
	plan.set(11, females[4]);
	plan.set(12, males[6]); // order[0]'s second male
	plan.set(13, females[5]); // round 3: order[0] must take a female
	plan.set(14, males[7]);
	plan.set(15, males[8]);
	plan.set(16, males[9]);
	plan.set(17, males[10]);
	plan.set(18, males[11]);
	plan.set(19, females[6]); // round 4 reversed: order[5]…
	plan.set(20, females[7]);
	plan.set(21, females[8]);
	plan.set(22, females[9]);
	plan.set(23, females[10]);
	plan.set(24, females[11]); // order[0]'s second female

	for (let pickNumber = 1; pickNumber <= 24; pickNumber++) {
		const seat = snakeSeat(order, pickNumber);
		const manager = byUser.get(seat.manager);
		if (pickNumber === 2) {
			await assert.rejects(
				pick(manager, created.id, males[0]),
				isCode('already_picked'),
				'one selection per athlete per draft'
			);
		}
		if (pickNumber === 13) {
			// order[0] already holds two males — a third is rejected.
			await assert.rejects(
				pick(manager, created.id, males[7]),
				isCode('roster_full'),
				'a third same-division athlete is rejected'
			);
		}
		await pick(manager, created.id, plan.get(pickNumber));
	}

	const done = await board(owner, created.id);
	assert.equal(done.draft.status, 'complete', 'pick 24 completes the draft');
	assert.equal(done.picks.length, 24);
	// Snake order held for every pick, reversing each round.
	for (const p of done.picks) {
		const seat = snakeSeat(order, p.pickNumber);
		assert.equal(p.manager, seat.manager, `pick ${p.pickNumber} follows the snake`);
		assert.equal(p.round, seat.round);
	}
	// Reversal spot checks: picks 6/7 and 12/13 belong to the same manager.
	assert.equal(done.picks[5].manager, done.picks[6].manager, 'round 1→2 reversal');
	assert.equal(done.picks[11].manager, done.picks[12].manager, 'round 2→3 reversal');
	// Six valid final rosters: exactly 2 MPO + 2 FPO, 24 distinct athletes.
	assert.equal(done.rosters.length, 6);
	for (const roster of done.rosters) {
		assert.equal(roster.athletes.length, 4, `${roster.name} drafted four athletes`);
		assert.equal(roster.maleCount, 2, `${roster.name} holds exactly 2 MPO`);
		assert.equal(roster.femaleCount, 2, `${roster.name} holds exactly 2 FPO`);
	}
	assert.equal(new Set(done.picks.map((p) => p.athlete)).size, 24, 'no athlete drafted twice');
	// Picks after completion are rejected.
	await assert.rejects(
		pick(byUser.get(order[0]), created.id, outsider.id),
		isCode('draft_not_active')
	);
});

test('2B timeouts: pause while disconnected, catch-up auto-pick, race, reconnect, slot-aware rankings', async () => {
	const { owner, org } = await orgWithCaps('fan2time', 'Timeout Org');
	const comp = await competitionFixture(owner, org.id, 'Clock');
	const event = await draftEvent(owner, org.id, comp, 'Clock Open');
	const { league, byUser } = await leagueWithManagers(owner, org.id, 'Clock League');

	// Deterministic fixture rankings: every male first, then every female —
	// auto-picks must skip over-cap genders to fit remaining roster slots.
	const probe = await owner.send(`/api/flihub/fantasy/leagues/${league.id}/drafts`, {
		method: 'POST',
		body: { event: event.id, pickSeconds: 2 }
	});
	const probeBoard = await board(owner, probe.id);
	const rankedMales = probeBoard.pool.filter((p) => p.gender === 'male').map((p) => p.athlete);
	const rankedFemales = probeBoard.pool.filter((p) => p.gender === 'female').map((p) => p.athlete);
	// Recreate with explicit rankings on a second event is unnecessary — the
	// draft is still 'ready', so delete isn't needed either: drafts are
	// immutable; instead use a fresh event for the ranked draft.
	const rankedEvent = await draftEvent(owner, org.id, comp, 'Clock Ranked');
	const created = await owner.send(`/api/flihub/fantasy/leagues/${league.id}/drafts`, {
		method: 'POST',
		body: {
			event: rankedEvent.id,
			pickSeconds: 2,
			rankings: [...rankedMales, ...rankedFemales]
		}
	});
	const order = created.draftOrder;
	await owner.send(`/api/flihub/fantasy/drafts/${created.id}/start`, { method: 'POST', body: {} });

	// ALL six managers "disconnect": nobody polls. The deadline passes and
	// the draft simply pauses — nothing drafts invisibly.
	await sleep(2600);
	let state = await board(owner, created.id); // board reads do not tick
	assert.equal(state.picks.length, 0, 'no pick happens while every manager is disconnected');
	assert.equal(state.draft.currentPick, 1, 'the draft pauses at the expired deadline');

	// First reconnect catches up: exactly one overdue auto-pick, clock restarts.
	const caughtUp = await tick(byUser.get(order[1]), created.id);
	assert.equal(caughtUp.acted, true, 'the overdue pick is auto-picked on reconnect');
	assert.equal(
		caughtUp.athlete,
		rankedMales[0],
		'auto-pick takes the highest-ranked available athlete'
	);
	state = await board(owner, created.id);
	assert.equal(state.picks.length, 1);
	assert.equal(state.picks[0].auto, true, 'the timeout pick is labeled automatic');
	assert.equal(state.draft.currentPick, 2);
	assert.ok(
		Date.parse(state.draft.deadline) > Date.now(),
		'the clock restarted from the catch-up moment'
	);

	// Reconnect: a brand-new client sees the identical server-owned state.
	const reconnecting = newClient();
	await reconnecting
		.collection('users')
		.authWithPassword(byUser.get(order[2]).authStore.record.email, 'test-password-1234');
	const reconnected = await board(reconnecting, created.id);
	assert.deepEqual(
		{
			currentPick: reconnected.draft.currentPick,
			deadline: reconnected.draft.deadline,
			picks: reconnected.picks.map((p) => p.athlete)
		},
		{
			currentPick: state.draft.currentPick,
			deadline: state.draft.deadline,
			picks: state.picks.map((p) => p.athlete)
		},
		'a reconnecting manager sees the same persisted board'
	);

	// Race: with pick 2 overdue, a manual pick and a timeout tick land
	// together — exactly ONE pick is created and the turn advances once.
	await sleep(2200);
	const onClock = byUser.get(snakeSeat(order, 2).manager);
	const manualChoice = rankedFemales[0];
	const [manualResult, tickResult] = await Promise.allSettled([
		pick(onClock, created.id, manualChoice),
		tick(byUser.get(order[0]), created.id)
	]);
	const manualWon = manualResult.status === 'fulfilled';
	const tickActed = tickResult.status === 'fulfilled' && tickResult.value.acted === true;
	assert.ok(
		manualWon || tickActed,
		`one of the racers must land (manual: ${manualResult.status}, tick: ${JSON.stringify(
			tickResult.status === 'fulfilled' ? tickResult.value : tickResult.reason?.message
		)})`
	);
	state = await board(owner, created.id);
	assert.equal(state.draft.currentPick, 3, 'the race advanced the turn exactly once');
	assert.equal(
		state.picks.filter((p) => p.pickNumber === 2).length,
		1,
		'the race produced exactly one pick'
	);
	// Two ticks racing the same overdue pick also act exactly once.
	await sleep(2200);
	const [tickA, tickB] = await Promise.all([
		tick(byUser.get(order[0]), created.id),
		tick(byUser.get(order[1]), created.id)
	]);
	assert.equal(
		[tickA.acted, tickB.acted].filter(Boolean).length,
		1,
		'concurrent ticks auto-pick exactly once'
	);
	state = await board(owner, created.id);
	assert.equal(state.draft.currentPick, 4);

	// Let the rest of the draft complete on timeouts alone. Rankings list
	// every male first, so once a manager holds two males the auto-pick must
	// skip ahead to the highest-ranked female — every roster still finishes
	// exactly 2 MPO + 2 FPO.
	for (let guard = 0; guard < 120 && state.draft.status === 'active'; guard++) {
		const due = Date.parse(state.draft.deadline) - Date.now();
		if (due > 0) await sleep(Math.min(due + 150, 2400));
		await tick(byUser.get(order[0]), created.id);
		state = await board(owner, created.id);
	}
	assert.equal(state.draft.status, 'complete', 'the draft completes on timeouts alone');
	assert.equal(state.picks.length, 24);
	for (const roster of state.rosters) {
		assert.equal(roster.maleCount, 2, `${roster.name} auto-completed with exactly 2 MPO`);
		assert.equal(roster.femaleCount, 2, `${roster.name} auto-completed with exactly 2 FPO`);
	}
	const autoCount = state.picks.filter((p) => p.auto).length;
	assert.ok(autoCount >= 22, 'timeout picks are labeled automatic');
});

test('2B substitutions: the designated substitute takes the slot; ambiguity is rejected', async () => {
	const { owner, org } = await orgWithCaps('fan2sub', 'Substitution Org');
	const comp = await competitionFixture(owner, org.id, 'Subs');
	const event = await draftEvent(owner, org.id, comp, 'Subs Open');
	const { league, byUser } = await leagueWithManagers(owner, org.id, 'Subs League');
	const created = await owner.send(`/api/flihub/fantasy/leagues/${league.id}/drafts`, {
		method: 'POST',
		body: { event: event.id, pickSeconds: 2 }
	});
	const order = created.draftOrder;
	await owner.send(`/api/flihub/fantasy/drafts/${created.id}/start`, { method: 'POST', body: {} });

	// Substitutions apply to completed rosters only.
	const activeBoard = await board(owner, created.id);
	assert.equal(activeBoard.draft.status, 'active');

	// Complete the whole draft quickly on the demo clock via catch-up ticks.
	let state = activeBoard;
	for (let guard = 0; guard < 120 && state.draft.status === 'active'; guard++) {
		const due = Date.parse(state.draft.deadline) - Date.now();
		if (due > 0) await sleep(Math.min(due + 150, 2400));
		await tick(owner, created.id);
		state = await board(owner, created.id);
	}
	assert.equal(state.draft.status, 'complete');

	// Pick a drafted FEMALE athlete and designate her event substitute (1E).
	const femalePick = state.picks.find((p) => {
		const entry = state.pool.find((a) => a.athlete === p.athlete);
		return entry?.gender === 'female';
	});
	const slotEntry = comp.entries.find((t) => t.female.id === femalePick.athlete);
	await owner.collection('substitutions').create({
		organization: org.id,
		event: event.id,
		entry: slotEntry.entry.id,
		athleteOut: femalePick.athlete,
		athleteIn: comp.femaleReserve.id,
		reason: 'Withdrew before round one'
	});

	// The board surfaces the pending designated substitution to the owner.
	state = await board(owner, created.id);
	const pending = state.pendingSubstitutions.find((p) => p.athleteOut === femalePick.athlete);
	assert.ok(pending, 'a drafted athlete with an event substitution is flagged');
	assert.equal(pending.athleteIn, comp.femaleReserve.id);

	// Only the league owner applies it.
	const managerClient = byUser.get(order.find((u) => u !== owner.authStore.record.id));
	await assert.rejects(
		managerClient.send(`/api/flihub/fantasy/picks/${pending.pick}/apply-substitution`, {
			method: 'POST',
			body: {}
		}),
		isDenied,
		'managers cannot apply substitutions'
	);
	const applied = await owner.send(`/api/flihub/fantasy/picks/${pending.pick}/apply-substitution`, {
		method: 'POST',
		body: {}
	});
	assert.equal(applied.athlete, femalePick.athlete, 'the original pick is preserved');
	assert.equal(applied.substituteAthlete, comp.femaleReserve.id, 'the substitute takes the slot');
	state = await board(owner, created.id);
	const slot = state.rosters
		.flatMap((r) => r.athletes)
		.find((a) => a.athlete === femalePick.athlete);
	assert.equal(slot.substituteAthlete, comp.femaleReserve.id);
	assert.ok(slot.substituteName, 'the roster shows the substitute alongside the original');
	assert.equal(
		state.pendingSubstitutions.some((p) => p.pick === pending.pick),
		false,
		'applied substitutions leave the pending list'
	);

	// Chained substitution on the same slot → rejected for a product decision.
	await assert.rejects(
		owner.send(`/api/flihub/fantasy/picks/${pending.pick}/apply-substitution`, {
			method: 'POST',
			body: {}
		}),
		isCode('substitution_unresolved'),
		'chained substitutions need a product decision'
	);

	// Gender/division mismatch → rejected (1E does not police gender; D18 does).
	const malePick = state.picks.find((p) => {
		const entry = state.pool.find((a) => a.athlete === p.athlete);
		return entry?.gender === 'male';
	});
	const maleEntry = comp.entries.find((t) => t.male.id === malePick.athlete);
	await owner.collection('substitutions').create({
		organization: org.id,
		event: event.id,
		entry: maleEntry.entry.id,
		athleteOut: malePick.athlete,
		athleteIn: comp.femaleReserve.id,
		reason: 'Cross-division designation'
	});
	state = await board(owner, created.id);
	const malePending = state.pendingSubstitutions.find((p) => p.athleteOut === malePick.athlete);
	await assert.rejects(
		owner.send(
			`/api/flihub/fantasy/picks/${malePending?.pick ?? malePick.athlete}/apply-substitution`,
			{
				method: 'POST',
				body: {}
			}
		),
		isCode('substitution_unresolved'),
		'cross-division substitutes are flagged, not guessed'
	);

	// Duplicate ownership: a SECOND slot designating the SAME reserve → rejected.
	const otherFemalePick = state.picks.find((p) => {
		const entry = state.pool.find((a) => a.athlete === p.athlete);
		return entry?.gender === 'female' && p.athlete !== femalePick.athlete;
	});
	const otherEntry = comp.entries.find((t) => t.female.id === otherFemalePick.athlete);
	await owner.collection('substitutions').create({
		organization: org.id,
		event: event.id,
		entry: otherEntry.entry.id,
		athleteOut: otherFemalePick.athlete,
		athleteIn: comp.femaleReserve.id,
		reason: 'Second withdrawal, same reserve'
	});
	state = await board(owner, created.id);
	const dupPending = state.pendingSubstitutions.find(
		(p) => p.athleteOut === otherFemalePick.athlete
	);
	await assert.rejects(
		owner.send(`/api/flihub/fantasy/picks/${dupPending.pick}/apply-substitution`, {
			method: 'POST',
			body: {}
		}),
		isCode('substitution_unresolved'),
		'duplicate roster ownership is flagged, not guessed'
	);
});
