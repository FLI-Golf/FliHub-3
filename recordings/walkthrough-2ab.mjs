/**
 * Two Phase 2A–2B silent walkthroughs. Reuses the verified browser demo
 * fixture from tests/e2e/phase2ab.spec.mjs: six verified users, twelve teams,
 * twenty-four rostered event athletes, and six event groups. All product
 * actions shown in the videos use the real UI; only fixture setup is API-seeded.
 */
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const APP = process.env.FLIHUB_RECORD_APP_URL;
const PB = process.env.FLIHUB_RECORD_PB_URL;
const MAILPIT = process.env.FLIHUB_RECORD_MAILPIT_URL;
const OUT = process.env.FLIHUB_RECORD_OUTPUT_DIR;
if (!APP || !PB || !MAILPIT || !OUT) throw new Error('Run node recordings/run-walkthrough.mjs 2ab');
mkdirSync(OUT, { recursive: true });
const PASS = 'e2e-password-123';
const people = ['Maya', 'Jordan', 'Casey', 'Sam', 'Taylor', 'Alex'].map((name) => ({
	name,
	email: `${name.toLowerCase()}.fantasy@example.com`
}));
function expect(condition, message) {
	if (!condition) throw new Error(message);
	console.log('Verified:', message);
}
const beat = (ms = 1500) => new Promise((resolve) => setTimeout(resolve, ms));
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

