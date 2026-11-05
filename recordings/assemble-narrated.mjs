/**
 * Assembles the narrated Phase 1A walkthrough from the approved silent
 * footage and cached ElevenLabs scene clips.
 *
 * For each scene, the video segment keeps its recorded length unless the
 * narration needs longer — then the scene's final frame is held (tpad clone)
 * so speech stays at a natural pace and is never time-stretched. Narration
 * starts 1.2s into each scene (as the slate fades). Output:
 *
 *   static/walkthroughs/phase1a-walkthrough-narrated.mp4  (H.264 + AAC)
 *   static/walkthroughs/phase1a-walkthrough.vtt           (synchronized captions)
 *   recordings/output/narrated-timeline.json              (actual timeline)
 *
 * The silent original static/walkthroughs/phase1a-walkthrough.webm is kept.
 *
 * Run: node recordings/assemble-narrated.mjs   (after recordings/narrate.mjs)
 */
import { spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
	copyFileSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'recordings', 'output');
const staticDir = path.join(root, 'static', 'walkthroughs');

const SILENT = path.join(outDir, 'phase1a-walkthrough.webm');
const manifest = JSON.parse(readFileSync(path.join(outDir, 'run-manifest.json'), 'utf8'));
const narration = JSON.parse(readFileSync(path.join(root, 'recordings', 'narration.json'), 'utf8'));
const cache = JSON.parse(
	readFileSync(path.join(outDir, 'narration', 'narration-cache.json'), 'utf8')
);

const LEAD_IN = 1.2; // slate settles before narration starts
const TAIL = 1.2; // hold after narration ends before the scene changes

function ffmpeg(args, label) {
	const res = spawnSync('ffmpeg', ['-hide_banner', '-y', ...args], { encoding: 'utf8' });
	if (res.status !== 0) {
		throw new Error(`ffmpeg failed (${label}):\n${res.stderr?.slice(-1200)}`);
	}
	return res;
}

