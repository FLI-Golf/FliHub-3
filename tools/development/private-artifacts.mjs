import {
	linkSync,
	lstatSync,
	mkdtempSync,
	mkdirSync,
	realpathSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';

export function requireSafeTmp() {
	const directory = lstatSync('/tmp');
	if (
		!directory.isDirectory() ||
		realpathSync('/tmp') !== '/tmp' ||
		(directory.mode & 0o022 && !(directory.mode & 0o1000))
	) {
		throw new Error('The temporary artifact directory is unavailable or unsafe.');
	}
}

export function publishPrivateArtifact(destination, contents) {
	const scratch = mkdtempSync(join(dirname(destination), '.flihub-artifact-'));
	const staged = join(scratch, 'artifact');
	try {
		writeFileSync(staged, contents, { flag: 'wx', mode: 0o600 });
		linkSync(staged, destination);
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

export function requirePrivateDirectory(path, { create = false } = {}) {
	if (create) {
		try {
			mkdirSync(path, { mode: 0o700 });
		} catch (error) {
			if (error.code !== 'EEXIST') throw error;
		}
	}
	const info = lstatSync(path);
	if (!info.isDirectory() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o700) {
		throw new Error('Artifact storage must be an operator-owned private directory.');
	}
}
