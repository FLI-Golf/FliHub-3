import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(
	new URL('../pocketbase/pb_hooks/participant_csv.js', import.meta.url),
	'utf8'
);

const context = {
	module: { exports: {} }
};

runInNewContext(source, context);

const parseParticipantCsv = context.module.exports.parseParticipantCsv;

// Convert VM-created objects to ordinary Node objects for comparison.
function parse(csv) {
	return JSON.parse(JSON.stringify(parseParticipantCsv(csv)));
}

test('participant CSV: accepts first and last name', () => {
	assert.deepEqual(parse('Emma,Wilson'), [{ row: 1, fields: ['Emma', 'Wilson'] }]);
});

test('participant CSV: accepts five columns', () => {
	assert.deepEqual(parse('Emma,Wilson,Em,emma@example.com,555-0100'), [
		{
			row: 1,
			fields: ['Emma', 'Wilson', 'Em', 'emma@example.com', '555-0100']
		}
	]);
});

test('participant CSV: preserves empty optional fields', () => {
	assert.deepEqual(parse('Emma,Wilson,,,'), [{ row: 1, fields: ['Emma', 'Wilson', '', '', ''] }]);
});

test('participant CSV: accepts quoted commas', () => {
	assert.deepEqual(parse('Emma,Wilson,"Wilson, Emma"'), [
		{ row: 1, fields: ['Emma', 'Wilson', 'Wilson, Emma'] }
	]);
});

test('participant CSV: accepts escaped quotation marks', () => {
	assert.deepEqual(parse('Emma,Wilson,"Em ""Runner"""'), [
		{ row: 1, fields: ['Emma', 'Wilson', 'Em "Runner"'] }
	]);
});

test('participant CSV: trims surrounding whitespace', () => {
	assert.deepEqual(parse('  Emma  ,  Wilson  ,  " Em "  '), [
		{ row: 1, fields: ['Emma', 'Wilson', 'Em'] }
	]);
});

test('participant CSV: accepts quoted empty optional fields', () => {
	assert.deepEqual(parse('Emma,Wilson,""'), [{ row: 1, fields: ['Emma', 'Wilson', ''] }]);
});

test('participant CSV: accepts UTF-8 BOM', () => {
	assert.deepEqual(parse('\uFEFFEmma,Wilson'), [{ row: 1, fields: ['Emma', 'Wilson'] }]);
});

test('participant CSV: accepts different line endings', () => {
	assert.deepEqual(parse('Emma,Wilson\r\nJames,Smith\nAvery,Jones\rRobin,Lee'), [
		{ row: 1, fields: ['Emma', 'Wilson'] },
		{ row: 2, fields: ['James', 'Smith'] },
		{ row: 3, fields: ['Avery', 'Jones'] },
		{ row: 4, fields: ['Robin', 'Lee'] }
	]);
});

test('participant CSV: skips blank lines and preserves row numbers', () => {
	assert.deepEqual(parse('\nEmma,Wilson\n  \nJames,Smith\n'), [
		{ row: 2, fields: ['Emma', 'Wilson'] },
		{ row: 4, fields: ['James', 'Smith'] }
	]);
});

test('participant CSV: preserves international names', () => {
	assert.deepEqual(parse('José,García\n李,明'), [
		{ row: 1, fields: ['José', 'García'] },
		{ row: 2, fields: ['李', '明'] }
	]);
});

test('participant CSV: rejects empty input', () => {
	for (const csv of ['', '   ', '\n\r\n']) {
		assert.throws(() => parse(csv), /Paste at least one CSV row/);
	}
});

test('participant CSV: rejects non-text input', () => {
	for (const csv of [null, undefined, 123, [], {}]) {
		assert.throws(() => parse(csv), /CSV input must be text/);
	}
});

test('participant CSV: rejects missing first or last name', () => {
	for (const csv of [',Wilson', 'Emma,', '"",Wilson', 'Emma,""']) {
		assert.throws(() => parse(csv), /Row 1: First and last names are required/);
	}
});

test('participant CSV: rejects too few columns', () => {
	assert.throws(() => parse('Emma'), /Row 1: Expected between two and five/);
});

test('participant CSV: rejects unexpected columns', () => {
	assert.throws(() => parse('Emma,Wilson,a,b,c,d'), /Row 1: Expected between two and five/);
});

test('participant CSV: rejects unclosed quotation', () => {
	assert.throws(() => parse('Emma,Wilson,"Em'), /Row 1: Unclosed quotation/);
});

