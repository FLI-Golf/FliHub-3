/**
 * Shared helpers for the Phase 1A integration suite.
 *
 * All product behavior is exercised with ordinary user credentials through
 * the public PocketBase API and the FliHub trusted hook endpoints. The
 * superuser is used only where a test explicitly says so (forcing an
 * invitation into an expired state), never as an application identity.
 */
import PocketBase from 'pocketbase';

export const PB_URL = process.env.FLIHUB_TEST_PB_URL;
export const MAILPIT_URL = process.env.FLIHUB_TEST_MAILPIT_URL;

if (!PB_URL || !MAILPIT_URL) {
	throw new Error('Run via `npm run test:integration` (tests/run-integration.mjs sets the env).');
}

let counter = 0;
export function uniqueEmail(prefix) {
	counter += 1;
	return `${prefix}-${Date.now()}-${counter}@example.com`;
}

export function newClient() {
	return new PocketBase(PB_URL);
}

export const PASSWORD = 'test-password-1234';

/** Registers a user (public create rule) and signs in. Does not verify. */
export async function registerUser(email, name) {
	const pb = newClient();
	await pb.collection('users').create({
		email,
		password: PASSWORD,
		passwordConfirm: PASSWORD,
		name
	});
	await pb.collection('users').authWithPassword(email, PASSWORD);
	return pb;
}

/** Polls mailpit for the newest verification email to `email` and returns its token. */
export async function latestVerificationToken(email) {
	for (let i = 0; i < 40; i++) {
		const list = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=50`).then((r) => r.json());
		const msg = (list.messages ?? [])
			.filter((m) => (m.To ?? []).some((t) => t.Address === email))
			.sort((a, b) => new Date(b.Created) - new Date(a.Created))[0];
		if (msg) {
			const full = await fetch(`${MAILPIT_URL}/api/v1/message/${msg.ID}`).then((r) => r.json());
			const body = `${full.HTML ?? ''}\n${full.Text ?? ''}`;
			const match = body.match(/verify-email\/([A-Za-z0-9_.-]+)/);
			if (match) return match[1];
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error(`No verification email captured for ${email}`);
}

/** Verifies the given user's email through the real captured email flow. */
export async function verifyEmail(pb, email) {
	await pb.collection('users').requestVerification(email);
	const token = await latestVerificationToken(email);
	await pb.collection('users').confirmVerification(token);
	await pb.collection('users').authRefresh();
}

/** Registers + verifies + signs in. */
export async function registerVerifiedUser(email, name) {
	const pb = await registerUser(email, name);
	await verifyEmail(pb, email);
	return pb;
}

/** Creates an organization through the trusted hook; returns {id, name}. */
export async function createOrg(pb, name) {
	return pb.send('/api/flihub/organizations', { method: 'POST', body: { name } });
}

/** Creates an invitation through the trusted hook; returns {id, token, role, ...}. */
export async function createInvitation(pb, orgId, email, role) {
	return pb.send('/api/flihub/invitations', {
		method: 'POST',
		body: { organization: orgId, email, role }
	});
}

export async function acceptInvitation(pb, token) {
	return pb.send('/api/flihub/invitations/accept', { method: 'POST', body: { token } });
}

/** Expects the promise to reject with a ClientResponseError carrying the hook's error code. */
export async function expectHookError(promise, status, code) {
	try {
		await promise;
	} catch (err) {
		// FliHub hooks return `{ code, message }`; the SDK exposes the parsed
		// body as `err.response`. PocketBase's own errors use a numeric code and
		// a human message.
		if (err?.status === status && err?.response?.code === code) {
			return err;
		}
		throw new Error(
			`Expected ${status}/${code}, got ${err?.status}/${JSON.stringify(err?.response ?? err?.message ?? err)}`,
			{ cause: err }
		);
	}
	throw new Error(`Expected ${status}/${code}, but the request succeeded`);
}

/** Test-only superuser client for forcing state (e.g. expiring invitations). */
export async function superuserClient() {
	const pb = newClient();
	await pb
		.collection('_superusers')
		.authWithPassword(
			process.env.FLIHUB_TEST_SUPERUSER_EMAIL,
			process.env.FLIHUB_TEST_SUPERUSER_PASSWORD
		);
	return pb;
}
