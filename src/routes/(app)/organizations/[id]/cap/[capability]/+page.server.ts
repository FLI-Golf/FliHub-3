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

	// Phase 1D: competition structure (decisions recorded as D12). Identity and
	// relationships are readable by every organization member; only Owners and
	// Admins write (collection rules), with the capability gate and same-org /
	// division-in-season integrity enforced by the flihub_competitions hook.
	// Phase 1E (D13) adds season rosters, reserve pools, and substitutions to
	// the same capability, enforced by the flihub_rosters hook.
	let teams = null;
	let rosters = null;
	if (capability.id === 'teams' && enabled) {
		const filter = `organization = "${params.id}"`;
		const [
			teamRows,
			seasonRows,
			entryRows,
			athleteRows,
			membershipRows,
			poolRows,
			reserveRows,
			substitutionRows,
			eventRows
		] = await Promise.all([
			pb.collection('teams').getFullList({ filter, sort: 'name' }),
			pb
				.collection('seasons')
				.getFullList({ filter, sort: 'name' })
				.catch(() => []),
			pb
				.collection('season_entries')
				.getFullList({ filter, sort: 'id' })
				.catch(() => []),
			pb
				.collection('athletes')
				.getFullList({ filter, sort: 'lastName,firstName' })
				.catch(() => []),
			pb.collection('roster_memberships').getFullList({ filter, sort: 'created' }),
			pb.collection('reserve_pools').getFullList({ filter, sort: 'name' }),
			pb.collection('reserve_members').getFullList({ filter, sort: 'created' }),
			pb.collection('substitutions').getFullList({ filter, sort: '-created' }),
			pb.collection('events').getFullList({ filter: `${filter} && season != ""`, sort: 'name' })
		]);
		teams = teamRows.map((t) => ({
			id: t.id,
			name: String(t.name ?? ''),
			status: (String(t.status) || 'active') as 'active' | 'archived'
		}));
		const teamName = new Map(teamRows.map((t) => [t.id, String(t.name ?? '')]));
		const athleteName = new Map(
			athleteRows.map((a) => [
				a.id,
				String(a.displayName ?? '') ||
					`${String(a.firstName ?? '')} ${String(a.lastName ?? '')}`.trim()
			])
		);
		const eventName = new Map(eventRows.map((ev) => [ev.id, String(ev.name ?? '')]));
		const entryTeam = new Map(entryRows.map((en) => [en.id, String(en.team ?? '')]));
		rosters = {
			seasons: seasonRows.map((s) => ({
				id: s.id,
				name: String(s.name ?? ''),
				status: (String(s.status) || 'planned') as 'planned' | 'active' | 'completed' | 'archived'
			})),
			entries: entryRows.map((en) => ({
				id: en.id,
				season: String(en.season ?? ''),
				team: String(en.team ?? ''),
				teamName: teamName.get(String(en.team ?? '')) ?? '',
				status: (String(en.status) || 'active') as 'active' | 'archived'
			})),
			athletes: athleteRows.map((a) => ({
				id: a.id,
				name: athleteName.get(a.id) ?? '',
				gender: String(a.gender ?? '') || null,
				status: (String(a.status) || 'active') as 'active' | 'archived'
			})),
			memberships: membershipRows.map((m) => ({
				id: m.id,
				entry: String(m.entry ?? ''),
				season: String(m.season ?? ''),
				athlete: String(m.athlete ?? ''),
				athleteName: athleteName.get(String(m.athlete ?? '')) ?? '',
				status: (String(m.status) || 'active') as 'active' | 'archived'
			})),
			pools: poolRows.map((p) => ({
				id: p.id,
				season: String(p.season ?? ''),
				name: String(p.name ?? ''),
				gender: String(p.gender ?? '') || null,
				status: (String(p.status) || 'active') as 'active' | 'archived'
			})),
			reserves: reserveRows.map((r) => ({
				id: r.id,
				pool: String(r.pool ?? ''),
				season: String(r.season ?? ''),
				athlete: String(r.athlete ?? ''),
				athleteName: athleteName.get(String(r.athlete ?? '')) ?? '',
				status: (String(r.status) || 'active') as 'active' | 'archived'
			})),
			substitutions: substitutionRows.map((s) => ({
				id: s.id,
				event: String(s.event ?? ''),
				eventName: eventName.get(String(s.event ?? '')) ?? '',
				entry: String(s.entry ?? ''),
				teamName: teamName.get(entryTeam.get(String(s.entry ?? '')) ?? '') ?? '',
				athleteOutName: athleteName.get(String(s.athleteOut ?? '')) ?? '',
				athleteInName: athleteName.get(String(s.athleteIn ?? '')) ?? '',
				reason: String(s.reason ?? '') || null,
				created: String(s.created ?? '')
			})),
			events: eventRows.map((ev) => ({
				id: ev.id,
				season: String(ev.season ?? ''),
				name: String(ev.name ?? '')
			}))
		};
	}

	let competition = null;
	if (capability.id === 'leagues-seasons' && enabled) {
		const filter = `organization = "${params.id}"`;
		const [leagueRows, seasonRows, divisionRows, entryRows, teamRows] = await Promise.all([
			pb.collection('leagues').getFullList({ filter, sort: 'name' }),
			pb.collection('seasons').getFullList({ filter, sort: 'name' }),
			pb.collection('divisions').getFullList({ filter, sort: 'name' }),
			// NB: 1C/1D collections have no created/updated autodate fields (only the
			// 1A collections do), so sorting by 'created' would 400 — use stable id.
			pb.collection('season_entries').getFullList({ filter, sort: 'id' }),
			pb.collection('teams').getFullList({ filter, sort: 'name' })
		]);
		const leagueName = new Map(leagueRows.map((l) => [l.id, String(l.name ?? '')]));
		const teamName = new Map(teamRows.map((t) => [t.id, String(t.name ?? '')]));
		const divisionName = new Map(divisionRows.map((d) => [d.id, String(d.name ?? '')]));
		competition = {
			leagues: leagueRows.map((l) => ({
				id: l.id,
				name: String(l.name ?? ''),
				status: (String(l.status) || 'active') as 'active' | 'archived'
			})),
			seasons: seasonRows.map((s) => ({
				id: s.id,
				league: String(s.league ?? ''),
				leagueName: leagueName.get(String(s.league ?? '')) ?? '',
				name: String(s.name ?? ''),
				status: (String(s.status) || 'planned') as 'planned' | 'active' | 'completed' | 'archived',
				startsOn: String(s.startsOn ?? '') || null,
				endsOn: String(s.endsOn ?? '') || null
			})),
			divisions: divisionRows.map((d) => ({
				id: d.id,
				season: String(d.season ?? ''),
				name: String(d.name ?? ''),
				status: (String(d.status) || 'active') as 'active' | 'archived'
			})),
			entries: entryRows.map((en) => ({
				id: en.id,
				season: String(en.season ?? ''),
				team: String(en.team ?? ''),
				teamName: teamName.get(String(en.team ?? '')) ?? '',
				division: String(en.division ?? '') || null,
				divisionName: divisionName.get(String(en.division ?? '')) ?? null,
				status: (String(en.status) || 'active') as 'active' | 'archived'
			})),
			teams: teamRows.map((t) => ({
				id: t.id,
				name: String(t.name ?? ''),
				status: (String(t.status) || 'active') as 'active' | 'archived'
			}))
		};
	}

	let eventsData = null;
	if (capability.id === 'events' && enabled) {
		const filter = `organization = "${params.id}"`;
		const [eventRows, seasonRows] = await Promise.all([
			pb.collection('events').getFullList({ filter, sort: 'startsAt,name' }),
			pb.collection('seasons').getFullList({ filter, sort: 'name' })
		]);
		const seasonName = new Map(seasonRows.map((s) => [s.id, String(s.name ?? '')]));
		eventsData = {
			events: eventRows.map((ev) => ({
				id: ev.id,
				season: String(ev.season ?? '') || null,
				seasonName: seasonName.get(String(ev.season ?? '')) ?? null,
				name: String(ev.name ?? ''),
				startsAt: String(ev.startsAt ?? '') || null,
				status: (String(ev.status) || 'planned') as 'planned' | 'active' | 'completed' | 'archived'
			})),
			seasons: seasonRows.map((s) => ({ id: s.id, name: String(s.name ?? '') }))
		};
	}

	return {
		organization: dto,
		myRole,
		canManage: myRole === 'owner' || myRole === 'admin',
		capability,
		enabled,
		enabledCapabilities: capabilityDefinitions.filter((c) => dto.capabilities.includes(c.id)),
		athletes,
		teams,
		rosters,
		competition,
		eventsData
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
	},

	// --- Phase 1D: teams ------------------------------------------------------
	// Collection rules enforce Owner/Admin; the flihub_competitions hook
	// enforces the capability gate. Failures surface as form errors.
	createTeam: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('teams').create({
				organization: params.id,
				name: String(form.get('name') ?? '').trim(),
				status: 'active'
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	renameTeam: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('teams').update(String(form.get('team') ?? ''), {
				name: String(form.get('name') ?? '').trim()
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { updated: true };
	},

	archiveTeam: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('team') ?? '');
		try {
			await locals.pb.collection('teams').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	unarchiveTeam: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('team') ?? '');
		try {
			await locals.pb.collection('teams').update(id, { status: 'active' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { restored: true };
	},

	// --- Phase 1D: leagues ----------------------------------------------------
	createLeague: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('leagues').create({
				organization: params.id,
				name: String(form.get('name') ?? '').trim(),
				status: 'active'
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	renameLeague: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('leagues').update(String(form.get('league') ?? ''), {
				name: String(form.get('name') ?? '').trim()
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { updated: true };
	},

	archiveLeague: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('league') ?? '');
		try {
			await locals.pb.collection('leagues').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	unarchiveLeague: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('league') ?? '');
		try {
			await locals.pb.collection('leagues').update(id, { status: 'active' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { restored: true };
	},

	// --- Phase 1D: seasons ----------------------------------------------------
	createSeason: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('seasons').create({
				organization: params.id,
				league: String(form.get('league') ?? ''),
				name: String(form.get('name') ?? '').trim(),
				status: 'planned',
				startsOn: String(form.get('startsOn') ?? '') || null,
				endsOn: String(form.get('endsOn') ?? '') || null
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	updateSeason: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		const status = String(form.get('status') ?? 'planned');
		if (!['planned', 'active', 'completed'].includes(status)) {
			return fail(400, { message: 'Season status must be planned, active, or completed.' });
		}
		try {
			await locals.pb.collection('seasons').update(String(form.get('season') ?? ''), {
				name: String(form.get('name') ?? '').trim(),
				status,
				startsOn: String(form.get('startsOn') ?? '') || null,
				endsOn: String(form.get('endsOn') ?? '') || null
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { updated: true };
	},

	archiveSeason: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('season') ?? '');
		try {
			await locals.pb.collection('seasons').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	// Restoring returns an archived season to 'planned' — the least-committed
	// state; the organizer advances it explicitly.
	unarchiveSeason: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('season') ?? '');
		try {
			await locals.pb.collection('seasons').update(id, { status: 'planned' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { restored: true };
	},

	// --- Phase 1D: divisions --------------------------------------------------
	createDivision: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('divisions').create({
				organization: params.id,
				season: String(form.get('season') ?? ''),
				name: String(form.get('name') ?? '').trim(),
				status: 'active'
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	archiveDivision: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('division') ?? '');
		try {
			await locals.pb.collection('divisions').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	unarchiveDivision: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('division') ?? '');
		try {
			await locals.pb.collection('divisions').update(id, { status: 'active' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { restored: true };
	},

	// --- Phase 1D: season entries (D12: one entry per team per season; -----
	// optional division must belong to the entry's season — hook-enforced) ---
	addEntry: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('season_entries').create({
				organization: params.id,
				season: String(form.get('season') ?? ''),
				team: String(form.get('team') ?? ''),
				division: String(form.get('division') ?? '') || null,
				status: 'active'
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	assignEntryDivision: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('season_entries').update(String(form.get('entry') ?? ''), {
				division: String(form.get('division') ?? '') || null
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { updated: true };
	},

	withdrawEntry: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('entry') ?? '');
		try {
			await locals.pb.collection('season_entries').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	restoreEntry: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('entry') ?? '');
		try {
			await locals.pb.collection('season_entries').update(id, { status: 'active' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { restored: true };
	},

	// --- Phase 1D: events (D12: one optional season; empty = independent) -----
	createEvent: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('events').create({
				organization: params.id,
				season: String(form.get('season') ?? '') || null,
				name: String(form.get('name') ?? '').trim(),
				status: 'planned',
				startsAt: String(form.get('startsAt') ?? '') || null
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	updateEvent: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		const status = String(form.get('status') ?? 'planned');
		if (!['planned', 'active', 'completed'].includes(status)) {
			return fail(400, { message: 'Event status must be planned, active, or completed.' });
		}
		try {
			await locals.pb.collection('events').update(String(form.get('event') ?? ''), {
				name: String(form.get('name') ?? '').trim(),
				season: String(form.get('season') ?? '') || null,
				startsAt: String(form.get('startsAt') ?? '') || null,
				status
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { updated: true };
	},

	archiveEvent: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('event') ?? '');
		try {
			await locals.pb.collection('events').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	unarchiveEvent: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('event') ?? '');
		try {
			await locals.pb.collection('events').update(id, { status: 'planned' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { restored: true };
	},

	// --- Phase 1E: season rosters (D13: roster rows belong to the entry; ------
	// the flihub_rosters hook derives season and enforces exclusivity) --------
	addRosterMember: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('roster_memberships').create({
				organization: params.id,
				entry: String(form.get('entry') ?? ''),
				athlete: String(form.get('athlete') ?? ''),
				status: 'active'
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	// Removal is an archive: the row is the preserved participation history.
	removeRosterMember: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('membership') ?? '');
		try {
			await locals.pb.collection('roster_memberships').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	restoreRosterMember: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('membership') ?? '');
		try {
			await locals.pb.collection('roster_memberships').update(id, { status: 'active' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { restored: true };
	},

	// --- Phase 1E: reserve pools (optional gender restriction is pilot --------
	// configuration, enforced at join time by the hook) ------------------------
	createReservePool: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('reserve_pools').create({
				organization: params.id,
				season: String(form.get('season') ?? ''),
				name: String(form.get('name') ?? '').trim(),
				gender: String(form.get('gender') ?? '') || null,
				status: 'active'
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	archiveReservePool: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('pool') ?? '');
		try {
			await locals.pb.collection('reserve_pools').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	unarchiveReservePool: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('pool') ?? '');
		try {
			await locals.pb.collection('reserve_pools').update(id, { status: 'active' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { restored: true };
	},

	addReserveMember: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('reserve_members').create({
				organization: params.id,
				pool: String(form.get('pool') ?? ''),
				athlete: String(form.get('athlete') ?? ''),
				status: 'active'
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	},

	removeReserveMember: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const id = String((await request.formData()).get('member') ?? '');
		try {
			await locals.pb.collection('reserve_members').update(id, { status: 'archived' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { archived: true };
	},

	// --- Phase 1E: substitutions (append-only; the hook validates the event, --
	// roster spot, and reserve membership, and records the author) -------------
	recordSubstitution: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		try {
			await locals.pb.collection('substitutions').create({
				organization: params.id,
				event: String(form.get('event') ?? ''),
				entry: String(form.get('entry') ?? ''),
				athleteOut: String(form.get('athleteOut') ?? ''),
				athleteIn: String(form.get('athleteIn') ?? ''),
				reason: String(form.get('reason') ?? '').trim()
			});
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { created: true };
	}
};
