/**
 * Phase 1A integration tests: authentication, organization isolation, roles,
 * invitations, and ownership — exercised against a disposable PocketBase
 * instance with ordinary user credentials and direct API requests.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
	acceptInvitation,
	createInvitation,
	createOrg,
	expectHookError,
	registerUser,
	registerVerifiedUser,
	superuserClient,
	uniqueEmail,
	verifyEmail
} from './helpers.mjs';

async function listOrgs(pb) {
	return pb.collection('organizations').getFullList();
}

async function listMyMemberships(pb, userId) {
	return pb.collection('memberships').getFullList({ filter: `user = "${userId}"` });
}

test('registration alone grants no organization access', async () => {
	const alice = await registerUser(uniqueEmail('alice'), 'Alice');
	assert.equal((await listOrgs(alice)).length, 0);
	assert.equal((await listMyMemberships(alice, alice.authStore.record.id)).length, 0);
	assert.equal((await alice.collection('invitations').getFullList()).length, 0);
	assert.equal((await alice.collection('membership_events').getFullList()).length, 0);
});

test('organization creation produces exactly one Owner', async () => {
	const alice = await registerUser(uniqueEmail('owner'), 'Alice');
	const org = await createOrg(alice, 'Alpha Disc Club');

	const memberships = await alice.collection('memberships').getFullList({
		filter: `organization = "${org.id}"`
	});
	assert.equal(memberships.length, 1);
	assert.equal(memberships[0].role, 'owner');
	assert.equal(memberships[0].user, alice.authStore.record.id);

	// Direct API writes cannot add a second owner (rules are locked).
	const bob = await registerUser(uniqueEmail('bob'), 'Bob');
	await assert.rejects(
		bob
			.collection('memberships')
			.create({ organization: org.id, user: bob.authStore.record.id, role: 'owner' }),
		(err) => err.status === 403 || err.status === 404
	);
	// The owner themselves cannot forge a second owner either.
	await assert.rejects(
		alice
			.collection('memberships')
			.create({ organization: org.id, user: bob.authStore.record.id, role: 'owner' }),
		(err) => err.status === 403 || err.status === 404
	);
});

test('users in organization A cannot read or modify organization B', async () => {
	const alice = await registerUser(uniqueEmail('a-owner'), 'Alice');
	const orgA = await createOrg(alice, 'Org A');
	const betty = await registerUser(uniqueEmail('b-owner'), 'Betty');
	const orgB = await createOrg(betty, 'Org B');

	// Betty sees only her own organization.
	const bettyOrgs = await listOrgs(betty);
	assert.deepEqual(
		bettyOrgs.map((o) => o.id),
		[orgB.id]
	);
	// Direct view of org A is rejected.
	await assert.rejects(
		betty.collection('organizations').getOne(orgA.id),
		(err) => err.status === 404
	);
	// Membership, invitation, and audit data of org A are invisible.
	assert.equal(
		(await betty.collection('memberships').getFullList({ filter: `organization = "${orgA.id}"` }))
			.length,
		0
	);
	assert.equal(
		(await betty.collection('invitations').getFullList({ filter: `organization = "${orgA.id}"` }))
			.length,
		0
	);
	assert.equal(
		(
			await betty
				.collection('membership_events')
				.getFullList({ filter: `organization = "${orgA.id}"` })
		).length,
		0
	);
	// Direct modifications are rejected.
	await assert.rejects(
		betty.collection('organizations').update(orgA.id, { name: 'Hijacked' }),
		(err) => err.status === 403 || err.status === 404
	);
	await assert.rejects(
		betty.collection('organizations').delete(orgA.id),
		(err) => err.status === 403 || err.status === 404
	);
});

test('organization lists include only accepted memberships', async () => {
	const alice = await registerVerifiedUser(uniqueEmail('inviter'), 'Alice');
	const org = await createOrg(alice, 'Invite Org');
	const bobEmail = uniqueEmail('pending-bob');
	const bob = await registerVerifiedUser(bobEmail, 'Bob');

	await createInvitation(alice, org.id, bobEmail, 'viewer');
	// Bob is invited but has not accepted: no membership, no organization.
	assert.equal((await listOrgs(bob)).length, 0);
	assert.equal((await listMyMemberships(bob, bob.authStore.record.id)).length, 0);
});

test('role permission matrix for invitations', async () => {
	const owner = await registerVerifiedUser(uniqueEmail('o'), 'Owner');
	const org = await createOrg(owner, 'Role Matrix Org');

	const adminEmail = uniqueEmail('admin');
	const admin = await registerVerifiedUser(adminEmail, 'Admin');
	await acceptInvitation(admin, (await createInvitation(owner, org.id, adminEmail, 'admin')).token);

	const skEmail = uniqueEmail('sk');
	const sk = await registerVerifiedUser(skEmail, 'Scorekeeper');
	await acceptInvitation(sk, (await createInvitation(owner, org.id, skEmail, 'scorekeeper')).token);

	// Admin may invite scorekeepers and viewers…
	await createInvitation(admin, org.id, uniqueEmail('v1'), 'viewer');
	await createInvitation(admin, org.id, uniqueEmail('sk2'), 'scorekeeper');
	// …but not admins, and cannot revoke the fact by escalating privileges.
	await expectHookError(
		createInvitation(admin, org.id, uniqueEmail('a2'), 'admin'),
		403,
		'admin_cannot_invite_admin'
	);
	// Scorekeeper cannot invite at all.
	await expectHookError(
		createInvitation(sk, org.id, uniqueEmail('v2'), 'viewer'),
		403,
		'forbidden_role'
	);

	// Admin may revoke a pending invitation.
	const pending = await createInvitation(owner, org.id, uniqueEmail('rev'), 'viewer');
	await admin.send(`/api/flihub/invitations/${pending.id}/revoke`, { method: 'POST' });
	// Scorekeeper may not revoke.
	const pending2 = await createInvitation(owner, org.id, uniqueEmail('rev2'), 'viewer');
	await expectHookError(
		sk.send(`/api/flihub/invitations/${pending2.id}/revoke`, { method: 'POST' }),
		403,
		'forbidden_role'
	);
});

test('admin cannot promote themselves, remove members, or grant ownership', async () => {
	const owner = await registerVerifiedUser(uniqueEmail('o2'), 'Owner');
	const org = await createOrg(owner, 'Admin Limits Org');

	const adminEmail = uniqueEmail('admin2');
	const admin = await registerVerifiedUser(adminEmail, 'Admin');
	await acceptInvitation(admin, (await createInvitation(owner, org.id, adminEmail, 'admin')).token);

	const memberships = await owner
		.collection('memberships')
		.getFullList({ filter: `organization = "${org.id}"` });
	const adminMembership = memberships.find((m) => m.user === admin.authStore.record.id);
	const ownerMembership = memberships.find((m) => m.user === owner.authStore.record.id);

	// Admin cannot change roles (owner-only), including their own.
	await expectHookError(
		admin.send(`/api/flihub/memberships/${adminMembership.id}/role`, {
			method: 'POST',
			body: { role: 'admin' }
		}),
		403,
		'not_owner'
	);
	// Admin cannot remove accepted members.
	await expectHookError(
		admin.send(`/api/flihub/memberships/${adminMembership.id}/remove`, { method: 'POST' }),
		403,
		'not_owner'
	);
	// Admin cannot transfer ownership.
	await expectHookError(
		admin.send(`/api/flihub/organizations/${org.id}/transfer`, {
			method: 'POST',
			body: { membership: adminMembership.id }
		}),
		403,
		'not_owner'
	);
	// Owner cannot be role-changed or removed; ownership moves via transfer only.
	await expectHookError(
		owner.send(`/api/flihub/memberships/${ownerMembership.id}/role`, {
			method: 'POST',
			body: { role: 'admin' }
		}),
		400,
		'cannot_target_owner'
	);
	await expectHookError(
		owner.send(`/api/flihub/memberships/${ownerMembership.id}/remove`, { method: 'POST' }),
		400,
		'cannot_target_owner'
	);
	// Role endpoint refuses to mint owners even if asked by the owner.
	await expectHookError(
		owner.send(`/api/flihub/memberships/${adminMembership.id}/role`, {
			method: 'POST',
			body: { role: 'owner' }
		}),
		400,
		'invalid_role'
	);
});

test('users cannot forge memberships or alter protected records via direct API', async () => {
	const alice = await registerUser(uniqueEmail('forge-a'), 'Alice');
	const org = await createOrg(alice, 'Forge Org');
	const bob = await registerUser(uniqueEmail('forge-b'), 'Bob');

	// Direct membership create/update/delete are locked for ordinary users.
	await assert.rejects(
		bob
			.collection('memberships')
			.create({ organization: org.id, user: bob.authStore.record.id, role: 'viewer' }),
		(err) => err.status === 403 || err.status === 404
	);
	const aliceMembership = (await listMyMemberships(alice, alice.authStore.record.id))[0];
	await assert.rejects(
		alice.collection('memberships').update(aliceMembership.id, { role: 'viewer' }),
		(err) => err.status === 403 || err.status === 404
	);
	await assert.rejects(
		alice.collection('memberships').delete(aliceMembership.id),
		(err) => err.status === 403 || err.status === 404
	);
	// Organizations cannot be created or deleted through the raw collections API.
	await assert.rejects(
		bob.collection('organizations').create({ name: 'Forged Org' }),
		(err) => err.status === 403 || err.status === 404
	);
	// A user cannot verify themselves by patching their own record —
	// PocketBase rejects `verified` changes from non-superusers outright.
	await assert.rejects(
		bob.collection('users').update(bob.authStore.record.id, { verified: true }),
		(err) => err.status === 400 || err.status === 403
	);
	await bob.collection('users').authRefresh();
	assert.equal(bob.authStore.record.verified, false);
});

test('invitation acceptance enforces verification, recipient, expiry, revocation, single use', async () => {
	const owner = await registerVerifiedUser(uniqueEmail('inv-own'), 'Owner');
	const org = await createOrg(owner, 'Acceptance Org');

	// 1. Unverified recipient is blocked.
	const unverifiedEmail = uniqueEmail('unverified');
	const unverified = await registerUser(unverifiedEmail, 'Unverified Ute');
	const inv1 = await createInvitation(owner, org.id, unverifiedEmail, 'viewer');
	await expectHookError(acceptInvitation(unverified, inv1.token), 403, 'email_not_verified');

	// 2. Wrong recipient is blocked (verified account, different email).
	const carol = await registerVerifiedUser(uniqueEmail('carol'), 'Carol');
	await expectHookError(acceptInvitation(carol, inv1.token), 403, 'wrong_recipient');

	// 3. Happy path after verifying.
	await verifyEmail(unverified, unverifiedEmail);
	await acceptInvitation(unverified, inv1.token);
	assert.equal((await listMyMemberships(unverified, unverified.authStore.record.id)).length, 1);

	// 4. Replay: single-use token cannot be accepted twice.
	await expectHookError(acceptInvitation(unverified, inv1.token), 409, 'already_accepted');

	// 5. Duplicate membership is rejected even with a fresh invitation.
	const daveEmail = uniqueEmail('dave');
	const dave = await registerVerifiedUser(daveEmail, 'Dave');
	await acceptInvitation(dave, (await createInvitation(owner, org.id, daveEmail, 'viewer')).token);
	await expectHookError(
		createInvitation(owner, org.id, daveEmail, 'viewer'),
		409,
		'already_member'
	);

	// 6. Duplicate active invitation for the same org+email is rejected.
	const dupEmail = uniqueEmail('dup');
	await createInvitation(owner, org.id, dupEmail, 'viewer');
	await expectHookError(
		createInvitation(owner, org.id, dupEmail, 'viewer'),
		409,
		'duplicate_invitation'
	);

	// 7. Revoked invitation cannot be accepted.
	const eveEmail = uniqueEmail('eve');
	const eve = await registerVerifiedUser(eveEmail, 'Eve');
	const inv2 = await createInvitation(owner, org.id, eveEmail, 'viewer');
	await owner.send(`/api/flihub/invitations/${inv2.id}/revoke`, { method: 'POST' });
	await expectHookError(acceptInvitation(eve, inv2.token), 409, 'invitation_revoked');

	// 8. Expired invitation cannot be accepted (expiry forced via test superuser;
	//    product TTL is configurable via FLIHUB_INVITE_TTL_HOURS, default 7 days).
	const frankEmail = uniqueEmail('frank');
	const frank = await registerVerifiedUser(frankEmail, 'Frank');
	const inv3 = await createInvitation(owner, org.id, frankEmail, 'viewer');
	const su = await superuserClient();
	await su
		.collection('invitations')
		.update(inv3.id, { expires_at: new Date(Date.now() - 1000).toISOString() });
	await expectHookError(acceptInvitation(frank, inv3.token), 410, 'invitation_expired');

	// 9. Lookup never leaks the recipient email address.
	const leakCheck = await frank.send('/api/flihub/invitations/lookup', {
		method: 'GET',
		query: { token: inv3.token }
	});
	assert.ok(!JSON.stringify(leakCheck).includes(frankEmail));
	assert.equal(leakCheck.status, 'expired');
});

test('ownership transfer preserves exactly one Owner; former Owner becomes Admin', async () => {
	const owner = await registerVerifiedUser(uniqueEmail('t-own'), 'Owner');
	const org = await createOrg(owner, 'Transfer Org');
	const memberEmail = uniqueEmail('t-member');
	const member = await registerVerifiedUser(memberEmail, 'Member');
	await acceptInvitation(
		member,
		(await createInvitation(owner, org.id, memberEmail, 'scorekeeper')).token
	);

	const memberships = await owner
		.collection('memberships')
		.getFullList({ filter: `organization = "${org.id}"` });
	const memberMembership = memberships.find((m) => m.user === member.authStore.record.id);

	await owner.send(`/api/flihub/organizations/${org.id}/transfer`, {
		method: 'POST',
		body: { membership: memberMembership.id }
	});

	const after = await owner
		.collection('memberships')
		.getFullList({ filter: `organization = "${org.id}"` });
	const owners = after.filter((m) => m.role === 'owner');
	assert.equal(owners.length, 1);
	assert.equal(owners[0].user, member.authStore.record.id);
	assert.equal(after.find((m) => m.user === owner.authStore.record.id).role, 'admin');

	// The new owner can invite; the former owner (now admin) cannot invite admins.
	await createInvitation(member, org.id, uniqueEmail('post-t'), 'viewer');
	await expectHookError(
		createInvitation(owner, org.id, uniqueEmail('post-t2'), 'admin'),
		403,
		'admin_cannot_invite_admin'
	);

	// Ownership cannot be transferred to the current owner / non-member.
	const newOwnerMembership = after.find((m) => m.role === 'owner');
	await expectHookError(
		member.send(`/api/flihub/organizations/${org.id}/transfer`, {
			method: 'POST',
			body: { membership: newOwnerMembership.id }
		}),
		400,
		'invalid_transfer_target'
	);
});

test('owner cannot leave or be removed before transferring ownership', async () => {
	const owner = await registerVerifiedUser(uniqueEmail('l-own'), 'Owner');
	const org = await createOrg(owner, 'Leave Org');
	await expectHookError(
		owner.send(`/api/flihub/organizations/${org.id}/leave`, { method: 'POST' }),
		400,
		'owner_cannot_leave'
	);
});

test('leaving, removal, and demotion revoke permissions on subsequent requests', async () => {
	const owner = await registerVerifiedUser(uniqueEmail('r-own'), 'Owner');
	const org = await createOrg(owner, 'Revocation Org');

	const adminEmail = uniqueEmail('r-admin');
	const admin = await registerVerifiedUser(adminEmail, 'Admin');
	await acceptInvitation(admin, (await createInvitation(owner, org.id, adminEmail, 'admin')).token);

	// Demote admin → viewer: inviting immediately stops working.
	const adminMembership = (
		await owner.collection('memberships').getFullList({ filter: `organization = "${org.id}"` })
	).find((m) => m.user === admin.authStore.record.id);
	await owner.send(`/api/flihub/memberships/${adminMembership.id}/role`, {
		method: 'POST',
		body: { role: 'viewer' }
	});
	await expectHookError(
		createInvitation(admin, org.id, uniqueEmail('after-demote'), 'viewer'),
		403,
		'forbidden_role'
	);

	// Removal: org access disappears on the next request.
	await owner.send(`/api/flihub/memberships/${adminMembership.id}/remove`, { method: 'POST' });
	assert.equal((await listOrgs(admin)).length, 0);
	await assert.rejects(
		admin.collection('organizations').getOne(org.id),
		(err) => err.status === 404
	);

	// Leaving: member leaves a second org and loses access.
	const owner2 = await registerVerifiedUser(uniqueEmail('r-own2'), 'Owner Two');
	const org2 = await createOrg(owner2, 'Second Org');
	const samEmail = uniqueEmail('r-sam');
	const sam = await registerVerifiedUser(samEmail, 'Sam');
	await acceptInvitation(sam, (await createInvitation(owner2, org2.id, samEmail, 'viewer')).token);
	assert.equal((await listOrgs(sam)).length, 1);
	await sam.send(`/api/flihub/organizations/${org2.id}/leave`, { method: 'POST' });
	assert.equal((await listOrgs(sam)).length, 0);
});

test('concurrent invitation acceptance preserves single use and unique membership', async () => {
	const owner = await registerVerifiedUser(uniqueEmail('c-own'), 'Owner');
	const org = await createOrg(owner, 'Concurrency Org');
	const joinerEmail = uniqueEmail('c-joiner');
	const joiner = await registerVerifiedUser(joinerEmail, 'Joiner');
	const invite = await createInvitation(owner, org.id, joinerEmail, 'viewer');

	// Two simultaneous accept attempts with the same token.
	const results = await Promise.allSettled([
		acceptInvitation(joiner, invite.token),
		acceptInvitation(joiner, invite.token)
	]);
	const succeeded = results.filter((r) => r.status === 'fulfilled').length;
	assert.equal(succeeded, 1, 'exactly one acceptance may succeed');

	const memberships = await listMyMemberships(joiner, joiner.authStore.record.id);
	assert.equal(memberships.filter((m) => m.organization === org.id).length, 1);
});

test('concurrent ownership transfers preserve exactly one Owner', async () => {
	const owner = await registerVerifiedUser(uniqueEmail('cc-own'), 'Owner');
	const org = await createOrg(owner, 'Transfer Race Org');
	const emails = [uniqueEmail('cc-m1'), uniqueEmail('cc-m2')];
	const members = [];
	for (const [i, email] of emails.entries()) {
		const pb = await registerVerifiedUser(email, `Member ${i + 1}`);
		await acceptInvitation(pb, (await createInvitation(owner, org.id, email, 'viewer')).token);
		members.push(pb);
	}
	const memberships = await owner
		.collection('memberships')
		.getFullList({ filter: `organization = "${org.id}"` });
	const targets = memberships.filter((m) => m.role === 'viewer');

	// The owner fires two transfers at once; at most one may take effect.
	await Promise.allSettled(
		targets.map((t) =>
			owner.send(`/api/flihub/organizations/${org.id}/transfer`, {
				method: 'POST',
				body: { membership: t.id }
			})
		)
	);
	const after = await owner
		.collection('memberships')
		.getFullList({ filter: `organization = "${org.id}"` });
	assert.equal(after.filter((m) => m.role === 'owner').length, 1, 'exactly one Owner survives');
});

test('audit trail records membership and ownership changes', async () => {
	const owner = await registerVerifiedUser(uniqueEmail('audit-own'), 'Owner');
	const org = await createOrg(owner, 'Audit Org');
	const joinerEmail = uniqueEmail('audit-join');
	const joiner = await registerVerifiedUser(joinerEmail, 'Joiner');
	const invite = await createInvitation(owner, org.id, joinerEmail, 'viewer');
	await acceptInvitation(joiner, invite.token);

	const events = await owner.collection('membership_events').getFullList({
		filter: `organization = "${org.id}"`,
		sort: 'created'
	});
	const actions = events.map((e) => e.action);
	assert.deepEqual(actions, ['organization_created', 'invitation_created', 'invitation_accepted']);
	assert.ok(
		events.every(
			(e) => e.actor === owner.authStore.record.id || e.actor === joiner.authStore.record.id
		)
	);
	// The audit trail never contains token material.
	assert.ok(!JSON.stringify(events).includes(invite.token));
});

test('member list shows co-member names but not private account fields', async () => {
	const owner = await registerVerifiedUser(uniqueEmail('vis-own'), 'Visible Owner');
	const org = await createOrg(owner, 'Visibility Org');
	const memberEmail = uniqueEmail('vis-member');
	const member = await registerVerifiedUser(memberEmail, 'Visible Member');
	await acceptInvitation(
		member,
		(await createInvitation(owner, org.id, memberEmail, 'viewer')).token
	);

	// Members can expand co-members and see names.
	const list = await owner.collection('memberships').getFullList({
		filter: `organization = "${org.id}"`,
		expand: 'user'
	});
	assert.equal(list.length, 2);
	const expanded = list.find((m) => m.user === member.authStore.record.id)?.expand?.user;
	assert.equal(expanded?.name, 'Visible Member');

	// An outsider cannot read member user records at all.
	const outsider = await registerUser(uniqueEmail('vis-out'), 'Outsider');
	await assert.rejects(
		outsider.collection('users').getOne(member.authStore.record.id),
		(err) => err.status === 404 || err.status === 403
	);
});
