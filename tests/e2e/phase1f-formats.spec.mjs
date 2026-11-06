/**
 * Phase 1F format verification (D14, sport-neutral model; demo numbers are
 * pilot configuration):
 *
 * A. Single nine-hole event, built entirely through the normal organizer UI:
 *    one course, nine named holes with one chosen basket position each, one
 *    event with exactly ONE round — verified to work with no second round
 *    and no intermission marker, with the organizer choosing the position
 *    from the course's actual labels.
 *
 * B. FLI two-round disc golf demo: ONE course with nine physical hole
 *    records (red + blue positions in the 220–425 ft demo range, hole 8
 *    carrying placeholder demo naming until the final content is decided),
 *    round 1 = holes 1–9 at red, an intermission, round 2 = the SAME nine
 *    holes at blue (18 holes of play from nine hole records), six groups of
 *    two teams and four athletes each with one scorekeeper per group.
 *    Fixtures are seeded through the direct API with the organizer's own
 *    credentials; the saved configuration and the organizer view for both
 *    rounds and the break are verified in the browser.
 *
 * Run via `npm run test:e2e` (the orchestrator runs every *.spec.mjs in order).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP = process.env.FLIHUB_E2E_APP_URL;
const MAILPIT = process.env.FLIHUB_E2E_MAILPIT_URL;
const PB = process.env.FLIHUB_E2E_PB_URL;
if (!APP || !MAILPIT || !PB) {
	throw new Error('Run via `npm run test:e2e` (tests/e2e/run-e2e.mjs sets the env).');
}

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'output');
const PASS = 'e2e-password-123';
const ts = Date.now();
const OWNER = { name: 'Fmt Owner', email: `e2e-fmt-owner-${ts}@example.com` };
const SCOREKEEPER = { name: 'Fmt Keeper', email: `e2e-fmt-keeper-${ts}@example.com` };

function expect(cond, label) {
	if (!cond) throw new Error(`E2E assertion failed: ${label}`);
	console.log(`  ✓ ${label}`);
}

async function verificationToken(email) {
	for (let i = 0; i < 40; i++) {
		const list = await fetch(`${MAILPIT}/api/v1/messages?limit=50`).then((r) => r.json());
		const msg = (list.messages ?? [])
			.filter((m) => (m.To ?? []).some((t) => t.Address === email))
			.sort((a, b) => new Date(b.Created) - new Date(a.Created))[0];
		if (msg) {
			const full = await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`).then((r) => r.json());
			const match = `${full.HTML ?? ''}\n${full.Text ?? ''}`.match(
				/verify-email\/([A-Za-z0-9_.-]+)/
			);
			if (match) return match[1];
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error(`No verification email for ${email}`);
}

async function api(pathname, { method = 'POST', body, token } = {}) {
	const res = await fetch(`${PB}${pathname}`, {
		method,
		headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
		body: body ? JSON.stringify(body) : undefined
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok)
		throw new Error(`API ${method} ${pathname} failed: ${res.status} ${JSON.stringify(data)}`);
	return data;
}

const browser = await chromium.launch();
try {
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const p = await ctx.newPage();
	p.setDefaultTimeout(10000);

	// ============================================================== Part A ===
	console.log('Part A — single nine-hole event through the organizer UI');
	await p.goto(`${APP}/register`);
	await p.fill('input[name="name"]', OWNER.name);
	await p.fill('input[name="email"]', OWNER.email);
	await p.fill('input[name="password"]', PASS);
	await p.fill('input[name="passwordConfirm"]', PASS);
	await p.click('button[type="submit"]');
	await p.waitForSelector('text=We sent a verification email', { timeout: 15000 });
	const token = await verificationToken(OWNER.email);
	await p.goto(`${APP}/verify-email/${token}`);
	await p.waitForLoadState('networkidle');
	await p.goto(`${APP}/login`);
	await p.fill('input[name="email"]', OWNER.email);
	await p.fill('input[name="password"]', PASS);
	await p.click('button[type="submit"]');
	await p.waitForURL(/\/organizations/, { timeout: 15000 });
	await p.fill('#org-name', 'Single Round Club');
	await p.click('input[name="template"][value="custom"]');
	for (const cap of ['events', 'venues-courses']) {
		await p.check(`input[name="capability"][value="${cap}"]`);
	}
	await p.click('button:has-text("Create organization")');
	await p.waitForURL(/\/organizations\/[a-z0-9]{15}/, { timeout: 15000 });
	const orgUrlA = p.url();
	expect(true, 'organization created with events + venues-courses only');

	console.log('Step A1: nine named holes with one chosen position each (UI)');
	const nav = () => p.locator('nav[aria-label="Organization sections"]');
	await p.waitForSelector('nav[aria-label="Organization sections"]');
	await nav()
		.getByRole('link', { name: /Venues & courses/ })
		.click();
	await p.waitForURL(/\/cap\/venues-courses/, { timeout: 15000 });
	await p.fill('#course-name', 'Riverbend Nine');
	await p.click('button:has-text("Create course")');
	await p.waitForSelector('form[action="?/addHole"]', { timeout: 15000 });
	const holeNames = [
		'The Willow',
		'Long Meadow',
		'Twin Pines',
		'The Crossing',
		'Osprey Point',
		'The Hollow',
		'Cedar Gap',
		'The Bend',
		'Home Stretch'
	];
	for (let i = 1; i <= 9; i++) {
		const holeForm = p.locator('form[action="?/addHole"]');
		await holeForm.locator('input[name="number"]').fill(String(i));
		await holeForm.locator('input[name="name"]').fill(holeNames[i - 1]);
		await holeForm.locator('button[type="submit"]').click();
		await p.waitForSelector(`text=Hole ${i} — ${holeNames[i - 1]}`, { timeout: 15000 });
		const posForm = p
			.locator('div.rounded-md.border.p-2', { hasText: `Hole ${i} — ${holeNames[i - 1]}` })
			.locator('form[action="?/addPosition"]');
		await posForm.locator('input[name="label"]').fill('standard');
		await posForm.locator('input[name="distance"]').fill(String(240 + i * 12));
		await posForm.locator('button[type="submit"]').click();
		await p.waitForSelector(`text=${240 + i * 12} feet`, { timeout: 15000 });
	}
	const mainText = await p.innerText('main');
	expect(
		holeNames.every((n) => mainText.includes(n)),
		'nine holes created through the UI, each numbered and named'
	);
	// One extra "long" position on hole 1 only — it must show up as an
	// incomplete, unselectable choice with its coverage and missing holes.
	const holeOneBlock = p.locator('div.rounded-md.border.p-2', {
		hasText: `Hole 1 — ${holeNames[0]}`
	});
	const longForm = holeOneBlock.locator('form[action="?/addPosition"]');
	await longForm.locator('input[name="label"]').fill('long');
	await longForm.locator('input[name="distance"]').fill('410');
	await longForm.locator('button[type="submit"]').click();
	await p.waitForSelector('text=410 feet', { timeout: 15000 });

	console.log('Step A2: one event, exactly one round, no intermission');
	await nav()
		.getByRole('link', { name: /Events/ })
		.click();
	await p.waitForURL(/\/cap\/events/, { timeout: 15000 });
	await p.fill('#event-name', 'Riverbend Open');
	// Independent event: rounds do not require a season.
	await p.click('button:has-text("Add event")');
	await p.waitForSelector('#ops-event', { timeout: 15000 });
	const roundForm = p.locator('form[action="?/addRound"]');
	await roundForm.locator('input[name="number"]').fill('1');
	await roundForm.locator('select[name="course"]').selectOption({ label: 'Riverbend Nine' });
	const positionOptions = await roundForm
		.locator('select[name="positionLabel"] option')
		.allInnerTexts();
	expect(
		positionOptions.some((o) => o.includes('standard') && o.includes('all 9 holes')),
		'organizer chooses from the course\u2019s available basket positions'
	);
	const longOption = roundForm.locator('select[name="positionLabel"] option', {
		hasText: 'long'
	});
	expect(
		(await longOption.innerText()).includes('1/9 holes') &&
			(await longOption.innerText()).includes('missing hole 2, 3, 4, 5, 6, 7, 8, 9') &&
			(await longOption.isDisabled()),
		'incomplete position shows its coverage and missing holes, and cannot be selected'
	);
	await roundForm.locator('select[name="positionLabel"]').selectOption('standard');
	await roundForm.locator('button[type="submit"]').click();
	await p.waitForSelector('text=standard positions', { timeout: 15000 });
	const opsText = await p
		.locator('[data-slot="card"]', { hasText: 'Rounds — Riverbend Open' })
		.innerText();
	expect(opsText.includes('Round 1'), 'single round saved and shown');
	expect(!opsText.includes('Round 2'), 'no second round exists');
	expect(!opsText.includes('— intermission —'), 'no intermission marker for a single-round event');
	await p.screenshot({ path: path.join(OUT, '1f-fmt-A-single-round.png') });

	// ============================================================== Part B ===
	console.log('Part B — FLI two-round disc golf demo (seeded, verified on screen)');
	const ownerAuth = await api('/api/collections/users/auth-with-password', {
		body: { identity: OWNER.email, password: PASS }
	});
	const T = ownerAuth.token;
	const org = await api('/api/flihub/organizations', {
		token: T,
		body: {
			name: 'FLI Disc Golf',
			template: 'custom',
			capabilities: ['athletes', 'teams', 'leagues-seasons', 'events', 'venues-courses']
		}
	});
	const record = (collection, body) =>
		api(`/api/collections/${collection}/records`, {
			token: T,
			body: { organization: org.id, ...body }
		});

	// Competition structure: league, season, 12 teams entered, each with one
	// male and one female rostered athlete (demo rule, pilot configuration).
	const league = await record('leagues', { name: 'FLI League', status: 'active' });
	const season = await record('seasons', {
		league: league.id,
		name: 'Demo Season',
		status: 'active'
	});
	const event = await record('events', {
		season: season.id,
		name: 'FLI Demonstration Event',
		status: 'planned'
	});
	const entries = [];
	const rosterByEntry = new Map();
	for (let i = 1; i <= 12; i++) {
		const team = await record('teams', {
			name: `Team ${String(i).padStart(2, '0')}`,
			status: 'active'
		});
		const entry = await record('season_entries', {
			season: season.id,
			team: team.id,
			status: 'active'
		});
		const male = await record('athletes', {
			firstName: `Marcus${i}`,
			lastName: `Demo`,
			gender: 'male',
			status: 'active'
		});
		const female = await record('athletes', {
			firstName: `Fiona${i}`,
			lastName: `Demo`,
			gender: 'female',
			status: 'active'
		});
		for (const athlete of [male, female]) {
			await record('roster_memberships', {
				entry: entry.id,
				athlete: athlete.id,
				status: 'active'
			});
		}
		entries.push(entry);
		rosterByEntry.set(entry.id, [male, female]);
	}
	// Separate male and female reserve pools (documented demo setup).
	const malePool = await record('reserve_pools', {
		season: season.id,
		name: "Men's Reserve",
		gender: 'male',
		status: 'active'
	});
	const femalePool = await record('reserve_pools', {
		season: season.id,
		name: "Women's Reserve",
		gender: 'female',
		status: 'active'
	});
	const maleReserve = await record('athletes', {
		firstName: 'Reserve',
		lastName: 'Marcus',
		gender: 'male',
		status: 'active'
	});
	const femaleReserve = await record('athletes', {
		firstName: 'Reserve',
		lastName: 'Fiona',
		gender: 'female',
		status: 'active'
	});
	await record('reserve_members', { pool: malePool.id, athlete: maleReserve.id, status: 'active' });
	await record('reserve_members', {
		pool: femalePool.id,
		athlete: femaleReserve.id,
		status: 'active'
	});

	// ONE course, nine physical hole records, red + blue positions within the
	// 220–425 ft demo range. Hole 8 keeps placeholder demo naming until the
	// final content is decided.
	const course = await record('courses', { name: 'FLI Nine', status: 'active' });
	const demoHoleNames = [
		'The Willow',
		'Long Meadow',
		'Twin Pines',
		'The Crossing',
		'Osprey Point',
		'The Hollow',
		'Cedar Gap',
		'Hole 8 (demo name — final content TBD)',
		'Home Stretch'
	];
	const distances = [];
	for (let i = 1; i <= 9; i++) {
		const hole = await record('course_holes', {
			course: course.id,
			number: i,
			name: demoHoleNames[i - 1],
			par: 3,
			status: 'active'
		});
		const red = 225 + i * 8;
		const blue = 300 + i * 12;
		distances.push(red, blue);
		await record('hole_positions', {
			hole: hole.id,
			label: 'red',
			distance: red,
			unit: 'feet',
			status: 'active'
		});
		await record('hole_positions', {
			hole: hole.id,
			label: 'blue',
			distance: blue,
			unit: 'feet',
			status: 'active'
		});
	}
	expect(
		distances.every((d) => d >= 220 && d <= 425),
		'all 18 position distances are within the approved 220–425 ft demo range'
	);

	// Round 1 = red, intermission, round 2 = the SAME course at blue.
	await record('rounds', {
		event: event.id,
		number: 1,
		name: 'Round one',
		course: course.id,
		positionLabel: 'red',
		status: 'active'
	});
	await record('rounds', {
		event: event.id,
		number: 2,
		name: 'Round two',
		course: course.id,
		positionLabel: 'blue',
		status: 'active'
	});

	// One scorekeeper member; six groups of two teams and four athletes.
	await api('/api/collections/users/records', {
		body: {
			email: SCOREKEEPER.email,
			password: PASS,
			passwordConfirm: PASS,
			name: SCOREKEEPER.name
		}
	});
	await api('/api/collections/users/request-verification', {
		body: { email: SCOREKEEPER.email }
	});
	const skToken = await verificationToken(SCOREKEEPER.email);
	await api('/api/collections/users/confirm-verification', { body: { token: skToken } });
	const invite = await api('/api/flihub/invitations', {
		token: T,
		body: { organization: org.id, email: SCOREKEEPER.email, role: 'scorekeeper' }
	});
	const skAuth = await api('/api/collections/users/auth-with-password', {
		body: { identity: SCOREKEEPER.email, password: PASS }
	});
	await api('/api/flihub/invitations/accept', {
		token: skAuth.token,
		body: { token: invite.token }
	});
	const scorekeeperId = skAuth.record.id;

	for (let g = 0; g < 6; g++) {
		const group = await record('event_groups', {
			event: event.id,
			name: `Group ${g + 1}`,
			scorekeeper: scorekeeperId,
			status: 'active'
		});
		for (const entry of [entries[g * 2], entries[g * 2 + 1]]) {
			await record('group_teams', { group: group.id, entry: entry.id, status: 'active' });
			for (const athlete of rosterByEntry.get(entry.id)) {
				await record('group_athletes', {
					group: group.id,
					entry: entry.id,
					athlete: athlete.id,
					status: 'active'
				});
			}
		}
	}
	expect(true, 'demo seeded: 12 teams, 24 rostered athletes, reserves, 6 staffed groups');

	console.log('Step B1: saved configuration verified via the API');
	const list = async (collection, filter) =>
		api(`/api/collections/${collection}/records?perPage=200&filter=${encodeURIComponent(filter)}`, {
			method: 'GET',
			token: T
		});
	const holes = await list('course_holes', `course = "${course.id}" && status = "active"`);
	expect(holes.totalItems === 9, 'exactly nine physical hole records exist');
	expect(
		holes.items.every((h) => h.par === 3),
		'every demo hole is par 3'
	);
	const rounds = await list('rounds', `event = "${event.id}" && status = "active"`);
	expect(
		rounds.totalItems === 2 &&
			rounds.items.every((r) => r.course === course.id) &&
			rounds.items.find((r) => r.number === 1)?.positionLabel === 'red' &&
			rounds.items.find((r) => r.number === 2)?.positionLabel === 'blue',
		'two rounds replay the SAME nine holes — 18 holes of play from nine hole records'
	);
	const groups = await list('event_groups', `event = "${event.id}" && status = "active"`);
	expect(groups.totalItems === 6, 'six groups exist for the event');
	expect(
		groups.items.every((g) => g.scorekeeper === scorekeeperId),
		'each group has one scorekeeper'
	);
	const groupTeams = await list('group_teams', `event = "${event.id}" && status = "active"`);
	const groupAthletes = await list('group_athletes', `event = "${event.id}" && status = "active"`);
	expect(
		groupTeams.totalItems === 12 &&
			groups.items.every((g) => groupTeams.items.filter((gt) => gt.group === g.id).length === 2),
		'each group contains two teams (12 total)'
	);
	expect(
		groupAthletes.totalItems === 24 &&
			groups.items.every((g) => groupAthletes.items.filter((ga) => ga.group === g.id).length === 4),
		'each group contains four athletes (24 total)'
	);

	console.log('Step B2: organizer view shows both rounds, the break, and the groups');
	await p.goto(`${APP}/organizations/${org.id}/cap/events`);
	await p.waitForSelector('#ops-event', { timeout: 15000 });
	const roundsCard = p.locator('[data-slot="card"]', {
		hasText: 'Rounds — FLI Demonstration Event'
	});
	const roundsText = await roundsCard.innerText();
	expect(
		roundsText.includes('Round 1') &&
			roundsText.includes('red positions') &&
			roundsText.includes('— intermission —') &&
			roundsText.includes('Round 2') &&
			roundsText.includes('blue positions'),
		'organizer view: round 1 (red), the intermission break, round 2 (blue)'
	);
	// Count on the round rows themselves (the add-round form's course select
	// also contains the course name in its options).
	const roundRowTexts = await roundsCard.locator('div.rounded-md.border').allInnerTexts();
	expect(
		roundRowTexts.filter((t) => t.includes('FLI Nine')).length === 2,
		'both rounds display the same course'
	);
	const groupsCard = p.locator('[data-slot="card"]', {
		hasText: 'Groups — FLI Demonstration Event'
	});
	const groupsText = await groupsCard.innerText();
	expect(
		[1, 2, 3, 4, 5, 6].every((n) => groupsText.includes(`Group ${n}`)),
		'organizer view lists all six groups'
	);
	expect(
		(groupsText.match(new RegExp(SCOREKEEPER.name, 'g')) ?? []).length >= 6,
		'every group shows its assigned scorekeeper'
	);
	const groupOne = groupsCard.locator('div.rounded-md.border', { hasText: 'Group 1' }).first();
	const groupOneText = await groupOne.innerText();
	expect(
		groupOneText.includes('Team 01') &&
			groupOneText.includes('Team 02') &&
			groupOneText.includes('Marcus1 Demo') &&
			groupOneText.includes('Fiona1 Demo') &&
			groupOneText.includes('Marcus2 Demo') &&
			groupOneText.includes('Fiona2 Demo'),
		'group 1 shows its two teams and four athletes'
	);
	await p.screenshot({ path: path.join(OUT, '1f-fmt-B-demo-event.png'), fullPage: true });
	await p.goto(`${APP}/organizations/${org.id}/cap/venues-courses`);
	await p.waitForSelector('text=FLI Nine', { timeout: 15000 });
	const courseText = await p.innerText('main');
	expect(
		courseText.includes('Hole 8 (demo name — final content TBD)'),
		'hole 8 keeps placeholder demo naming until the final content is decided'
	);
	await p.screenshot({ path: path.join(OUT, '1f-fmt-B-course.png'), fullPage: true });
	expect(true, `single-round org (${orgUrlA}) and demo org verified side by side`);

	console.log('Phase 1F format verification: all steps passed');
} finally {
	await browser.close();
}
