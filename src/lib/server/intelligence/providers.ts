import { directorContext } from './director.ts';
import type { Provider } from './types.ts';
import { record, probability, definitionFor } from './validation.ts';

export const MODEL = 'jev-1.14.0';
export const NANODOLLARS_PER_TOKEN = 42;
// Conservative reservation against the documented 64k default request context.
export const RESERVED_TOKENS = 65_536;

export const disabledProvider: Provider = {
	name: 'disabled',
	async decide() {
		return { status: 'disabled' };
	}
};

export const mockProvider: Provider = {
	name: 'mock',
	async decide(request) {
		const { state } = request;
		if ('candidates' in request) {
			const preferred = {
				taskSelection: 'checks',
				taskPriority: 'checks',
				implementationApproach: 'minimal_change',
				riskClassification: 'routine',
				verificationStrategy: 'targeted',
				testAssessment: state === 'verification_failed' ? 'failing' : 'passing',
				defectTriage: 'fixture_defect',
				retryEscalation: 'retry',
				acceptanceReadiness: 'ready',
				nextAction:
					state === 'verification_failed'
						? 'correct_defect'
						: state === 'verification_passed'
							? 'recommend_completion'
							: state === 'verification_pending' || state === 'correction_done'
								? 'verify_targeted'
								: 'implement_next'
			}[request.id];
			const choice = request.candidates.some((candidate) => candidate === preferred)
				? preferred
				: request.candidates[0];
			return { status: 'suggested', choice, confidence: 0.95 };
		}
		if (state === 'running an ordinary local unit test') {
			return { status: 'suggested', choice: 'ordinary', confidence: 0.9 };
		}
		return state === 'local build with uncertain side effects' ||
			state === 'installing an unfamiliar dependency'
			? { status: 'suggested', choice: 'elevated', confidence: 0.9 }
			: { status: 'abstained' };
	}
};

async function readJson(response: Response): Promise<unknown> {
	const reader = response.body?.getReader();
	if (!reader) return null;
	const decoder = new TextDecoder('utf-8', { fatal: true });
	let size = 0;
	let body = '';
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > 16_384) {
				void reader.cancel().catch(() => {});
				return null;
			}
			body += decoder.decode(value, { stream: true });
		}
		return JSON.parse(body + decoder.decode());
	} catch (error) {
		void reader.cancel().catch(() => {});
		throw error;
	} finally {
		reader.releaseLock();
	}
}

export function jevProvider(apiKey: string, fetcher: typeof fetch): Provider {
	return {
		name: 'jev',
		async decide(request, signal) {
			const { state } = request;
			const { instructions, criteria } = definitionFor(request);
			const response = await fetcher('https://api.typesafe.ai/v1/systemone', {
				method: 'POST',
				redirect: 'error',
				headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: MODEL,
					state: 'candidates' in request ? directorContext[request.state] : state,
					questions: { assessment: { type: 'choice', instructions, criteria } }
				}),
				signal
			});
			if (response.status !== 200) {
				void response.body?.cancel().catch(() => {});
				const reason =
					{
						401: 'authentication',
						403: 'authentication',
						402: 'billing',
						429: 'rate',
						400: 'invalid_input',
						422: 'invalid_input'
					}[response.status as 401 | 403 | 402 | 429 | 400 | 422] ?? 'provider';
				return { status: 'unavailable', reason };
			}

			const payload = await readJson(response).catch(() => null);
			const envelope = record(payload);
			const answer = record(record(envelope?.answers)?.assessment);
			const probabilities = record(answer?.probabilities);
			const choice = answer?.choice;
			const keys = Object.keys(criteria);
			const model = envelope?.model === MODEL ? MODEL : undefined;
			const usage = record(envelope?.usage);
			const metadata = {
				model,
				usage: { inputTokens: usage?.input_tokens, outputTokens: usage?.output_tokens }
			};
			if (
				!model ||
				answer?.type !== 'choice' ||
				typeof choice !== 'string' ||
				!Object.hasOwn(criteria, choice) ||
				!probabilities ||
				Object.keys(probabilities).length !== keys.length ||
				!keys.every(
					(key) => Object.hasOwn(probabilities, key) && probability(probabilities[key])
				) ||
				keys.some((key) => Number(probabilities[key]) > Number(probabilities[choice])) ||
				Math.abs(keys.reduce((sum, key) => sum + Number(probabilities[key]), 0) - 1) > 0.001 ||
				(answer.confidence !== null && !probability(answer.confidence))
			) {
				return { ...metadata, status: 'unavailable', reason: 'invalid_output' };
			}
			return { ...metadata, status: 'suggested', choice, confidence: answer.confidence };
		}
	};
}