test('participant CSV: rejects quotation inside unquoted field', () => {
	assert.throws(() => parse('Em"ma,Wilson'), /Row 1: Unexpected quotation mark/);
});

test('participant CSV: rejects text after closing quotation', () => {
	assert.throws(() => parse('Emma,Wilson,"Em"x'), /Row 1: Unexpected text after a quoted field/);
});

test('participant CSV: rejects multiline quoted fields', () => {
	assert.throws(
		() => parse('Emma,Wilson,"Em\nRunner"'),
		/Row 1: Unclosed quotation or unsupported multiline field/
	);
});

test('participant CSV: reports original invalid row number', () => {
	assert.throws(() => parse('Emma,Wilson\n\nJames,'), /Row 3: First and last names are required/);
});

test('participant CSV: accepts exactly 200 rows', () => {
	const csv = Array.from({ length: 200 }, (_, i) => `Participant${i + 1},Example`).join('\n');

	const rows = parse(csv);

	assert.equal(rows.length, 200);
	assert.equal(rows[199].row, 200);
});

test('participant CSV: rejects 201 rows', () => {
	const csv = Array.from({ length: 201 }, (_, i) => `Participant${i + 1},Example`).join('\n');

	assert.throws(() => parse(csv), /Row 201: Import at most 200 participants/);
});

test('participant CSV: rejects oversized input', () => {
	assert.throws(() => parse('a'.repeat(262145)), /CSV input exceeds the maximum size/);
});

test('participant CSV: rejects null characters', () => {
	assert.throws(() => parse('Emma,Wilson\u0000'), /CSV input contains an invalid character/);
});

const validateParticipantCsv = context.module.exports.validateParticipantCsv;

function validate(csv, profile = '') {
	return JSON.parse(JSON.stringify(validateParticipantCsv(csv, profile)));
}

test('participant import: maps complete charity CSV', () => {
	assert.deepEqual(validate('Emma,Wilson,Em,emma@example.com,555-0100', 'charity-run-walk'), [
		{
			row: 1,
			identity: {
				firstName: 'Emma',
				lastName: 'Wilson',
				displayName: 'Em'
			},
			contact: {
				email: 'emma@example.com',
				phone: '555-0100'
			}
		}
	]);
});

test('participant import: preserves existing golf CSV format', () => {
	assert.deepEqual(validate('Emma,Wilson,female,USA,emma@example.com'), [
		{
			row: 1,
			identity: {
				firstName: 'Emma',
				lastName: 'Wilson',
				gender: 'female',
				nationality: 'USA'
			},
			contact: {
				email: 'emma@example.com'
			}
		}
	]);
});

test('participant import: charity identity has no demographic fields', () => {
	const [result] = validate('Emma,Wilson', 'charity-run-walk');

	assert.deepEqual(result, {
		row: 1,
		identity: {
			firstName: 'Emma',
			lastName: 'Wilson'
		}
	});
});

test('participant import: golf defaults blank gender to unspecified', () => {
	for (const csv of ['Emma,Wilson', 'Emma,Wilson,,,']) {
		const [result] = validate(csv);

		assert.equal(result.identity.gender, 'unspecified');
		assert.equal('contact' in result, false);
	}
});

test('participant import: accepts supported golf gender values', () => {
	for (const gender of ['female', 'male', 'other', 'unspecified']) {
		const [result] = validate(`Emma,Wilson,${gender}`);

		assert.equal(result.identity.gender, gender);
	}
});

test('participant import: rejects invalid golf gender', () => {
	assert.throws(() => validate('Emma,Wilson,invalid'), /Row 1: Invalid gender value/);
});

test('participant import: charity third column is display name', () => {
	const [result] = validate('Emma,Wilson,Runner', 'charity-run-walk');

	assert.equal(result.identity.displayName, 'Runner');
	assert.equal('gender' in result.identity, false);
});

test('participant import: charity supports email without phone', () => {
	const [result] = validate('Emma,Wilson,,emma@example.com', 'charity-run-walk');

	assert.deepEqual(result.contact, {
		email: 'emma@example.com'
	});
});

test('participant import: charity supports phone without email', () => {
	const [result] = validate('Emma,Wilson,,,555-0100', 'charity-run-walk');

	assert.deepEqual(result.contact, {
		phone: '555-0100'
	});
});

