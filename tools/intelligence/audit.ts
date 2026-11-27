import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const policyVersion = 'flihub-dev-2';
export const categories = [
	'read',
	'test',
	'dependency',
	'secret',
	'restricted',
	'unsupported'
] as const;
export type Category = (typeof categories)[number];
export type Verdict = 'allow' | 'review' | 'deny';
export type Reason = 'readonly' | 'mandatory' | 'human_review' | 'elevated' | 'unsupported';
type Provider = 'none' | 'mock' | 'jev' | 'disabled';

export type Decision = {
	category: Category;
	verdict: Verdict;
	reason: Reason;
	provider: Provider;
};

export function privateDatabase(
	directory = join(homedir(), '.flihub-dev-guardrail'),
	name: 'decisions.sqlite' | 'workflows.sqlite' = 'decisions.sqlite'
) {
	try {
		mkdirSync(directory, { mode: 0o700 });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
	}

	const owner = process.getuid?.();
	const dir = lstatSync(directory);
	if (
		owner === undefined ||
		!dir.isDirectory() ||
		dir.uid !== owner ||
		(dir.mode & 0o777) !== 0o700
	) {
		throw new Error('Audit directory must be owned by the local operator and have mode 0700.');
	}
	const file = join(directory, name);
	const fd = openSync(file, constants.O_CREAT | constants.O_NOFOLLOW | constants.O_RDWR, 0o600);
	try {
		const info = fstatSync(fd);
		if (!info.isFile() || info.nlink !== 1 || info.uid !== owner || (info.mode & 0o777) !== 0o600) {
			throw new Error('Audit database must be a private regular file.');
		}
	} finally {
		closeSync(fd);
	}
	const db = new DatabaseSync(file);
	db.exec('PRAGMA busy_timeout = 5000');
	return db;
}

export function auditStore(directory?: string) {
	const db = privateDatabase(directory);
	try {
		db.exec(`
			CREATE TABLE IF NOT EXISTS private_key (id INTEGER PRIMARY KEY CHECK(id=1), key BLOB NOT NULL);
			CREATE TABLE IF NOT EXISTS decisions (
				id TEXT PRIMARY KEY, proposal TEXT NOT NULL, native TEXT UNIQUE,
				created INTEGER NOT NULL, policy TEXT NOT NULL, provider TEXT NOT NULL,
				category TEXT NOT NULL, verdict TEXT NOT NULL, reason TEXT NOT NULL,
				expires INTEGER NOT NULL, state TEXT NOT NULL, human TEXT,
				human_at INTEGER, consumed_at INTEGER, cancelled_at INTEGER
			);
		`);
		db.prepare('INSERT OR IGNORE INTO private_key VALUES (1, ?)').run(randomBytes(32));
	} catch (error) {
		db.close();
		throw error;
	}
	const key = db.prepare('SELECT key FROM private_key WHERE id = 1').get()?.key as Uint8Array;
	const digest = (domain: string, input: string) =>
		createHmac('sha256', key)
			.update(JSON.stringify([domain, input]))
			.digest('hex');
	const approvedBinding = (id: string, proposal: string, native?: string) =>
		[
			id,
			digest('proposal', proposal),
			native === undefined ? null : digest('native', native)
		] as const;

	return {
		close: () => db.close(),
		record(decision: Decision, proposal: string, native?: string, now = Date.now()) {
			if (
				!categories.includes(decision.category) ||
				!['none', 'mock', 'jev', 'disabled'].includes(decision.provider) ||
				!['allow', 'review', 'deny'].includes(decision.verdict) ||
				!['readonly', 'mandatory', 'human_review', 'elevated', 'unsupported'].includes(
					decision.reason
				)
			) {
				throw new Error('Invalid audit decision.');
			}
			const id = randomUUID();
			db.prepare(
				`INSERT INTO decisions (id, proposal, native, created, policy, provider,
				category, verdict, reason, expires, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			).run(
				...approvedBinding(id, proposal, native),
				now,
				policyVersion,
				decision.provider,
				decision.category,
				decision.verdict,
				decision.reason,
				now + 120_000,
				decision.verdict === 'review' ? 'pending' : 'terminal'
			);
			return id;
		},
		human(
			id: string,
			proposal: string,
			native: string | undefined,
			answer: 'approve' | 'reject',
			now = Date.now()
		) {
			if (answer !== 'approve' && answer !== 'reject') return false;
			return (
				db
					.prepare(
						`UPDATE decisions SET human=?, human_at=?, state=?
				WHERE id=? AND proposal=? AND native IS ? AND state='pending' AND expires>?
				AND created<=? AND policy=?`
					)
					.run(
						answer,
						now,
						answer === 'approve' ? 'approved' : 'rejected',
						...approvedBinding(id, proposal, native),
						now,
						now,
						policyVersion
					).changes === 1
			);
		},
		consume(id: string, proposal: string, native?: string, now = Date.now()) {
			return (
				db
					.prepare(
						`UPDATE decisions SET state='consumed', consumed_at=?
				WHERE id=? AND proposal=? AND native IS ? AND state='approved' AND expires>?
				AND human_at<=? AND policy=?`
					)
					.run(now, ...approvedBinding(id, proposal, native), now, now, policyVersion).changes === 1
			);
		},
		cancel(id: string, proposal: string, native?: string, now = Date.now()) {
			return (
				db
					.prepare(
						`UPDATE decisions SET state='cancelled', cancelled_at=?
				WHERE id=? AND proposal=? AND native IS ? AND state IN ('pending','approved')`
					)
					.run(now, ...approvedBinding(id, proposal, native)).changes === 1
			);
		},
		get(id: string) {
			return db
				.prepare(
					`SELECT id, created, policy, provider, category, verdict, reason,
				expires, state, human, human_at, consumed_at, cancelled_at FROM decisions WHERE id = ?`
				)
				.get(id);
		}
	};
}
