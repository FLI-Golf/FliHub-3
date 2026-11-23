import type { SponsorshipFundingCondition } from './funding-threshold';
import type { SponsorshipAgreement, SponsorshipFundingEntry } from './model';

interface FundingTotals {
	committed: number;
	scheduled: number;
	received: number;
	outstanding: number;
	dueNow: number;
	overdue: number;
}

const emptyTotals = (): FundingTotals => ({
	committed: 0,
	scheduled: 0,
	received: 0,
	outstanding: 0,
	dueNow: 0,
	overdue: 0
});

export function summarizeAgreementFunding(
	entries: SponsorshipFundingEntry[],
	condition: SponsorshipFundingCondition | undefined,
	asOf: string
) {
	const installments = entries
		.filter((entry) => entry.kind === 'installment')
		.sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.id.localeCompare(b.id));
	const payments = entries.filter((entry) => entry.kind === 'payment');
	const scheduled = installments.reduce((sum, entry) => sum + entry.amountCents, 0);
	const received = payments.reduce(
		(sum, entry) => sum + (entry.reversal ? 0 : entry.amountCents),
		0
	);

	const due = new Map<string, { status: 'Due now' | 'Overdue'; amount: number }>();
	let available = received;
	let dueNow = 0;
	let overdue = 0;
	if (!condition || condition.releasedAt) {
		for (const installment of installments) {
			if (installment.entryDate > asOf) break;
			const amount = Math.max(installment.amountCents - available, 0);
			available = Math.max(available - installment.amountCents, 0);
			if (!amount) continue;

			const status = installment.entryDate === asOf ? 'Due now' : 'Overdue';
			due.set(installment.id, { status, amount });
			if (status === 'Due now') dueNow += amount;
			else overdue += amount;
		}
	}
	return { installments, payments, scheduled, received, due, dueNow, overdue };
}

export const paymentStatuses = [
	['', 'All payment statuses'],
	['unpaid', 'Unpaid'],
	['partial', 'Partially paid'],
	['paid', 'Paid in full'],
	['overpaid', 'Overpaid'],
	['held', 'Installments held'],
	['due', 'Due now'],
	['overdue', 'Overdue']
] as const;

export type FundingPaymentStatus = (typeof paymentStatuses)[number][0];

function matchesPaymentStatus(
	status: FundingPaymentStatus,
	committed: number,
	balance: ReturnType<typeof summarizeAgreementFunding>,
	held: boolean
) {
	switch (status) {
		case 'unpaid':
			return balance.received === 0 && committed > 0;
		case 'partial':
			return balance.received > 0 && balance.received < committed;
		case 'paid':
			return balance.received === committed;
		case 'overpaid':
			return balance.received > committed;
		case 'held':
			return held && balance.scheduled > balance.received;
		case 'due':
			return balance.dueNow > 0;
		case 'overdue':
			return balance.overdue > 0;
		default:
			return true;
	}
}

export function summarizeSponsorshipFunding(
	agreements: SponsorshipAgreement[],
	entries: SponsorshipFundingEntry[],
	conditions: ReadonlyMap<string, SponsorshipFundingCondition>,
	asOf: string,
	status: FundingPaymentStatus = ''
) {
	const entriesByAgreement = Map.groupBy(entries, (entry) => entry.agreement);
	const currencies = new Map<string, FundingTotals>();
	for (const agreement of agreements) {
		const condition = conditions.get(agreement.id);
		const balance = summarizeAgreementFunding(
			entriesByAgreement.get(agreement.id) ?? [],
			condition,
			asOf
		);
		if (
			!matchesPaymentStatus(
				status,
				agreement.amountCents,
				balance,
				Boolean(condition && !condition.releasedAt)
			)
		)
			continue;
		const total = currencies.get(agreement.currency) ?? emptyTotals();
		total.committed += agreement.amountCents;
		total.scheduled += balance.scheduled;
		total.received += balance.received;
		total.outstanding += Math.max(agreement.amountCents - balance.received, 0);
		total.dueNow += balance.dueNow;
		total.overdue += balance.overdue;
		currencies.set(agreement.currency, total);
	}

	return Array.from(currencies, ([currency, totals]) => ({ currency, ...totals })).sort((a, b) =>
		a.currency.localeCompare(b.currency)
	);
}
