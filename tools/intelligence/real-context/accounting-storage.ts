import { randomUUID } from 'node:crypto';
import {
	closeSync,
	constants,
	fstatSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	realpathSync,
	writeFileSync
} from 'node:fs';
import { dirname, isAbsolute, join, normalize } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { requireFact } from './contract.ts';

const databaseBytes = 1024 * 1024;
const pageSize = 4096;
export const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function optionalStat(path: string) {
	try {
		return lstatSync(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		return undefined;
	}
}

export function openAccountingStorage(directory: string, initialize: boolean) {
	const uid = process.getuid?.();
	requireFact(uid !== undefined && isAbsolute(directory) && normalize(directory) === directory);
	const parent = dirname(directory);
	requireFact(parent !== directory && realpathSync(parent) === parent);
	// Trust private ancestors or system-owned sticky scratch directories.
	for (let path = parent; ; path = dirname(path)) {
		const entry = lstatSync(path);
		const system = entry.uid === 0 || (entry.uid === 65534 && lstatSync('/').uid === 65534);
		requireFact(entry.isDirectory() && (entry.uid === uid || system));
		requireFact((entry.mode & 0o022) === 0 || (system && (entry.mode & 0o1000) !== 0));
		if (path === '/') break;
	}
	if (initialize) {
		try {
			mkdirSync(directory, { mode: 0o700 });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
		}
	}
	const root = lstatSync(directory);
	requireFact(
		realpathSync(directory) === directory &&
			root.isDirectory() &&
			root.uid === uid &&
			(root.mode & 0o7777) === 0o700
	);
	const file = join(directory, 'reservations.sqlite');
	const identityFile = join(directory, 'identity');
	const same = (a: { ino: number; dev: number }, b: { ino: number; dev: number }) =>
		a.ino === b.ino && a.dev === b.dev;

	function privateFile(path: string, maxSize: number) {
		const info = lstatSync(path);
		requireFact(
			info.isFile() &&
				info.uid === uid &&
				info.nlink === 1 &&
				(info.mode & 0o7777) === 0o600 &&
				info.size <= maxSize
		);
		return info;
	}

	function verifyJournal() {
		requireFact(!optionalStat(file + '-wal') && !optionalStat(file + '-shm'));
		const journal = optionalStat(file + '-journal');
		if (journal) {
			requireFact(
				journal.isFile() &&
					journal.uid === uid &&
					journal.nlink === 1 &&
					(journal.mode & 0o7777) === 0o600 &&
					journal.size <= databaseBytes + 64 * 1024
			);
		}
	}

	let fresh = false;
	if (!optionalStat(identityFile)) {
		requireFact(initialize);
		requireFact(!optionalStat(file) && !optionalStat(file + '-journal'));
		verifyJournal();
		// Persistent marker is created first. An interrupted initialization stays closed.
		const fd = openSync(
			identityFile,
			constants.O_EXCL | constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW,
			0o600
		);
		try {
			writeFileSync(fd, randomUUID());
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		const dir = openSync(
			directory,
			constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
		);
		try {
			fsyncSync(dir);
		} finally {
			closeSync(dir);
		}
		const dbFile = openSync(
			file,
			constants.O_EXCL | constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,
			0o600
		);
		closeSync(dbFile);
		fresh = true;
	}
	const marker = privateFile(identityFile, 36);
	const markerHandle = openSync(identityFile, constants.O_RDONLY | constants.O_NOFOLLOW);
	let identity: string;
	try {
		requireFact(same(fstatSync(markerHandle), marker) && marker.size === 36);
		identity = readFileSync(markerHandle, 'utf8');
		requireFact(uuidPattern.test(identity));
	} finally {
		closeSync(markerHandle);
	}

	const database = privateFile(file, databaseBytes);
	requireFact(fresh || database.size >= pageSize);
	function guard() {
		const actual = lstatSync(directory);
		requireFact(
			same(actual, root) &&
				actual.isDirectory() &&
				actual.uid === uid &&
				(actual.mode & 0o7777) === 0o700
		);
		requireFact(
			same(privateFile(identityFile, 36), marker) &&
				same(privateFile(file, databaseBytes), database)
		);
		verifyJournal();
	}
	guard();
	const db = new DatabaseSync(file, { enableForeignKeyConstraints: true, allowExtension: false });
	try {
		db.exec(
			`PRAGMA busy_timeout=2500; PRAGMA trusted_schema=OFF; PRAGMA synchronous=FULL; PRAGMA page_size=${pageSize}; PRAGMA max_page_count=${databaseBytes / pageSize};`
		);
		requireFact(db.prepare('PRAGMA journal_mode').get()?.journal_mode === 'delete');
		requireFact(db.prepare('PRAGMA page_size').get()?.page_size === pageSize);
		const integrity = db.prepare('PRAGMA quick_check(1)').get();
		requireFact(integrity?.quick_check === 'ok');
		return { db, guard, identity, fresh };
	} catch (error) {
		db.close();
		throw error;
	}
}
