import { fail } from '@sveltejs/kit';
import { pbErrorMessage, pbErrorStatus } from '$lib/server/auth';

type ExpenseActionEvent = {
	locals: App.Locals;
	params: { id: string; capability: string };
	request: Request;
};

const idPattern = /^[a-z0-9]{15}$/;

export async function submitExpense({
	locals,
	params,
	request
}: ExpenseActionEvent) {
	const { pb, user } = locals;
	if (!pb || !user)
		return fail(401, { expenseError: 'Sign in to submit an expense.' });
	if (params.capability !== 'reimbursements' || !idPattern.test(params.id))
		return fail(404, { expenseError: 'Expenses page not found.' });

	const form = await request.formData();
	const read = (key: string) => String(form.get(key) ?? '').trim();
	const values = {
		expenseOn: read('expenseOn'),
		vendor: read('vendor'),
		category: read('category'),
		purpose: read('purpose'),
		amount: read('amount')
	};
	const invalid = (expenseError: string) =>
		fail(400, { expenseError, expenseValues: values });

	const date = new Date(values.expenseOn + 'T00:00:00Z');
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(values.expenseOn) ||
		!Number.isFinite(date.getTime()) ||
		date.toISOString().slice(0, 10) !== values.expenseOn
	) {
		return invalid('Enter a valid expense date.');
	}
	if (!values.vendor || values.vendor.length > 120)
		return invalid('Enter a vendor of 1–120 characters.');
	if (!values.category || values.category.length > 80)
		return invalid('Enter a category of 1–80 characters.');
	if (!values.purpose || values.purpose.length > 1000)
		return invalid('Enter a business purpose of 1–1,000 characters.');

	const dollars = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(values.amount);
	const amountCents = dollars
		? Number(dollars[1]) * 100 + Number((dollars[2] ?? '').padEnd(2, '0'))
		: 0;
	if (amountCents <= 0)
		return invalid('Enter a USD amount from $0.01 to $9,999,999.99.');

	const receipt = form.get('receipt');
	const payload = new FormData();
	if (receipt instanceof File && receipt.name) {
		if (
			!receipt.size ||
			receipt.size > 5 * 1024 * 1024 ||
			!['application/pdf', 'image/jpeg', 'image/png'].includes(receipt.type)
		) {
			return invalid('Choose a PDF, JPEG, or PNG receipt up to 5 MB.');
		}
		payload.set('receipt', receipt);
	}
	payload.set('organization', params.id);
	payload.set('submitter', user.id);
	payload.set('expenseOn', values.expenseOn);
	payload.set('vendor', values.vendor);
	payload.set('category', values.category);
	payload.set('purpose', values.purpose);
	payload.set('amountCents', String(amountCents));
	payload.set('status', 'submitted');

	try {
		await pb.collection('expenses').create(payload);
		return { expenseMessage: 'Expense submitted.' };
	} catch (err) {
		return fail(pbErrorStatus(err), {
			expenseError: pbErrorMessage(err, 'Unable to submit the expense.'),
			expenseValues: values
		});
	}
}

export async function replaceExpenseReceipt({
	locals,
	params,
	request
}: ExpenseActionEvent) {
	const { pb, user } = locals;
	if (!pb || !user)
		return fail(401, { expenseError: 'Sign in to replace a receipt.' });
	if (params.capability !== 'reimbursements' || !idPattern.test(params.id))
		return fail(404, { expenseError: 'Expenses page not found.' });

	const form = await request.formData();
	const expense = String(form.get('expense') ?? '');
	if (!idPattern.test(expense))
		return fail(400, { expenseError: 'Choose a valid expense.' });

	const receipt = form.get('receipt');
	if (
		!(receipt instanceof File) ||
		!receipt.name ||
		!receipt.size ||
		receipt.size > 5 * 1024 * 1024 ||
		!['application/pdf', 'image/jpeg', 'image/png'].includes(receipt.type)
	) {
		return fail(400, { expenseError: 'Choose a PDF, JPEG, or PNG receipt up to 5 MB.' });
	}

	const payload = new FormData();
	payload.set('receipt', receipt);

	try {
		await pb.send(
			`/api/flihub/organizations/${params.id}/expenses/${expense}/replace-receipt`,
			{ method: 'POST', body: payload }
		);
		return { expenseMessage: 'Receipt replaced and expense resubmitted.' };
	} catch (err) {
		return fail(pbErrorStatus(err), {
			expenseError: pbErrorMessage(err, 'Unable to replace the receipt.')
		});
	}
}

export async function reviewExpense({
	locals,
	params,
	request
}: ExpenseActionEvent) {
	const { pb, user } = locals;
	if (!pb || !user)
		return fail(401, { expenseError: 'Sign in to review an expense.' });
	if (params.capability !== 'reimbursements' || !idPattern.test(params.id))
		return fail(404, { expenseError: 'Expenses page not found.' });

	const form = await request.formData();
	const expense = String(form.get('expense') ?? '');
	if (!idPattern.test(expense))
		return fail(400, { expenseError: 'Choose a valid expense.' });

	try {
		const result = await pb.send<{ status: string }>(
			`/api/flihub/organizations/${params.id}/expenses/${expense}/review`,
			{
				method: 'POST',
				body: { decision: form.get('decision'), note: form.get('note') }
			}
		);
		return {
			expenseMessage:
				result.status === 'approved' ? 'Expense approved.' : 'Expense returned.'
		};
	} catch (err) {
		return fail(pbErrorStatus(err), {
			expenseError: pbErrorMessage(err, 'Unable to review the expense.')
		});
	}
}
