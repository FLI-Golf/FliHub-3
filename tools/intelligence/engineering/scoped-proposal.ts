import { createHash } from 'node:crypto';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const digestPattern = /^[a-f0-9]{64}$/;
const sourcePath = /^src\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.ts$/;
const maxFiles = 16;
const maxBytes = 65_536;

type Baseline = {
	context: string;
	files: readonly { path: string; sha256: string }[];
};

// The baseline is supplied by the trusted snapshot reader. This step only validates
// replacement data and never writes files or grants execution authority.
export function scopedReplacementSnapshot(baseline: Baseline, proposal: unknown, limit = maxBytes) {
	if (
		!digestPattern.test(baseline.context) ||
		baseline.files.length < 1 ||
		baseline.files.length > maxFiles ||
		!Number.isSafeInteger(limit) ||
		limit < 1 ||
		limit > maxBytes ||
		typeof proposal !== 'string' ||
		Buffer.byteLength(proposal) > limit
	)
		throw new Error('Invalid scoped proposal limits.');
	const allowed = new Map<string, string>();
	for (const file of baseline.files) {
		if (!sourcePath.test(file.path) || !digestPattern.test(file.sha256) || allowed.has(file.path))
			throw new Error('Invalid baseline scope.');
		allowed.set(file.path, file.sha256);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(proposal);
	} catch {
		throw new Error('Invalid scoped proposal JSON.');
	}
	if (
		!parsed ||
		typeof parsed !== 'object' ||
		Array.isArray(parsed) ||
		Object.keys(parsed).length !== 2
	)
		throw new Error('Invalid scoped proposal.');
	const { context, replacements } = parsed as Record<string, unknown>;
	if (
		context !== baseline.context ||
		!Array.isArray(replacements) ||
		!replacements.length ||
		replacements.length > allowed.size
	)
		throw new Error('Invalid scoped proposal context.');
	const files = replacements.map((value: unknown) => {
		if (
			!value ||
			typeof value !== 'object' ||
			Array.isArray(value) ||
			Object.keys(value).length !== 3
		)
			throw new Error('Invalid replacement.');
		const { path, before, source } = value as Record<string, unknown>;
		if (
			typeof path !== 'string' ||
			!allowed.has(path) ||
			before !== allowed.get(path) ||
			typeof source !== 'string' ||
			source.length === 0 ||
			!source.endsWith('\n') ||
			// eslint-disable-next-line no-control-regex
			/[\x00-\x08\x0B-\x1F\x7F]/u.test(source) ||
			Buffer.from(source).toString() !== source
		)
			throw new Error('Unexpected replacement bytes or path.');
		allowed.delete(path);
		const digest = sha256(source);
		if (digest === before) throw new Error('Replacement did not change the file.');
		return Object.freeze({ path, before, source, digest });
	});
	files.sort((a, b) => (a.path < b.path ? -1 : 1));
	return Object.freeze({
		context,
		digest: sha256(
			JSON.stringify([context, files.map(({ path, before, digest }) => [path, before, digest])])
		),
		files: Object.freeze(files)
	});
}
