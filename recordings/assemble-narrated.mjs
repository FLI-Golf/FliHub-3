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

// 1a publishes the reviewed asset to static/walkthroughs/; 1b is an
// UNPUBLISHED review preview and goes to git-ignored static/review/.
const WALKTHROUGHS = {
	'1a': {
		silent: 'phase1a-walkthrough.webm',
		manifest: 'run-manifest.json',
		narration: 'narration.json',
		cacheDir: 'narration',
		publishDir: path.join(root, 'static', 'walkthroughs'),
		mp4Name: 'phase1a-walkthrough-narrated.mp4',
		vttName: 'phase1a-walkthrough.vtt',
		timelineName: 'narrated-timeline.json'
	},
	'1b': {
		silent: 'phase1b-walkthrough.webm',
		manifest: 'run-manifest-1b.json',
		narration: 'narration-1b.json',
		cacheDir: 'narration-1b',
		publishDir: path.join(root, 'static', 'review'),
		mp4Name: 'phase1b-walkthrough-narrated-preview.mp4',
		vttName: 'phase1b-walkthrough-preview.vtt',
		timelineName: 'narrated-timeline-1b.json'
	},
	// Like 1b, 1c is an UNPUBLISHED review preview in git-ignored static/review/.
	'1c': {
		silent: 'phase1c-walkthrough.webm',
		manifest: 'run-manifest-1c.json',
		narration: 'narration-1c.json',
		cacheDir: 'narration-1c',
		publishDir: path.join(root, 'static', 'review'),
		mp4Name: 'phase1c-walkthrough-narrated-preview.mp4',
		vttName: 'phase1c-walkthrough-preview.vtt',
		timelineName: 'narrated-timeline-1c.json'
	},
	// Like 1b/1c, 1d is an UNPUBLISHED review preview in git-ignored static/review/.
	'1d': {
		silent: 'phase1d-walkthrough.webm',
		manifest: 'run-manifest-1d.json',
		narration: 'narration-1d.json',
		cacheDir: 'narration-1d',
		publishDir: path.join(root, 'static', 'review'),
		mp4Name: 'phase1d-walkthrough-narrated-preview.mp4',
		vttName: 'phase1d-walkthrough-preview.vtt',
		timelineName: 'narrated-timeline-1d.json'
	},
	// Like 1b/1c/1d, 1e is an UNPUBLISHED review preview in git-ignored static/review/.
	'1e': {
		silent: 'phase1e-walkthrough.webm',
		manifest: 'run-manifest-1e.json',
		narration: 'narration-1e.json',
		cacheDir: 'narration-1e',
		publishDir: path.join(root, 'static', 'review'),
		mp4Name: 'phase1e-walkthrough-narrated-preview.mp4',
		vttName: 'phase1e-walkthrough-preview.vtt',
		timelineName: 'narrated-timeline-1e.json'
	},
	// Like 1b/1c/1d/1e, 1f is an UNPUBLISHED review preview in git-ignored static/review/.
	'1f': {
		silent: 'phase1f-walkthrough.webm',
		manifest: 'run-manifest-1f.json',
		narration: 'narration-1f.json',
		cacheDir: 'narration-1f',
		publishDir: path.join(root, 'static', 'review'),
		mp4Name: 'phase1f-walkthrough-narrated-preview.mp4',
		vttName: 'phase1f-walkthrough-preview.vtt',
		timelineName: 'narrated-timeline-1f.json'
	},
	// Like 1b–1f, 1g is an UNPUBLISHED review preview in git-ignored static/review/.
	'1g': {
		silent: 'phase1g-walkthrough.webm',
		manifest: 'run-manifest-1g.json',
		narration: 'narration-1g.json',
		cacheDir: 'narration-1g',
		publishDir: path.join(root, 'static', 'review'),
		mp4Name: 'phase1g-walkthrough-narrated-preview.mp4',
		vttName: 'phase1g-walkthrough-preview.vtt',
		timelineName: 'narrated-timeline-1g.json'
	},
	// Phase 1H also remains a preview-only review asset until approved.
	'1h': {
		silent: 'phase1h-walkthrough.webm',
		manifest: 'run-manifest-1h.json',
		narration: 'narration-1h.json',
		cacheDir: 'narration-1h',
		publishDir: path.join(root, 'static', 'review'),
		mp4Name: 'phase1h-walkthrough-narrated-preview.mp4',
		vttName: 'phase1h-walkthrough-preview.vtt',
		timelineName: 'narrated-timeline-1h.json'
	},
	// Phase 1I is an UNPUBLISHED review preview in git-ignored static/review/.
	'1i': {
		silent: 'phase1i-walkthrough.webm',
		manifest: 'run-manifest-1i.json',
		narration: 'narration-1i.json',
		cacheDir: 'narration-1i',
		publishDir: path.join(root, 'static', 'review'),
		mp4Name: 'phase1i-walkthrough-narrated-preview.mp4',
		vttName: 'phase1i-walkthrough-preview.vtt',
		timelineName: 'narrated-timeline-1i.json'
	}
};
const W = WALKTHROUGHS[process.argv[2] ?? '1a'];
if (!W) {
	throw new Error(
		`Unknown walkthrough "${process.argv[2]}" — expected one of: ${Object.keys(WALKTHROUGHS).join(', ')}`
	);
}
const staticDir = W.publishDir;

