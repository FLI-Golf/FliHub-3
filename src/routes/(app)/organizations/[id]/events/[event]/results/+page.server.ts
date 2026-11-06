import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { OrgRole } from '$lib/server/auth';
import { pbErrorMessage, pbErrorStatus } from '$lib/server/auth';

const ID_PATTERN = /^[a-z0-9]{15}$/;

interface VersionTotals {
	rounds: { round: string; number: number; name: string; positionLabel: string }[];
	teams: { entry: string; teamName: string; roundTotals: Record<string, number>; total: number }[];
	athletes: {
		athlete: string;
		athleteName: string;
		entry: string;
		teamName: string;
		roundTotals: Record<string, number>;
		total: number;
	}[];
}

/**
 * Phase 1H official-results review (D16). The event_results rules +
 * flihub_results hook enforce every transition (Owner/Admin only, completeness
 * check, versioned snapshots, no unpublish); this load mirrors them only to
 * render an honest read-only state for ordinary members.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const pb = locals.pb;
	const user = locals.user;
	if (!pb || !user) error(503, 'PocketBase is not configured.');
	if (!ID_PATTERN.test(params.id) || !ID_PATTERN.test(params.event)) {
		error(404, 'Not found.');
	}
	const memberships = await pb.collection('memberships').getFullList({
		filter: `organization = "${params.id}"`,
		expand: 'user'
	});
	const mine = memberships.find((m) => String(m.user) === user.id);
	if (!mine) error(404, 'Not found.');
	const myRole = String(mine.role) as OrgRole;
	const memberName = new Map(
		memberships.map((m) => [
			String(m.user),
			String(
				(m.expand as { user?: { name?: string; email?: string } } | undefined)?.user?.name ??
					(m.expand as { user?: { email?: string } } | undefined)?.user?.email ??
					m.user
			)
		])
	);

	const event = await pb
		.collection('events')
		.getOne(params.event)
		.catch(() => null);
	if (!event || String(event.organization) !== params.id) error(404, 'Event not found.');

	const filter = `organization = "${params.id}"`;
	const eventFilter = `${filter} && event = "${params.event}"`;
	const [roundRows, groupRows, scorecardRows, resultRows, versionRows, resultChangeRows] =
		await Promise.all([
			pb.collection('rounds').getFullList({ filter: eventFilter, sort: 'number' }),
			pb.collection('event_groups').getFullList({ filter: eventFilter, sort: 'name' }),
			pb.collection('scorecards').getFullList({ filter: eventFilter, sort: 'created' }),
			pb.collection('event_results').getFullList({ filter: eventFilter }),
			pb.collection('result_versions').getFullList({ filter: eventFilter, sort: '-version' }),
			pb.collection('result_changes').getFullList({ filter: eventFilter, sort: '-created' })
		]);

	const activeRounds = roundRows.filter((r) => String(r.status) === 'active');
	const activeGroups = groupRows.filter((g) => String(g.status) === 'active');
	const cardByKey = new Map(scorecardRows.map((c) => [`${c.round}|${c.group}`, c]));
	const submissionGrid = activeRounds.map((round) => ({
		roundId: String(round.id),
		roundNumber: Number(round.number),
		positionLabel: String(round.positionLabel ?? ''),
		hasCourse: Boolean(round.course),
		groups: activeGroups.map((group) => {
			const card = cardByKey.get(`${round.id}|${group.id}`);
			return {
				groupName: String(group.name),
				status: card ? String(card.status) : 'missing'
			};
		})
	}));
	const submittedCount = submissionGrid.reduce(
		(sum, row) => sum + row.groups.filter((g) => g.status === 'submitted').length,
		0
	);
	const totalCards = activeRounds.length * activeGroups.length;

	const result = resultRows[0] ?? null;
	return {
		organizationId: params.id,
		myRole,
		canManage: myRole === 'owner' || myRole === 'admin',
		event: { id: String(event.id), name: String(event.name) },
		submissionGrid,
		submittedCount,
		totalCards,
		result: result
			? {
					id: String(result.id),
					status: String(result.status),
					currentVersion: Number(result.currentVersion),
					publishedVersion: Number(result.publishedVersion ?? 0),
					pendingReason: String(result.pendingReason ?? '')
				}
			: null,
		versions: versionRows.map((v) => ({
			version: Number(v.version),
			totals: v.totals as VersionTotals,
			reason: String(v.reason ?? ''),
			approvedByName: memberName.get(String(v.approvedBy)) ?? String(v.approvedBy),
			approvedAt: String(v.approvedAt ?? ''),
			publishedByName: v.publishedBy
				? (memberName.get(String(v.publishedBy)) ?? String(v.publishedBy))
				: null,
			publishedAt: String(v.publishedAt ?? '')
		})),
		changes: resultChangeRows.map((ch) => ({
			action: String(ch.action),
			version: Number(ch.version),
			reason: String(ch.reason ?? ''),
			authorName: memberName.get(String(ch.author)) ?? String(ch.author),
			created: String(ch.created ?? '')
		}))
	};
};

export const actions: Actions = {
	// Approval (first or re-approval). The hook validates completeness and
	// snapshots totals; the rules restrict callers to Owners/Admins.
	approveResult: async ({ locals, request, params }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		const resultId = String(form.get('result') ?? '');
		try {
			if (resultId) {
				await locals.pb.collection('event_results').update(resultId, { status: 'approved' });
			} else {
				await locals.pb.collection('event_results').create({
					organization: params.id,
					event: params.event
				});
			}
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { approved: true };
	},

	publishResult: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const resultId = String((await request.formData()).get('result') ?? '');
		try {
			await locals.pb.collection('event_results').update(resultId, { status: 'published' });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { published: true };
	},

	reopenResult: async ({ locals, request }) => {
		if (!locals.pb || !locals.user) return fail(503, { message: 'PocketBase is not configured.' });
		const form = await request.formData();
		const resultId = String(form.get('result') ?? '');
		const reason = String(form.get('reason') ?? '').trim();
		if (!reason) {
			return fail(400, {
				message: 'Provide a correction reason — it is recorded in the result history.'
			});
		}
		try {
			await locals.pb
				.collection('event_results')
				.update(resultId, { status: 'correcting', reason });
		} catch (err) {
			return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
		}
		return { reopened: true };
	}
};
