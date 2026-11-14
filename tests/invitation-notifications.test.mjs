import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { invitationNotice } from '../src/lib/server/invitation-notifications.ts';
const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const id = 'invitation12345';
function record(values) {
	return {
		id: values.id ?? id,
		getString: (key) => String(values[key] ?? ''),
		getBool: (key) => Boolean(values[key]),
		set: (key, value) => {
			values[key] = value;
		}
	};
}
function pendingFixture({ verified = true, query = {} } = {}) {
	let handler;
	const calls = [],
		headers = [];
	vm.runInNewContext(read('../pocketbase/pb_hooks/flihub_invitation_notifications.pb.js'), {
		routerAdd: (_method, _path, callback) => {
			handler = callback;
		},
		$apis: { requireAuth: () => true }
	});
	const response = handler({
		response: { header: () => ({ set: (...args) => headers.push(args) }) },
		auth: record({ verified, email: ' MORGAN@example.com ' }),
		requestInfo: () => ({ query }),
		app: {
			findRecordsByFilter: (...args) => {
				calls.push(args);
				return [
					record({
						organization: 'org',
						role: 'scorekeeper',
						expires_at: '2099-01-01 00:00:00.000Z',
						token_hash: 'SECRET-HASH',
						email: 'morgan@example.com'
					})
				];
			},
			findRecordById: () => record({ name: 'Invited Org', privateField: 'secret' })
		},
		json: (status, data) => ({ status, data })
	});
	return { response, calls, headers };
}
test('pending DTO uses authenticated verified email, ignores supplied email, and exposes only safe fields', () => {
	const { response, calls, headers } = pendingFixture({ query: { email: 'other@example.com' } });
	assert.equal(response.status, 200);
	assert.equal(calls[0][5].email, 'morgan@example.com');
	assert.match(calls[0][1], /status = "pending"/);
	assert.match(calls[0][1], /expires_at > \{:now\}/);
	assert.deepEqual(Object.keys(response.data.items[0]).sort(), [
		'expiresAt',
		'invitationId',
		'organizationName',
		'role'
	]);
	assert.ok(!JSON.stringify(response.data).includes('SECRET'));
	assert.deepEqual(headers[0], ['Cache-Control', 'private, no-store']);
});
test('unverified users cannot enumerate pending invitation metadata', () => {
	const { response, calls } = pendingFixture({ verified: false });
	assert.equal(response.status, 403);
	assert.equal(calls.length, 0);
});
test('invalid pagination cannot trigger invitation reads', () => {
	for (const query of [{ page: '-1' }, { page: '1.2' }, { perPage: '100' }, { page: '10001' }]) {
		const { response, calls } = pendingFixture({ query });
		assert.equal(response.status, 400);
		assert.equal(calls.length, 0);
	}
});
test('notice state distinguishes pending, none, and unavailable without querying unverified users', async () => {
	const pb = { send: async () => ({ items: [{}] }) };
	assert.equal(await invitationNotice(pb, true), 'pending');
	assert.equal(await invitationNotice({ send: async () => ({ items: [] }) }, true), 'none');
	assert.equal(
		await invitationNotice(
			{
				send: async () => {
					throw new Error('offline');
				}
			},
			true
		),
		'unavailable'
	);
	assert.equal(
		await invitationNotice(
			{
				send: async () => {
					assert.fail('must not query');
				}
			},
			false
		),
		'none'
	);
});

function acceptance({
	verified = true,
	email = 'morgan@example.com',
	status = 'pending',
	expiresAt = '2099-01-01 00:00:00.000Z',
	existingMember = false
} = {}) {
	let handler;
	const writes = [],
		lookups = [];
	const invitation = record({
		id,
		organization: 'org',
		email: 'morgan@example.com',
		role: 'scorekeeper',
		status,
		expires_at: expiresAt
	});
	class Record {
		constructor(table) {
			this.table = table;
			this.values = {};
		}
		set(key, value) {
			this.values[key] = value;
		}
		getString(key) {
			return String(this.values[key] ?? '');
		}
	}
	const app = {
		findFirstRecordByFilter: (table, filter, params) => {
			lookups.push({ table, filter, params });
			if (table === 'memberships') {
				if (existingMember) return record({ role: 'viewer' });
				throw new Error('none');
			}
			if (
				(params.id === id && params.email === 'morgan@example.com') ||
				params.hash === 'hash:valid-token'
			)
				return invitation;
			throw new Error('not found');
		},
		findCollectionByNameOrId: (table) => table,
		save: (item) => writes.push(item),
		runInTransaction: (callback) => callback(app)
	};
	vm.runInNewContext(read('../pocketbase/pb_hooks/flihub.pb.js'), {
		routerAdd: (_method, path, callback) => {
			if (path === '/api/flihub/invitations/accept') handler = callback;
		},
		$apis: { requireAuth: () => true },
		$security: { sha256: (value) => 'hash:' + value },
		Record
	});
	return {
		writes,
		lookups,
		invoke: (body = { invitationId: id }) =>
			handler({
				auth: { id: 'morgan', getString: () => email, getBool: () => verified },
				app,
				requestInfo: () => ({ body }),
				json: (statusCode, data) => ({ status: statusCode, data })
			})
	};
}
test('ID acceptance grants only the stored organization role and records existing acceptance audit', () => {
	const fixture = acceptance();
	assert.equal(
		fixture.invoke({ invitationId: id, role: 'owner', organization: 'forged' }).status,
		200
	);
	assert.equal(fixture.writes[0].values.organization, 'org');
	assert.equal(fixture.writes[0].values.user, 'morgan');
	assert.equal(fixture.writes[0].values.role, 'scorekeeper');
	assert.equal(fixture.writes[2].values.action, 'invitation_accepted');
	assert.equal(fixture.lookups[0].params.email, 'morgan@example.com');
});
test('another email cannot accept or learn invitation status by guessing its ID', () => {
	const fixture = acceptance({ email: 'outsider@example.com' });
	assert.equal(fixture.invoke().status, 404);
	assert.equal(fixture.writes.length, 0);
});
for (const [options, expected] of [
	[{ verified: false }, 403],
	[{ status: 'accepted' }, 409],
	[{ status: 'revoked' }, 409],
	[{ expiresAt: '2000-01-01 00:00:00.000Z' }, 410],
	[{ expiresAt: 'invalid' }, 410],
	[{ existingMember: true }, 409]
]) {
	test(`ID acceptance refuses stale or unauthorized invitations ${JSON.stringify(options)}`, () => {
		const fixture = acceptance(options);
		assert.equal(fixture.invoke().status, expected);
		assert.equal(fixture.writes.length, 0);
	});
}
test('successful acceptance is single-use', () => {
	const fixture = acceptance();
	assert.equal(fixture.invoke().status, 200);
	const writes = fixture.writes.length;
	assert.equal(fixture.invoke().status, 409);
	assert.equal(fixture.writes.length, writes);
});
test('existing token acceptance remains supported', () => {
	assert.equal(acceptance().invoke({ token: 'valid-token' }).status, 200);
});
test('ambiguous or invalid references cannot reach acceptance lookup', () => {
	for (const body of [{ token: 'valid-token', invitationId: id }, { invitationId: 'bad' }, {}]) {
		const fixture = acceptance();
		assert.equal(fixture.invoke(body).status, 400);
		assert.equal(fixture.lookups.length, 0);
		assert.equal(fixture.writes.length, 0);
	}
});
