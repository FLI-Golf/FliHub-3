/**
 * Phase 1G walkthrough recording (Playwright, headless Chromium, 390×844
 * phone viewport, single continuous take): mobile scorekeeping on the same
 * fictional FLI demo as the Phase 1F walkthrough. The assigned scorekeeper
 * opens the event (rounds, group, teams, athletes), enters hole 1 of
 * Round 1 · 9 holes · Red as a draft, shows a blank score blocking
 * submission (missing never counts as zero), submits Round 1, crosses the
 * intermission into Round 2 · 9 holes · Blue (displayed hole 10 is physical
 * hole 1), then — after a "Later in the round" slate — enters the final
 * scores on hole 18 and shows Submitted. Official approval stays Phase 1H.
 *
 * Runs against a disposable instance with fictional demo data. The
 * competition structure, course, rounds, groups, and all INTERVENING hole
 * scores are seeded off-camera via the direct API; the scorekeeper session
 * uses a prepared cookie (authentication happens off-camera); credentials
 * are never typed on the recording. Every scene synchronizes on visible UI
 * outcomes and logs them into output/run-manifest-1g.json.
 *
 * Run via `npm run record:walkthrough-1g` — the runner provides the
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
		'Run via `npm run record:walkthrough-1g` (recordings/run-walkthrough.mjs sets env).'
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
// Group 1 on-camera cast (teams 0 and 1).
const CAST = ['Ava Stone', 'Sam Finch', 'Mia Calder', 'Leo Park'];

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
		path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'narration-1g.json'),
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
			'background:#111827;color:#f9fafb;padding:10px 14px;border-radius:10px;' +
			'font:600 13px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35);' +
			'max-width:92vw;text-align:center;';
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
			capabilities: [
				'athletes',
				'teams',
				'leagues-seasons',
				'events',
				'venues-courses',
				'scoring-results'
			]
		}
	});
	const record = (collection, body) =>
		api(`/api/collections/${collection}/records`, {
			method: 'POST',
			token: riley.token,
			body: { organization: org.id, ...body }
		});

	// Competition structure: 12 teams entered into the season, each with one
	// female and one male rostered athlete (pilot configuration) — the same
	// fictional FLI demo as the Phase 1F walkthrough.
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
	// explicit distances in feet.
	const course = await record('courses', { name: COURSE, status: 'active' });
	const holes = [];
	for (let i = 1; i <= 9; i++) {
		const hole = await record('course_holes', {
			course: course.id,
			number: i,
			name: HOLE_NAMES[i - 1],
			par: 3,
			status: 'active'
		});
		holes.push(hole);
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

	// FLI demo event: Round 1 Red → intermission → Round 2 Blue, six staffed
	// groups of two teams and four athletes with Casey as each group's
	// scorekeeper.
	const demo = await record('events', { season: season.id, name: EVENT_DEMO, status: 'planned' });
	const roundOne = await record('rounds', {
		event: demo.id,
		number: 1,
		name: 'Round one',
		course: course.id,
		positionLabel: 'red',
		status: 'active'
	});
	const roundTwo = await record('rounds', {
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
	let groupOne = null;
	for (let g = 0; g < 6; g++) {
		const group = await record('event_groups', {
			event: demo.id,
			name: `Group ${g + 1}`,
			scorekeeper: casey.record.id,
			status: 'active'
		});
		if (g === 0) groupOne = group;
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

	// Prefill the INTERVENING holes with fictional scores as Casey (ordinary
	// draft entry through the scoring API): Round 1 keeps hole 1 open for the
	// on-camera entry; Round 2 keeps hole 9 (displayed 18) open for the
	// on-camera finish. Lineups are complete before any scorecard exists.
	const groupOneAthletes = [
		...athletesByEntry.get(entries[0].id),
		...athletesByEntry.get(entries[1].id)
	];
	const score = (collection, body) =>
		api(`/api/collections/${collection}/records`, {
			method: 'POST',
			token: casey.token,
			body: { organization: org.id, ...body }
		});
	const cardOne = await score('scorecards', { round: roundOne.id, group: groupOne.id });
	const cardTwo = await score('scorecards', { round: roundTwo.id, group: groupOne.id });
	const fictionalStrokes = (athleteIndex, holeIndex) => ((athleteIndex + holeIndex) % 4) + 2;
	for (const [a, athlete] of groupOneAthletes.entries()) {
		for (let h = 1; h < 9; h++) {
			// Round 1: physical holes 2–9 prefilled (hole 1 stays open on camera).
			await score('scores', {
				scorecard: cardOne.id,
				athlete: athlete.id,
				hole: holes[h].id,
				strokes: fictionalStrokes(a, h)
			});
			// Round 2: physical holes 1–8 prefilled (hole 9 → displayed 18 stays
			// open on camera).
			await score('scores', {
				scorecard: cardTwo.id,
				athlete: athlete.id,
				hole: holes[h - 1].id,
				strokes: fictionalStrokes(a, h + 1)
			});
		}
	}
	const scoreUrl = `${APP}/organizations/${org.id}/events/${demo.id}/score`;

	const context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		recordVideo: { dir: OUT, size: { width: 390, height: 844 } }
	});
	await context.addCookies([cookieFor(casey)]);
	t0 = Date.now(); // video t=0 starts with the recording context
	const page = await context.newPage();

	const cell = (holeNo, athleteName) =>
		page.locator(`input[aria-label="Strokes for ${athleteName} on hole ${holeNo}"]`);
	// Score entry posts a native form (onchange): wait out the navigation,
	// reload the clean scorecard URL, and re-select Round 2 when needed.
	async function enterScore(holeNo, athleteName, strokes, { roundTwoView = false } = {}) {
		await cell(holeNo, athleteName).scrollIntoViewIfNeeded();
		await cell(holeNo, athleteName).fill(String(strokes));
		await cell(holeNo, athleteName).dispatchEvent('change');
		await page.waitForTimeout(1500);
		await page.goto(scoreUrl);
		await page.waitForSelector('[data-testid="round-picker"]', { timeout: 15000 });
		if (roundTwoView) {
			await page.click('button:has-text("Round 2")');
			await page.waitForSelector('text=Round 2 · Group', { timeout: 15000 });
		}
	}

	// ---- S1 — The phone scorecard: rounds, group, teams, athletes -------------
	markScene('s1-phone-scorecard', 'The assigned scorekeeper opens the event');
	await page.goto(scoreUrl);
	await page.waitForSelector('[data-testid="round-picker"]', { timeout: 15000 });
	await showSlate(page, 'Phase 1G — Mobile scorekeeping (assigned scorekeeper, phone view)');
	const picker = await page.locator('[data-testid="round-picker"]').innerText();
	for (const expected of [
		'Round 1 · 9 holes · red',
		'— intermission —',
		'Round 2 · 9 holes · blue'
	]) {
		if (!picker.includes(expected)) throw new Error(`Round picker should show "${expected}"`);
	}
	const mainText = await page.innerText('main');
	for (const expected of [EVENT_DEMO, 'Group 1', TEAM_NAMES[0], TEAM_NAMES[1]]) {
		if (!mainText.includes(expected)) throw new Error(`Scorecard should show "${expected}"`);
	}
	for (const name of CAST) {
		if (!mainText.includes(name.split(' ')[0]))
			throw new Error(`Scorecard should show athlete ${name}`);
	}
	observed(
		'Round 1 · 9 holes · red, intermission, Round 2 · 9 holes · blue; Group 1 shows both teams and four athletes'
	);
	await cell(1, CAST[0]).scrollIntoViewIfNeeded();
	observed('Hole 1 of Round 1 in view — ready for entry');
	await settleScene('s1-phone-scorecard');

	// ---- S2 — Hole 1 draft entry, blank blocks submission, Round 1 submits ----
	markScene('s2-draft-and-submit', 'Hole 1 drafts, missing-never-zero, Round 1 submitted');
	await showSlate(page, 'Hole 1 — every entry saves as a draft');
	await enterScore(1, CAST[0], 3);
	await enterScore(1, CAST[1], 4);
	await enterScore(1, CAST[2], 3);
	await cell(1, CAST[3]).scrollIntoViewIfNeeded();
	const missingText = await page.innerText('main');
	if (!/1 score missing/.test(missingText) || !missingText.includes('never stored as zero'))
		throw new Error('A single blank score should be reported as missing, never zero');
	const submitButton = page.locator('button:has-text("Submit scorecard")');
	await submitButton.scrollIntoViewIfNeeded();
	if (!(await submitButton.isDisabled()))
		throw new Error('Submission must be blocked while a score is missing');
	observed('One blank score: "1 score missing" is shown and Submit scorecard is disabled');
	await showSlate(page, 'One score is blank — submission is blocked (missing is never zero)');
	await enterScore(1, CAST[3], 4);
	const readyText = await page.innerText('main');
	if (/\d+ scores? missing/.test(readyText))
		throw new Error('All Round 1 cells should be filled now');
	await submitButton.scrollIntoViewIfNeeded();
	await page.click('button:has-text("Submit scorecard")');
	await page.waitForSelector('text=Submitted — locked', { timeout: 15000 });
	observed('Round 1 submitted — the scorecard is locked against silent changes');
	await settleScene('s2-draft-and-submit');

	// ---- S3 — Intermission, then Round 2: displayed 10–18 on physical 1–9 -----
	markScene('s3-second-pass', 'Round 2 · 9 holes · blue — displayed hole 10 is physical hole 1');
	await page.locator('[data-testid="round-picker"]').scrollIntoViewIfNeeded();
	await beat(1200);
	await page.click('button:has-text("Round 2")');
	await page.waitForSelector('text=Round 2 · Group', { timeout: 15000 });
	await showSlate(page, 'Second pass at Blue: displayed hole 10 is physical hole 1');
	const roundTwoText = await page.innerText('main');
	for (const expected of ['Round 2 · 9 holes · blue', HOLE_NAMES[0], HOLE_NAMES[8]]) {
		if (!roundTwoText.includes(expected)) throw new Error(`Round 2 should show "${expected}"`);
	}
	const firstRowText = await page
		.locator('tbody tr', { hasText: HOLE_NAMES[0] })
		.first()
		.innerText();
	if (!firstRowText.includes('10'))
		throw new Error('The second pass should display physical hole 1 as hole 10');
	await cell(10, CAST[0]).scrollIntoViewIfNeeded();
	observed(
		'Round 2 displays holes 10–18 while keeping the physical hole names (hole 10 = The Willow)'
	);
	await settleScene('s3-second-pass');

	// ---- S4 — Later in the round: hole 18 entry and Submitted -----------------
	markScene('s4-final-hole', 'Later in the round — final scores on hole 18, Submitted');
	await showSlate(page, 'Later in the round…');
	await cell(18, CAST[0]).scrollIntoViewIfNeeded();
	await enterScore(18, CAST[0], 4, { roundTwoView: true });
	await enterScore(18, CAST[1], 3, { roundTwoView: true });
	await enterScore(18, CAST[2], 5, { roundTwoView: true });
	await enterScore(18, CAST[3], 3, { roundTwoView: true });
	const finalText = await page.innerText('main');
	if (/\d+ scores? missing/.test(finalText))
		throw new Error('All Round 2 cells should be filled now');
	observed('Final scores entered on hole 18 — the second pass is complete');
	await page.locator('button:has-text("Submit scorecard")').scrollIntoViewIfNeeded();
	await page.click('button:has-text("Submit scorecard")');
	await page.waitForTimeout(1500);
	await page.goto(scoreUrl);
	await page.waitForSelector('[data-testid="round-picker"]', { timeout: 15000 });
	await page.click('button:has-text("Round 2")');
	await page.waitForSelector('text=Submitted — locked', { timeout: 15000 });
	const submittedText = await page.innerText('main');
	if (!submittedText.includes(`Submitted by ${SCOREKEEPER.name}`))
		throw new Error('Round 2 should record who submitted it');
	observed('Round 2 Submitted — locked, with the submitter recorded; approval arrives in Phase 1H');
	await showSlate(page, 'Submitted — official approval and results arrive in Phase 1H');
	await settleScene('s4-final-hole');

	await context.close();
} finally {
	await browser.close();
}

// Move the single-take video into place and write the scene timing manifest.
const webm = readdirSync(OUT).find((f) => f.endsWith('.webm'));
if (!webm) throw new Error('no video recorded');
renameSync(path.join(OUT, webm), path.join(OUT, 'phase1g-walkthrough.webm'));
writeFileSync(
	path.join(OUT, 'run-manifest-1g.json'),
	JSON.stringify(
		{
			video: 'recordings/output/phase1g-walkthrough.webm',
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
console.log('RECORDING 1G OK');