const SILENT = path.join(outDir, W.silent);
const manifest = JSON.parse(readFileSync(path.join(outDir, W.manifest), 'utf8'));
const narration = JSON.parse(readFileSync(path.join(root, 'recordings', W.narration), 'utf8'));
const cache = JSON.parse(
	readFileSync(path.join(outDir, W.cacheDir, 'narration-cache.json'), 'utf8')
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
const segDir = path.join(outDir, `narrated-segments-${W.cacheDir}`);
mkdirSync(segDir, { recursive: true });
const segFiles = [];
for (const scene of scenes) {
	const segFile = path.join(segDir, `${scene.id}.mp4`);
	const hold = Math.max(0, scene.target - scene.span);
	// Overruns change the approved video pacing — they must be flagged, not hidden.
	if (hold > 0.05) {
		console.log(
			`  ⚠ OVERRUN ${scene.id}: narration ${scene.audioDur}s exceeds approved scene span ${scene.span.toFixed(1)}s — holding final frame ${hold.toFixed(1)}s`
		);
	}
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

const videoFull = path.join(outDir, `${W.cacheDir}-video.mp4`);
const concatList = path.join(segDir, 'concat.txt');
writeFileSync(concatList, segFiles.map((f) => `file '${f}'`).join('\n'));
ffmpeg(['-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', videoFull], 'concat video');

// --- Audio: place each clip at its scene offset --------------------------------
const audioInputs = scenes.flatMap((scene) => ['-i', path.join(root, cache[scene.id].file)]);
const delays = scenes
	.map((scene, i) => `[${i}:a]adelay=${Math.round(scene.audioStart * 1000)}:all=1[a${i}]`)
	.join(';');
const mix = `${delays};${scenes.map((_, i) => `[a${i}]`).join('')}amix=inputs=${scenes.length}:normalize=0[aout]`;
const audioFull = path.join(outDir, `${W.cacheDir}-mix.m4a`);
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
const finalMp4 = path.join(outDir, W.mp4Name);
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
writeFileSync(path.join(outDir, W.vttName), vtt);

// --- Publish to the walkthrough's target directory -------------------------------
mkdirSync(staticDir, { recursive: true });
copyFileSync(finalMp4, path.join(staticDir, W.mp4Name));
copyFileSync(path.join(outDir, W.vttName), path.join(staticDir, W.vttName));

const timeline = {
	silentSource: `recordings/output/${W.silent}`,
	output: path.relative(root, path.join(staticDir, W.mp4Name)),
	captions: path.relative(root, path.join(staticDir, W.vttName)),
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
writeFileSync(path.join(outDir, W.timelineName), JSON.stringify(timeline, null, 2));

const sizeMb = (statSync(finalMp4).size / (1024 * 1024)).toFixed(1);
console.log(`Narrated walkthrough: ${totalDuration}s, ${sizeMb} MB`);
console.log(`  video: ${path.relative(root, path.join(staticDir, W.mp4Name))}`);
console.log(`  captions: ${path.relative(root, path.join(staticDir, W.vttName))}`);
console.log(`  timeline: recordings/output/${W.timelineName}`);
for (const s of scenes) {
	console.log(
		`  ${s.id}: scene ${s.target.toFixed(1)}s (was ${s.span.toFixed(1)}s), narration ${s.audioDur}s @ ${s.audioStart}s`
	);
}
