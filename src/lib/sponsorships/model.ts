export const sponsorStages = [
	{ value: 'prospect', label: 'Prospect' },
	{ value: 'in-discussion', label: 'In discussion' },
	{ value: 'proposal-sent', label: 'Proposal sent' },
	{ value: 'signed', label: 'Signed' },
	{ value: 'closed', label: 'Closed' }
] as const;

export interface Sponsor {
	id: string;
	name: string;
	contactName: string;
	contactEmail: string;
	stage: string;
	followUpOn: string;
	nextAction: string;
	notes: string;
	archived: boolean;
}
