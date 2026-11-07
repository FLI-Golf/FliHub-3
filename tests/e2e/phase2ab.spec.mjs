/**
 * Phases 2A–2B browser acceptance: fantasy league lobby and live snake draft
 * on the disposable preview stack. Seeded via the API (six verified
 * managers, the 12-team/24-athlete event fixture, an approved league), then
 * verified in real browsers: the lobby shows six approved seats, the owner
 * starts the draft, the on-the-clock manager picks from the live board, a
 * timeout auto-pick lands while watching (the room's own clock drives the
 * server tick), a reconnecting manager sees the identical server-owned
 * state, the completed draft shows six final rosters at exactly 2 MPO + 2
 * FPO with the snake reversal visible in the log, and a designated event
 * substitution is applied from the room while preserving the original pick.
 *
 * Run via `npm run test:e2e` (the orchestrator runs every *.spec.mjs; the
 * stack sets FLIHUB_FANTASY_DEMO_CLOCK=1, though this spec uses the normal
 * 7-second clock).
 */
import { chromium } from 'playwright';

const APP = process.env.FLIHUB_E2E_APP_URL;
const MAILPIT = process.env.FLIHUB_E2E_MAILPIT_URL;
const PB = process.env.FLIHUB_E2E_PB_URL;
if (!APP || !MAILPIT || !PB) {
	throw new Error('Run via `npm run test:e2e` (tests/e2e/run-e2e.mjs sets the env).');
}

const PASS = 'e2e-password-123';
const ts = Date.now();
const people = Array.from({ length: 6 }, (_, i) => ({
	name: i === 0 ? 'Fantasy Owner' : `Manager ${i}`,
	email: `e2e-2ab-${i}-${ts}@example.com`
}));

function expect(cond, label) {
	if (!cond) throw new Error(`E2E assertion failed: ${label}`);
	console.log(`  ✓ ${label}`);
}

