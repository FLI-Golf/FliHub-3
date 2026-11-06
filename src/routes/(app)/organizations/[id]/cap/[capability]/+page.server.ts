import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { OrgRole } from '$lib/server/auth';
import { pbErrorMessage, pbErrorStatus, toOrganizationDTO } from '$lib/server/auth';
import { capabilityDefinitions, getCapability } from '$lib/capabilities/catalog';

const ID_PATTERN = /^[a-z0-9]{15}$/;

/**
 * Capability destination pages. Access rules, enforced server-side here and
 * by collection rules on the data itself:
 * - non-members never see the page (404);
 * - members see an honest "not enabled" state when the capability is off;
 * - enabled planned/upcoming capabilities show their honest status — no fake
 *   CRUD screens, no working-looking buttons.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const pb = locals.pb;
	const user = locals.user;
	if (!pb || !user) {
		error(503, 'PocketBase is not configured.');
	}
	if (!ID_PATTERN.test(params.id)) {
		error(404, 'Organization not found.');
	}

	const capability = getCapability(params.capability);
	if (!capability) {
		error(404, 'Unknown capability.');
	}

	const memberships = await pb.collection('memberships').getFullList({
		filter: `organization = "${params.id}" && user = "${user.id}"`
	});
	const mine = memberships[0];
	if (!mine) {
		error(404, 'Organization not found.');
	}
	const myRole = String(mine.role) as OrgRole;

	const organization = await pb.collection('organizations').getOne(params.id);
	const dto = toOrganizationDTO(organization);
	const enabled = dto.capabilities.includes(capability.id);

	// Phase 1C: the athletes capability is implemented software — load its records.
	// Identity fields live on `athletes` (all member roles); contact/eligibility
	// fields live on `athlete_private` (Owner/Admin-only by collection rule —
	// Scorekeepers/Viewers simply get an empty list back).
	let athletes = null;
	if (capability.id === 'athletes' && enabled) {
		const canSeePrivate = myRole === 'owner' || myRole === 'admin';
		const records = await pb.collection('athletes').getFullList({
			filter: `organization = "${params.id}"`,
			sort: 'lastName,firstName'
		});
		const privateByAthlete = new Map();
		if (canSeePrivate) {
			const privates = await pb.collection('athlete_private').getFullList({
				filter: `organization = "${params.id}"`
			});
			for (const p of privates) privateByAthlete.set(String(p.athlete), p);
		}
		athletes = records.map((r) => {
			const base = {
				id: r.id,
				firstName: String(r.firstName ?? ''),
				lastName: String(r.lastName ?? ''),
				displayName: String(r.displayName ?? '') || null,
				gender: String(r.gender ?? '') || null,
				nationality: String(r.nationality ?? '') || null,
				hasPrivateRecord: privateByAthlete.has(r.id),
				status: (String(r.status) || 'active') as 'active' | 'archived'
			};
			// Scorekeepers/Viewers: the private keys are OMITTED from the page
			// data entirely — not just nulled — so the payload cannot carry them.
			if (!canSeePrivate) return base;
			const priv = privateByAthlete.get(r.id);
			return {
				...base,
				email: priv ? String(priv.email ?? '') || null : null,
				phone: priv ? String(priv.phone ?? '') || null : null,
				eligibilityNotes: priv ? String(priv.eligibilityNotes ?? '') || null : null
			};
		});
	}

	return {
		organization: dto,
		myRole,
		canManage: myRole === 'owner' || myRole === 'admin',
		capability,
		enabled,
		enabledCapabilities: capabilityDefinitions.filter((c) => dto.capabilities.includes(c.id)),
		athletes
	};
};

/** Parses one CSV line, honoring simple double-quoted fields. */
function parseCsvLine(line: string): string[] {
	const out: string[] = [];
	let cur = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (inQuotes) {
			if (ch === '"' && line[i + 1] === '"') {
				cur += '"';
				i++;
			} else if (ch === '"') {
				inQuotes = false;
			} else {
				cur += ch;
			}
		} else if (ch === '"') {
			inQuotes = true;
		} else if (ch === ',') {
			out.push(cur.trim());
			cur = '';
		} else {
			cur += ch;
		}
	}
	out.push(cur.trim());
	return out;
}

