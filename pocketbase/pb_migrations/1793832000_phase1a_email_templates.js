/// <reference path="../pb_data/types.d.ts" />
/**
 * Phase 1A email templates: point PocketBase auth emails at the SvelteKit app
 * instead of the PocketBase admin UI, so verification links land on the
 * app-hosted `/verify-email/{TOKEN}` route. In local development the message
 * is captured by mailpit (see pocketbase/README.md).
 */
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.verificationTemplate.subject = 'Verify your {APP_NAME} email';
		users.verificationTemplate.body =
			'<p>Hello,</p>\n' +
			'<p>Click the link below to verify your {APP_NAME} email address.</p>\n' +
			'<p>\n' +
			'  <a class="btn" href="{APP_URL}/verify-email/{TOKEN}" target="_blank" rel="noopener">Verify email</a>\n' +
			'</p>\n' +
			'<p><i>If you did not create an account, you can ignore this email.</i></p>\n' +
			'<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>';
		return app.save(users);
	},
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.verificationTemplate.subject = 'Verify your {APP_NAME} email';
		users.verificationTemplate.body =
			'<p>Hello,</p>\n' +
			'<p>Click on the button below to verify your email address.</p>\n' +
			'<p>\n' +
			'  <a class="btn" href="{APP_URL}/_/#/auth/confirm-verification/{TOKEN}" target="_blank" rel="noopener">Verify</a>\n' +
			'</p>\n' +
			'<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>';
		return app.save(users);
	}
);
