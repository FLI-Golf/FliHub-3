import { workspaceLimits } from './sessions.ts';

type RequestFailure = {
	readonly status: 'invalid';
	readonly code: 400 | 403 | 405 | 408 | 413 | 415;
};

type ExecuteInput = {
	readonly action: 'execute';
	readonly confirmation: 'approve-and-execute';
	readonly generation: string;
	readonly reviewId: string;
	readonly planDigest: string;
};

type ReviewRequestResult =
	| RequestFailure
	| {
			readonly status: 'valid';
			readonly input:
				| { readonly action: 'prepare'; readonly generation: string }
				| { readonly action: 'cancel'; readonly reviewId: string }
				| ExecuteInput;
	  };

function invalid(code: RequestFailure['code']): RequestFailure {
	return { status: 'invalid', code };
}

function parseFields(body: string, action: 'prepare' | 'cancel' | 'execute'): ReviewRequestResult {
	if (action === 'execute') {
		const fields = new Map<string, string>();
		try {
			for (const pair of body.split('&')) {
				const separator = pair.indexOf('=');
				if (separator < 1) return invalid(400);
				const name = decodeURIComponent(pair.slice(0, separator).replace(/\+/g, ' '));
				const value = decodeURIComponent(pair.slice(separator + 1).replace(/\+/g, ' '));
				if (fields.has(name)) return invalid(400);
				fields.set(name, value);
			}
		} catch {
			return invalid(400);
		}

		const confirmation = fields.get('confirmation');
		const generation = fields.get('generation');
		const reviewId = fields.get('reviewId');
		const planDigest = fields.get('planDigest');
		if (
			fields.size !== 4 ||
			confirmation !== 'approve-and-execute' ||
			!generation ||
			!/^[a-f0-9]{64}$/.test(generation) ||
			!reviewId ||
			!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(reviewId) ||
			!planDigest ||
			!/^[a-f0-9]{64}$/.test(planDigest)
		)
			return invalid(400);

		return {
			status: 'valid',
			input: Object.freeze({ action, confirmation, generation, reviewId, planDigest })
		};
	}

	const expected = action === 'prepare' ? 'generation' : 'reviewId';

	// Exactly one field. No duplicates or additional instructions.
	if (!body || body.includes('&')) return invalid(400);

	const separator = body.indexOf('=');

	if (separator < 1) return invalid(400);

	try {
		const name = decodeURIComponent(body.slice(0, separator).replace(/\\+/g, ' '));

		const value = decodeURIComponent(body.slice(separator + 1).replace(/\\+/g, ' '));

		if (name !== expected) return invalid(400);

		if (action === 'prepare') {
			if (!/^[a-f0-9]{64}$/.test(value)) {
				return invalid(400);
			}

			return {
				status: 'valid',
				input: Object.freeze({ action, generation: value })
			};
		}

		if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
			return invalid(400);
		}

		return {
			status: 'valid',
			input: Object.freeze({ action, reviewId: value })
		};
	} catch {
		return invalid(400);
	}
}

export async function parseWorkspaceReviewRequest(
	request: Request,
	expectedOrigin: string,
	action: 'prepare' | 'cancel' | 'execute',
	readDeadlineMs: number = workspaceLimits.requestReadMs
): Promise<ReviewRequestResult> {
	if (request.method !== 'POST') return invalid(405);

	if (request.headers.get('origin') !== expectedOrigin) {
		return invalid(403);
	}

	const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();

	if (contentType !== 'application/x-www-form-urlencoded') {
		return invalid(415);
	}

	const length = request.headers.get('content-length');

	if (length !== null) {
		if (!/^[0-9]+$/.test(length)) return invalid(400);

		if (Number(length) > workspaceLimits.bodyBytes) {
			return invalid(413);
		}
	}

	if (!request.body || request.bodyUsed || request.body.locked) {
		return invalid(400);
	}

	const reader = request.body.getReader();

	let timer: ReturnType<typeof setTimeout> | undefined;

	const deadline = new Promise<'timeout'>((resolve) => {
		timer = setTimeout(() => resolve('timeout'), readDeadlineMs);
	});

	const buffer = new Uint8Array(workspaceLimits.bodyBytes);

	let receivedBytes = 0;

	try {
		while (true) {
			const result = await Promise.race([reader.read(), deadline]);

			if (result === 'timeout') {
				void reader.cancel().catch(() => {});
				return invalid(408);
			}

			if (result.done) break;

			if (receivedBytes + result.value.byteLength > workspaceLimits.bodyBytes) {
				void reader.cancel().catch(() => {});
				return invalid(413);
			}

			buffer.set(result.value, receivedBytes);
			receivedBytes += result.value.byteLength;
		}

		if (length !== null && Number(length) !== receivedBytes) {
			return invalid(400);
		}

		const body = new TextDecoder('utf-8', {
			fatal: true,
			ignoreBOM: true
		}).decode(buffer.subarray(0, receivedBytes));

		return parseFields(body, action);
	} catch {
		return invalid(400);
	} finally {
		clearTimeout(timer);
		reader.releaseLock();
	}
}