async function verificationToken(email) {
	for (let i = 0; i < 40; i++) {
		const list = await fetch(`${MAILPIT}/api/v1/messages?limit=100`).then((r) => r.json());
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

async function registerVerified(person) {
	await api('/api/collections/users/records', {
		body: { email: person.email, password: PASS, passwordConfirm: PASS, name: person.name }
	});
	await api('/api/collections/users/request-verification', { body: { email: person.email } });
	const token = await verificationToken(person.email);
	await api('/api/collections/users/confirm-verification', { body: { token } });
	return api('/api/collections/users/auth-with-password', {
		body: { identity: person.email, password: PASS }
	});
}

async function signIn(browser, person) {
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const page = await ctx.newPage();
	page.setDefaultTimeout(15000);
	await page.goto(`${APP}/login`);
	await page.fill('input[name="email"]', person.email);
	await page.fill('input[name="password"]', PASS);
	await page.click('button[type="submit"]');
	await page.waitForURL(/\/organizations/, { timeout: 20000 });
	return { ctx, page };
}

const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
try {
	console.log('Step 1: seed the league and event fixture off-camera (fictional data)');
	const auths = [];
	for (const person of people) auths.push(await registerVerified(person));
	const owner = auths[0];
	const org = await api('/api/flihub/organizations', {
		token: owner.token,
		body: {
			name: '2AB Fantasy Org',
			template: 'custom',
			capabilities: [
				'athletes',
				'teams',
				'leagues-seasons',
				'events',
				'venues-courses',
				'scoring-results',
				'standings',
				'fantasy'
			]
		}
	});
	const record = (collection, body) =>
		api(`/api/collections/${collection}/records`, {
			token: owner.token,
			body: { organization: org.id, ...body }
		});
	const compLeague = await record('leagues', { name: '2AB League', status: 'active' });
	const season = await record('seasons', {
		league: compLeague.id,
		name: '2AB Season',
		status: 'active'
	});
	const event = await record('events', {
		season: season.id,
		name: 'Sunset Open',
		status: 'planned'
	});
	const entries = [];
	for (let i = 1; i <= 12; i++) {
		const team = await record('teams', {
			name: `2AB Team ${String(i).padStart(2, '0')}`,
			status: 'active'
		});
		const entry = await record('season_entries', {
			season: season.id,
			team: team.id,
			status: 'active'
		});
		const male = await record('athletes', {
			firstName: `M${String(i).padStart(2, '0')}`,
			lastName: '2AB',
			gender: 'male',
			status: 'active'
		});
		const female = await record('athletes', {
			firstName: `F${String(i).padStart(2, '0')}`,
			lastName: '2AB',
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
		entries.push({ entry, male, female });
	}
	const femalePool = await record('reserve_pools', {
		season: season.id,
		name: "2AB Women's Reserve",
		gender: 'female',
		status: 'active'
	});
	const femaleReserve = await record('athletes', {
		firstName: 'Reserve',
		lastName: 'Fem2AB',
		gender: 'female',
		status: 'active'
	});
	await record('reserve_members', {
		pool: femalePool.id,
		athlete: femaleReserve.id,
		status: 'active'
	});
	for (let g = 0; g < 6; g++) {
		const group = await record('event_groups', {
			event: event.id,
			name: `Sunset G${g + 1}`,
			status: 'active'
		});
		for (const slot of [entries[g * 2], entries[g * 2 + 1]]) {
			await record('group_teams', { group: group.id, entry: slot.entry.id, status: 'active' });
			for (const athlete of [slot.male, slot.female]) {
				await record('group_athletes', {
					group: group.id,
					entry: slot.entry.id,
					athlete: athlete.id,
					status: 'active'
				});
			}
		}
	}
	const league = await api('/api/flihub/fantasy/leagues', {
		token: owner.token,
		body: { organization: org.id, name: 'Sunset Fantasy', participantLimit: 6 }
	});
	for (let i = 1; i <= 5; i++) {
		const invite = await api(`/api/flihub/fantasy/leagues/${league.id}/invite`, {
			token: owner.token,
			body: { email: people[i].email }
		});
		await api(`/api/flihub/fantasy/members/${invite.id}/respond`, {
			token: auths[i].token,
			body: { accept: true }
		});
		await api(`/api/flihub/fantasy/members/${invite.id}/approve`, {
			token: owner.token,
			body: {}
		});
	}
	const draft = await api(`/api/flihub/fantasy/leagues/${league.id}/drafts`, {
		token: owner.token,
		body: { event: event.id, pickSeconds: 7 }
	});
	const order = draft.draftOrder;
	const authByUser = new Map(auths.map((a) => [a.record.id, a]));
	const personByUser = new Map(auths.map((a, i) => [a.record.id, people[i]]));
	expect(order.length === 6, 'draft order drawn and persisted for six managers');

	console.log('Step 2: the owner sees the lobby; the first manager connects early');
	const { page: ownerPage } = await signIn(browser, people[0]);
	await ownerPage.goto(`${APP}/organizations/${org.id}/fantasy/${league.id}`);
	await ownerPage.waitForSelector('[data-testid="seats-filled"]');
	expect(
		(await ownerPage.locator('[data-testid="seat-count"]').innerText()).includes('6 of 6'),
		'lobby shows 6 of 6 approved seats'
	);
	await ownerPage.waitForSelector('[data-testid="lobby-draft"]');
	await ownerPage.click('[data-testid="lobby-draft"] >> text=Open draft room');
	await ownerPage.waitForSelector('[data-testid="start-draft"]');
	const orderText = (await ownerPage.locator('main').innerText()).replace(/\s+/g, ' ');
	expect(
		order.every((u) => orderText.includes(personByUser.get(u).name)),
		'the saved first-round order is displayed before the start'
	);
	// The first manager signs in BEFORE the clock starts.
	const { page: managerPage } = await signIn(browser, personByUser.get(order[0]));
	await managerPage.goto(`${APP}/organizations/${org.id}/fantasy/${league.id}/draft/${draft.id}`);
	await managerPage.waitForSelector('[data-testid="draft-status"]');

	console.log('Step 3: start, then the on-the-clock manager picks from the live board');
	await ownerPage.click('[data-testid="start-draft"]');
	await ownerPage.waitForSelector('[data-testid="draft-turn"]');
	const turnText = await ownerPage.locator('[data-testid="draft-turn"]').innerText();
	expect(turnText.includes('Round 1 · Pick 1'), 'the draft opens at Round 1 · Pick 1');
	expect(
		turnText.includes(personByUser.get(order[0]).name),
		'the first manager in the saved order is on the clock'
	);
	await ownerPage.waitForSelector('[data-testid="draft-clock"]');
	expect(true, 'the pick clock is running');
	await managerPage.reload();
	await managerPage.waitForSelector('[data-testid="your-turn"]');
	await managerPage.locator('[data-testid="pick-button"]').first().click();
	await managerPage.waitForSelector('[data-testid="pick-log-row"]');
	expect(true, 'the manual pick lands in the pick log');
	const rosterText = await managerPage
		.locator('[data-testid="roster-tile"]', { hasText: personByUser.get(order[0]).name })
		.innerText();
	expect(rosterText.includes('1 of 4 drafted'), 'the roster tile shows 1 of 4 drafted');

	console.log('Step 4: a timeout auto-pick lands while watching (7-second clock)');
	await ownerPage.waitForSelector('[data-testid="pick-log-row"] >> text=Auto', { timeout: 20000 });
	expect(true, 'the next pick times out and the auto-pick is labeled in the log');

	console.log('Step 5: a reconnecting manager sees the same server-owned board');
	const reconnectPerson = personByUser.get(order[2]);
	const { page: reconnectPage } = await signIn(browser, reconnectPerson);
	await reconnectPage.goto(`${APP}/organizations/${org.id}/fantasy/${league.id}/draft/${draft.id}`);
	await reconnectPage.waitForSelector('[data-testid="pick-log-row"]');
	const ownerPicks = await ownerPage.locator('[data-testid="pick-log-row"]').count();
	const reconnectPicks = await reconnectPage.locator('[data-testid="pick-log-row"]').count();
	expect(
		Math.abs(ownerPicks - reconnectPicks) <= 1,
		`reconnect shows the shared board (${ownerPicks} vs ${reconnectPicks} picks within one poll)`
	);

	console.log('Step 6: the draft completes; six final rosters at exactly 2 MPO + 2 FPO');
	// Finish quickly via the API: each on-turn manager picks the first
	// athlete that fits their remaining slots (same rules, faster than 7s).
	let boardState = await api(`/api/flihub/fantasy/drafts/${draft.id}/board`, {
		method: 'GET',
		token: owner.token
	});
	let guard = 0;
	while (boardState.draft.status === 'active' && guard < 30) {
		guard += 1;
		const onClock = boardState.draft.onTheClock.user;
		const roster = boardState.rosters.find((r) => r.user === onClock);
		const counts = { male: roster.maleCount, female: roster.femaleCount };
		const choice = boardState.pool.find((p) => !p.pickedBy && counts[p.gender] < 2);
		await api(`/api/flihub/fantasy/drafts/${draft.id}/pick`, {
			token: authByUser.get(onClock).token,
			body: { athlete: choice.athlete }
		});
		boardState = await api(`/api/flihub/fantasy/drafts/${draft.id}/board`, {
			method: 'GET',
			token: owner.token
		});
	}
	expect(boardState.draft.status === 'complete', 'all 24 picks complete the draft');
	// Snake reversal visible in the completed log: picks 6/7 and 12/13 share
	// a manager.
	const byNumber = new Map(boardState.picks.map((p) => [p.pickNumber, p.manager]));
	expect(byNumber.get(6) === byNumber.get(7), 'picks 6 and 7 belong to the same manager');
	expect(byNumber.get(12) === byNumber.get(13), 'picks 12 and 13 belong to the same manager');

	await ownerPage.waitForSelector('text=Final rosters', { timeout: 15000 });
	const tiles = ownerPage.locator('[data-testid="roster-tile"]');
	expect((await tiles.count()) === 6, 'six final rosters render');
	for (let i = 0; i < 6; i++) {
		const text = (await tiles.nth(i).innerText()).replace(/\s+/g, ' ');
		expect(
			text.includes('4 of 4 drafted · 2 MPO / 2 FPO'),
			`roster ${i + 1} holds exactly 2 MPO and 2 FPO`
		);
	}
	const poolRows = await ownerPage.locator('[data-testid="pool-athlete"]').allInnerTexts();
	expect(
		poolRows.every((row) => row.includes('2AB Team')),
		'every eligible athlete shows their real event team'
	);

	console.log('Step 7: a designated event substitution is applied from the room');
	const femalePick = boardState.picks.find((p) => {
		const entry = boardState.pool.find((a) => a.athlete === p.athlete);
		return entry?.gender === 'female';
	});
	const slot = entries.find((t) => t.female.id === femalePick.athlete);
	await record('substitutions', {
		event: event.id,
		entry: slot.entry.id,
		athleteOut: femalePick.athlete,
		athleteIn: femaleReserve.id,
		reason: 'Withdrew before round one'
	});
	await ownerPage.reload();
	await ownerPage.waitForSelector('[data-testid="pending-substitution"]');
	await ownerPage.click('[data-testid="apply-substitution"]');
	await ownerPage.waitForSelector('[data-testid="roster-slot"] >> text=Substitute for');
	const substitutedSlot = (
		await ownerPage
			.locator('[data-testid="roster-slot"]', { hasText: 'Substitute for' })
			.innerText()
	).replace(/\s+/g, ' ');
	expect(
		substitutedSlot.includes('Reserve Fem2AB'),
		'the designated substitute takes over the roster slot'
	);
	expect(
		substitutedSlot.includes('Substitute for'),
		'the original pick stays visible alongside the substitute'
	);

	console.log('Phases 2A–2B browser acceptance: all steps passed');
	await browser.close();
	process.exit(0);
} catch (err) {
	console.error(err);
	await browser.close();
	process.exit(1);
}
