import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
	acceptedSha,
	fact,
	isObjective,
	observationTime,
	repository,
	requireFact,
	sha,
	validateContext,
	type Context,
	type Fact,
	type Objective
} from './contract.ts';

const checkout = fileURLToPath(new URL('../../../', import.meta.url));
const branch = 'refs/heads/feature/assisted-development-mode';
const funding = 'refs/heads/feature/funding-phase-2';
const main = 'refs/heads/main';
const historicalRun = 45301470515;
const apiRoot = 'repos/FLI-Golf/FliHub-3/';
const maxOutput = 192 * 1024;
const timeout = 5000;
const runFile = promisify(execFile);

export type ReadCommand = Readonly<{ program: 'git' | 'gh'; args: readonly string[] }>;
export type Read = (command: ReadCommand) => Promise<string>;

function git(...args: string[]): ReadCommand {
	return { program: 'git', args: ['--no-pager', '--no-replace-objects', ...args] };
}

function api(endpoint: string, filter: string): ReadCommand {
	return { program: 'gh', args: ['api', apiRoot + endpoint, '--jq', filter] };
}

const identityQuery = 'visibility nameWithOwner defaultBranchRef{name}';
function qualificationQuery(includeQualification: boolean) {
	const optional = includeQualification
		? 'qualification:issue(number:62){number state projectItems(first:10){pageInfo{hasNextPage} nodes{project{number public} status:fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}}}}}'
		: '';
	return `{repository(owner:"FLI-Golf",name:"FliHub-3"){${identityQuery} main:ref(qualifiedName:"${main}"){target{oid}} feature:ref(qualifiedName:"${branch}"){target{oid}} ${optional}}}`;
}
const fundingQuery = `{repository(owner:"FLI-Golf",name:"FliHub-3"){${identityQuery} main:ref(qualifiedName:"${main}"){target{oid}} feature:ref(qualifiedName:"${funding}"){target{oid}} pr:pullRequest(number:52){number state isDraft baseRefName baseRefOid headRefName headRefOid headRepository{nameWithOwner}}}}`;
export const ownerAccountId = 20407445;

const ownerAcceptance = api(
	'issues/comments/7241436818',
	'{issue_url,author_id:.user.id,author_type:.user.type,verified:(.body | contains("The owner explicitly accepted the bounded offline simulation scope at [07cc7f6f6bdc08bda6ec5a0d7691cf3cbad19f35]"))}'
);
const acceptedCI = api(
	`actions/runs?head_sha=${acceptedSha}&per_page=1`,
	'{total_count,heads:[.workflow_runs[].head_sha]}'
);
const fundingCI = api(
	`actions/runs/${historicalRun}`,
	'{id,event,head_sha,conclusion,records:[.pull_requests[]|{number,head:.head.sha,base:.base.sha}]}'
);

export function processOptions(env: NodeJS.ProcessEnv) {
	// Pass only configuration needed by the fixed local Git and authenticated CLI reads.
	const allowed = ['PATH', 'HOME', 'XDG_CONFIG_HOME', 'GH_CONFIG_DIR', 'LANG', 'SystemRoot'];
	return {
		cwd: checkout,
		timeout,
		maxBuffer: maxOutput,
		encoding: 'utf8' as const,
		windowsHide: true,
		env: {
			...Object.fromEntries(
				allowed.map((key) => [key, env[key]]).filter(([, v]) => v !== undefined)
			),
			GH_PROMPT_DISABLED: '1',
			GIT_TERMINAL_PROMPT: '0'
		}
	};
}

async function execute({ program, args }: ReadCommand): Promise<string> {
	const { stdout } = await runFile(program, [...args], processOptions(process.env));
	return stdout;
}

function jsonRecord(output: string): Record<string, unknown> {
	return record(JSON.parse(output));
}
function record(value: unknown): Record<string, unknown> {
	requireFact(value && typeof value === 'object' && !Array.isArray(value));
	return value as Record<string, unknown>;
}
function ref(value: unknown): string {
	const oid = record(record(value).target).oid;
	sha(oid);
	return oid;
}

