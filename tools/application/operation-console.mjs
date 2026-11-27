import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { createOfflineOperationWorkflow } from './operation-workflow.mjs';
import { reviewSyntheticOperation } from './operation-interaction.mjs';

import { syntheticFixtureIds } from '../../src/lib/server/intelligence/application/fixtures.ts';

import { syntheticActorIds } from '../../src/lib/server/intelligence/application/operations/fixtures.ts';

const colors = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	green: '\x1b[32m',
	amber: '\x1b[33m',
	cyan: '\x1b[36m',
	dim: '\x1b[90m'
};

function paint(value, color) {
	return stdout.isTTY ? `${colors[color]}${value}${colors.reset}` : value;
}

function heading(value) {
	console.log(`\n${paint(value, 'bold')}`);
	console.log('─'.repeat(52));
}

function displayName(value) {
	return value
		.split('_')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

async function selectOption(question, title, options) {
	heading(title);

	options.forEach((option, index) => {
		console.log(`${index + 1}. ${option.label}`);
	});

	console.log('0. Cancel');

	const answer = (await question('Select an option: ')).trim();

	if (answer === '0') return null;

	if (!/^[1-9][0-9]*$/.test(answer)) {
		console.log(paint('Invalid selection.', 'amber'));
		return null;
	}

	const index = Number(answer) - 1;

	if (!Number.isSafeInteger(index) || index >= options.length) {
		console.log(paint('Invalid selection.', 'amber'));
		return null;
	}

	return options[index].value;
}

function showAdvisory(advisory) {
	if (!advisory) return;

	heading('MOCK INTELLIGENCE ASSESSMENT');

	const { explanation } = advisory;

	console.log(explanation.summary);

	if (explanation.recommendation) {
		console.log(paint(`Recommendation: ${explanation.recommendation}`, 'amber'));
	}

	if (explanation.reasoning) {
		console.log(explanation.reasoning);
	}

	for (const notice of explanation.notices) {
		console.log(paint(`[!] ${notice}`, 'amber'));
	}

	console.log(paint(explanation.disclaimer, 'dim'));
}

async function runAssessment(workflow, question, signal, objectiveId) {
	const fixtureId = await selectOption(
		question,
		'SELECT SYNTHETIC EVENT',
		syntheticFixtureIds().map((id) => ({
			label: displayName(id),
			value: id
		}))
	);

	if (!fixtureId || signal.aborted) return;

	const actorId = await selectOption(
		question,
		'SELECT SIMULATED OPERATOR',
		Object.entries(syntheticActorIds).map(([role, id]) => ({
			label: `${displayName(role)} (simulated)`,
			value: id
		}))
	);

	if (!actorId || signal.aborted) return;

	const result = await workflow.prepare(objectiveId, fixtureId, actorId);

	if (signal.aborted) {
		if (result.status === 'review_required') {
			result.session.cancel();
		}
		return;
	}

	try {
		showAdvisory(result.advisory);

		if (result.status === 'advisory_only') {
			console.log(paint('\nNo controlled operation proposed.', 'dim'));
			return;
		}

		if (result.status === 'rejected') {
			console.log(paint(`\nOperation rejected: ${result.reason}`, 'amber'));
			return;
		}

		const outcome = await reviewSyntheticOperation(result, {
			write: (message) => console.log(message),
			question,
			signal
		});

		heading('CONTROLLED OPERATION RESULT');

		console.log(`Outcome: ${outcome.status}`);

		if (outcome.status === 'rejected') {
			console.log(`Reason: ${outcome.reason}`);
		}

		const state = result.session.getState();

		if (outcome.status === 'published') {
			console.log(paint('[OK] Independent verification passed.', 'green'));
			console.log(paint('[OK] Synthetic state published.', 'green'));
			console.log(`Groups created: ${outcome.groupsCreated}`);
			console.log(`Teams assigned: ${outcome.teamsAssigned}`);
			console.log(`Athletes assigned: ${outcome.athletesAssigned}`);
			console.log(`Revision: ${outcome.revisionBefore} → ${outcome.revisionAfter}`);
			console.log(`Published state digest: ${outcome.publishedStateDigest}`);

			heading('PUBLISHED GROUP ASSIGNMENTS');

			for (const group of state.groups) {
				console.log(`\n${group.name}`);

				for (const assignment of group.entries) {
					const entry = state.entries.find((item) => item.id === assignment.entryId);

					const team = state.teams.find((item) => item.id === entry?.teamId);

					console.log(`  ${team?.name ?? assignment.entryId}`);

					for (const athleteId of assignment.athleteIds) {
						const athlete = state.athletes.find((item) => item.id === athleteId);

						console.log(`    ${athlete?.name ?? athleteId}`);
					}
				}
			}
		} else {
			console.log(paint('No synthetic state published.', 'amber'));
		}

		heading('RESULTING SYNTHETIC STATE');

		console.log(`Current groups: ${state.groups.length}`);
		console.log(`State revision: ${state.revision}`);
		console.log('Scope: synthetic-only');
		console.log('Persistent database changes: none');

		heading('SANITIZED PUBLICATION AUDIT');

		const audit = result.session.getAuditHistory();

		if (audit.length === 0) {
			console.log('No publication attempts recorded.');
		} else {
			console.table(
				audit.map((record) => ({
					sequence: record.sequence,
					outcome: record.outcome,
					verification: record.verification,
					reason: record.failureReason ?? 'none',
					revisionBefore: record.revisionBefore,
					revisionAfter: record.revisionAfter,
					groupsCreated: record.groupsCreated
				}))
			);
		}

		console.log(paint('This operation session is disposable.', 'dim'));
		console.log('Starting another assessment creates a fresh synthetic scenario.');
	} finally {
		if (result.status === 'review_required') {
			result.session.cancel();
		}
	}
}

async function main() {
	if (process.argv.length !== 2) {
		console.error('This offline terminal accepts no arguments.');
		process.exitCode = 1;
		return;
	}

	if (!stdin.isTTY || !stdout.isTTY) {
		console.error('An interactive terminal is required.');
		process.exitCode = 1;
		return;
	}

	const workflow = createOfflineOperationWorkflow();

	const terminal = createInterface({
		input: stdin,
		output: stdout
	});

	const controller = new AbortController();

	const stop = () => controller.abort();

	terminal.on('SIGINT', stop);
	terminal.on('close', stop);

	const question = (prompt) =>
		terminal.question(paint(prompt, 'cyan'), {
			signal: controller.signal
		});

	try {
		while (!controller.signal.aborted) {
			heading('JEV APPLICATION INTELLIGENCE');

			console.log(paint('FliHub-3 · Offline mock mode', 'green'));
			console.log(paint('Synthetic operations · Explicit approval required', 'amber'));
			console.log('Operator identities are simulated.');
			console.log('No external provider or database access.');

			console.log(`
1. Prepare an event
2. Assess event readiness
3. View session usage
4. Exit
`);

			const choice = (await question('Select an option: ')).trim();

			switch (choice) {
				case '1':
				case '2':
					await runAssessment(
						workflow,
						question,
						controller.signal,
						choice === '1' ? 'prepare_tournament' : 'assess_readiness'
					);
					break;

				case '3':
					heading('OFFLINE SESSION USAGE');
					console.table(workflow.getUsage());
					break;

				case '4':
					return;

				default:
					console.log(paint('Invalid selection.', 'amber'));
			}
		}
	} catch {
		if (!controller.signal.aborted) {
			console.error('The offline operation session could not complete.');
			process.exitCode = 1;
		}
	} finally {
		terminal.close();
		console.log('\nOffline operation session ended.');
		console.log('Disposable synthetic state discarded.');
	}
}

main().catch(() => {
	console.error('Unable to start offline operation terminal.');
	process.exitCode = 1;
});
