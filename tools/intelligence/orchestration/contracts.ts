export const tasks = {
	implementation: { file: 'implementation.txt', operation: 'edit', dependencies: [] },
	checks: { file: 'checks.txt', operation: 'edit', dependencies: [] },
	integration: { file: 'checks.txt', operation: 'edit', dependencies: ['implementation', 'checks'] }
} as const;
export const engineeringFiles = ['discount.mjs', 'discount.test.mjs'] as const;
export function jobFile(job: Job, objective: Authorization['objective']) {
	if (job === 'verify_targeted' || job === 'verify_broader') return undefined;
	const task = job === 'correct_defect' || job === 'reconsider' ? 'implementation' : job;
	return objective === 'isolated_engineering'
		? engineeringFiles[task === 'implementation' ? 0 : 1]
		: tasks[task].file;
}
export type Task = keyof typeof tasks;
export type Operation = 'edit' | 'verify';
export type Job = Task | 'verify_targeted' | 'verify_broader' | 'correct_defect' | 'reconsider';
export type Evidence = 'pass' | 'fail' | 'missing' | 'unexpected' | 'timeout' | 'cancelled';
export type WorkerResult = {
	evidence: Evidence;
	changed: readonly string[];
	checkpoint?: string;
	codexAcknowledged?: boolean;
	checks?: { build: boolean; test: boolean };
};
export type Worker = {
	readonly source: 'mock' | 'codex' | 'fixture' | 'engineering';
	execute(
		job: Job,
		signal: AbortSignal,
		corrected: boolean,
		approach?: 'minimal_change' | 'add_fixture'
	): Promise<WorkerResult>;
};

export type Authorization = {
	objective: 'synthetic_development' | 'isolated_engineering';
	files: readonly string[];
	operations: readonly Operation[];
	protectedTasks: readonly Task[];
};

export const limits = Object.freeze({
	durationMs: 300_000,
	requests: 20,
	invocations: 10,
	spendNanodollars: 55_050_240,
	retries: 1,
	repeatedFailures: 2,
	iterations: 10,
	changes: 2
});
export type Limits = { -readonly [Key in keyof typeof limits]: number };
export type Source =
	'engineering' | 'fixture' | 'deterministic' | 'mock' | 'jev' | 'codex' | 'human' | 'disabled';
export type Event = {
	at: number;
	source: Source;
	category: string;
	value: string;
	confidence?: number;
	minConfidence?: number;
	phase?: string;
	candidates?: readonly string[];
	task?: Job;
};
export type Workflow = {
	id: string;
	policy: 'synthetic-director-v1';
	requirements: readonly ['all_tasks_evidenced', 'verification_passed'];
	version: number;
	authorized: Authorization;
	limits: Limits;
	provider: 'mock' | 'jev' | 'disabled';
	worker?: 'mock' | 'fixture' | 'engineering';
	localFixturePort?: number;
	checkpoint?: string;
	started: number;
	deadline: number;
	status: 'active' | 'paused' | 'stopped' | 'complete' | 'cancelled';
	reason: string;
	requests: number;
	spent: number;
	invocations: number;
	iterations: number;
	retries: number;
	failures: number;
	lastFailed?: Job;
	changes: string[];
	done: Task[];
	verification: 'pending' | 'pass' | 'fail';
	corrected: boolean;
	pending?: { kind: 'decision' | 'worker'; id: string };
	approval?: { task: Task; expires: number };
	approved?: { task: Task; expires: number };
	events: Event[];
};