const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
try {
	const auths = [];
	for (const person of people) auths.push(await registerVerified(person));
	const owner = auths[0];
	const org = await api('/api/flihub/organizations', {
		token: owner.token,
		body: {
			name: 'Riverbend Disc Golf',
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
	const compLeague = await record('leagues', { name: 'Riverbend League', status: 'active' });
	const season = await record('seasons', {
		league: compLeague.id,
		name: 'Autumn Season',
		status: 'active'
	});
	const event = await record('events', {
		season: season.id,
		name: 'Riverbend Open',
		status: 'planned'
	});
	const entries = [];
	for (let i = 1; i <= 12; i++) {
		const team = await record('teams', {
			name: `Riverbend Team ${String(i).padStart(2, '0')}`,
			status: 'active'
		});
		const entry = await record('season_entries', {
			season: season.id,
			team: team.id,
			status: 'active'
		});
		const male = await record('athletes', {
			firstName: [
				'Noah',
				'Liam',
				'Ethan',
				'Owen',
				'Leo',
				'Finn',
				'Theo',
				'Arlo',
				'Eli',
				'Max',
				'Jude',
				'Miles'
			][i - 1],
			lastName: 'Reed',
			gender: 'male',
			status: 'active'
		});
		const female = await record('athletes', {
			firstName: [
				'Ava',
				'Mia',
				'Emma',
				'Ivy',
				'Zoe',
				'Ella',
				'Lily',
				'Nora',
				'Ruby',
				'Lucy',
				'Isla',
				'Clara'
			][i - 1],
			lastName: 'Reed',
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
			name: `Riverbend Group${g + 1}`,
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

	// These demo users separately accept organization Viewer invitations off-camera
	// so the existing capability page can show its in-app fantasy Accept control.
	// Organization roles do not grant fantasy seats; approval is recorded below.
	for (let i = 1; i < 6; i++) {
		const invite = await api('/api/flihub/invitations', {
			token: owner.token,
			body: { organization: org.id, email: people[i].email, role: 'viewer' }
		});
		await api('/api/flihub/invitations/accept', {
			token: auths[i].token,
			body: { token: invite.token }
		});
	}
	const cap = `${APP}/organizations/${org.id}/cap/fantasy`;
	const authByUser = new Map(auths.map((a) => [a.record.id, a]));
	const nameByUser = new Map(auths.map((a, i) => [a.record.id, people[i].name]));
	let ctx, page, origin, scenes;
	async function become(auth, url) {
		await ctx.clearCookies();
		await ctx.addCookies([
			{
				name: 'pb_auth',
				value: encodeURIComponent(JSON.stringify({ token: auth.token, record: auth.record })),
				url: APP,
				httpOnly: true,
				sameSite: 'Strict'
			}
		]);
		await page.goto(url);
	}
	async function scene(title, hold = 2000) {
		scenes.push({ title, offsetSeconds: Math.round((Date.now() - origin) / 100) / 10 });
		console.log('Scene:', title);
		await page.evaluate((text) => {
			document.getElementById('recording-slate')?.remove();
			const slate = document.createElement('div');
			slate.id = 'recording-slate';
			slate.textContent = text;
			slate.style.cssText =
				'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:99999;background:#111827;color:#fff;padding:12px 22px;border-radius:10px;font:600 18px system-ui;box-shadow:0 4px 16px #0005;max-width:90%;text-align:center;pointer-events:none';
			document.body.appendChild(slate);
		}, title);
		await beat(hold);
	}
	async function begin(kind) {
		scenes = [];
		origin = Date.now();
		ctx = await browser.newContext({
			viewport: { width: 1280, height: 850 },
			recordVideo: { dir: path.join(OUT, kind), size: { width: 1280, height: 850 } }
		});
		page = await ctx.newPage();
		page.setDefaultTimeout(20000);
	}
	async function finish(kind) {
		const video = page.video();
		await ctx.close();
		await video.saveAs(path.join(OUT, `phase2ab-${kind}-walkthrough.webm`));
		writeFileSync(
			path.join(OUT, `run-manifest-2ab-${kind}.json`),
			JSON.stringify(
				{
					video: `phase2ab-${kind}-walkthrough.webm`,
					silent: true,
					viewport: '1280x850',
					fixture: 'six approved fantasy participants; 12 teams; 24 event athletes',
					scenes
				},
				null,
				2
			)
		);
	}

	await begin('setup');
	await become(owner, cap);
	await page.waitForSelector('[data-testid="create-league"]');
	await scene('League setup & draft prep · Maya is the league owner', 3000);
	await page.locator('#fl-name').fill('Riverbend Fantasy Six');
	await page.locator('#fl-limit').fill('6');
	await beat(1800);
	await page.locator('[data-testid="create-league"]').click();
	await page.waitForSelector('[data-testid="lobby-invite"]');
	const lobby = page.url();
	await scene('A private fantasy league · one owner and five invited participants', 2500);
	for (let i = 1; i < 6; i++) {
		await page.locator('#inv-email').fill(people[i].email);
		await beat(500);
		await page.locator('[data-testid="invite-manager"]').click();
		await page
			.locator('[data-testid="lobby-member"]')
			.filter({ hasText: people[i].name })
			.waitFor();
		await beat(600);
	}
	await scene('Invited is not approved · participants must accept first', 3000);
	for (let i = 1; i < 6; i++) {
		await become(auths[i], cap);
		await page.waitForSelector('[data-testid="fantasy-invites"]');
		await scene(`${people[i].name} accepts a personal fantasy seat`, 1200);
		await page.getByRole('button', { name: 'Accept', exact: true }).click();
		await page.waitForSelector('[data-testid="fantasy-league-row"]');
		await beat(800);
	}
	await become(owner, lobby);
	await scene('Maya reviews accepted invitations and approves each seat', 2500);
	for (let i = 1; i < 6; i++) {
		const row = page.locator('[data-testid="lobby-member"]').filter({ hasText: people[i].name });
		expect(/accepted/i.test(await row.innerText()), 'participant accepted before approval');
		await row.getByRole('button', { name: 'Approve', exact: true }).click();
		await row.getByRole('button', { name: 'Remove', exact: true }).waitFor();
		await beat(800);
	}
	await page.waitForSelector('[data-testid="seats-filled"]');
	expect(
		(await page.locator('[data-testid="seat-count"]').innerText()).includes('6 of 6'),
		'six approved participants'
	);
	await scene('Six approved seats · ready to prepare this event’s draft', 3000);
	await page.locator('#draft-event').selectOption(event.id);
	await page.locator('#draft-clock').selectOption('30');
	await page.locator('[data-testid="prepare-draft"]').scrollIntoViewIfNeeded();
	await beat(2000);
	await page.locator('[data-testid="prepare-draft"]').click();
	await page.waitForSelector('[data-testid="start-draft"]');
	const room = page.url();
	const draftId = room.split('/').pop();
	await scene('The first-round order is drawn once and saved · the owner starts manually', 3500);
	await page.locator('[data-testid="start-draft"]').click();
	await page.waitForSelector('[data-testid="draft-turn"]');
	await scene('Draft started · Round 1 · 24 picks across four snake rounds', 3500);
	await finish('setup');

	await begin('live');
	let final;
	for (let n = 1; n <= 24; n++) {
		const state = await api(`/api/flihub/fantasy/drafts/${draftId}/board`, {
			method: 'GET',
			token: owner.token
		});
		expect(state.draft.currentPick === n, 'draft follows the expected pick number');
		const user = state.draft.onTheClock.user;
		const firstGender = state.order.findIndex((p) => p.user === user) % 2 === 0 ? 'female' : 'male';
		const gender = n <= 12 ? firstGender : firstGender === 'female' ? 'male' : 'female';
		const choice = state.pool.find((p) => !p.pickedBy && p.gender === gender);
		await become(authByUser.get(user), room);
		await page.waitForSelector('[data-testid="your-turn"]');
		if (n === 1)
			await scene('Live draft & roster rules · six approved participants take turns', 3000);
		const division = gender === 'female' ? 'FPO' : 'MPO';
		if ([13, 14, 19, 20].includes(n)) {
			const expected = state.pool.filter((p) => !p.pickedBy && p.gender === gender);
			const visible = await page.locator('[data-testid="pool-athlete"]').count();
			expect(
				visible === expected.length,
				'only available athletes in the needed division are listed'
			);
			for (const candidate of expected)
				expect(
					await page
						.locator(`[data-athlete="${candidate.athlete}"] [data-testid="pick-button"]`)
						.isEnabled(),
					'eligible athlete is selectable'
				);
			const counts = state.rosters.find((r) => r.user === user);
			const title =
				n <= 14
					? `Round 3 · ${nameByUser.get(user)} already has two ${gender === 'male' ? 'FPO' : 'MPO'} · only ${division} is offered`
					: `Round 4 · ${counts.maleCount} MPO + ${counts.femaleCount} FPO · only ${division} can complete the roster`;
			await scene(title, 5000);
		} else if (n <= 3 || n === 7 || n === 12 || n === 24) {
			await scene(
				`Round ${state.draft.round} · ${nameByUser.get(user)} selects an athlete · pick ${n} of 24`,
				1800
			);
		} else await beat(650);
		await page.locator(`[data-athlete="${choice.athlete}"] [data-testid="pick-button"]`).click();
		await page.waitForFunction(
			(count) => document.querySelectorAll('[data-testid="pick-log-row"]').length === count,
			n
		);
		await beat(n <= 3 ? 1200 : 450);
		final = await api(`/api/flihub/fantasy/drafts/${draftId}/board`, {
			method: 'GET',
			token: owner.token
		});
	}
	expect(
		final.draft.status === 'complete' &&
			final.rosters.every((r) => r.maleCount === 2 && r.femaleCount === 2),
		'all six rosters finish with two MPO and two FPO'
	);
	await page.getByText('Final rosters', { exact: true }).waitFor();
	const tile = page
		.locator('[data-testid="roster-tile"]')
		.filter({ hasText: nameByUser.get(final.order[0].user) });
	await tile.scrollIntoViewIfNeeded();
	await scene('Completed roster · 4 athletes · exactly 2 MPO + 2 FPO', 6000);
	await finish('live');
	console.log('PHASE 2AB RECORDINGS OK');
} finally {
	await browser.close();
}