export function createCollector(read: Read = execute, now: () => number = Date.now) {
	async function output(command: ReadCommand): Promise<string> {
		try {
			const result = await read(command);
			requireFact(typeof result === 'string' && Buffer.byteLength(result, 'utf8') <= maxOutput);
			return result.trim();
		} catch {
			throw new Error('A bounded repository read failed');
		}
	}
	const clock = () => {
		const milliseconds = now();
		requireFact(Number.isSafeInteger(milliseconds));
		const stamp = new Date(milliseconds).toISOString();
		observationTime(stamp);
		return stamp;
	};
	const object = async (revision: string) => {
		sha(revision);
		requireFact((await output(git('cat-file', '-t', revision))) === 'commit');
	};

	return async function collect(
		objective: Objective,
		includeQualification = false
	): Promise<Context> {
		requireFact(isObjective(objective));
		try {
			const isFunding = objective === 'funding-draft-reconciliation';
			requireFact(isFunding ? !includeQualification : typeof includeQualification === 'boolean');
			const query = isFunding ? fundingQuery : qualificationQuery(includeQualification);
			const raw = jsonRecord(
				await output({ program: 'gh', args: ['api', 'graphql', '-f', 'query=' + query] })
			);
			requireFact(!Object.hasOwn(raw, 'errors'));
			const repo = record(record(raw.data).repository);
			requireFact(
				repo.nameWithOwner === repository &&
					repo.visibility === 'PUBLIC' &&
					record(repo.defaultBranchRef).name === 'main'
			);
			const facts: Fact[] = [
				fact('repository', { slug: repository, visibility: 'PUBLIC' }, null, clock())
			];
			const base = ref(repo.main);
			const head = ref(repo.feature);
			const refObserved = clock();
			await object(base);
			await object(head);
			const mergeBase = await output(git('merge-base', '--all', base, head));
			sha(mergeBase);
			await object(mergeBase);
			if (!isFunding) {
				// The reviewed baseline must remain an ancestor of the live development ref.
				requireFact(mergeBase === base);
				requireFact((await output(git('merge-base', '--all', acceptedSha, head))) === acceptedSha);
				const owner = jsonRecord(await output(ownerAcceptance));
				requireFact(
					owner.verified === true &&
						owner.author_id === ownerAccountId &&
						owner.author_type === 'User' &&
						owner.issue_url === 'https://api.github.com/repos/FLI-Golf/FliHub-3/issues/94'
				);
				facts.push(
					fact(
						'adm6d-acceptance',
						{ issue: 94, scope: 'offline-simulation' },
						{ revision: acceptedSha },
						clock()
					)
				);
				const runs = jsonRecord(await output(acceptedCI));
				requireFact(
					typeof runs.total_count === 'number' &&
						Number.isSafeInteger(runs.total_count) &&
						runs.total_count >= 0
				);
				requireFact(
					Array.isArray(runs.heads) &&
						runs.heads.length === Math.min(1, runs.total_count) &&
						runs.heads.every((s) => s === acceptedSha)
				);
				facts.push(
					fact(
						'adm6d-ci',
						{ status: runs.total_count === 0 ? 'no-matching-run' : 'unverified' },
						{ revision: acceptedSha },
						clock()
					)
				);
				const roadmap = await output(git('show', `${head}:docs/INTELLIGENCE-ROADMAP.md`));
				requireFact(
					/^#### ADM-6 — Qualified Development Advisory/m.test(roadmap) &&
						/\*\*ADM-6E — Separately authorized live Jev qualification\.\*\* Requires a new explicit owner authorization/.test(
							roadmap
						)
				);
				facts.push(
					fact(
						'adm6e-gate',
						{
							section: 'adm-6-qualified-development-advisory',
							gate: 'separate-live-authorization'
						},
						{ head, base },
						clock()
					)
				);
				if (includeQualification) {
					const issue = record(repo.qualification);
					const membership = record(issue.projectItems);
					requireFact(
						issue.number === 62 &&
							issue.state === 'OPEN' &&
							record(membership.pageInfo).hasNextPage === false &&
							Array.isArray(membership.nodes)
					);
					const items = membership.nodes
						.map(record)
						.filter((row) => record(row.project).number === 21);
					requireFact(
						items.length === 1 &&
							record(items[0].project).public === true &&
							record(items[0].status).name === '📋 Planning'
					);
					facts.push(
						fact('engineering-qualification', { issue: 62, status: 'Planning' }, null, refObserved)
					);
				}
			} else {
				const pr = record(repo.pr);
				requireFact(
					pr.number === 52 &&
						pr.state === 'OPEN' &&
						pr.isDraft === true &&
						pr.headRefOid === head &&
						pr.headRefName === 'feature/funding-phase-2' &&
						pr.baseRefName === 'main' &&
						(pr.baseRefOid === base || pr.baseRefOid === mergeBase) &&
						record(pr.headRepository).nameWithOwner === repository
				);
				facts.push(
					fact(
						'funding-draft',
						{ pr: 52, state: 'OPEN', draft: true, reportedBase: pr.baseRefOid as string },
						{ head, base },
						refObserved
					)
				);
				const divergence = await output(
					git('rev-list', '--left-right', '--count', `${base}...${head}`)
				);
				requireFact(/^\d+\s+\d+$/.test(divergence));
				const [behind, ahead] = divergence.split(/\s+/).map(Number);
				facts.push(
					fact('funding-relationship', { mergeBase, ahead, behind }, { head, base }, clock())
				);
				const run = jsonRecord(await output(fundingCI));
				requireFact(
					run.id === historicalRun &&
						run.event === 'pull_request' &&
						run.conclusion === 'success' &&
						run.head_sha === head &&
						Array.isArray(run.records) &&
						run.records.length === 1
				);
				const linked = record(run.records[0]);
				requireFact(
					linked.number === 52 &&
						linked.head === head &&
						linked.base === mergeBase &&
						mergeBase !== base
				);
				facts.push(
					fact(
						'funding-historical-ci',
						{ pr: 52, run: historicalRun, status: 'passed' },
						{ head, base: mergeBase },
						clock()
					)
				);
				const roadmap = await output(git('show', `${base}:docs/CHARITY-EVENT-ROADMAP.md`));
				requireFact(
					/Donations and pledges\s*\| Deferred\s*\| Deferred to CE-6/.test(roadmap) &&
						/Charity development is frozen after CE-3C/.test(roadmap)
				);
				facts.push(
					fact(
						'funding-charity-gate',
						{ section: 'charity-development-sequence', gate: 'ce-6-deferred' },
						{ revision: base },
						clock()
					)
				);
				// This collector verifies only the registered historical run, never compatibility.
				facts.push(
					fact('funding-compatibility', { status: 'unverified' }, { head, base }, clock())
				);
			}
			return validateContext({ version: 1, objective, facts });
		} catch {
			throw new Error('Real development context unavailable; use manual review');
		}
	};
}