function videoDurationSeconds(file) {
	const probe = spawnSync('ffmpeg', ['-i', file], { encoding: 'utf8' });
	const match = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(probe.stderr ?? '');
	if (!match) throw new Error(`Cannot read duration of ${file}`);
	return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

// --- Timeline -----------------------------------------------------------------
const offsets = manifest.scenes.map((s) => s.offsetSeconds);
const totalSilent = videoDurationSeconds(SILENT);

const scenes = manifest.scenes.map((scene, i) => {
	const start = offsets[i];
	const end = i + 1 < offsets.length ? offsets[i + 1] : totalSilent;
	const span = end - start;
	const clip = cache[scene.id];
	if (!clip || !existsSync(path.join(root, clip.file))) {
		throw new Error(`Missing narration clip for ${scene.id} — run recordings/narrate.mjs first`);
	}
	const audioDur = clip.durationSeconds;
	const target = Math.max(span, LEAD_IN + audioDur + TAIL);
	return { id: scene.id, srcStart: start, srcEnd: end, span, audioDur, target };
});

let cursor = 0;
for (const scene of scenes) {
	scene.outStart = Math.round(cursor * 100) / 100;
	scene.audioStart = Math.round((cursor + LEAD_IN) * 100) / 100;
	cursor += scene.target;
}
const totalDuration = Math.round(cursor * 100) / 100;

// --- Video: per-scene segments with frame holds --------------------------------
const segDir = path.join(outDir, 'narrated-segments');
mkdirSync(segDir, { recursive: true });
const segFiles = [];
for (const scene of scenes) {
	const segFile = path.join(segDir, `${scene.id}.mp4`);
	const hold = Math.max(0, scene.target - scene.span);
	const vf =
		hold > 0.05
			? `tpad=stop_mode=clone:stop=${hold.toFixed(2)},fps=30,format=yuv420p`
			: 'fps=30,format=yuv420p';
	ffmpeg(
		[
			'-ss',
			scene.srcStart.toFixed(2),
			'-to',
			scene.srcEnd.toFixed(2),
			'-i',
			SILENT,
			'-vf',
			vf,
			'-an',
			'-c:v',
			'libx264',
			'-preset',
			'veryfast',
			'-crf',
			'20',
			'-r',
			'30',
			segFile
		],
		`video ${scene.id}`
	);
	segFiles.push(segFile);
}

const videoFull = path.join(outDir, 'phase1a-narrated-video.mp4');
const concatList = path.join(segDir, 'concat.txt');
writeFileSync(concatList, segFiles.map((f) => `file '${f}'`).join('\n'));
ffmpeg(['-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', videoFull], 'concat video');

// --- Audio: place each clip at its scene offset --------------------------------
const audioInputs = scenes.flatMap((scene) => ['-i', path.join(root, cache[scene.id].file)]);
const delays = scenes
	.map((scene, i) => `[${i}:a]adelay=${Math.round(scene.audioStart * 1000)}:all=1[a${i}]`)
	.join(';');
const mix = `${delays};${scenes.map((_, i) => `[a${i}]`).join('')}amix=inputs=${scenes.length}:normalize=0[aout]`;
const audioFull = path.join(outDir, 'phase1a-narration.m4a');
ffmpeg(
	[
		...audioInputs,
		'-filter_complex',
		mix,
		'-map',
		'[aout]',
		'-c:a',
		'aac',
		'-b:a',
		'128k',
		audioFull
	],
	'audio mix'
);

// --- Mux ------------------------------------------------------------------------
const finalMp4 = path.join(outDir, 'phase1a-walkthrough-narrated.mp4');
ffmpeg(
	[
		'-i',
		videoFull,
		'-i',
		audioFull,
		'-map',
		'0:v',
		'-map',
		'1:a',
		'-c:v',
		'copy',
		'-c:a',
		'copy',
		'-movflags',
		'+faststart',
		finalMp4
	],
	'mux'
);

// --- Captions (WebVTT, synchronized to the output timeline) ----------------------
function vttTime(seconds) {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
}
const cues = scenes.map((scene) => {
	const caption = narration.scenes.find((n) => n.id === scene.id)?.caption ?? '';
	const start = vttTime(scene.audioStart);
	const end = vttTime(scene.audioStart + scene.audioDur);
	return `${scene.id}\n${start} --> ${end}\n${caption}\n`;
});
const vtt = `WEBVTT\n\n${cues.join('\n')}`;
writeFileSync(path.join(outDir, 'phase1a-walkthrough.vtt'), vtt);

// --- Publish reviewed assets next to the silent original -------------------------
mkdirSync(staticDir, { recursive: true });
copyFileSync(finalMp4, path.join(staticDir, 'phase1a-walkthrough-narrated.mp4'));
copyFileSync(
	path.join(outDir, 'phase1a-walkthrough.vtt'),
	path.join(staticDir, 'phase1a-walkthrough.vtt')
);

const timeline = {
	silentSource:
		'recordings/output/phase1a-walkthrough.webm (preserved; also static/walkthroughs/phase1a-walkthrough.webm)',
	output: 'static/walkthroughs/phase1a-walkthrough-narrated.mp4',
	captions: 'static/walkthroughs/phase1a-walkthrough.vtt',
	durationSeconds: totalDuration,
	voice: cache[scenes[0].id].voiceName,
	voiceId: cache[scenes[0].id].voiceId,
	modelId: cache[scenes[0].id].modelId,
	scenes: scenes.map((s) => ({
		id: s.id,
		videoSpan: [s.srcStart, s.srcEnd],
		outputStart: s.outStart,
		audioStart: s.audioStart,
		audioDuration: s.audioDur,
		sceneDuration: Math.round(s.target * 100) / 100
	}))
};
writeFileSync(path.join(outDir, 'narrated-timeline.json'), JSON.stringify(timeline, null, 2));

const sizeMb = (statSync(finalMp4).size / (1024 * 1024)).toFixed(1);
console.log(`Narrated walkthrough: ${totalDuration}s, ${sizeMb} MB`);
console.log(`  video: static/walkthroughs/phase1a-walkthrough-narrated.mp4`);
console.log(`  captions: static/walkthroughs/phase1a-walkthrough.vtt`);
console.log(`  timeline: recordings/output/narrated-timeline.json`);
for (const s of scenes) {
	console.log(
		`  ${s.id}: scene ${s.target.toFixed(1)}s (was ${s.span.toFixed(1)}s), narration ${s.audioDur}s @ ${s.audioStart}s`
	);
}