test('participant import: omits empty optional charity fields', () => {
	const [result] = validate('Emma,Wilson,,,', 'charity-run-walk');

	assert.equal('contact' in result, false);
	assert.equal('displayName' in result.identity, false);
});

test('participant import: rejects unsupported profiles', () => {
	for (const profile of ['unknown', 'race-event', null, 123]) {
		assert.throws(() => validate('Emma,Wilson', profile), /Unsupported participant import profile/);
	}
});

test('participant import: rejects invalid charity email', () => {
	assert.throws(
		() => validate('Emma,Wilson,,not-an-email', 'charity-run-walk'),
		/Row 1: Invalid email address/
	);
});

test('participant import: rejects invalid golf email', () => {
	assert.throws(() => validate('Emma,Wilson,female,USA,invalid'), /Row 1: Invalid email address/);
});

test('participant import: enforces first name length', () => {
	for (const profile of ['', 'charity-run-walk']) {
		assert.throws(
			() => validate(`${'a'.repeat(61)},Wilson`, profile),
			/Row 1: First name exceeds 60 characters/
		);
	}
});

test('participant import: enforces last name length', () => {
	for (const profile of ['', 'charity-run-walk']) {
		assert.throws(
			() => validate(`Emma,${'a'.repeat(61)}`, profile),
			/Row 1: Last name exceeds 60 characters/
		);
	}
});

test('participant import: enforces charity display name length', () => {
	assert.throws(
		() => validate(`Emma,Wilson,${'a'.repeat(121)}`, 'charity-run-walk'),
		/Row 1: Display name exceeds 120 characters/
	);
});

test('participant import: enforces golf nationality length', () => {
	assert.throws(
		() => validate(`Emma,Wilson,female,${'a'.repeat(61)}`),
		/Row 1: Nationality exceeds 60 characters/
	);
});

test('participant import: enforces charity phone length', () => {
	assert.throws(
		() => validate(`Emma,Wilson,,,${'1'.repeat(41)}`, 'charity-run-walk'),
		/Row 1: Phone exceeds 40 characters/
	);
});

test('participant import: enforces email length in both profiles', () => {
	const email = `${'a'.repeat(243)}@example.com`;

	assert.equal(email.length, 255);

	assert.throws(
		() => validate(`Emma,Wilson,,${email}`, 'charity-run-walk'),
		/Row 1: Email exceeds 254 characters/
	);

	assert.throws(() => validate(`Emma,Wilson,,,${email}`), /Row 1: Email exceeds 254 characters/);
});

test('participant import: accepts exact field length limits', () => {
	const firstName = 'a'.repeat(60);
	const lastName = 'b'.repeat(60);
	const displayName = 'c'.repeat(120);
	const email = `${'d'.repeat(242)}@example.com`;
	const phone = '1'.repeat(40);
	const nationality = 'e'.repeat(60);

	assert.equal(email.length, 254);

	const [charity] = validate(
		`${firstName},${lastName},${displayName},${email},${phone}`,
		'charity-run-walk'
	);

	assert.equal(charity.identity.firstName, firstName);
	assert.equal(charity.identity.lastName, lastName);
	assert.equal(charity.identity.displayName, displayName);
	assert.equal(charity.contact.email, email);
	assert.equal(charity.contact.phone, phone);

	const [golf] = validate(`${firstName},${lastName},female,${nationality},${email}`);

	assert.equal(golf.identity.nationality, nationality);
	assert.equal(golf.contact.email, email);
});

test('participant import: preserves original validation row numbers', () => {
	assert.throws(
		() => validate('Emma,Wilson\n\nJames,Smith,,invalid', 'charity-run-walk'),
		/Row 3: Invalid email address/
	);
});

test('participant import: rejects a batch containing an invalid later row', () => {
	assert.throws(
		() => validate('Emma,Wilson,,emma@example.com\nJames,Smith,,invalid', 'charity-run-walk'),
		/Row 2: Invalid email address/
	);
});

test('participant import: validated rows contain no privileged fields', () => {
	const [result] = validate('Emma,Wilson,Em,emma@example.com,555-0100', 'charity-run-walk');

	assert.deepEqual(Object.keys(result).sort(), ['contact', 'identity', 'row']);

	assert.deepEqual(Object.keys(result.identity).sort(), ['displayName', 'firstName', 'lastName']);

	assert.deepEqual(Object.keys(result.contact).sort(), ['email', 'phone']);
});
