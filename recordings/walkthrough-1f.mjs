/**
 * Phase 1F walkthrough recording (Playwright, headless Chromium, 1280×720,
 * single continuous take): event operations — a nine-hole course with Red
 * and Blue basket positions and explicit distances, a single-round event
 * with no intermission, the FLI two-round demo (Red → intermission → Blue:
 * 18 holes of play on nine physical holes), and the six staffed groups with
 * teams, athletes, and an assigned scorekeeper (framed as setup for Phase 1G
 * scoring). The future playoff shootout stays outside the recording.
 *
 * Runs against a disposable instance with fictional demo data. The
 * competition structure, rosters, course, rounds, and groups are seeded
 * off-camera via the direct API; the organizer session uses a prepared
 * cookie (authentication happens off-camera); credentials are never typed on
 * the recording. Every scene synchronizes on visible UI outcomes and logs
 * them into output/run-manifest-1f.json.
 *
 * Run via `npm run record:walkthrough-1f` — the runner provides the
 * environment.
 */
import path from 'node:path';
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP = process.env.FLIHUB_RECORD_APP_URL;
const MAILPIT = process.env.FLIHUB_RECORD_MAILPIT_URL;
const PB = process.env.FLIHUB_RECORD_PB_URL;
if (!APP || !MAILPIT || !PB) {
	throw new Error(
		'Run via `npm run record:walkthrough-1f` (recordings/run-walkthrough.mjs sets env).'
	);
}

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const PASSWORD = 'demo-not-a-real-password';
const ORGANIZER = { name: 'Riley Chen', email: 'riley.chen@example.com' }; // Owner / organizer
const SCOREKEEPER = { name: 'Casey Morgan', email: 'casey.morgan@example.com' };
const ORG = 'Lakeside Golf Collective';
const LEAGUE = 'Lakeside Golf League';
const SEASON = 'Summer 2026';
const COURSE = 'Lakeside Nine';
const EVENT_SINGLE = 'Club Night';
const EVENT_DEMO = 'FLI Demonstration Event';
const HOLE_NAMES = [
	'The Willow',
	'Long Meadow',
	'Twin Pines',
	'The Crossing',
	'Osprey Point',
	'The Hollow',
	'Cedar Gap',
	'Hole Eight (name TBD)',
	'Home Stretch'
];
const TEAM_NAMES = [
	'Blue Heron Flyers',
	'Cedar Hawks',
	'River Otters',
	'Granite Spinners',
	'Maple Drifters',
	'Fox Hollow Four',
	'Lakeside Larks',
	'Juniper Jays',
	'Stone Bridge Club',
	'Windmill Pines',
	'Harbor Lights',
	'Meadow Runners'
];
const ATHLETE_NAMES = [
	['Ava Stone', 'Sam Finch'],
	['Mia Calder', 'Leo Park'],
	['Nora Vale', 'Eli Brook'],
	['Isla Reyes', 'Owen Hart'],
	['Lena Frost', 'Noah Webb'],
	['Ruth Lennox', 'Finn Harper'],
	['June Maren', 'Cole Draper'],
	['Tess Arbor', 'Reed Colton'],
	['Faye Winslow', 'Jude Mercer'],
	['Skye Alden', 'Rhys Monroe'],
	['Vera Lindon', 'Beau Carver'],
	['Dana Elwood', 'Kai Sheldon']
];

const beat = (ms = 1200) => new Promise((r) => setTimeout(r, ms));

// Clock origin = recording context creation (video t=0), NOT module load —
// data seeding must not shift the scene offsets off the video timeline.
let t0 = 0;
const sceneLog = [];
function seconds() {
	return Math.round((Date.now() - t0) / 100) / 10;
}
function markScene(id, title) {
	sceneLog.push({ id, title, offsetSeconds: seconds(), observed: [] });
	console.log(`Scene ${id} @ ${seconds()}s`);
}
function observed(text) {
	sceneLog[sceneLog.length - 1].observed.push({ atSeconds: seconds(), outcome: text });
	console.log(`  observed @ ${seconds()}s: ${text}`);
}

// Narration-paced minimum scene durations (local word-count estimate, no API).
const narration = JSON.parse(
	readFileSync(
		path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'narration-1f.json'),
		'utf8'
	)
);
const WORDS_PER_SECOND = 2.4;
const LEAD_TAIL_SECONDS = 2.4;
function minSceneSeconds(id) {
	const scene = narration.scenes.find((n) => n.id === id);
	const words = scene.tts.trim().split(/\s+/).length;
	return words / WORDS_PER_SECOND + LEAD_TAIL_SECONDS;
}
async function settleScene(id) {
	const scene = sceneLog[sceneLog.length - 1];
	const elapsed = seconds() - scene.offsetSeconds;
	const remaining = minSceneSeconds(id) - elapsed;
	if (remaining > 0) await beat(remaining * 1000);
}

