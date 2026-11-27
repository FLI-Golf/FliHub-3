import { workflowStore } from '../orchestration/store.ts';
import { verifiedReviewFiles } from './worker.ts';

export function reviewPatch(directory: string, id: string) {
	const store = workflowStore(directory);
	try {
		const state = store.get(id);
		if (
			state?.worker !== 'engineering' ||
			state.status !== 'complete' ||
			state.reason !== 'verified_acceptance' ||
			!state.checkpoint ||
			!state.events.some((event) => event.category === 'test' && event.value === 'pass') ||
			!state.events.some((event) => event.category === 'build' && event.value === 'pass')
		) {
			throw new Error('A verified engineering run is required.');
		}
		const files = verifiedReviewFiles(directory, id, state.checkpoint);
		return Object.entries(files)
			.map(([name, source]) => {
				if (!state.authorized.files.includes(name))
					throw new Error('Review contains an unauthorized file.');
				const content = source.slice(0, -1).split('\n');
				return [
					`diff --git a/${name} b/${name}`,
					'new file mode 100644',
					'--- /dev/null',
					`+++ b/${name}`,
					`@@ -0,0 +1,${content.length} @@`,
					...content.map((line) => '+' + line),
					''
				].join('\n');
			})
			.join('');
	} finally {
		store.close();
	}
}

if (import.meta.main) {
	const directory = process.env.FLIHUB_GUARDRAIL_AUDIT_DIR;
	if (!directory || process.argv.length !== 3)
		throw new Error('Specify the audit directory and one workflow ID.');
	process.stdout.write(reviewPatch(directory, process.argv[2]));
}
