/**
 * Phase 1I walkthrough recording (Playwright, headless Chromium, 1280×850):
 * the hosted public page and competition standings on the disposable preview
 * stack. The ENTIRE take is the signed-out visitor's view of /o/<slug> — the
 * fixture mirrors the verified Phase 1I browser scenario (tests/e2e/
 * phase1i.spec.mjs Step 7): Solo A plays 1 of 2 events (12 strokes,
 * Unranked), Solo B plays both (24 strokes, rank 1); the missing second
 * result arrives through the D16 correction window and, once published,
 * both teams share first place at 24. Owner-side actions run off-camera via
 * the API so the recording shows exactly what the public sees.
 *
 * Every scene is asserted in-browser before the take advances.
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
		'Run via `npm run record:walkthrough-1i` (recordings/run-walkthrough.mjs sets env).'
	);
}

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const PASS = 'e2e-password-123';
const ts = Date.now();
const OWNER = { name: 'I Owner', email: `record-i-owner-${ts}@example.com` };
const SLUG = 'riverbend-disc-golf';

const sceneLog = [];
let t0 = 0;
const narration = JSON.parse(
	readFileSync(
		path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'narration-1i.json'),
		'utf8'
	)
);
const WORDS_PER_SECOND = 2.4;
const LEAD_TAIL_SECONDS = 2.4;
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

function beat(ms = 1200) {
	return new Promise((resolve) => setTimeout(resolve, ms));
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

function expect(cond, label) {
	if (!cond) throw new Error(`Playwright assertion failed: ${label}`);
	console.log(`  ✓ ${label}`);
}

const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
try {
	console.log('Preparing fictional demo data off-camera…');
	const owner = await registerVerified(OWNER);
	const org = await api('/api/flihub/organizations', {
		token: owner.token,
		body: {
			name: 'Riverbend Disc Golf Club',
			template: 'custom',
			capabilities: [
				'athletes',
				'teams',
				'leagues-seasons',
				'events',
				'venues-courses',
				'scoring-results',
				'standings'
			]
		}
	});
	const record = (collection, body) =>
		api(`/api/collections/${collection}/records`, {
			token: owner.token,
			body: { organization: org.id, ...body }
		});
	const patch = (collection, id, body) =>
		api(`/api/collections/${collection}/records/${id}`, {
			method: 'PATCH',
			token: owner.token,
			body
		});

	const league = await record('leagues', { name: 'Riverbend League', status: 'active' });
	const season = await record('seasons', {
		league: league.id,
		name: 'Autumn 2026',
		status: 'active'
	});
	const course = await record('courses', { name: 'Riverbend Short Nine', status: 'active' });
	const holes = [];
	for (let i = 1; i <= 2; i++) {
		const hole = await record('course_holes', {
			course: course.id,
			number: i,
			name: `Hole ${i}`,
			par: 3,
			status: 'active'
		});
		await record('hole_positions', {
			hole: hole.id,
			label: 'red',
			distance: 240 + i * 10,
			unit: 'feet',
			status: 'active'
		});
		holes.push(hole);
	}
	const mkSolo = async (teamName, first, last, gender) => {
		const team = await record('teams', { name: teamName, status: 'active' });
		const entry = await record('season_entries', {
			season: season.id,
			team: team.id,
			status: 'active'
		});
		const athlete = await record('athletes', {
			firstName: first,
			lastName: last,
			gender,
			status: 'active'
		});
		await record('roster_memberships', { entry: entry.id, athlete: athlete.id, status: 'active' });
		// Published display profiles so the public athletes section has content.
		await patch('athletes', athlete.id, { publicPublished: true });
		await patch('teams', team.id, { publicPublished: true });
		return { team, entry, athlete };
	};
	const soloA = await mkSolo('Solo A', 'Alice', 'Marsh', 'female');
	const soloB = await mkSolo('Solo B', 'Bree', 'Calder', 'female');

	const addGroupWithCards = async (eventId, eventRounds, t, groupName) => {
		const group = await record('event_groups', {
			event: eventId,
			name: groupName,
			status: 'active'
		});
		await record('group_teams', { group: group.id, entry: t.entry.id, status: 'active' });
		await record('group_athletes', {
			group: group.id,
			entry: t.entry.id,
			athlete: t.athlete.id,
			status: 'active'
		});
		for (const round of eventRounds) {
			const card = await record('scorecards', { round: round.id, group: group.id });
			for (const hole of holes) {
				await record('scores', {
					scorecard: card.id,
					athlete: t.athlete.id,
					hole: hole.id,
					strokes: 3
				});
			}
			await patch('scorecards', card.id, { status: 'submitted' });
		}
	};
	const mkEvent = async (name, teams, startsAt) => {
		const event = await record('events', {
			season: season.id,
			name,
			status: 'completed',
			startsAt
		});
		const rounds = [];
		for (let number = 1; number <= 2; number++) {
			rounds.push(
				await record('rounds', {
					event: event.id,
					number,
					course: course.id,
					positionLabel: 'red',
					status: 'active'
				})
			);
		}
		for (const t of teams) {
			await addGroupWithCards(event.id, rounds, t, `${name} — ${t.team.name}`);
		}
		const result = await record('event_results', { event: event.id });
		await patch('event_results', result.id, { status: 'published' });
		await patch('events', event.id, { publicPublished: true });
		return { event, rounds, result };
	};
	await mkEvent('Autumn Open', [soloA, soloB], '2026-11-01 10:00:00');
	const harvest = await mkEvent('Harvest Classic', [soloB], '2026-11-08 10:00:00');

	await api(`/api/flihub/organizations/${org.id}/public-page`, {
		token: owner.token,
		body: {
			slug: SLUG,
			tagline: 'Fairways, chains, and honest standings.',
			themePrimary: '#1d4ed8',
			published: true
		}
	});
	console.log('Fixture ready: Solo A 1 of 2 events, Solo B 2 of 2 — page published.');

	// The whole recording is the SIGNED-OUT visitor context.
	const ctx = await browser.newContext({
		viewport: { width: 1280, height: 850 },
		recordVideo: { dir: OUT, size: { width: 1280, height: 850 } }
	});
	t0 = Date.now();
	const page = await ctx.newPage();
	page.setDefaultTimeout(15000);

	const publicUrl = `${APP}/o/${SLUG}`;
	const teamRow = (name) =>
		page.locator('[data-testid="public-standings-teams"] tbody tr', { hasText: name });
	const rowText = async (name) => (await teamRow(name).innerText()).replace(/\s+/g, ' ');

	markScene('s1-public-page', 'A signed-out visitor opens the hosted public page');
	await page.goto(publicUrl);
	await page.waitForSelector('[data-testid="public-page"]');
	const header = (await page.locator('header').allInnerTexts()).join('\n');
	expect(header.includes('Sign in'), 'the visitor context is signed out');
	expect(
		(await page.locator('[data-testid="public-org-name"]').innerText()).includes(
			'Riverbend Disc Golf Club'
		),
		'organization branding (name) renders'
	);
	expect(
		(await page.locator('[data-testid="public-org-tagline"]').innerText()).includes(
			'Fairways, chains, and honest standings.'
		),
		'tagline renders'
	);
	const schedule = await page.locator('[data-testid="public-schedule"]').innerText();
	expect(
		schedule.includes('Autumn Open') && schedule.includes('Harvest Classic'),
		'published schedule lists both events'
	);
	await beat(2500);
	await page
		.locator('[data-testid="public-results"]')
		.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
	await beat(2000);
	const results = await page.locator('[data-testid="public-results"]').innerText();
	expect(
		results.includes('Autumn Open') &&
			results.includes('Harvest Classic') &&
			results.includes('Official published result'),
		'published official results render for both events'
	);
	await page
		.locator('[data-testid="public-standings"]')
		.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
	await beat(1500);
	expect(
		(await page.locator('[data-testid="public-standings"]').innerText()).includes('Autumn 2026'),
		'season standings render'
	);
	observed('Branding, published schedule, results, and standings visible signed out');
	await settleScene('s1-public-page');

	markScene('s2-unranked', 'Solo A Unranked at 1 of 2 events; Solo B rank 1 at 2 of 2');
	await page
		.locator('[data-testid="public-standings-teams"]')
		.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
	await beat(1500);
	let rowA = await rowText('Solo A');
	let rowB = await rowText('Solo B');
	expect(rowA.includes('Unranked'), 'Solo A shows Unranked');
	expect(rowA.includes('1 of 2'), 'Solo A shows 1 of 2 events');
	expect(rowA.includes('12'), 'Solo A shows its 12 strokes (missing results add none)');
	expect(rowB.startsWith('1 '), 'Solo B shows rank 1');
	expect(rowB.includes('2 of 2'), 'Solo B shows 2 of 2 events');
	expect(rowB.includes('24'), 'Solo B shows 24 strokes');
	await teamRow('Solo A').hover();
	observed('Solo A: Unranked, 1 of 2 events, 12 strokes; Solo B: rank 1, 2 of 2, 24 strokes');
	await settleScene('s2-unranked');

	markScene(
		's3-pending-correction',
		'Standings hold steady while the correction awaits publication'
	);
	// Off-camera: the owner reopens Harvest Classic with a recorded reason,
	// adds Solo A's omitted group with submitted scorecards, and reapproves.
	// The corrected v2 is approved but NOT yet published.
	await patch('event_results', harvest.result.id, {
		status: 'correcting',
		reason: 'Solo A group was omitted from the official result'
	});
	await addGroupWithCards(harvest.event.id, harvest.rounds, soloA, 'Harvest Classic — Solo A');
	await patch('event_results', harvest.result.id, { status: 'approved' });
	await page.reload();
	await page.waitForSelector('[data-testid="public-standings-teams"]');
	await page
		.locator('[data-testid="public-standings-teams"]')
		.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
	await beat(1200);
	rowA = await rowText('Solo A');
	expect(
		rowA.includes('Unranked') && rowA.includes('1 of 2') && rowA.includes('12'),
		'public standings hold steady while the corrected v2 awaits publication'
	);
	expect(
		!(await page.locator('[data-testid="public-results"]').innerText()).includes('Corrected'),
		'no correction indicator while the corrected version is unpublished'
	);
	observed('Pending corrected result is invisible: Solo A still Unranked at 12');
	await settleScene('s3-pending-correction');

	markScene('s4-shared-first', 'The corrected result publishes — both teams share first place');
	// Off-camera: the owner publishes the corrected version.
	await patch('event_results', harvest.result.id, { status: 'published' });
	await page.reload();
	await page.waitForSelector('[data-testid="public-standings-teams"]');
	await page
		.locator('[data-testid="public-standings-teams"]')
		.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
	await beat(1500);
	rowA = await rowText('Solo A');
	rowB = await rowText('Solo B');
	expect(!rowA.includes('Unranked'), 'Solo A is no longer Unranked');
	expect(rowA.startsWith('1 '), 'Solo A shares first place');
	expect(rowB.startsWith('1 '), 'Solo B keeps the shared first place');
	expect(rowA.includes('2 of 2') && rowA.includes('24'), 'Solo A: 24 strokes across 2 of 2 events');
	expect(rowB.includes('2 of 2') && rowB.includes('24'), 'Solo B: 24 strokes across 2 of 2 events');
	await beat(1500);
	await page
		.locator('[data-testid="public-results"]')
		.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
	await beat(1200);
	expect(
		(await page.locator('[data-testid="corrected-badge"]').first().innerText()).includes(
			'Corrected'
		),
		'the republished result carries the dated Corrected badge'
	);
	observed('Both teams at 24 across 2 of 2 events share first place; Corrected badge visible');
	await settleScene('s4-shared-first');

	await ctx.close();

	writeFileSync(
		path.join(OUT, 'run-manifest-1i.json'),
		JSON.stringify(
			{
				video: 'recordings/output/phase1i-walkthrough.webm',
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
	console.log('Recorded 1I walkthrough manifest to recordings/output/run-manifest-1i.json');
} finally {
	await browser.close();
}

const webm = readdirSync(OUT).find((f) => f.endsWith('.webm'));
if (!webm) throw new Error('no video recorded');
renameSync(path.join(OUT, webm), path.join(OUT, 'phase1i-walkthrough.webm'));
console.log('RECORDING 1I OK');
