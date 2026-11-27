import { workspaceLimits } from './sessions.ts';
import { WORKSPACE_OBJECTIVE_MAX_LENGTH } from './objectives.ts';

export type WorkspaceAssessmentInput = {
	readonly mode: 'registered' | 'natural';
	readonly objective: string;
	readonly fixtureId: string;
	readonly actorId: string;
};

type RequestFailure = {
	readonly status: 'invalid';
	readonly code: 400 | 403 | 405 | 408 | 413 | 415;
};

type AssessmentRequestResult =
	| RequestFailure
	| {
			readonly status: 'valid';
			readonly input: WorkspaceAssessmentInput;
	  };

function invalid(code: RequestFailure['code']): RequestFailure {
	return { status: 'invalid', code };
}

const expectedFields = new Set(['mode', 'objective', 'fixtureId', 'actorId']);

function decodeField(value: string): string {
	return decodeURIComponent(value.replace(/\+/g, ' '));
}

function parseFields(body: string): AssessmentRequestResult {
	const fields = new Map<string, string>();

	try {
		for (const pair of body.split('&')) {
			const separator = pair.indexOf('=');

			if (separator < 1) return invalid(400);

			const name = decodeField(pair.slice(0, separator));
			const value = decodeField(pair.slice(separator + 1));

			if (!expectedFields.has(name) || fields.has(name)) {
				return invalid(400);
			}

			fields.set(name, value);
		}
	} catch {
		return invalid(400);
	}

	if (fields.size !== expectedFields.size) {
		return invalid(400);
	}

	const mode = fields.get('mode');
	const objective = fields.get('objective');
	const fixtureId = fields.get('fixtureId');
	const actorId = fields.get('actorId');

	if (
		(mode !== 'registered' && mode !== 'natural') ||
		objective === undefined ||
		fixtureId === undefined ||
		actorId === undefined
	) {
		return invalid(400);
	}

	if (objective.length > WORKSPACE_OBJECTIVE_MAX_LENGTH) {
		return invalid(400);
	}

	if (!/^[a-z][a-z0-9_]{0,63}$/.test(fixtureId) || !/^[a-z][a-z0-9-]{0,63}$/.test(actorId)) {
		return invalid(400);
	}

	return {
		status: 'valid',
		input: Object.freeze({
			mode,
			objective,
			fixtureId,
			actorId
		})
	};
}

export async function parseWorkspaceAssessmentRequest(
	request: Request,
	expectedOrigin: string,
	readDeadlineMs: number = workspaceLimits.requestReadMs
): Promise<AssessmentRequestResult> {
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

		return parseFields(body);
	} catch {
		return invalid(400);
	} finally {
		clearTimeout(timer);
		reader.releaseLock();
	}
}
