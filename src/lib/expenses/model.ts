export const expenseStatuses = {
	submitted: 'Submitted',
	approved: 'Approved',
	returned: 'Returned'
};

export interface Expense {
	id: string;
	expenseOn: string;
	vendor: string;
	category: string;
	purpose: string;
	amountCents: number;
	hasReceipt: boolean;
	status: keyof typeof expenseStatuses;
	reviewNote: string;
	returnHistory: { decision: 'returned'; note: string; reviewedAt: string; reviewer: string }[];
	submitter: string;
	submitterName: string;
}
