/** Playback of the reviewed Phase 2A–2B walkthrough assets (disposable preview). */
import { chromium } from 'playwright';
const APP = process.env.FLIHUB_E2E_APP_URL;
if (!APP) throw new Error('Run node tests/e2e/run-e2e.mjs walkthrough2ab');
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
try {
	const page = await browser.newPage();
	for (const [kind, title] of [
		['setup', 'League Setup & Draft Prep'],
		['live', 'Live Draft & Roster Rules']
	]) {
		await page.goto(APP);
		const button = page.getByRole('link', { name: `Watch ${title}`, exact: true });
		await button.waitFor();
		if ((await button.getAttribute('href')) !== `/walkthroughs/phase2ab-${kind}`)
			throw new Error('Incorrect walkthrough button destination');
		await button.click();
		await page.waitForURL(`${APP}/walkthroughs/phase2ab-${kind}`);
		const response = await page.request.get(page.url());
		if (!response.ok()) throw new Error(`${kind} playback page failed`);
		await page.getByRole('heading', { name: title, exact: true }).waitFor();
		const video = page.locator('video');
		await video.waitFor();
		if (!(await video.getAttribute('src')).endsWith(`phase2ab-${kind}-walkthrough-narrated.mp4`))
			throw new Error('Watch button did not open narrated MP4');
		await page.getByText('Narrated walkthrough', { exact: true }).waitFor();
		const playback = await video.evaluate(async (el) => {
			await new Promise((resolve, reject) => {
				if (el.readyState >= 1) return resolve();
				el.addEventListener('loadedmetadata', resolve, { once: true });
				el.addEventListener('error', () => reject(new Error('video metadata failed')), {
					once: true
				});
			});
			if (el.muted || el.volume === 0) throw new Error('video is muted');
			const context = new AudioContext();
			await context.resume();
			const source = context.createMediaElementSource(el);
			const analyser = context.createAnalyser();
			source.connect(analyser);
			analyser.connect(context.destination);
			const signal = new Float32Array(analyser.fftSize);
			async function audible() {
				let peak = 0;
				for (let i = 0; i < 20; i++) {
					analyser.getFloatTimeDomainData(signal);
					peak = Math.max(peak, ...signal.map(Math.abs));
					await new Promise((resolve) => setTimeout(resolve, 50));
				}
				if (peak < 0.005) throw new Error(`No audible decoded narration: ${peak}`);
				return peak;
			}
			async function seek(time) {
				await new Promise((resolve, reject) => {
					const timeout = setTimeout(() => reject(new Error('seek timed out')), 10000);
					el.addEventListener(
						'seeked',
						() => {
							clearTimeout(timeout);
							resolve();
						},
						{ once: true }
					);
					el.currentTime = time;
				});
			}
			await el.play();
			await new Promise((resolve) => setTimeout(resolve, 800));
			if (el.currentTime <= 0) throw new Error('video did not advance');
			await seek(2);
			const audioPeaks = [await audible()];
			for (const fraction of [0.5, 0.95, 0.1]) {
				await new Promise((resolve, reject) => {
					el.addEventListener('seeked', resolve, { once: true });
					el.addEventListener('error', () => reject(new Error('video seek failed')), {
						once: true
					});
					el.currentTime = el.duration * fraction;
				});
			}
			await seek(el.duration > 60 ? 52 : 32);
			audioPeaks.push(await audible());
			await seek(el.duration > 60 ? 72 : 48);
			audioPeaks.push(await audible());
			const captions = el.textTracks[0];
			if (!captions || captions.language !== 'en') throw new Error('English captions missing');
			captions.mode = 'hidden';
			await new Promise((resolve) => setTimeout(resolve, 300));
			if (!captions.cues?.length) throw new Error('English captions did not load');
			el.pause();
			await context.close();
			return {
				duration: el.duration,
				audioPeaks,
				captionCues: captions.cues.length,
				width: el.videoWidth,
				height: el.videoHeight,
				error: el.error?.message
			};
		});
		if (playback.duration < 30 || playback.width !== 1280 || playback.error)
			throw new Error(JSON.stringify(playback));
		const download = await page.getByRole('link', { name: /Download video/ }).getAttribute('href');
		const asset = await page.request.get(`${APP}${download}`, {
			headers: { Range: 'bytes=0-1023' }
		});
		if (asset.status() !== 206 || !(asset.headers()['content-type'] ?? '').includes('video'))
			throw new Error('video asset unavailable');
		console.log(
			`PASS ${title}: HTTP ${asset.status()}, playback advances, middle/end seek, ${JSON.stringify(playback)}`
		);
	}
} finally {
	await browser.close();
}