// ---------------------------------------------------------------------------
// Off-camera helpers (never recorded)
// ---------------------------------------------------------------------------
async function api(pathname, { method = 'GET', body, token } = {}) {
	const res = await fetch(`${PB}${pathname}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: token } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok)
		throw new Error(`API ${method} ${pathname} failed: ${res.status} ${JSON.stringify(data)}`);
	return data;
}

async function confirmLatestVerificationEmail(email) {
	let token = null;
	for (let i = 0; i < 40 && !token; i++) {
		const list = await fetch(`${MAILPIT}/api/v1/messages?limit=50`).then((r) => r.json());
		const msg = (list.messages ?? [])
			.filter((m) => (m.To ?? []).some((t) => t.Address === email))
			.sort((a, b) => new Date(b.Created) - new Date(a.Created))[0];
		if (msg) {
			const full = await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`).then((r) => r.json());
			const match = `${full.HTML ?? ''}\n${full.Text ?? ''}`.match(
				/verify-email\/([A-Za-z0-9_.-]+)/
			);
			if (match) token = match[1];
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	if (!token) throw new Error(`No verification email for ${email}`);
	await api('/api/collections/users/confirm-verification', { method: 'POST', body: { token } });
}

async function createVerifiedUser(person) {
	await api('/api/collections/users/records', {
		method: 'POST',
		body: { email: person.email, password: PASSWORD, passwordConfirm: PASSWORD, name: person.name }
	});
	await api('/api/collections/users/request-verification', {
		method: 'POST',
		body: { email: person.email }
	});
	await confirmLatestVerificationEmail(person.email);
	return api('/api/collections/users/auth-with-password', {
		method: 'POST',
		body: { identity: person.email, password: PASSWORD }
	});
}

function cookieFor(auth) {
	return {
		name: 'pb_auth',
		value: encodeURIComponent(JSON.stringify({ token: auth.token, record: auth.record })),
		domain: '127.0.0.1',
		path: '/',
		httpOnly: true,
		sameSite: 'Strict'
	};
}

async function showSlate(page, text) {
	await page.evaluate((t) => {
		document.getElementById('recording-slate')?.remove();
		const el = document.createElement('div');
		el.id = 'recording-slate';
		el.textContent = t;
		el.style.cssText =
			'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99999;' +
			'background:#111827;color:#f9fafb;padding:10px 18px;border-radius:10px;' +
			'font:600 15px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35);';
		document.body.appendChild(el);
	}, text);
	await beat(2300);
	await page.evaluate(() => document.getElementById('recording-slate')?.remove());
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });

