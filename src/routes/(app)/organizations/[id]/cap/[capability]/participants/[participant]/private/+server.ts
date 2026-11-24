import { error, json } from '@sveltejs/kit';
import { pbErrorStatus, toOrganizationDTO } from '$lib/server/auth';
import type { RequestHandler } from './$types';

const idPattern = /^[a-z0-9]{15}$/;

export const GET: RequestHandler = async ({ locals, params, setHeaders }) => {
	setHeaders({
		'cache-control': 'private, no-store',
		'x-content-type-options': 'nosniff'
	});

	const { pb, user } = locals;

	if (
		!pb ||
		!user ||
		params.capability !== 'athletes' ||
		!idPattern.test(params.id) ||
		!idPattern.test(params.participant)
	) {
		error(404, 'Participant not found.');
	}

	const memberships = await pb.collection('memberships').getFullList({
		filter: pb.filter('organization = {:org} && user = {:user}', {
			org: params.id,
			user: user.id
		})
	});

	const membership = memberships[0];

	if (!membership) {
		error(404, 'Participant not found.');
	}

	if (membership.role !== 'owner' && membership.role !== 'admin') {
		error(403, 'Participant management requires Owner or Admin access.');
	}

	const organization = toOrganizationDTO(await pb.collection('organizations').getOne(params.id));

	if (
		organization.profile !== 'charity-run-walk' ||
		!organization.capabilities.includes('athletes')
	) {
		error(404, 'Participant management is not available.');
	}

	const participant = await pb
		.collection('athletes')
		.getOne(params.participant)
		.catch((err) => {
			if (pbErrorStatus(err) === 404 || pbErrorStatus(err) === 403) {
				error(404, 'Participant not found.');
			}
			error(502, 'Unable to load participant.');
		});

	if (participant.organization !== params.id) {
		error(404, 'Participant not found.');
	}

	const records = await pb.collection('athlete_private').getFullList({
		filter: pb.filter('organization = {:org} && athlete = {:athlete}', {
			org: params.id,
			athlete: params.participant
		}),
		fields: 'email,phone,eligibilityNotes'
	});

	if (records.length > 1) {
		error(500, 'Participant private record integrity error.');
	}

	const contact = records[0];

	return json({
		email: String(contact?.email ?? ''),
		phone: String(contact?.phone ?? ''),
		eligibilityNotes: String(contact?.eligibilityNotes ?? '')
	});
};
