import test from 'node:test';
import assert from 'node:assert/strict';
import {
	registerVerifiedUser,
	uniqueEmail,
	createInvitation,
	acceptInvitation,
	newClient
} from './helpers.mjs';

const setup = (pb, id, body) =>
	pb.send(`/api/flihub/organizations/${id}/league-season-setup`, { method: 'POST', body });
const input = {
	mode: 'new',
	leagueName: 'Coastal League',
	seasonName: 'Spring 2027',
	startsOn: '2027-03-01',
	endsOn: '2027-05-31',
	purseAmount: '100.01'
};
async function fixture() {
	const owner = await registerVerifiedUser(uniqueEmail('combined'), 'Setup Owner');
	const org = await owner.send('/api/flihub/organizations', {
		method: 'POST',
		body: { name: 'Combined Setup Org', template: 'custom', capabilities: ['leagues-seasons'] }
	});
	return { owner, org };
}
async function count(pb, table, orgId) {
	return (
		await pb
			.collection(table)
			.getList(1, 1, { filter: pb.filter('organization = {:org}', { org: orgId }) })
	).totalItems;
}
test('real setup creates linked records once, with planned season, exact cents, and no fantasy enrollment', async () => {
	const { owner, org } = await fixture();
	const result = await setup(owner, org.id, input);
	const league = await owner.collection('leagues').getOne(result.leagueId);
	const season = await owner.collection('seasons').getOne(result.seasonId);
	assert.equal(league.organization, org.id);
	assert.equal(season.organization, org.id);
	assert.equal(season.league, league.id);
	assert.equal(season.status, 'planned');
	assert.equal(season.startsOn.slice(0, 10), '2027-03-01');
	assert.equal(season.purseAmountCents, 10001);
	assert.equal(season.fantasyEnabled, false);
	await assert.rejects(setup(owner, org.id, input));
	assert.equal(await count(owner, 'leagues', org.id), 1);
	assert.equal(await count(owner, 'seasons', org.id), 1);
	await setup(owner, org.id, {
		...input,
		mode: 'existing',
		leagueId: league.id,
		seasonName: 'Summer 2027',
		startsOn: '',
		endsOn: '',
		purseAmount: ''
	});
	assert.equal(await count(owner, 'leagues', org.id), 1);
	assert.equal(await count(owner, 'seasons', org.id), 2);
});
test('invalid season input creates neither a league nor a season', async () => {
	const { owner, org } = await fixture();
	for (const invalid of [
		{ seasonName: '' },
		{ startsOn: '2027-02-30' },
		{ endsOn: '2026-01-01' },
		{ purseAmount: '-1' }
	]) {
		await assert.rejects(
			setup(owner, org.id, { ...input, ...invalid }),
			(err) => err.status === 400
		);
	}
	assert.equal(await count(owner, 'leagues', org.id), 0);
	assert.equal(await count(owner, 'seasons', org.id), 0);
});
test('backend rejects disabled capability and foreign or archived existing league', async () => {
	const { owner, org } = await fixture();
	const other = await owner.send('/api/flihub/organizations', {
		method: 'POST',
		body: { name: 'Other Setup Org', template: 'custom', capabilities: ['leagues-seasons'] }
	});
	const foreign = await owner
		.collection('leagues')
		.create({ organization: other.id, name: 'Other League', status: 'active' });
	await assert.rejects(
		setup(owner, org.id, { ...input, mode: 'existing', leagueId: foreign.id }),
		(err) => err.status === 400
	);
	const archived = await owner
		.collection('leagues')
		.create({ organization: org.id, name: 'Archived League', status: 'archived' });
	await assert.rejects(
		setup(owner, org.id, { ...input, mode: 'existing', leagueId: archived.id }),
		(err) => err.status === 400
	);
	await owner.send(`/api/flihub/organizations/${org.id}/configure`, {
		method: 'POST',
		body: { capabilities: [] }
	});
	await assert.rejects(setup(owner, org.id, input), (err) => err.status === 400);
	assert.equal(await count(owner, 'seasons', org.id), 0);
});
test('Owner/Admin can set up; Scorekeeper, Viewer, and outsider cannot', async () => {
	const { owner, org } = await fixture();
	await assert.rejects(setup(newClient(), org.id, input), (err) => err.status === 401);
	for (const role of ['admin', 'scorekeeper', 'viewer']) {
		const email = uniqueEmail('setup-' + role);
		const member = await registerVerifiedUser(email, role);
		const invitation = await createInvitation(owner, org.id, email, role);
		await acceptInvitation(member, invitation.token);
		if (role === 'admin') {
			await setup(member, org.id, { ...input, leagueName: 'Admin league' });
		} else {
			await assert.rejects(
				setup(member, org.id, { ...input, leagueName: role + ' league' }),
				(err) => err.status === 403
			);
		}
	}
	const outsider = await registerVerifiedUser(uniqueEmail('setup-outsider'), 'Outsider');
	await assert.rejects(setup(outsider, org.id, input), (err) => err.status === 404);
	assert.equal(await count(owner, 'leagues', org.id), 1);
	assert.equal(await count(owner, 'seasons', org.id), 1);
});
