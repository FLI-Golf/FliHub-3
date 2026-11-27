/**
 * Phases 2A–2B browser acceptance: fantasy league lobby and live snake draft
 * on the disposable preview stack. Seeded via the API (six verified
 * managers, the 12-team/24-athlete event fixture, an approved league), then
 * verified in real browsers: the lobby shows six approved seats, the owner
 * starts the draft, the on-the-clock manager picks from the live board, a
 * timeout auto-pick lands while watching (the room's own clock drives the
 * server tick), a reconnecting manager sees the same saved picks, the
 * completed draft shows six final rosters at exactly 2 MPO + 2 FPO, and
 * a designated event substitution preserves the original pick. The saved
 * pick order verifies the snake reversal.
 * A second draft checks both full-division cases in round 3 and both missing
 * divisions in round 4: ineligible rows are absent, eligible rows are
 * selectable, and browser picks persist with all six rosters visible.
 *
 * Run via `npm run test:e2e` (the orchestrator runs every *.spec.mjs; the
 * stack sets FLIHUB_FANTASY_DEMO_CLOCK=1, though this spec uses the normal
 * 7-second clock for the original flow and 30 seconds for eligibility checkpoints).
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
	await page.waitForURL(/\/(?:organizations|account)(?:[/?#]|$)/, { timeout: 20000 });
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
	if (order[0] === owner.record.id) {
		await managerPage.locator('[data-testid="start-draft"]').waitFor();
	} else {
		await managerPage
			.getByText('Waiting for the commissioner to start the draft.', { exact: true })
			.waitFor();

		expect(
			(await managerPage.locator('[data-testid="start-draft"]').count()) === 0,
			'a non-commissioner cannot start the draft'
		);
	}

	expect(
		(await managerPage.locator('[data-testid="draft-clock"]').count()) === 0,
		'the pick clock has not started before commissioner authorization'
	);

	console.log('Step 3: start, then the on-the-clock manager picks from the live board');
	await ownerPage.click('[data-testid="start-draft"]');
	await ownerPage.waitForSelector('[data-testid="draft-turn"]');
	const turnText = await ownerPage.locator('[data-testid="draft-turn"]').innerText();
	expect(
		(await ownerPage.locator('[data-testid="draft-focus"]').innerText()).includes(
			'Round 1 · Pick 1'
		),
		'the draft opens at Round 1 · Pick 1'
	);
	expect(
		turnText.includes(personByUser.get(order[0]).name),
		'the first manager in the saved order is on the clock'
	);
	await ownerPage.waitForSelector('[data-testid="draft-clock"]');
	expect(true, 'the pick clock is running');
	await managerPage.reload();
	await managerPage.waitForSelector('[data-testid="your-turn"]');
	const roster = (page, user) =>
		page.getByTestId('roster-tile').filter({
			has: page.getByRole('rowheader').getByText(personByUser.get(user).name, { exact: true })
		});
	const pool = managerPage.getByTestId('pool-athlete');
	const available = await pool
		.getByTestId('pick-button')
		.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
	expect(
		available.length > 0 && available.every((label) => label?.includes('2AB Team')),
		'every available athlete names their real event team in the pick control'
	);
	const manualRow = pool.first();
	const manualAthlete = await manualRow.getAttribute('data-athlete');
	await manualRow.getByTestId('pick-button').click();
	const manualSlot = roster(managerPage, order[0]).getByTestId('roster-slot');
	await manualSlot.waitFor();
	const manualBoard = await api(`/api/flihub/fantasy/drafts/${draft.id}/board`, {
		method: 'GET',
		token: owner.token
	});
	const manualPick = manualBoard.picks[0];
	expect(
		manualPick?.athlete === manualAthlete &&
			manualPick.manager === order[0] &&
			!manualPick.auto &&
			(await manualSlot.innerText()) === manualPick.athleteName,
		'the exact manual selection appears in the first manager’s roster'
	);

	console.log('Step 4: a timeout auto-pick lands while watching (7-second clock)');
	const timeoutSlot = roster(ownerPage, order[1]).getByTestId('roster-slot');
	await timeoutSlot.waitFor({ timeout: 20000 });
	const timeoutBoard = await api(`/api/flihub/fantasy/drafts/${draft.id}/board`, {
		method: 'GET',
		token: owner.token
	});
	const timeoutPick = timeoutBoard.picks[1];
	expect(
		timeoutPick?.auto &&
			timeoutPick.manager === order[1] &&
			(await timeoutSlot.innerText()) === timeoutPick.athleteName,
		'the timeout selection appears in the next manager’s roster and is recorded as automatic'
	);

	console.log('Step 5: a reconnecting manager sees the same server-owned board');
	const reconnectPerson = personByUser.get(order[2]);
	const { page: reconnectPage } = await signIn(browser, reconnectPerson);
	await reconnectPage.goto(`${APP}/organizations/${org.id}/fantasy/${league.id}/draft/${draft.id}`);
	for (const pick of [manualPick, timeoutPick]) {
		for (const page of [ownerPage, reconnectPage]) {
			await roster(page, pick.manager)
				.getByTestId('roster-slot')
				.getByText(pick.athleteName, { exact: true })
				.waitFor();
		}
	}
	expect(
		(await reconnectPage.getByTestId('roster-tile').count()) === 6,
		'reconnect shows all six rosters with the same manual and automatic selections'
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
	// The persisted pick sequence shows snake reversal: picks 6/7 and 12/13 share
	// a manager.
	const byNumber = new Map(boardState.picks.map((p) => [p.pickNumber, p.manager]));
	expect(byNumber.get(6) === byNumber.get(7), 'picks 6 and 7 belong to the same manager');
	expect(byNumber.get(12) === byNumber.get(13), 'picks 12 and 13 belong to the same manager');

	await ownerPage.waitForSelector('text=Final rosters', { timeout: 15000 });
	const tiles = ownerPage.locator('[data-testid="roster-tile"]');
	expect((await tiles.count()) === 6, 'six final rosters render');
	const headers = await ownerPage
		.getByTestId('roster-table')
		.getByRole('columnheader')
		.allTextContents();
	expect(
		headers
			.slice(1)
			.map((heading) => heading.trim())
			.join(', ') === 'MPO 1, MPO 2, FPO 1, FPO 2',
		'final roster columns identify two MPO and two FPO slots'
	);
	for (const finalRoster of boardState.rosters) {
		const cells = roster(ownerPage, finalRoster.user).getByRole('cell');
		const expected = ['male', 'female'].flatMap((gender) =>
			finalRoster.athletes
				.filter((athlete) => athlete.gender === gender)
				.map((athlete) => athlete.name)
		);
		expect(
			finalRoster.maleCount === 2 &&
				finalRoster.femaleCount === 2 &&
				(await cells.allInnerTexts()).join('|') === expected.join('|'),
			`${finalRoster.name} displays exactly two MPO and two FPO selections in the corresponding columns`
		);
	}

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

	console.log('Step 8: rounds 3–4 show only selectable athletes for the on-clock manager');
	const filteredEvent = await record('events', {
		season: season.id,
		name: 'Eligibility Open',
		status: 'planned'
	});
	for (let g = 0; g < 6; g++) {
		const group = await record('event_groups', {
			event: filteredEvent.id,
			name: `Eligibility G${g + 1}`,
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
	const filteredDraft = await api(`/api/flihub/fantasy/leagues/${league.id}/drafts`, {
		token: owner.token,
		body: { event: filteredEvent.id, pickSeconds: 30 }
	});
	const filteredRoom = `${APP}/organizations/${org.id}/fantasy/${league.id}/draft/${filteredDraft.id}`;
	await api(`/api/flihub/fantasy/drafts/${filteredDraft.id}/start`, {
		token: owner.token,
		body: {}
	});
	const checkpoints = new Map([
		[13, { round: 3, male: 0, female: 2, needed: 'male' }],
		[14, { round: 3, male: 2, female: 0, needed: 'female' }],
		[19, { round: 4, male: 2, female: 1, needed: 'female' }],
		[20, { round: 4, male: 1, female: 2, needed: 'male' }]
	]);
	for (let n = 1; n <= 24; n++) {
		const state = await api(`/api/flihub/fantasy/drafts/${filteredDraft.id}/board`, {
			method: 'GET',
			token: owner.token
		});
		const user = state.draft.onTheClock.user;
		// Alternating managers take two FPO or two MPO in rounds 1–2,
		// then fill the opposite division in rounds 3–4.
		const firstGender = filteredDraft.draftOrder.indexOf(user) % 2 === 0 ? 'female' : 'male';
		const desired = n <= 12 ? firstGender : firstGender === 'female' ? 'male' : 'female';
		const choice = state.pool.find((p) => !p.pickedBy && p.gender === desired);
		const checkpoint = checkpoints.get(n);
		if (checkpoint) {
			const roster = state.rosters.find((r) => r.user === user);
			expect(
				state.draft.round === checkpoint.round &&
					roster.maleCount === checkpoint.male &&
					roster.femaleCount === checkpoint.female,
				`pick ${n}: checkpoint has the intended round and roster`
			);
			const { ctx, page } = await signIn(browser, personByUser.get(user));
			try {
				await page.goto(filteredRoom);
				await page.waitForSelector('[data-testid="your-turn"]');
				const expected = state.pool.filter((p) => !p.pickedBy && p.gender === checkpoint.needed);
				const excluded = state.pool.filter((p) => p.pickedBy || p.gender !== checkpoint.needed);
				const rows = page.locator('[data-testid="pool-athlete"]');
				expect(
					(await rows.count()) === expected.length && expected.length > 0,
					`pick ${n}: only available ${checkpoint.needed} candidates are listed`
				);
				for (const athlete of excluded) {
					expect(
						(await page
							.locator(`[data-testid="pool-athlete"][data-athlete="${athlete.athlete}"]`)
							.count()) === 0,
						`pick ${n}: ineligible athlete ${athlete.name} row is absent`
					);
				}
				for (const athlete of expected) {
					const row = page.locator(
						`[data-testid="pool-athlete"][data-athlete="${athlete.athlete}"]`
					);
					const button = row.locator('[data-testid="pick-button"]');
					expect(
						(await row.isVisible()) && (await button.isVisible()) && (await button.isEnabled()),
						`pick ${n}: eligible athlete ${athlete.name} is visible and selectable`
					);
				}
				expect(
					(await page.locator('[data-testid="roster-slot"]').count()) === n - 1 &&
						(await page.locator('[data-testid="roster-tile"]').count()) === 6,
					`pick ${n}: previous selections and all rosters remain visible`
				);
				await page
					.locator(
						`[data-testid="pool-athlete"][data-athlete="${choice.athlete}"] [data-testid="pick-button"]`
					)
					.click();
				await page.waitForFunction(
					(count) => document.querySelectorAll('[data-testid="roster-slot"]').length === count,
					n
				);
				const after = await api(`/api/flihub/fantasy/drafts/${filteredDraft.id}/board`, {
					method: 'GET',
					token: owner.token
				});
				expect(
					after.picks[n - 1]?.athlete === choice.athlete && after.draft.currentPick === n + 1,
					`pick ${n}: eligible browser selection persists and advances once`
				);
			} finally {
				await ctx.close();
			}
		} else {
			await api(`/api/flihub/fantasy/drafts/${filteredDraft.id}/pick`, {
				token: authByUser.get(user).token,
				body: { athlete: choice.athlete }
			});
		}
	}
	const filteredDone = await api(`/api/flihub/fantasy/drafts/${filteredDraft.id}/board`, {
		method: 'GET',
		token: owner.token
	});
	expect(
		filteredDone.draft.status === 'complete' &&
			filteredDone.rosters.length === 6 &&
			filteredDone.rosters.every((r) => r.maleCount === 2 && r.femaleCount === 2),
		'filtered draft completes with six 2 MPO + 2 FPO rosters'
	);

	console.log('Phases 2A–2B browser acceptance: all steps passed');
	await browser.close();
	process.exit(0);
} catch (err) {
	console.error(err);
	await browser.close();
	process.exit(1);
}
