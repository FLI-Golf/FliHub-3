import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const modules = fileURLToPath(new URL('../../../node_modules/', import.meta.url));
const dateTypes = '@internationalized/date/dist/types';
const compilerFiles = [
	'typescript.js',
	'lib.es5.d.ts',
	'lib.decorators.d.ts',
	'lib.decorators.legacy.d.ts',
	'lib.es2015.core.d.ts',
	'lib.es2017.intl.d.ts',
	'lib.es2017.string.d.ts',
	'lib.es2018.intl.d.ts',
	'lib.es2020.intl.d.ts'
];
export const pilotToolchainDigest =
	'b3113f039de1a8364098ba9d2352ce51f17b4a895c0b0721b52faa29698d4ffb';

function declarations(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		if (entry.isDirectory())
			return declarations(join(directory, entry.name)).map((file) => entry.name + '/' + file);
		return entry.isFile() && entry.name.endsWith('.d.ts') ? [entry.name] : [];
	});
}

export function stagePilotToolchain(working: string) {
	const files = [
		...compilerFiles.map((file) => 'typescript/lib/' + file),
		...declarations(join(modules, dateTypes)).map((file) => dateTypes + '/' + file)
	];
	const hash = createHash('sha256');
	let total = 0;
	for (const file of files.sort()) {
		const path = join(modules, file);
		const info = lstatSync(path);
		total += info.size;
		if (!info.isFile() || info.nlink !== 1 || total > 12_000_000)
			throw new Error('Unexpected pilot toolchain file.');
		const bytes = readFileSync(path);
		hash.update(JSON.stringify([file, createHash('sha256').update(bytes).digest('hex')]));
		const destination = join(working, 'node_modules', file.replace('/dist/types/', '/types/'));
		mkdirSync(dirname(destination), { recursive: true });
		writeFileSync(destination, bytes, { flag: 'wx' });
	}
	if (hash.digest('hex') !== pilotToolchainDigest) throw new Error('Pilot toolchain pin mismatch.');
}
