import test from 'node:test';
import assert from 'node:assert/strict';
import {
	registerVerifiedUser,
	registerUser,
	verifyEmail,
	uniqueEmail,
	createOrg,
	createInvitation,
	acceptInvitation,
	superuserClient,
	newClient
} from './helpers.mjs';
const pending = (pb, query = {}) =>
	pb.send('/api/flihub/invitations/pending', { method: 'GET', query });
const acceptId = (pb, invitationId) =>
	pb.send('/api/flihub/invitations/accept', { method: 'POST', body: { invitationId } });

test('verified recipient discovers only their invitations without getting organization access or secret material', async () => {
	const owner = await registerVerifiedUser(uniqueEmail('notify-owner'), 'Owner');
	const org = await createOrg(owner, 'Notification Test');
	const email = uniqueEmail('notify-morgan');
	const recipient = await registerVerifiedUser(email, 'Morgan');
	const outsider = await registerVerifiedUser(uniqueEmail('notify-other'), 'Other');
	const invitation = await createInvitation(owner, org.id, email, 'scorekeeper');
	await assert.rejects(pending(newClient()), (err) => err.status === 401);
	assert.equal((await pending(outsider, { email })).items.length, 0);
	const inbox = await pending(recipient);
	assert.equal(inbox.items.length, 1);
	assert.equal(inbox.items[0].invitationId, invitation.id);
	assert.equal(inbox.items[0].organizationName, 'Notification Test');
	assert.equal(inbox.items[0].role, 'scorekeeper');
	assert.deepEqual(Object.keys(inbox.items[0]).sort(), [
		'expiresAt',
		'invitationId',
		'organizationName',
		'role'
	]);
	assert.ok(!JSON.stringify(inbox).includes(invitation.token));
	await assert.rejects(
		recipient.collection('organizations').getOne(org.id),
		(err) => err.status === 404
	);
	await assert.rejects(acceptId(outsider, invitation.id), (err) => err.status === 404);
	const result = await acceptId(recipient, invitation.id);
	assert.equal(result.organization, org.id);
	const memberships = await recipient
		.collection('memberships')
		.getFullList({
			filter: recipient.filter('organization = {:org} && user = {:user}', {
				org: org.id,
				user: recipient.authStore.record.id
			})
		});
	assert.equal(memberships.length, 1);
	assert.equal(memberships[0].role, 'scorekeeper');
	assert.equal((await pending(recipient)).items.length, 0);
	await assert.rejects(acceptInvitation(recipient, invitation.token), (err) => err.status === 409);
});
test('revoked and expired invitations vanish from the inbox and cannot be accepted by ID', async () => {
	const owner = await registerVerifiedUser(uniqueEmail('notify-stale-owner'), 'Owner');
	const org = await createOrg(owner, 'Stale Invitations');
	const email = uniqueEmail('notify-stale');
	const recipient = await registerVerifiedUser(email, 'Recipient');
	const revoked = await createInvitation(owner, org.id, email, 'viewer');
	await owner.send(`/api/flihub/invitations/${revoked.id}/revoke`, { method: 'POST' });
	const expired = await createInvitation(owner, org.id, email, 'viewer');
	const su = await superuserClient();
	await su
		.collection('invitations')
		.update(expired.id, { expires_at: new Date(Date.now() - 1000).toISOString() });
	assert.equal((await pending(recipient)).items.length, 0);
	await assert.rejects(acceptId(recipient, revoked.id), (err) => err.status === 409);
	await assert.rejects(acceptId(recipient, expired.id), (err) => err.status === 410);
});
test('email verification is required before metadata listing and ID acceptance', async () => {
	const owner = await registerVerifiedUser(uniqueEmail('notify-verify-owner'), 'Owner');
	const org = await createOrg(owner, 'Verification Gate');
	const email = uniqueEmail('notify-verify');
	const recipient = await registerUser(email, 'Recipient');
	const invitation = await createInvitation(owner, org.id, email, 'viewer');
	await assert.rejects(pending(recipient), (err) => err.status === 403);
	await assert.rejects(acceptId(recipient, invitation.id), (err) => err.status === 403);
	await verifyEmail(recipient, email);
	assert.equal((await pending(recipient)).items.length, 1);
	await acceptId(recipient, invitation.id);
});
test('concurrent ID acceptance remains single-use', async () => {
	const owner = await registerVerifiedUser(uniqueEmail('notify-race-owner'), 'Owner');
	const org = await createOrg(owner, 'Concurrent Invitations');
	const email = uniqueEmail('notify-race');
	const recipient = await registerVerifiedUser(email, 'Recipient');
	const invitation = await createInvitation(owner, org.id, email, 'viewer');
	recipient.autoCancellation(false);
	const results = await Promise.allSettled([
		acceptId(recipient, invitation.id),
		acceptId(recipient, invitation.id)
	]);
	assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
	assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
	const memberships = await recipient
		.collection('memberships')
		.getFullList({
			filter: recipient.filter('organization = {:org} && user = {:user}', {
				org: org.id,
				user: recipient.authStore.record.id
			})
		});
	assert.equal(memberships.length, 1);
});
