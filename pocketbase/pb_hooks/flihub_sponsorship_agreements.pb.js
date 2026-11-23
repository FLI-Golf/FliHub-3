onRecordCreateRequest((e) => {
	const record = e.record;
	const org = record.getString('organization');
	const [membership] = e.app.findRecordsByFilter(
		'memberships',
		'organization = {:org} && user = {:user} && (role = "owner" || role = "admin")',
		'',
		1,
		0,
		{ org, user: e.auth?.id ?? '' }
	);
	if (!membership) throw new ForbiddenError('Only Owners and Admins can add agreements.');
	const organization = e.app.findRecordById('organizations', org);
	if (!JSON.parse(String(organization.get('capabilities') || '[]')).includes('sponsorships'))
		throw new ForbiddenError('Sponsorships must be enabled.');

	function target(collection, id) {
		const row = e.app.findRecordById(collection, id);
		if (row.getString('organization') !== org || row.getString('status') === 'archived')
			throw new BadRequestError('Select an active record in this organization.');
		return row;
	}
	const sponsor = target('sponsors', record.getString('sponsor'));
	if (sponsor.getBool('archived'))
		throw new BadRequestError('Restore this sponsor before adding an agreement.');
	const quoteId = record.getString('quote');
	if (quoteId) {
		const quote = target('sponsorship_quotes', quoteId);
		if (quote.getString('sponsor') !== sponsor.id)
			throw new BadRequestError('Choose a quote for this sponsor.');
		const [converted] = e.app.findRecordsByFilter(
			'sponsorship_agreements',
			'quote = {:quote}',
			'',
			1,
			0,
			{ quote: quoteId }
		);
		if (converted) throw new BadRequestError('This quote already has an agreement.');
		const benefits = JSON.parse(String(quote.get('benefits') || '[]'));
		const lines = benefits.map((benefit) => benefit.name).join('\n');
		if (
			record.getInt('amountCents') !== quote.getInt('amountCents') ||
			record.getString('currency') !== quote.getString('currency') ||
			record.getString('title') !== quote.getString('packageName') ||
			record.getString('benefits') !== lines
		) {
			throw new BadRequestError('The quote changed. Review the latest draft and try again.');
		}
	}
	const title = record.getString('title').trim();
	if (!title) throw new BadRequestError('Enter an agreement title.');
	record.set('title', title);

	function validDate(value) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
		const date = new Date(value + 'T00:00:00Z');
		return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
	}
	const signed = record.getString('signedOn');
	const due = record.getString('dueOn');
	if (!validDate(signed) || (due && (!validDate(due) || due < signed)))
		throw new BadRequestError('Enter a valid signing date and a due date on or after it.');

	const coverage = record.getString('coverage');
	const [kind, id, roundId, holeId] = coverage.split(':');
	const collections = { league: 'leagues', season: 'seasons', team: 'teams', event: 'events' };
	let label;
	if (coverage === 'organization') {
		label = 'Organization';
	} else if (
		Object.prototype.hasOwnProperty.call(collections, kind) &&
		id &&
		coverage === kind + ':' + id
	) {
		label =
			kind[0].toUpperCase() +
			kind.slice(1) +
			' · ' +
			target(collections[kind], id).getString('name');
	} else if (
		kind === 'hole' &&
		id &&
		roundId &&
		holeId &&
		coverage === ['hole', id, roundId, holeId].join(':')
	) {
		const event = target('events', id);
		const round = target('rounds', roundId);
		const hole = target('course_holes', holeId);
		if (
			round.getString('event') !== event.id ||
			round.getString('course') !== hole.getString('course')
		)
			throw new BadRequestError('Select a hole on the selected event round.');
		label =
			event.getString('name') +
			' · Round ' +
			round.getInt('number') +
			' · Hole ' +
			hole.getInt('number');
	} else {
		throw new BadRequestError('Choose what the sponsorship covers.');
	}
	record.set('coverageLabel', label);
	e.next();
}, 'sponsorship_agreements');
