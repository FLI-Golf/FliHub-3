/**
 * Organization-specific presentation metadata.
 *
 * This module does not grant permissions or activate capabilities.
 * PocketBase remains authoritative for organization configuration.
 */

export interface OrganizationProfileDefinition {
	id: string;
	label: string;
	description: string;
	participationModel: string;
	terminology: {
		athlete: string;
		athletes: string;
	};
	plannedWorkflows: {
		id: string;
		label: string;
		phase: string;
	}[];
}

export const charityRunWalkProfile: OrganizationProfileDefinition = {
	id: 'charity-run-walk',
	label: 'Charity run / walk organization',
	description:
		'Organize community participation and fundraising events without competitive scoring.',
	participationModel: 'Noncompetitive',
	terminology: {
		athlete: 'Participant',
		athletes: 'Participants'
	},
	plannedWorkflows: [
		{ id: 'participants', label: 'Participants', phase: 'CE-3' },
		{ id: 'events', label: 'Events & registrations', phase: 'CE-4' },
		{ id: 'routes-distances', label: 'Routes & distances', phase: 'CE-4' },
		{ id: 'sponsorships', label: 'Sponsorships', phase: 'CE-5' },
		{ id: 'reimbursements', label: 'Reimbursements & expenses', phase: 'CE-5' },
		{ id: 'donations-pledges', label: 'Donations & pledges', phase: 'CE-6' }
	]
};

export function getOrganizationProfile(id: string): OrganizationProfileDefinition | null {
	return id === charityRunWalkProfile.id ? charityRunWalkProfile : null;
}

/** Presentation only; never grants capability access or permissions. */
export function getParticipantTerminology(profile: string) {
	const definition = getOrganizationProfile(profile);
	const singular = definition?.terminology.athlete ?? 'Athlete';
	const plural = definition?.terminology.athletes ?? 'Athletes';

	return {
		singular,
		plural,
		singularLower: singular.toLowerCase(),
		pluralLower: plural.toLowerCase(),
		indefinite: profile === 'charity-run-walk' ? 'a participant' : 'an athlete',
		isCharity: profile === 'charity-run-walk'
	};
}
