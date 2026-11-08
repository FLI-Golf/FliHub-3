/** Fixed-window Phase 2A–2B narration. Never alters the approved footage timing.
 * Run: node recordings/narrate-2ab.mjs [setup|live]
 * Uses the existing git-ignored .env secret and established Rachel voice.
 * Cache is keyed by text, voice, model and settings; overlong lines fail before assembly.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const kind = process.argv[2];
if (!['setup', 'live'].includes(kind)) throw new Error('Expected setup or live');
const spec = JSON.parse(readFileSync(`recordings/narration-2ab-${kind}.json`, 'utf8'));
const dir = `recordings/output/phase2ab/narration-${kind}`;
mkdirSync(dir, { recursive: true });
const settings = { stability: 0.55, similarity_boost: 0.75, style: 0.2 };
const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const key =
	process.env.ELEVENLABS_API_KEY ||
	env
		.match(/^ELEVENLABS_API_KEY=(.+)$/m)?.[1]
		?.trim()
		.replace(/^(['"])(.*)\1$/, '$2');
if (!key)
	throw new Error('Configure ELEVENLABS_API_KEY in existing git-ignored .env or environment.');
function run(args) {
	const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' });
	if (r.status !== 0) throw new Error(r.stderr.slice(-1500));
}
function duration(file) {
	const r = spawnSync(
		'ffprobe',
		['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
		{ encoding: 'utf8' }
	);
	if (r.status !== 0) throw new Error('Cannot measure audio duration');
	return Number(r.stdout.trim());
}
let overrun = false;
for (const scene of spec.scenes) {
	const hash = createHash('sha256')
		.update(JSON.stringify([scene.tts, spec.voiceId, spec.modelId, settings]))
		.digest('hex')
		.slice(0, 16);
	scene.file = `${dir}/${scene.id}-${hash}.mp3`;
	if (!existsSync(scene.file)) {
		let res;
		try {
			res = await fetch(
				`https://api.elevenlabs.io/v1/text-to-speech/${spec.voiceId}?output_format=mp3_44100_128`,
				{
					method: 'POST',
					headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
					body: JSON.stringify({
						text: scene.tts,
						model_id: spec.modelId,
						voice_settings: settings
					})
				}
			);
		} catch {
			throw new Error('ElevenLabs network request failed (request details suppressed).');
		}
		if (!res.ok)
			throw new Error(
				`ElevenLabs TTS HTTP ${res.status}; check secret permissions, Rachel voice access, and credits.`
			);
		writeFileSync(scene.file, Buffer.from(await res.arrayBuffer()));
	}
	scene.duration = duration(scene.file);
	console.log(
		`${scene.id}: ${scene.duration.toFixed(2)}s / ${(scene.end - scene.start).toFixed(2)}s`
	);
	if (scene.duration > scene.end - scene.start) overrun = true;
}
writeFileSync(`${dir}/timeline.json`, JSON.stringify(spec, null, 2));
if (overrun)
	throw new Error(
		'Shorten overlong lines in the narration specification and rerun; unchanged clips are cached.'
	);
const source = `static/walkthroughs/phase2ab-${kind}-walkthrough.webm`;
const total = duration(source);
const inputs = spec.scenes.flatMap((s) => ['-i', s.file]);
const filters =
	spec.scenes.map((s, i) => `[${i}:a]adelay=${Math.round(s.start * 1000)}:all=1[a${i}]`).join(';') +
	';' +
	spec.scenes.map((_, i) => `[a${i}]`).join('') +
	`amix=inputs=${spec.scenes.length}:normalize=0,apad,atrim=duration=${total}[out]`;
run([
	...inputs,
	'-filter_complex',
	filters,
	'-map',
	'[out]',
	'-c:a',
	'pcm_s16le',
	`${dir}/mix.wav`
]);
run([
	'-i',
	source,
	'-i',
	`${dir}/mix.wav`,
	'-map',
	'0:v:0',
	'-map',
	'1:a:0',
	'-c:v',
	'libx264',
	'-preset',
	'fast',
	'-crf',
	'20',
	'-pix_fmt',
	'yuv420p',
	'-c:a',
	'aac',
	'-b:a',
	'160k',
	'-t',
	String(total),
	'-movflags',
	'+faststart',
	`static/walkthroughs/phase2ab-${kind}-walkthrough-narrated.mp4`
]);
const stamp = (t) =>
	`${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${(t % 60).toFixed(3).padStart(6, '0')}`;
writeFileSync(
	`static/walkthroughs/phase2ab-${kind}-walkthrough.vtt`,
	'WEBVTT\n\n' +
		spec.scenes
			.map((s) => `${s.id}\n${stamp(s.start)} --> ${stamp(s.start + s.duration)}\n${s.caption}\n`)
			.join('\n')
);
console.log(`Assembled ${kind}: ${total}s; original footage and on-screen captions retained.`);
