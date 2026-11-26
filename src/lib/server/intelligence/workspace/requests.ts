import { workspaceLimits } from './sessions.ts';

export async function validateWorkspaceRequest(
	request: Request,
	expectedOrigin: string,
	readDeadlineMs: number = workspaceLimits.requestReadMs
): Promise<400 | 403 | 405 | 408 | 413 | 415 | null> {
	if (request.method !== 'POST') return 405;

	if (request.headers.get('origin') !== expectedOrigin) {
		return 403;
	}

	const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();

	if (contentType !== 'application/x-www-form-urlencoded') {
		return 415;
	}

	const length = request.headers.get('content-length');

	if (length !== null) {
		if (!/^[0-9]+$/.test(length)) return 400;
		if (Number(length) > workspaceLimits.bodyBytes) return 413;
	}

	// Initial session actions accept no form fields.
	// Reject any body bytes, including streaming submissions.
	if (!request.body) return null;

	const reader = request.body.getReader();
	let timer: ReturnType<typeof setTimeout> | undefined;

	const deadline = new Promise<'timeout'>((resolve) => {
		timer = setTimeout(() => resolve('timeout'), readDeadlineMs);
	});

	let receivedBytes = 0;

	try {
		while (true) {
			const result = await Promise.race([reader.read(), deadline]);

			if (result === 'timeout') {
				void reader.cancel().catch(() => {});
				return 408;
			}

			if (result.done) {
				return receivedBytes === 0 ? null : 400;
			}

			receivedBytes += result.value.byteLength;

			if (receivedBytes > workspaceLimits.bodyBytes) {
				void reader.cancel().catch(() => {});
				return 413;
			}
		}
	} catch {
		return 400;
	} finally {
		clearTimeout(timer);
		reader.releaseLock();
	}
}
