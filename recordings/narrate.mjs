/**
 * ElevenLabs narration generator for walkthroughs.
 *
 * Reads ELEVENLABS_API_KEY from the git-ignored .env (never printed, never
 * sent anywhere but api.elevenlabs.io). Generates one MP3 per scene from
 * recordings/narration*.json and caches results in recordings/output/ so
 * retries never regenerate paid audio: a scene is skipped when text + voice
 * + model are unchanged.
 *
 * Voice selection: prefers a voice already configured in the account's
 * library; otherwise falls back to a clear, neutral premade English voice.
 * No voice is cloned. The chosen voice/model and measured clip durations are
 * recorded in the cache manifest. Reports actual character usage from the
 * subscription endpoint when the key permits it.
 *
 * Run: node recordings/narrate.mjs [1a|1b]   (default 1a)
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const WALKTHROUGHS = {
	'1a': { narration: 'narration.json', cacheDir: 'narration' },
	'1b': { narration: 'narration-1b.json', cacheDir: 'narration-1b' },
	'1c': { narration: 'narration-1c.json', cacheDir: 'narration-1c' },
	'1d': { narration: 'narration-1d.json', cacheDir: 'narration-1d' },
	'1e': { narration: 'narration-1e.json', cacheDir: 'narration-1e' },
	'1f': { narration: 'narration-1f.json', cacheDir: 'narration-1f' },
	'1g': { narration: 'narration-1g.json', cacheDir: 'narration-1g' },
	'1h': { narration: 'narration-1h.json', cacheDir: 'narration-1h' }
};
const selected = WALKTHROUGHS[process.argv[2] ?? '1a'];
if (!selected) {
	throw new Error(
		`Unknown walkthrough "${process.argv[2]}" — expected one of: ${Object.keys(WALKTHROUGHS).join(', ')}`
	);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const narration = JSON.parse(
	readFileSync(path.join(root, 'recordings', selected.narration), 'utf8')
);
const outDir = path.join(root, 'recordings', 'output', selected.cacheDir);
const cacheFile = path.join(outDir, 'narration-cache.json');
mkdirSync(outDir, { recursive: true });

// --- API key from git-ignored .env (never logged) ---------------------------
const envText = readFileSync(path.join(root, '.env'), 'utf8');
const apiKey = envText.match(/^ELEVENLABS_API_KEY=(.+)$/m)?.[1]?.trim();
if (!apiKey) throw new Error('ELEVENLABS_API_KEY not found in .env');

const MODEL_ID = 'eleven_multilingual_v2';
const headers = { 'xi-api-key': apiKey, 'Content-Type': 'application/json' };

async function api(pathname, options = {}) {
	const res = await fetch(`https://api.elevenlabs.io${pathname}`, { headers, ...options });
	if (!res.ok) {
		throw new Error(`ElevenLabs ${pathname} → ${res.status} ${await res.text().catch(() => '')}`);
	}
	return res;
}

/** Subscription usage — requires the user_read permission; null when the key lacks it. */
async function subscription() {
	try {
		const res = await api('/v1/user/subscription');
		const data = await res.json();
		return { used: data.character_count, limit: data.character_limit, tier: data.tier };
	} catch {
		return null;
	}
}

function measureDurationSeconds(file) {
	const probe = spawnSync('ffmpeg', ['-i', file], { encoding: 'utf8' });
	const match = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(probe.stderr ?? '');
	if (!match) throw new Error(`Cannot measure duration of ${file}`);
	return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

const textHash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

// --- Voice selection ---------------------------------------------------------
const before = await subscription();
if (before) {
	console.log(
		`Subscription: tier=${before.tier} characters used=${before.used} limit=${before.limit}`
	);
} else {
	console.log('Subscription endpoint not permitted for this key — tracking characters locally.');
}

// Premade stock voice fallback, used when the key may not list voices.
const STOCK_VOICE = { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', category: 'premade' };
let voice = STOCK_VOICE;
try {
	const voicesRes = await api('/v1/voices');
	const voices = (await voicesRes.json()).voices ?? [];
	const libraryVoice = voices.find(
		(v) => v.category !== 'premade' && v.category !== 'professional'
	);
	const premadePreferred = ['Rachel', 'Aria', 'Roger', 'Sarah'];
	const premade = voices.find((v) => v.category === 'premade' && premadePreferred.includes(v.name));
	voice = libraryVoice ?? premade ?? voices[0] ?? STOCK_VOICE;
} catch {
	console.log('Voice listing not permitted for this key — using premade stock voice Rachel.');
}
console.log(
	`Voice: ${voice.name} (${voice.voice_id}) category=${voice.category ?? 'unknown'} model=${MODEL_ID}`
);

// --- Generation with cache ----------------------------------------------------
const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
let generated = 0;
let skipped = 0;
let charactersSent = 0;

for (const scene of narration.scenes) {
	const file = path.join(outDir, `${scene.id}.mp3`);
	const hash = textHash(scene.tts);
	const hit = cache[scene.id];
	if (
		hit &&
		hit.textHash === hash &&
		hit.voiceId === voice.voice_id &&
		hit.modelId === MODEL_ID &&
		existsSync(file)
	) {
		skipped += 1;
		continue;
	}

	console.log(`Generating ${scene.id} (${scene.tts.length} chars)…`);
	const res = await api(`/v1/text-to-speech/${voice.voice_id}?output_format=mp3_44100_128`, {
		method: 'POST',
		body: JSON.stringify({
			text: scene.tts,
			model_id: MODEL_ID,
			voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.2 }
		})
	});
	writeFileSync(file, Buffer.from(await res.arrayBuffer()));
	charactersSent += scene.tts.length;
	cache[scene.id] = {
		textHash: hash,
		voiceId: voice.voice_id,
		voiceName: voice.name,
		modelId: MODEL_ID,
		file: `recordings/output/${selected.cacheDir}/${scene.id}.mp3`,
		durationSeconds: Math.round(measureDurationSeconds(file) * 100) / 100,
		generatedAt: new Date().toISOString()
	};
	writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
	generated += 1;
}

// Refresh durations for cached clips too (manifest stays accurate).
for (const scene of narration.scenes) {
	const file = path.join(outDir, `${scene.id}.mp3`);
	cache[scene.id].durationSeconds = Math.round(measureDurationSeconds(file) * 100) / 100;
}
writeFileSync(cacheFile, JSON.stringify(cache, null, 2));

const after = await subscription();
if (before && after) {
	console.log(
		`Done. generated=${generated} cached=${skipped}. ` +
			`Characters used this run (subscription delta): ${after.used - before.used} ` +
			`(total ${after.used}/${after.limit}).`
	);
} else {
	console.log(
		`Done. generated=${generated} cached=${skipped}. ` +
			`Characters sent this run: ${charactersSent} ` +
			`(subscription endpoint not permitted — this is the exact billed character count for the text submitted).`
	);
}
for (const scene of narration.scenes) {
	console.log(`  ${scene.id}: ${cache[scene.id].durationSeconds}s`);
}
