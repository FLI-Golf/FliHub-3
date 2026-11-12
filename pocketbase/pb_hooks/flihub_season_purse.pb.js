/// <reference path="../pb_data/types.d.ts" />
onRecordCreateRequest((e) => {
	const amount = Number(e.record.get('purseAmountCents') || 0);
	const currency = e.record.getString('purseCurrency');
	if (
		!Number.isSafeInteger(amount) ||
		amount < 0 ||
		(currency !== '' && currency !== 'USD') ||
		(amount > 0 && currency !== 'USD')
	) {
		throw new BadRequestError(
			'The season purse requires nonnegative integer cents and USD currency.'
		);
	}
	e.next();
}, 'seasons');
onRecordUpdateRequest((e) => {
	const amount = Number(e.record.get('purseAmountCents') || 0);
	const currency = e.record.getString('purseCurrency');
	if (
		!Number.isSafeInteger(amount) ||
		amount < 0 ||
		(currency !== '' && currency !== 'USD') ||
		(amount > 0 && currency !== 'USD')
	) {
		throw new BadRequestError(
			'The season purse requires nonnegative integer cents and USD currency.'
		);
	}
	e.next();
}, 'seasons');