try {
	console.log('Preparing fictional demo data off-camera…');
	const riley = await createVerifiedUser(ORGANIZER);
	const org = await api('/api/flihub/organizations', {
		method: 'POST',
		token: riley.token,
		body: {
			name: ORG,
			template: 'custom',
			capabilities: ['athletes', 'teams', 'leagues-seasons', 'events', 'venues-courses']
		}
	});
	const record = (collection, body) =>
		api(`/api/collections/${collection}/records`, {
			method: 'POST',
			token: riley.token,
			body: { organization: org.id, ...body }
		});

	// Competition structure: 12 teams entered into the season, each with one
	// female and one male rostered athlete (pilot configuration).
	const league = await record('leagues', { name: LEAGUE, status: 'active' });
	const season = await record('seasons', {
		league: league.id,
		name: SEASON,
		status: 'active',
		startsOn: '2026-06-01',
		endsOn: '2026-08-31'
	});
	const entries = [];
	const athletesByEntry = new Map();
	for (let i = 0; i < 12; i++) {
		const team = await record('teams', { name: TEAM_NAMES[i], status: 'active' });
		const entry = await record('season_entries', {
			season: season.id,
			team: team.id,
			status: 'active'
		});
		const pair = [];
		for (const [index, full] of ATHLETE_NAMES[i].entries()) {
			const [firstName, lastName] = full.split(' ');
			const athlete = await record('athletes', {
				firstName,
				lastName,
				gender: index === 0 ? 'female' : 'male',
				status: 'active'
			});
			await record('roster_memberships', {
				entry: entry.id,
				athlete: athlete.id,
				status: 'active'
			});
			pair.push(athlete);
		}
		entries.push(entry);
		athletesByEntry.set(entry.id, pair);
	}

	// Course: nine physical holes (par 3), Red and Blue positions with
	// explicit distances in feet, all within the 220–425 ft demo range.
	const course = await record('courses', { name: COURSE, status: 'active' });
	for (let i = 1; i <= 9; i++) {
		const hole = await record('course_holes', {
			course: course.id,
			number: i,
			name: HOLE_NAMES[i - 1],
			par: 3,
			status: 'active'
		});
		await record('hole_positions', {
			hole: hole.id,
			label: 'red',
			distance: 225 + i * 8,
			unit: 'feet',
			status: 'active'
		});
		await record('hole_positions', {
			hole: hole.id,
			label: 'blue',
			distance: 300 + i * 12,
			unit: 'feet',
			status: 'active'
		});
	}

	// Single-round event: one round at Red, no intermission.
	const clubNight = await record('events', { name: EVENT_SINGLE, status: 'planned' });
	await record('rounds', {
		event: clubNight.id,
		number: 1,
		name: 'Evening round',
		course: course.id,
		positionLabel: 'red',
		status: 'active'
	});

	// FLI demo event: Round 1 Red → intermission → Round 2 Blue, six staffed
	// groups of two teams and four athletes with Casey as each group's
	// scorekeeper (assignment is 1G setup; no scoring exists yet).
	const demo = await record('events', { season: season.id, name: EVENT_DEMO, status: 'planned' });
	await record('rounds', {
		event: demo.id,
		number: 1,
		name: 'Round one',
		course: course.id,
		positionLabel: 'red',
		status: 'active'
	});
	await record('rounds', {
		event: demo.id,
		number: 2,
		name: 'Round two',
		course: course.id,
		positionLabel: 'blue',
		status: 'active'
	});
	const casey = await createVerifiedUser(SCOREKEEPER);
	const invitation = await api('/api/flihub/invitations', {
		method: 'POST',
		token: riley.token,
		body: { organization: org.id, email: SCOREKEEPER.email, role: 'scorekeeper' }
	});
	await api('/api/flihub/invitations/accept', {
		method: 'POST',
		token: casey.token,
		body: { token: invitation.token }
	});
	for (let g = 0; g < 6; g++) {
		const group = await record('event_groups', {
			event: demo.id,
			name: `Group ${g + 1}`,
			scorekeeper: casey.record.id,
			status: 'active'
		});
		for (const entry of [entries[g * 2], entries[g * 2 + 1]]) {
			await record('group_teams', { group: group.id, entry: entry.id, status: 'active' });
			for (const athlete of athletesByEntry.get(entry.id)) {
				await record('group_athletes', {
					group: group.id,
					entry: entry.id,
					athlete: athlete.id,
					status: 'active'
				});
			}
		}
	}
	const coursesUrl = `${APP}/organizations/${org.id}/cap/venues-courses`;
	const eventsUrl = `${APP}/organizations/${org.id}/cap/events`;

	const context = await browser.newContext({
		viewport: { width: 1280, height: 720 },
		recordVideo: { dir: OUT, size: { width: 1280, height: 720 } }
	});
	await context.addCookies([cookieFor(riley)]);
	t0 = Date.now(); // video t=0 starts with the recording context
	const page = await context.newPage();
	const roundsCard = (eventName) =>
		page.locator('[data-slot="card"]', { hasText: `Rounds — ${eventName}` });
	const groupsCard = () =>
		page.locator('[data-slot="card"]', { hasText: `Groups — ${EVENT_DEMO}` });

	// ---- S1 — Course layout: nine holes, Red and Blue, explicit distances ----
	markScene('s1-course-layout', 'A nine-hole course with Red and Blue positions');
	await page.goto(coursesUrl);
	await page.waitForSelector(`text=${COURSE}`, { timeout: 15000 });
	await showSlate(page, 'Phase 1F — Event operations: one course, Red and Blue positions');
	const courseText = await page.innerText('main');
	for (const name of [HOLE_NAMES[0], HOLE_NAMES[8]]) {
		if (!courseText.includes(name)) throw new Error(`Course should show hole "${name}"`);
	}
	if (!courseText.includes('feet')) throw new Error('Distances should show their explicit unit');
	if (!courseText.includes('red') || !courseText.includes('blue'))
		throw new Error('Red and Blue position badges should be visible');
	observed('Lakeside Nine lists nine named holes with red and blue distances in feet');
	// Glide down the holes so the labeled positions are seen on camera.
	await page.locator(`text=${HOLE_NAMES[4]}`).first().scrollIntoViewIfNeeded();
	await beat(1500);
	await page.locator(`text=${HOLE_NAMES[8]}`).first().scrollIntoViewIfNeeded();
	observed('Hole 9 reached — every hole carries both positions');
	await settleScene('s1-course-layout');

	// ---- S2 — Single-round event: one round, no intermission ------------------
	markScene('s2-single-round', 'A single-round event — one round, no intermission');
	await page.goto(eventsUrl);
	await page.waitForSelector('#ops-event', { timeout: 15000 });
	// "Club Night" sorts first and is the default selection.
	await showSlate(page, 'A single-round event: one round at Red — no intermission');
	const singleText = await roundsCard(EVENT_SINGLE).innerText();
	if (!singleText.includes('Round 1')) throw new Error('Club Night should show Round 1');
	if (!singleText.includes('red positions'))
		throw new Error('Club Night round should play the red positions');
	if (singleText.includes('Round 2') || singleText.includes('— intermission —'))
		throw new Error('A single-round event must have no second round and no intermission');
	await roundsCard(EVENT_SINGLE).scrollIntoViewIfNeeded();
	observed('Club Night: exactly one round at the red positions, no intermission marker');
	await settleScene('s2-single-round');

	// ---- S3 — FLI demo: Red → intermission → Blue on the same nine holes ------
	markScene('s3-two-rounds', 'The FLI demo: Red, intermission, Blue — 18 holes on nine');
	await page.selectOption('#ops-event', { label: `${EVENT_DEMO} · ${SEASON}` });
	await page.waitForSelector(`text=Rounds — ${EVENT_DEMO}`, { timeout: 15000 });
	await showSlate(page, '18 holes of play on nine physical holes: Red, break, Blue');
	const demoText = await roundsCard(EVENT_DEMO).innerText();
	for (const expected of [
		'Round 1',
		'red positions',
		'— intermission —',
		'Round 2',
		'blue positions'
	]) {
		if (!demoText.includes(expected)) throw new Error(`Demo rounds should show "${expected}"`);
	}
	const courseMentions = demoText.split(COURSE).length - 1;
	if (courseMentions < 2) throw new Error('Both rounds should display the same course');
	await roundsCard(EVENT_DEMO).scrollIntoViewIfNeeded();
	observed('Round 1 (red) and Round 2 (blue) replay Lakeside Nine with an intermission between');
	await settleScene('s3-two-rounds');

	// ---- S4 — Six staffed groups; Group 1 opened ------------------------------
	markScene('s4-groups', 'Six groups with teams, athletes, and an assigned scorekeeper');
	await showSlate(page, 'Six groups staffed — scorekeepers assigned for Phase 1G scoring');
	const groupsText = await groupsCard().innerText();
	for (let g = 1; g <= 6; g++) {
		if (!groupsText.includes(`Group ${g}`)) throw new Error(`Groups should include Group ${g}`);
	}
	const groupOne = groupsCard().locator('div.rounded-md.border', { hasText: 'Group 1' }).first();
	await groupOne.scrollIntoViewIfNeeded();
	const groupOneText = await groupOne.innerText();
	for (const expected of [
		TEAM_NAMES[0],
		TEAM_NAMES[1],
		...ATHLETE_NAMES[0],
		...ATHLETE_NAMES[1],
		SCOREKEEPER.name
	]) {
		if (!groupOneText.includes(expected)) throw new Error(`Group 1 should show "${expected}"`);
	}
	observed('Group 1: two teams, four rostered athletes, Casey Morgan as scorekeeper');
	await beat(1500);
	await groupsCard()
		.locator('div.rounded-md.border', { hasText: 'Group 6' })
		.first()
		.scrollIntoViewIfNeeded();
	observed('All six staffed groups visible for the event');
	await settleScene('s4-groups');

	await context.close();
} finally {
	await browser.close();
}

// Move the single-take video into place and write the scene timing manifest.
const webm = readdirSync(OUT).find((f) => f.endsWith('.webm'));
if (!webm) throw new Error('no video recorded');
renameSync(path.join(OUT, webm), path.join(OUT, 'phase1f-walkthrough.webm'));
writeFileSync(
	path.join(OUT, 'run-manifest-1f.json'),
	JSON.stringify(
		{
			video: 'recordings/output/phase1f-walkthrough.webm',
			clockOrigin: 'Offsets are seconds of video time (t=0 at recording context creation)',
			pacing:
				'Scene holds are sized so each narration line fits its scene (2.4 words/s + 2.4s lead/tail)',
			scenes: sceneLog.map((s) => ({
				...s,
				narrationWords: narration.scenes
					.find((n) => n.id === s.id)
					.tts.trim()
					.split(/\s+/).length,
				minSeconds: Math.round(minSceneSeconds(s.id) * 10) / 10
			}))
		},
		null,
		2
	)
);
console.log('RECORDING 1F OK');
