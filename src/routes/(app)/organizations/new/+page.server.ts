import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { pbErrorMessage, pbErrorStatus, setActiveOrgCookie } from '$lib/server/auth';
import { creationPlan } from '$lib/setup/creation';

export const actions: Actions = {
	default: async ({ locals, request, cookies }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const selection = {
			activity: String(form.get('activity') ?? ''),
			format: String(form.get('format') ?? ''),
			competitors: String(form.get('competitors') ?? ''),
			result: String(form.get('result') ?? '')
		};
		const denied = (status: number, message: string) => fail(status, { message, name, selection });
		if (!locals.pb || !locals.user)
			return denied(503, 'Sign in with a configured PocketBase instance.');
		if (!locals.user.verified)
			return denied(403, 'Verify your email before creating an organization.');
		if (name.length < 2 || name.length > 120)
			return denied(400, 'Organization names need 2–120 characters.');
		if (!creationPlan(selection))
			return denied(
				400,
				'This combination is preview-only. Creation currently supports Disc golf → League season → Teams → Strokes.'
			);
		let id: string;
		try {
			const created = await locals.pb.send<{ id: string }>('/api/flihub/organizations', {
				method: 'POST',
				body: { name, guidedSetup: { version: 1, ...selection } }
			});
			id = created.id;
		} catch (err) {
			return denied(pbErrorStatus(err), pbErrorMessage(err));
		}
		setActiveOrgCookie(cookies, id);
		redirect(303, `/organizations/${id}`);
	}
};
