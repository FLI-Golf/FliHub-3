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

export interface SponsorshipAgreement {
	quote?: string;
	id: string;
	sponsor: string;
	title: string;
	coverage: string;
	coverageLabel: string;
	amountCents: number;
	currency: string;
	signedOn: string;
	dueOn: string;
	benefits: string;
}

export interface SponsorshipQuote {
	id: string;
	sponsor: string;
	packageName: string;
	currency: string;
	amountCents: number;
	benefits: { id: string; name: string; amountCents: number; required: boolean }[];
}

export interface SponsorshipFundingEntry {
	reversal?: { reason: string; recordedByName: string; recordedBy: string; created: string };
	id: string;
	agreement: string;
	kind: 'installment' | 'payment';
	amountCents: number;
	entryDate: string;
	method: string;
	reference: string;
}