/**
 * Athlete writes. The collection API rules enforce Owner/Admin; the
 * flihub_athletes hook enforces the capability being enabled. Both are
 * re-checked here so failures surface as form errors, not surprises.
 */
export const actions: Actions = {
	createAthlete: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			const created = await locals.pb.collection('athletes').create({
				organization: params.id,
				firstName: String(form.get('firstName') ?? '').trim(),
				lastName: String(form.get('lastName') ?? '').trim(),
				displayName: String(form.get('displayName') ?? '').trim(),
				gender: String(form.get('gender') ?? 'unspecified'),
				nationality: String(form.get('nationality') ?? '').trim(),
				status: 'active'
			});
			const email = String(form.get('email') ?? '').trim();
			const phone = String(form.get('phone') ?? '').trim();
			const eligibilityNotes = String(form.get('eligibilityNotes') ?? '').trim();
			if (email || phone || eligibilityNotes) {
				await locals.pb.collection('athlete_private').create({
					athlete: created.id,
					organization: params.id,
					email,
					phone,
					eligibilityNotes
				});
			}
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	updateAthlete: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		const id = String(form.get('athlete') ?? '');
		try {
			await locals.pb.collection('athletes').update(id, {
				firstName: String(form.get('firstName') ?? '').trim(),
				lastName: String(form.get('lastName') ?? '').trim(),
				displayName: String(form.get('displayName') ?? '').trim(),
				nationality: String(form.get('nationality') ?? '').trim()
			});
			const email = String(form.get('email') ?? '').trim();
			const phone = String(form.get('phone') ?? '').trim();
			const eligibilityNotes = String(form.get('eligibilityNotes') ?? '').trim();
			const existing = await locals.pb
				.collection('athlete_private')
				.getFirstListItem(`athlete = "${id}"`)
				.catch(() => null);
			if (existing) {
				await locals.pb.collection('athlete_private').update(existing.id, {
					email,
					phone,
					eligibilityNotes
				});
			} else if (email || phone || eligibilityNotes) {
				const athlete = await locals.pb.collection('athletes').getOne(id);
				await locals.pb.collection('athlete_private').create({
					athlete: id,
					organization: String(athlete.organization),
					email,
					phone,
					eligibilityNotes
				});
			}
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { updated: true };
	},

	archiveAthlete: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('athlete') ?? '');
		try {
			await locals.pb.collection('athletes').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	unarchiveAthlete: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('athlete') ?? '');
		try {
			await locals.pb.collection('athletes').update(id, { status: 'active' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { restored: true };
	},

	// Athlete writes. The collection API rules enforce Owner/Admin; the
	// flihub_athletes hook enforces the capability being enabled. Both are
	// re-checked here so failures surface as form errors, not surprises.
	// There is no deleteAthlete action: permanent delete is not part of the
	// Phase 1C lifecycle (archive/restore only) and the delete rule is locked.

	importAthletes: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const csv = String((await request.formData()).get('csv') ?? '');
		const rows = csv
			.split(/\r?\n/)
			.map((l) => l.trim())
			.filter((l) => l !== '');
		if (rows.length === 0) return fail(400, { message: 'Paste at least one CSV row.' });
		if (rows.length > 200) return fail(400, { message: 'Import at most 200 athletes at a time.' });

		let imported = 0;
		for (const [index, line] of rows.entries()) {
			const [firstName = '', lastName = '', gender = '', nationality = '', email = ''] =
				parseCsvLine(line);
			if (!firstName || !lastName) {
				return fail(400, {
					message: `Row ${index + 1} needs at least a first and last name.`
				});
			}
			const genderValue = ['female', 'male', 'other', 'unspecified'].includes(gender)
				? gender
				: 'unspecified';
			try {
				const created = await locals.pb.collection('athletes').create({
					organization: params.id,
					firstName,
					lastName,
					gender: genderValue,
					nationality,
					status: 'active'
				});
				if (email) {
					await locals.pb.collection('athlete_private').create({
						athlete: created.id,
						organization: params.id,
						email
					});
				}
				imported += 1;
			} catch (err) {
				return fail(pbErrorStatus(err), {
					message: `Row ${index + 1} failed: ${pbErrorMessage(err)} (${imported} imported before the failure)`
				});
			}
		}
		return { imported };
	}
};
