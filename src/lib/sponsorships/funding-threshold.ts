import type { SponsorshipAgreement } from './model';

export interface FundingConditionTerms {
	targetCents: number;
	percentage: number;
	currency: string;
	deadline: string;
	selectedIds: string[];
}

export interface SponsorshipFundingCondition extends FundingConditionTerms {
	agreement: string;
	releasedAt: string;
	releasedBy: string;
	releasedByName: string;
	releasedCommittedCents: number;
}

export function parseFundingTarget(value: string): number | null {
	const amount = /^(\d{1,9}|\d{1,3}(?:,\d{3}){1,2})(?:\.(\d{1,2}))?$/.exec(value.trim());
	if (!amount) return null;
	const cents = Number(amount[1].replaceAll(',', '')) * 100 + Number((amount[2] ?? '').padEnd(2, '0'));
	return cents > 0 ? cents : null;
}

export function previewFundingThreshold(input: FundingConditionTerms & {
	asOf: string;
	agreements: SponsorshipAgreement[];
}) {
	const cutoff = input.asOf < input.deadline ? input.asOf : input.deadline;
	const selected = new Set(input.selectedIds);
	const qualifying = input.agreements.filter((agreement) =>
		selected.has(agreement.id) && agreement.currency === input.currency &&
		Boolean(agreement.signedOn) && agreement.signedOn <= cutoff
	);
	const committedCents = qualifying.reduce((total, agreement) => total + agreement.amountCents, 0);
	const requiredCents = Math.ceil(input.targetCents * input.percentage / 100);
	const remainingCents = Math.max(requiredCents - committedCents, 0);
	const status = remainingCents === 0 ? 'Met' : input.asOf > input.deadline ? 'Expired' : 'Pending';
	return { requiredCents, committedCents, remainingCents, status };
}
