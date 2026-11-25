import { capabilitiesForObjective } from '../../src/lib/server/intelligence/application/capabilities.ts';
import {
	syntheticFixtureIds,
	getSyntheticFixture
} from '../../src/lib/server/intelligence/application/fixtures.ts';

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { createIntelligence } from '../../src/lib/server/intelligence/service.ts';

const HISTORY_LIMIT = 50;

const colors = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	green: '\x1b[32m',
	amber: '\x1b[33m',
	dim: '\x1b[90m',
	cyan: '\x1b[36m'
};

function paint(value, color) {
	return stdout.isTTY ? `${colors[color]}${value}${colors.reset}` : value;
}

function heading(value) {
	console.log(`\n${paint(value, 'bold')}`);
	console.log('─'.repeat(52));
}

function showMenu() {
	heading('JEV APPLICATION INTELLIGENCE');

	console.log(paint('FliHub-3 · Offline mock mode', 'green'));
	console.log(paint('Advisory only — execution disabled', 'amber'));

	console.log(`
1. Prepare an event
2. Assess event readiness
3. Browse application capabilities
4. Inspect synthetic scenarios
5. Review session history
6. View resource usage
7. Exit
`);
}

function displayName(id) {
	return id
		.split('_')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

function showCapabilities() {
	heading('APPLICATION CAPABILITIES');

	for (const capability of capabilitiesForObjective('prepare_event')) {
		console.log(`\n${paint(capability.label, 'bold')}`);
		console.log(capability.description);
		console.log(paint(`Effect: ${capability.effect}`, 'dim'));
		console.log(paint(`Execution: ${capability.execution}`, 'dim'));
	}
}

function showScenarios() {
	heading('REGISTERED SYNTHETIC SCENARIOS');

	for (const id of syntheticFixtureIds()) {
		console.log(`\n${paint(displayName(id), 'bold')}`);
		console.log(JSON.stringify(getSyntheticFixture(id), null, 2));
	}
}

async function selectScenario(terminal, signal) {
	const ids = syntheticFixtureIds();

	heading('SELECT A SYNTHETIC EVENT');

	ids.forEach((id, index) => {
		console.log(`${index + 1}. ${displayName(id)}`);
	});

	console.log('0. Return to main menu');

	while (!signal.aborted) {
		const choice = (
			await terminal.question(paint('Select a scenario: ', 'cyan'), { signal })
		).trim();

		if (choice === '0') return null;

		if (/^[1-9][0-9]*$/.test(choice)) {
			const index = Number(choice) - 1;

			if (Number.isSafeInteger(index) && index < ids.length) {
				return ids[index];
			}
		}

		console.log(paint('Invalid scenario selection.', 'amber'));
	}

	return null;
}

function showAssignment(label, value) {
	if (value === null) {
		console.log(paint(`[?] ${label}: unknown`, 'amber'));
	} else if (value) {
		console.log(paint(`[OK] ${label}: assigned`, 'green'));
	} else {
		console.log(paint(`[!] ${label}: not assigned`, 'amber'));
	}
}

function showCount(label, value) {
	if (value === null) {
		console.log(paint(`[?] ${label}: unknown`, 'amber'));
	} else {
		console.log(
			paint(`[${value === 0 ? '!' : 'OK'}] ${label}: ${value}`, value === 0 ? 'amber' : 'green')
		);
	}
}

function showAdvisoryResponse(result, fixtureId) {
	const { plan, explanation } = result;
	const facts = plan.facts;

	console.log(paint(displayName(fixtureId), 'bold'));
	console.log(paint(explanation.heading, 'cyan'));
	console.log(paint('Source: offline mock assessment', 'dim'));

	heading('EVENT CONTEXT');

	showAssignment('Event date', facts.dateAssigned);
	showAssignment('Venue', facts.venueAssigned);
	showCount('Registered participants', facts.participantCount);
	showCount('Competition groups', facts.groupCount);

	if (facts.scoringConfigured === null) {
		console.log(paint('[?] Scoring configuration: unknown', 'amber'));
	} else if (facts.scoringConfigured) {
		console.log(paint('[OK] Scoring configured', 'green'));
	} else {
		console.log(paint('[!] Scoring not configured', 'amber'));
	}

	if (explanation.recommendation) {
		heading(
			plan.decision.status === 'clarification' ? 'CLARIFICATION NEEDED' : 'RECOMMENDED NEXT STEP'
		);

		console.log(paint(explanation.recommendation, 'amber'));
	} else {
		heading('NO RECOMMENDATION AVAILABLE');
	}

	if (explanation.reasoning) {
		console.log(explanation.reasoning);
	}

	if (plan.readiness && explanation.readiness) {
		heading('QUALITATIVE READINESS');

		const { score, maximum } = plan.readiness;
		const width = 20;
		const filled = Math.round((score / maximum) * width);

		const bar = '█'.repeat(filled) + '░'.repeat(width - filled);

		console.log(paint(`${bar} ${score.toFixed(2)} / ${maximum}`, 'amber'));

		console.log(paint('Not an official completion measurement.', 'dim'));
	}

	if (explanation.alternatives.length > 0) {
		heading('ALTERNATIVE RECOMMENDATIONS');

		for (const alternative of explanation.alternatives) {
			console.log(`  - ${alternative}`);
		}
	}

	if (explanation.notices.length > 0) {
		heading('ATTENTION');

		for (const notice of explanation.notices) {
			console.log(paint(`[!] ${notice}`, 'amber'));
		}
	}

	console.log('\n' + '─'.repeat(52));
	console.log(paint(explanation.disclaimer, 'dim'));
}

function recordResponse(session, entry) {
	session.totalResponses++;
	session.responseCounts[entry.result.status]++;

	if (entry.result.status === 'unavailable' && entry.result.reason === 'rate') {
		session.rateLimitedResponses++;
	}

	session.history.push(entry);

	if (session.history.length > HISTORY_LIMIT) {
		session.history.shift();
	}
}

async function runAdvisory(intelligence, terminal, signal, session, objectiveId) {
	const fixtureId = await selectScenario(terminal, signal);

	if (!fixtureId || signal.aborted) return;

	const result = await intelligence.adviseApplication({
		objectiveId,
		fixtureId
	});

	recordResponse(session, { objectiveId, fixtureId, result });

	heading('APPLICATION ADVISORY RESPONSE');

	if (result.status !== 'advised') {
		console.log(paint(`Assessment status: ${result.status}`, 'amber'));

		if (result.status === 'unavailable') {
			console.log(`Reason: ${result.reason}`);
		}

		return;
	}

	showAdvisoryResponse(result, fixtureId);
}

async function showSessionHistory(terminal, signal, session) {
	heading('SESSION HISTORY');

	console.log(`Total session responses: ${session.totalResponses}`);
	console.log(`Retained responses: ${session.history.length} / ${HISTORY_LIMIT}`);

	if (session.totalResponses > session.history.length) {
		console.log(paint('Older responses have been discarded.', 'dim'));
	}

	if (session.history.length === 0) {
		console.log(paint('No assessments recorded in this session.', 'dim'));
		return;
	}

	session.history.forEach((entry, index) => {
		console.log(`\n${index + 1}. ${paint(displayName(entry.fixtureId), 'bold')}`);

		console.log(`   Objective: ${displayName(entry.objectiveId)}`);

		if (entry.result.status === 'advised') {
			console.log(
				paint(`   ${entry.result.explanation.recommendation ?? 'No recommendation'}`, 'amber')
			);
		} else {
			console.log(paint(`   Status: ${entry.result.status}`, 'amber'));

			if (entry.result.status === 'unavailable') {
				console.log(`   Reason: ${entry.result.reason}`);
			}
		}
	});

	console.log('\n0. Return to main menu');

	while (!signal.aborted) {
		const choice = (
			await terminal.question(paint('Select a response to review: ', 'cyan'), { signal })
		).trim();

		if (choice === '0') return;

		if (/^[1-9][0-9]*$/.test(choice)) {
			const index = Number(choice) - 1;

			if (Number.isSafeInteger(index) && index < session.history.length) {
				const entry = session.history[index];

				heading('RECORDED ADVISORY RESPONSE');

				console.log(paint('Session history — no new assessment requested.', 'dim'));

				if (entry.result.status === 'advised') {
					showAdvisoryResponse(entry.result, entry.fixtureId);
				} else {
					console.log(`Status: ${entry.result.status}`);

					if (entry.result.status === 'unavailable') {
						console.log(`Reason: ${entry.result.reason}`);
					}
				}

				return;
			}
		}

		console.log(paint('Invalid history selection.', 'amber'));
	}
}

function showResourceUsage(session) {
	heading('SESSION RESOURCE USAGE');

	console.log('Provider: offline mock');

	heading('ASSESSMENT ACTIVITY');

	console.log(`Assessment attempts: ${session.assessmentAttempts}`);

	console.log(`Recorded responses: ${session.totalResponses}`);
	console.log(`Retained responses: ${session.history.length}`);
	console.log(`Discarded responses: ${session.totalResponses - session.history.length}`);

	console.log(`Advisory responses: ${session.responseCounts.advised}`);
	console.log(`Unavailable responses: ${session.responseCounts.unavailable}`);
	console.log(`Disabled responses: ${session.responseCounts.disabled}`);
	console.log(`Rate-limited responses: ${session.rateLimitedResponses}`);

	heading('RESOURCE CONTROLS');

	console.log('Configured rate limit: 10 requests per minute');
	console.log('Configured concurrency limit: 1');
	console.log('Resource scope: current process');

	heading('PROVIDER USAGE');

	console.log(paint('Paid provider requests: 0', 'green'));
	console.log(paint('Paid provider cost: $0.00', 'green'));

	console.log('External provider access: disabled');
	console.log(
		paint(
			`Blocked provider fetch attempts: ${session.blockedFetchAttempts}`,
			session.blockedFetchAttempts === 0 ? 'green' : 'amber'
		)
	);

	console.log('Live token usage: not applicable');

	heading('SESSION STORAGE');

	console.log('History storage: in memory only');
	console.log(`History retention limit: ${HISTORY_LIMIT} responses`);

	console.log('Persistent session storage: disabled');
	console.log('History is discarded when the terminal exits.');

	console.log(`Session duration: ${Math.floor((Date.now() - session.startedAt) / 1000)} seconds`);
}

async function main() {
	if (!stdin.isTTY || !stdout.isTTY) {
		console.error('Jev application intelligence requires an interactive terminal.');
		process.exitCode = 1;
		return;
	}

	const session = {
		startedAt: Date.now(),
		history: [],

		assessmentAttempts: 0,
		totalResponses: 0,
		responseCounts: {
			advised: 0,
			unavailable: 0,
			disabled: 0
		},
		rateLimitedResponses: 0,
		blockedFetchAttempts: 0
	};

	// Deliberately do not inherit process.env or live provider credentials.
	const intelligence = createIntelligence(
		{
			FLIHUB_INTELLIGENCE_ENABLED: 'true',
			FLIHUB_INTELLIGENCE_PROVIDER: 'mock',
			FLIHUB_INTELLIGENCE_REQUESTS_PER_MINUTE: '10',
			FLIHUB_INTELLIGENCE_CONCURRENCY: '1'
		},
		{
			fetch: async () => {
				session.blockedFetchAttempts++;
				throw new Error('External provider access is disabled.');
			},
			applicationAudit: () => {
				session.assessmentAttempts++;
			}
		}
	);

	if (typeof intelligence.adviseApplication !== 'function') {
		throw new Error('Application advisory service is unavailable.');
	}

	const terminal = createInterface({
		input: stdin,
		output: stdout
	});

	const controller = new AbortController();

	const stop = () => controller.abort();

	terminal.on('SIGINT', stop);
	terminal.on('close', stop);

	try {
		while (!controller.signal.aborted) {
			showMenu();

			const choice = (
				await terminal.question(paint('Select an option: ', 'cyan'), { signal: controller.signal })
			).trim();

			switch (choice) {
				case '1':
				case '2':
					await runAdvisory(
						intelligence,
						terminal,
						controller.signal,
						session,
						choice === '1' ? 'prepare_tournament' : 'assess_readiness'
					);
					break;

				case '3':
					showCapabilities();
					break;

				case '4':
					showScenarios();
					break;

				case '5':
					await showSessionHistory(terminal, controller.signal, session);
					break;

				case '6':
					showResourceUsage(session);
					break;

				case '7':
					return;

				default:
					console.log(paint('\nInvalid selection. Choose 1–7.', 'amber'));
			}
		}
	} catch (error) {
		if (!controller.signal.aborted) throw error;
	} finally {
		terminal.close();
		console.log('\nJev application intelligence session ended.');
	}
}

main().catch(() => {
	console.error('Jev application intelligence could not complete the session.');
	process.exitCode = 1;
});
