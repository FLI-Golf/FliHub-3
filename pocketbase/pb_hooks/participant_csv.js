/**
 * CE-3 — Strict participant CSV parsing.
 *
 * Pure parsing only: no database access, authorization,
 * profile selection, or persistence.
 */

function parseParticipantCsv(csv) {
	if (typeof csv !== 'string') {
		throw new Error('CSV input must be text.');
	}

	if (csv.length > 262144) {
		throw new Error('CSV input exceeds the maximum size.');
	}

	if (csv.includes('\u0000')) {
		throw new Error('CSV input contains an invalid character.');
	}

	const lines = csv.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
	const rows = [];

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const row = index + 1;

		if (!line.trim()) {
			continue;
		}

		if (rows.length >= 200) {
			throw new Error(`Row ${row}: Import at most 200 participants at a time.`);
		}

		const fields = [];
		let value = '';
		let state = 'start';

		for (let i = 0; i < line.length; i++) {
			const ch = line[i];

			if (state === 'quoted') {
				if (ch === '"') {
					if (line[i + 1] === '"') {
						value += '"';
						i++;
					} else {
						state = 'closed';
					}
				} else {
					value += ch;
				}

				continue;
			}

			if (ch === ',') {
				fields.push(value.trim());
				value = '';
				state = 'start';
				continue;
			}

			if (state === 'closed') {
				if (!/\s/.test(ch)) {
					throw new Error(`Row ${row}: Unexpected text after a quoted field.`);
				}

				continue;
			}

			if (ch === '"') {
				if (state !== 'start') {
					throw new Error(`Row ${row}: Unexpected quotation mark.`);
				}

				value = '';
				state = 'quoted';
				continue;
			}

			if (state === 'start' && /\s/.test(ch)) {
				continue;
			}

			value += ch;
			state = 'unquoted';
		}

		if (state === 'quoted') {
			throw new Error(`Row ${row}: Unclosed quotation or unsupported multiline field.`);
		}

		fields.push(value.trim());

		if (fields.length < 2 || fields.length > 5) {
			throw new Error(`Row ${row}: Expected between two and five CSV columns.`);
		}

		if (!fields[0] || !fields[1]) {
			throw new Error(`Row ${row}: First and last names are required.`);
		}

		rows.push({ row, fields });
	}

	if (!rows.length) {
		throw new Error('Paste at least one CSV row.');
	}

	return rows;
}

/**
 * Convert CSV rows into validated participant operation inputs.
 *
 * The caller must supply the persisted organization profile.
 * An empty profile retains the existing athlete CSV format.
 */
function validateParticipantCsv(csv, profile) {
	if (profile !== '' && profile !== 'charity-run-walk') {
		throw new Error('Unsupported participant import profile.');
	}

	const charity = profile === 'charity-run-walk';
	const rows = parseParticipantCsv(csv);

	return rows.map(({ row, fields }) => {
		const [firstName, lastName, third = '', fourth = '', fifth = ''] = fields;

		const validateLength = (value, label, max) => {
			if (value.length > max) {
				throw new Error(`Row ${row}: ${label} exceeds ${max} characters.`);
			}
		};

		const validateEmail = (email) => {
			validateLength(email, 'Email', 254);

			if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
				throw new Error(`Row ${row}: Invalid email address.`);
			}
		};

		validateLength(firstName, 'First name', 60);
		validateLength(lastName, 'Last name', 60);

		const identity = {
			firstName,
			lastName
		};

		const contact = {};

		if (charity) {
			const displayName = third;
			const email = fourth;
			const phone = fifth;

			validateLength(displayName, 'Display name', 120);
			validateEmail(email);
			validateLength(phone, 'Phone', 40);

			if (displayName) identity.displayName = displayName;
			if (email) contact.email = email;
			if (phone) contact.phone = phone;
		} else {
			const gender = third || 'unspecified';
			const nationality = fourth;
			const email = fifth;

			if (!['female', 'male', 'other', 'unspecified'].includes(gender)) {
				throw new Error(`Row ${row}: Invalid gender value.`);
			}

			validateLength(nationality, 'Nationality', 60);
			validateEmail(email);

			identity.gender = gender;

			if (nationality) identity.nationality = nationality;
			if (email) contact.email = email;
		}

		const result = {
			row,
			identity
		};

		if (Object.keys(contact).length) {
			result.contact = contact;
		}

		return result;
	});
}

module.exports = {
	parseParticipantCsv,
	validateParticipantCsv
};
