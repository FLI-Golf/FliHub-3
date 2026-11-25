import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { PilotCheckpoint } from '../engineering/project-pilot.ts';
import { privateDatabase } from '../audit.ts';
import {
	jobFile,
	limits,
	tasks,
	type Authorization,
	type Limits,
	type Workflow
} from './contracts.ts';

const retention = 30 * 24 * 60 * 60 * 1000;

export function workflowStore(directory?: string) {
	const db = privateDatabase(directory, 'workflows.sqlite');
	db.exec(`CREATE TABLE IF NOT EXISTS workflows (
		id TEXT PRIMARY KEY, version INTEGER NOT NULL, updated INTEGER NOT NULL, state TEXT NOT NULL
	)`);
	db.prepare('DELETE FROM workflows WHERE updated < ?').run(Date.now() - retention);
	db.exec(`CREATE TABLE IF NOT EXISTS project_pilots (
		id TEXT PRIMARY KEY, version INTEGER NOT NULL, started INTEGER NOT NULL, state TEXT NOT NULL
	)`);
	db.prepare('DELETE FROM project_pilots WHERE started <= ?').run(Date.now() - 7 * 86_400_000);

	return {
		close: () => db.close(),
		createPilot(state: PilotCheckpoint) {
			db.prepare('INSERT INTO project_pilots VALUES (?, ?, ?, ?)').run(
				state.id,
				state.version,
				state.started,
				JSON.stringify(state)
			);
			return state;
		},
		getPilot(id: string): PilotCheckpoint | undefined {
			const row = db.prepare('SELECT state FROM project_pilots WHERE id=?').get(id);
			return row ? (JSON.parse(String(row.state)) as PilotCheckpoint) : undefined;
		},
		savePilot(state: PilotCheckpoint) {
			const next = { ...state, version: state.version + 1, updated: Date.now() };
			if (
				db
					.prepare('UPDATE project_pilots SET version=?, state=? WHERE id=? AND version=?')
					.run(next.version, JSON.stringify(next), state.id, state.version).changes !== 1
			)
				throw new Error('Pilot changed concurrently.');
			return next;
		},
		get(id: string): Workflow | undefined {
			const row = db.prepare('SELECT state FROM workflows WHERE id=?').get(id);
			return row ? (JSON.parse(String(row.state)) as Workflow) : undefined;
		},
		create(
			auth: Authorization,
			provider: Workflow['provider'],
			caps: Partial<Limits> = {},
			worker: NonNullable<Workflow['worker']> = 'mock',
			localFixturePort?: number
		) {
			if (
				!['synthetic_development', 'isolated_engineering'].includes(auth?.objective) ||
				(auth.objective === 'isolated_engineering') !== (worker === 'engineering') ||
				!Array.isArray(auth.files) ||
				auth.files.length > 2 ||
				new Set(auth.files).size !== auth.files.length ||
				auth.files.some(
					(file) =>
						file !== jobFile('implementation', auth.objective) &&
						file !== jobFile('checks', auth.objective)
				) ||
				!Array.isArray(auth.operations) ||
				auth.operations.length > 2 ||
				auth.operations.some((operation) => operation !== 'edit' && operation !== 'verify') ||
				!Array.isArray(auth.protectedTasks) ||
				auth.protectedTasks.length > Object.keys(tasks).length ||
				auth.protectedTasks.some((task) => !Object.hasOwn(tasks, task)) ||
				!['mock', 'jev', 'disabled'].includes(provider) ||
				!['mock', 'fixture', 'engineering'].includes(worker) ||
				(localFixturePort !== undefined &&
					(worker !== 'fixture' ||
						provider !== 'mock' ||
						!Number.isInteger(localFixturePort) ||
						localFixturePort < 1024 ||
						localFixturePort > 65535))
			)
				throw new Error('Invalid workflow authorization.');
			const configuration: Limits = { ...limits };
			for (const [name, value] of Object.entries(caps)) {
				const key = name as keyof Limits;
				if (
					!Object.hasOwn(limits, key) ||
					!Number.isSafeInteger(value) ||
					value < 0 ||
					value > limits[key]
				) {
					throw new Error('Invalid workflow limit.');
				}
				configuration[key] = value;
			}
			const started = Date.now();
			const state: Workflow = {
				id: randomUUID(),
				policy: 'synthetic-director-v1',
				requirements: ['all_tasks_evidenced', 'verification_passed'],
				version: 0,
				authorized: {
					objective: auth.objective,
					files: [...auth.files],
					operations: [...auth.operations],
					protectedTasks: [...auth.protectedTasks]
				},
				limits: configuration,
				provider,
				worker,
				localFixturePort,
				started,
				deadline: started + configuration.durationMs,
				status: 'active',
				reason: 'authorized',
				events: [{ at: started, source: 'human', category: 'authorization', value: 'authorized' }],
				requests: 0,
				spent: 0,
				invocations: 0,
				iterations: 0,
				retries: 0,
				failures: 0,
				changes: [],
				done: [],
				verification: 'pending',
				corrected: false
			};
			db.prepare('INSERT INTO workflows VALUES (?, ?, ?, ?)').run(
				state.id,
				state.version,
				started,
				JSON.stringify(state)
			);
			return state;
		},
		save(state: Workflow) {
			const next = { ...state, version: state.version + 1 };
			if (
				db
					.prepare('UPDATE workflows SET version=?, updated=?, state=? WHERE id=? AND version=?')
					.run(next.version, Date.now(), JSON.stringify(next), state.id, state.version).changes !==
				1
			) {
				throw new Error('Workflow changed concurrently.');
			}
			return next;
		}
	};
}

export type WorkflowStore = ReturnType<typeof workflowStore>;

export function workflowSummary(directory: string) {
	const parent = lstatSync(directory, { throwIfNoEntry: false });
	if (!parent) return { ready: false, reason: 'not_initialized', workflows: [] };
	const path = join(directory, 'workflows.sqlite');
	if (
		!parent.isDirectory() ||
		parent.uid !== process.getuid?.() ||
		(parent.mode & 0o777) !== 0o700
	) {
		return { ready: false, reason: 'unsafe_storage', workflows: [] };
	}
	const file = lstatSync(path, { throwIfNoEntry: false });
	if (!file) return { ready: false, reason: 'not_initialized', workflows: [] };
	if (
		!file.isFile() ||
		file.nlink !== 1 ||
		file.uid !== parent.uid ||
		(file.mode & 0o777) !== 0o600
	) {
		return { ready: false, reason: 'unsafe_storage', workflows: [] };
	}
	let db;
	try {
		db = new DatabaseSync(path, { readOnly: true });
		const workflows = db
			.prepare('SELECT state FROM workflows WHERE updated >= ? ORDER BY updated DESC LIMIT 50')
			.all(Date.now() - retention)
			.map((row) => {
				const state = JSON.parse(String(row.state)) as Workflow;
				return {
					id: state.id,
					status: state.status,
					reason: state.reason,
					provider: state.provider,
					requests: state.requests,
					spent: state.spent,
					pending: Boolean(state.pending)
				};
			});
		return { ready: true, workflows };
	} catch {
		return { ready: false, reason: 'storage_unavailable', workflows: [] };
	} finally {
		db?.close();
	}
}
