/// <reference path="../pb_data/types.d.ts" />

/**
 * CE-3 — Shared transactional participant operations.
 *
 * Athletes and charity participants share the same identity
 * and private companion collections.
 *
 * Internal saves bypass collection API request rules, so
 * authorization and relationship integrity are enforced here.
 */

routerAdd(
	'POST',
	'/api/flihub/organizations/{id}/participants',
	(e) => {
		const orgId = e.request.pathValue('id');
		const auth = e.auth;
		const body = e.requestInfo().body || {};
		const operation = body.operation;

		const validId = (value) => typeof value === 'string' && /^[a-z0-9]{15}$/.test(value);

		if (!validId(orgId)) {
			throw new BadRequestError('Invalid organization identifier.');
		}

		const authorize = (app) => {
			const memberships = app.findRecordsByFilter(
				'memberships',
				'organization = {:org} && user = {:user}',
				'',
				1,
				0,
				{ org: orgId, user: auth.id }
			);

			const role = memberships.length ? memberships[0].getString('role') : '';

			if (role !== 'owner' && role !== 'admin') {
				throw new ForbiddenError('Only Owners and Admins can manage participants.');
			}

			const org = app.findRecordById('organizations', orgId);

			let capabilities = [];

			try {
				capabilities = JSON.parse(String(org.get('capabilities')));
			} catch (_) {
				capabilities = [];
			}

			if (!Array.isArray(capabilities) || !capabilities.includes('athletes')) {
				throw new ForbiddenError('capability_disabled: Participant management is not enabled.');
			}

			return org;
		};

		// Deny unauthorized callers before returning validation feedback.
		authorize(e.app);

		// Archive and restore change status only. Historical relationships
		// and private companion records remain intact.
		if (operation === 'archive' || operation === 'restore') {
			if (!validId(body.athleteId)) {
				throw new BadRequestError('Invalid participant identifier.');
			}

			for (const key of Object.keys(body)) {
				if (!['operation', 'athleteId'].includes(key)) {
					throw new BadRequestError('Unsupported lifecycle field.');
				}
			}

			const status = operation === 'archive' ? 'archived' : 'active';

			let result = null;

			e.app.runInTransaction((txApp) => {
				authorize(txApp);

				const matches = txApp.findRecordsByFilter(
					'athletes',
					'id = {:id} && organization = {:org}',
					'',
					1,
					0,
					{ id: body.athleteId, org: orgId }
				);

				if (!matches.length) {
					throw new NotFoundError('Participant not found.');
				}

				const athlete = matches[0];

				if (athlete.getString('status') !== status) {
					athlete.set('status', status);
					txApp.save(athlete);
				}

				result = {
					id: athlete.id,
					operation,
					status
				};
			});

			return e.json(200, result);
		}

		const importing = operation === 'previewImport' || operation === 'import';

		if (!importing && operation !== 'create' && operation !== 'update') {
			throw new BadRequestError('Unsupported participant operation.');
		}

		const identity = body.identity;
		const contact = body.contact;

		if (!importing && (!identity || typeof identity !== 'object' || Array.isArray(identity))) {
			throw new BadRequestError('Participant identity is required.');
		}

		if (
			!importing &&
			contact !== undefined &&
			(!contact || typeof contact !== 'object' || Array.isArray(contact))
		) {
			throw new BadRequestError('Invalid private contact information.');
		}

		const identityFields = ['firstName', 'lastName', 'displayName', 'gender', 'nationality'];

		const contactFields = ['email', 'phone', 'eligibilityNotes'];

		const allowedBodyFields = ['operation', 'athleteId', 'identity', 'contact'];

		const validateKeys = (value, allowed) => {
			for (const key of Object.keys(value)) {
				if (!allowed.includes(key)) {
					throw new BadRequestError('Unsupported participant field.');
				}
			}
		};

		if (!importing) {
			validateKeys(body, allowedBodyFields);
			validateKeys(identity, identityFields);

			if (contact !== undefined) {
				validateKeys(contact, contactFields);
			}
		} else {
			validateKeys(
				body,
				operation === 'previewImport'
					? ['operation', 'csv']
					: ['operation', 'csv', 'fingerprint', 'confirmedWarnings']
			);
		}

		const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

		const readText = (value, key, max, required = false) => {
			if (!has(value, key)) {
				if (required) {
					throw new BadRequestError(`${key} is required.`);
				}
				return '';
			}

			if (typeof value[key] !== 'string') {
				throw new BadRequestError(`${key} must be text.`);
			}

			const text = value[key].trim();

			if (required && !text) {
				throw new BadRequestError(`${key} is required.`);
			}

			if (text.length > max) {
				throw new BadRequestError(`${key} is too long.`);
			}

			return text;
		};

		if (operation === 'update' && !validId(body.athleteId)) {
			throw new BadRequestError('Invalid participant identifier.');
		}

		if (operation === 'create' && has(body, 'athleteId')) {
			throw new BadRequestError('New participant identifiers are assigned by the server.');
		}

		const persistParticipant = (txApp, org, operation, athleteId, identity, contact) => {
			const charity = org.getString('profile') === 'charity-run-walk';

			let athlete;

			if (operation === 'create') {
				athlete = new Record(txApp.findCollectionByNameOrId('athletes'));

				athlete.set('organization', orgId);
				athlete.set('status', 'active');
				athlete.set('publicPublished', false);
				athlete.set('gender', 'unspecified');
			} else {
				const matches = txApp.findRecordsByFilter(
					'athletes',
					'id = {:id} && organization = {:org}',
					'',
					1,
					0,
					{ id: athleteId, org: orgId }
				);

				if (!matches.length) {
					throw new NotFoundError('Participant not found.');
				}

				athlete = matches[0];
			}

			athlete.set('firstName', readText(identity, 'firstName', 60, true));

			athlete.set('lastName', readText(identity, 'lastName', 60, true));

			if (has(identity, 'displayName')) {
				athlete.set('displayName', readText(identity, 'displayName', 120));
			}

			if (charity) {
				if (has(identity, 'gender') || has(identity, 'nationality')) {
					throw new BadRequestError('Demographic fields are not used for charity participants.');
				}

				if (athlete.getBool('publicPublished')) {
					throw new BadRequestError(
						'Charity participants cannot be marked for public publication.'
					);
				}
			} else {
				if (has(identity, 'gender')) {
					const gender = readText(identity, 'gender', 20);

					if (!['female', 'male', 'other', 'unspecified'].includes(gender)) {
						throw new BadRequestError('Invalid gender value.');
					}

					athlete.set('gender', gender);
				}

				if (has(identity, 'nationality')) {
					athlete.set('nationality', readText(identity, 'nationality', 60));
				}
			}

			txApp.save(athlete);

			// An omitted contact object leaves private information unchanged.
			if (contact !== undefined) {
				const companions = txApp.findRecordsByFilter(
					'athlete_private',
					'athlete = {:athlete}',
					'',
					2,
					0,
					{ athlete: athlete.id }
				);

				if (companions.length > 1) {
					throw new BadRequestError('Participant private record integrity error.');
				}

				let companion = companions.length ? companions[0] : null;

				if (companion && companion.getString('organization') !== orgId) {
					throw new BadRequestError('Participant private record organization mismatch.');
				}

				const limits = {
					email: 254,
					phone: 40,
					eligibilityNotes: 2000
				};

				const changes = {};

				for (const key of contactFields) {
					if (has(contact, key)) {
						changes[key] = readText(contact, key, limits[key]);
					}
				}

				if (changes.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(changes.email)) {
					throw new BadRequestError('Invalid email address.');
				}

				const hasContact = Object.values(changes).some((value) => value !== '');

				if (!companion && hasContact) {
					companion = new Record(txApp.findCollectionByNameOrId('athlete_private'));

					companion.set('organization', orgId);
					companion.set('athlete', athlete.id);
				}

				if (companion && Object.keys(changes).length) {
					for (const key of Object.keys(changes)) {
						companion.set(key, changes[key]);
					}

					txApp.save(companion);
				}
			}

			// Do not return private contact information.
			return {
				id: athlete.id,
				operation
			};
		};

		if (importing) {
			// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase hook runtime requires CommonJS.
			const { validateParticipantCsv } = require(`${__hooks}/participant_csv.js`);

			// eslint-disable-next-line @typescript-eslint/no-require-imports -- PocketBase hook runtime requires CommonJS.
			const { buildImportReview, validateImportConfirmation } = require(
				`${__hooks}/participant_duplicates.js`
			);

			const buildReview = (app, org) => {
				const profile = org.getString('profile');

				let rows;

				try {
					rows = validateParticipantCsv(body.csv, profile);
				} catch (error) {
					throw new BadRequestError(error.message);
				}

				// Fetch identities and private companions from
				// this organization only, including archived identities.
				const readOrganizationRecords = (collection) => {
					const records = [];
					const seen = new Set();
					const pageSize = 200;

					for (let offset = 0; ; offset += pageSize) {
						const page = app.findRecordsByFilter(
							collection,
							'organization = {:org}',
							'id',
							pageSize,
							offset,
							{ org: orgId }
						);

						for (const record of page) {
							if (seen.has(record.id)) {
								throw new BadRequestError('Participant records changed during import review.');
							}

							seen.add(record.id);
							records.push(record);
						}

						if (page.length < pageSize) break;
					}

					return records;
				};

				const athletes = readOrganizationRecords('athletes');

				const companions = readOrganizationRecords('athlete_private');

				const existingById = new Map();

				for (const athlete of athletes) {
					existingById.set(athlete.id, {
						id: athlete.id,
						status: athlete.getString('status'),
						identity: {
							firstName: athlete.getString('firstName'),
							lastName: athlete.getString('lastName')
						}
					});
				}

				for (const companion of companions) {
					const participant = existingById.get(companion.getString('athlete'));

					if (!participant || participant.contact) {
						throw new BadRequestError('Participant private record integrity error.');
					}

					participant.contact = {
						email: companion.getString('email'),
						phone: companion.getString('phone')
					};
				}

				let review;

				try {
					review = buildImportReview(
						{
							organizationId: orgId,
							userId: auth.id,
							profile
						},
						body.csv,
						rows,
						Array.from(existingById.values()),
						(value) => $security.sha256(value)
					);
				} catch (error) {
					if (
						error.message === 'Too many duplicate warnings. Split the CSV into smaller batches.'
					) {
						throw new BadRequestError(error.message);
					}

					throw error;
				}

				return { rows, review };
			};

			let importResult = null;
			let importError = null;

			e.app.runInTransaction((txApp) => {
				const org = authorize(txApp);

				const { rows, review } = buildReview(txApp, org);

				if (operation === 'previewImport') {
					importResult = {
						operation,
						...review
					};

					return;
				}

				try {
					validateImportConfirmation(review, body.fingerprint, body.confirmedWarnings);
				} catch (error) {
					const detail = String(error.message || '');
					const separator = detail.indexOf(':');

					const code = separator === -1 ? '' : detail.slice(0, separator);

					const allowedCodes = [
						'import_review_stale',
						'import_confirmation_invalid',
						'import_duplicates_unresolved'
					];

					if (!allowedCodes.includes(code)) {
						throw error;
					}

					importError = {
						code,
						message: detail.slice(separator + 1).trim()
					};

					// Confirmation failed before any participant writes.
					return;
				}

				const created = [];

				for (const row of rows) {
					const participant = persistParticipant(
						txApp,
						org,
						'create',
						undefined,
						row.identity,
						row.contact
					);

					created.push({
						row: row.row,
						id: participant.id
					});
				}

				importResult = {
					operation,
					importedCount: created.length,
					participants: created
				};
			});

			if (importError) {
				return e.json(400, importError);
			}

			return e.json(operation === 'previewImport' ? 200 : 201, importResult);
		}

		let result = null;

		e.app.runInTransaction((txApp) => {
			const org = authorize(txApp);

			result = persistParticipant(txApp, org, operation, body.athleteId, identity, contact);
		});

		return e.json(operation === 'create' ? 201 : 200, result);
	},
	$apis.requireAuth()
);
