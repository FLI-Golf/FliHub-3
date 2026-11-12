export interface SeasonPurse {
	purseAmountCents: number | null;
	purseCurrency: string;
}
export function parseSeasonPurse(
	input: string
):
	| { ok: true; value: { purseAmountCents: number; purseCurrency: string } }
	| { ok: false; message: string } {
	const value = input.trim();
	if (!value) return { ok: true, value: { purseAmountCents: 0, purseCurrency: '' } };
	if (!/^\d+(?:\.\d{1,2})?$/.test(value) || value.length > 32) {
		return {
			ok: false,
			message: 'Enter a nonnegative USD purse with up to two decimal places, without commas.'
		};
	}
	const [whole, fraction = ''] = value.split('.');
	const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
	if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
		return { ok: false, message: 'The purse amount is too large.' };
	}
	return { ok: true, value: { purseAmountCents: Number(cents), purseCurrency: 'USD' } };
}
export function seasonPurseInput(season: SeasonPurse): string {
	if (season.purseAmountCents === null) return '';
	const cents = BigInt(season.purseAmountCents);
	return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
export function formatSeasonPurse(season: SeasonPurse): string {
	if (season.purseAmountCents === null) return 'Purse not set';
	const cents = BigInt(season.purseAmountCents);
	return `Season purse: USD $${(cents / 100n).toLocaleString('en-US')}.${String(cents % 100n).padStart(2, '0')}`;
}
