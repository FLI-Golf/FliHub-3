/// <reference path="../pb_data/types.d.ts" />
onRecordCreateRequest((e) => {
	const day = e.record.getString('expenseOn');
	const parsed = new Date(day + 'T00:00:00Z');
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
		!Number.isFinite(parsed.getTime()) ||
		parsed.toISOString().slice(0, 10) !== day
	) {
		throw new BadRequestError('Enter a valid expense date.');
	}

	for (const field of ['vendor', 'category', 'purpose']) {
		const value = e.record.getString(field).trim();
		if (!value)
			throw new BadRequestError(
				'Enter a vendor, category, and business purpose.'
			);
		e.record.set(field, value);
	}
	e.record.set(
		'submitterName',
		e.auth?.getString('name').trim().slice(0, 255) ?? ''
	);
	e.record.set('status', 'submitted');
	e.record.set('reviewNote', '');
	e.record.set('returnHistory', null);
	e.record.set('reviewer', '');
	e.record.set('reviewedAt', '');
	e.next();
}, 'expenses');

routerAdd(
	'POST',
	'/api/flihub/organizations/{org}/expenses/{id}/review',
	(e) => {
		const org = e.request.pathValue('org');
		const id = e.request.pathValue('id');
		const body = e.requestInfo().body ?? {};
		const decision = String(body.decision ?? '');
		const note = String(body.note ?? '').trim();
		if (!['approved', 'returned'].includes(decision))
			throw new BadRequestError('Choose approve or return.');
		if (note.length > 500 || (decision === 'returned' && !note))
			throw new BadRequestError('Enter a return note of 1–500 characters.');

		e.app.runInTransaction((app) => {
			const membership = app.findRecordsByFilter(
				'memberships',
				'organization = {:org} && user = {:user} && (role = "owner" || role = "admin")',
				'',
				1,
				0,
				{ org, user: e.auth.id }
			)[0];
			if (!membership)
				throw new ForbiddenError('Owner or Admin access required.');

			const organization = app.findRecordById('organizations', org);
			const capabilities = JSON.parse(
				String(organization.get('capabilities') ?? '[]')
			);
			if (
				!Array.isArray(capabilities) ||
				!capabilities.includes('reimbursements')
			)
				throw new ForbiddenError('Reimbursements & expenses is disabled.');

			const expense = app.findRecordById('expenses', id);
			if (expense.getString('organization') !== org)
				throw new NotFoundError('Expense not found.');
			if (expense.getString('status') !== 'submitted')
				throw new BadRequestError('This expense has already been reviewed.');

			expense.set('status', decision);
			expense.set('reviewNote', note);
			expense.set('reviewer', e.auth.id);
			expense.set('reviewedAt', new Date().toISOString());
			app.save(expense);
		});

		return e.json(200, { status: decision });
	},
	$apis.requireAuth('users')
);

routerAdd(
	'POST',
	'/api/flihub/organizations/{org}/expenses/{id}/replace-receipt',
	(e) => {
		const org = e.request.pathValue('org');
		const id = e.request.pathValue('id');
		const receipts = e.findUploadedFiles('receipt') ?? [];
		if (receipts.length !== 1)
			throw new BadRequestError('Choose one replacement receipt.');

		e.app.runInTransaction((app) => {
			const membership = app.findRecordsByFilter(
				'memberships',
				'organization = {:org} && user = {:user}',
				'',
				1,
				0,
				{ org, user: e.auth.id }
			)[0];
			if (!membership)
				throw new ForbiddenError('Organization membership required.');

			const organization = app.findRecordById('organizations', org);
			const capabilities = JSON.parse(
				String(organization.get('capabilities') ?? '[]')
			);
			if (!Array.isArray(capabilities) || !capabilities.includes('reimbursements'))
				throw new ForbiddenError('Reimbursements & expenses is disabled.');

			const expense = app.findRecordById('expenses', id);
			if (expense.getString('organization') !== org || expense.getString('submitter') !== e.auth.id)
				throw new NotFoundError('Expense not found.');
			if (expense.getString('status') !== 'returned')
				throw new BadRequestError('Only a returned expense can be resubmitted.');

			const history = JSON.parse(expense.getString('returnHistory') || 'null') ?? [];
			history.push({
				decision: 'returned',
				note: expense.getString('reviewNote'),
				reviewer: expense.getString('reviewer'),
				reviewedAt: expense.getString('reviewedAt')
			});
			expense.set('returnHistory', history);
			expense.set('receipt', receipts);
			expense.set('status', 'submitted');
			expense.set('reviewNote', '');
			expense.set('reviewer', '');
			expense.set('reviewedAt', '');
			app.save(expense);
		});

		return e.json(200, { status: 'submitted' });
	},
	$apis.requireAuth('users')
);
