/**
 * CE-3 — Participant import duplicate detection.
 *
 * Matches are advisory, not unique identity constraints.
 *
 * The caller must supply existing records from the authorized
 * organization only, including archived identities.
 *
 * This module performs no database reads or writes.
 */

function normalizeName(value) {
	return String(value ?? '')
		.trim()
		.replace(/\s+/g, ' ')
		.toLowerCase();
}

function normalizeEmail(value) {
	return String(value ?? '')
		.trim()
		.toLowerCase();
}

function normalizePhone(value) {
	return String(value ?? '').replace(/[^0-9]/g, '');
}

function participantKeys(participant) {
	const identity = participant.identity || {};
	const contact = participant.contact || {};

	const firstName = normalizeName(identity.firstName);
	const lastName = normalizeName(identity.lastName);

	return {
		name: firstName && lastName ? JSON.stringify([firstName, lastName]) : '',
		email: normalizeEmail(contact.email),
		phone: normalizePhone(contact.phone)
	};
}

function matchingFields(left, right) {
	const matches = [];

	for (const field of ['name', 'email', 'phone']) {
		if (left[field] && left[field] === right[field]) {
			matches.push(field);
		}
	}

	return matches;
}

/**
 * rows:
 *   [{ row, identity, contact? }]
 *
 * existing:
 *   [{ id, status, identity, contact? }]
 *
 * Returns warnings without exposing names, emails, or phones.
 */
const MAX_DUPLICATE_WARNINGS = 2000;

function findParticipantDuplicates(rows, existing) {
	if (!Array.isArray(rows) || !Array.isArray(existing)) {
		throw new Error('Invalid participant duplicate detection input.');
	}

	const incoming = rows.map((participant) => ({
		row: participant.row,
		keys: participantKeys(participant)
	}));

	const stored = existing.map((participant) => ({
		id: participant.id,
		status: participant.status,
		keys: participantKeys(participant)
	}));

	const warnings = [];

	const addWarning = (warning) => {
		if (warnings.length >= MAX_DUPLICATE_WARNINGS) {
			throw new Error('Too many duplicate warnings. Split the CSV into smaller batches.');
		}

		warnings.push(warning);
	};

	for (let i = 0; i < incoming.length; i++) {
		const current = incoming[i];

		for (let j = 0; j < i; j++) {
			const previous = incoming[j];
			const fields = matchingFields(current.keys, previous.keys);

			if (fields.length) {
				addWarning({
					row: current.row,
					type: 'batch',
					matchingRow: previous.row,
					fields
				});
			}
		}

		for (const participant of stored) {
			const fields = matchingFields(current.keys, participant.keys);

			if (fields.length) {
				addWarning({
					row: current.row,
					type: 'existing',
					participantId: participant.id,
					status: participant.status,
					fields
				});
			}
		}
	}

	return warnings;
}

/**
 * Build a deterministic review of the current import.
 *
 * The caller supplies authorized organization context and
 * a SHA-256 function provided by the runtime.
 *
 * The fingerprint detects stale reviews. It is not an
 * authorization token or a cryptographic signature.
 */
function buildImportReview(context, csv, rows, existing, hash) {
	const warnings = findParticipantDuplicates(rows, existing);

	const reviewedWarnings = warnings.map((warning) => {
		const key = JSON.stringify([
			warning.row,
			warning.type,
			warning.matchingRow ?? null,
			warning.participantId ?? null,
			warning.status ?? null,
			warning.fields
		]);

		return {
			...warning,
			key
		};
	});

	// Database query ordering must not invalidate an
	// otherwise unchanged review.
	reviewedWarnings.sort((left, right) => {
		if (left.key < right.key) return -1;
		if (left.key > right.key) return 1;
		return 0;
	});

	const fingerprint = hash(
		JSON.stringify([
			'participant-import-review-v1',
			context.organizationId,
			context.userId,
			context.profile,
			csv,
			reviewedWarnings.map((warning) => warning.key)
		])
	);

	return {
		rowCount: rows.length,
		warnings: reviewedWarnings,
		fingerprint
	};
}

/**
 * Require an exact acknowledgment of every current warning.
 *
 * Reject stale fingerprints, missing acknowledgments,
 * unknown warning keys, and repeated acknowledgments.
 */
function validateImportConfirmation(review, fingerprint, confirmedWarnings) {
	if (typeof fingerprint !== 'string' || !fingerprint || fingerprint !== review.fingerprint) {
		throw new Error('import_review_stale: Preview the import again before saving.');
	}

	if (!Array.isArray(confirmedWarnings)) {
		throw new Error('import_confirmation_invalid: Confirmations must be an array.');
	}

	const expected = new Set(review.warnings.map((warning) => warning.key));

	const confirmed = new Set();

	for (const key of confirmedWarnings) {
		if (typeof key !== 'string' || !expected.has(key) || confirmed.has(key)) {
			throw new Error('import_confirmation_invalid: Unknown or repeated confirmation.');
		}

		confirmed.add(key);
	}

	if (confirmed.size !== expected.size) {
		throw new Error('import_duplicates_unresolved: Resolve every duplicate warning before saving.');
	}

	return true;
}

module.exports = {
	normalizeName,
	normalizeEmail,
	normalizePhone,
	findParticipantDuplicates,
	buildImportReview,
	validateImportConfirmation
};
