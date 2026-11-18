import { error } from '@sveltejs/kit';
import { pbErrorStatus } from '$lib/server/auth';
import type { RequestHandler } from './$types';

const idPattern = /^[a-z0-9]{15}$/;

export const GET: RequestHandler = async ({ locals, params, fetch }) => {
	const { pb, user } = locals;
	if (
		!pb ||
		!user ||
		params.capability !== 'reimbursements' ||
		!idPattern.test(params.id) ||
		!idPattern.test(params.expense)
	) {
		error(404, 'Receipt not found.');
	}

	const expense = await pb
		.collection('expenses')
		.getOne(params.expense)
		.catch((err) => {
			if (pbErrorStatus(err) === 404) error(404, 'Receipt not found.');
			error(502, 'Unable to load the receipt.');
		});
	if (expense.organization !== params.id || !expense.receipt)
		error(404, 'Receipt not found.');

	const token = await pb.files
		.getToken()
		.catch(() => error(502, 'Unable to load the receipt.'));
	const file = await fetch(
		pb.files.getURL(expense, expense.receipt, { token, download: true }),
		{
			redirect: 'error'
		}
	).catch(() => error(502, 'Unable to load the receipt.'));
	if (file.status === 404 || file.status === 403)
		error(404, 'Receipt not found.');
	if (!file.ok || !file.body) error(502, 'Unable to load the receipt.');

	return new Response(file.body, {
		headers: {
			'content-type': 'application/octet-stream',
			'content-disposition':
				file.headers.get('content-disposition') ?? 'attachment',
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff'
		}
	});
};
