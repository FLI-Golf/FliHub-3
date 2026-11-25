/**
 * Shared bounded TypeSafe System One HTTP transport.
 *
 * Transport only: callers remain responsible for authorization,
 * registered inputs, resource limits and response validation.
 * No automatic retries.
 */

import type { Failure } from './types.ts';

export type JevTransportResult =
	{ status: 'received'; payload: unknown } | { status: 'unavailable'; reason: Failure };

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

export async function requestJev(
	apiKey: string,
	fetcher: typeof fetch,
	body: string,
	signal: AbortSignal
): Promise<JevTransportResult> {
	const response = await fetcher('https://api.typesafe.ai/v1/systemone', {
		method: 'POST',
		redirect: 'error',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body,
		signal
	});

	if (response.status !== 200) {
		void response.body?.cancel().catch(() => {});

		const failures: Readonly<Partial<Record<number, Failure>>> = {
			401: 'authentication',
			403: 'authentication',
			402: 'billing',
			429: 'rate',
			400: 'invalid_input',
			422: 'invalid_input'
		};

		const reason: Failure = failures[response.status] ?? 'provider';

		return {
			status: 'unavailable',
			reason
		};
	}

	const payload = await readJson(response).catch(() => null);

	return {
		status: 'received',
		payload
	};
}
