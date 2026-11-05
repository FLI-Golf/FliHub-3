/// <reference path="../pb_data/types.d.ts" />
/**
 * Phase 1A application settings: FliHub branding, the SvelteKit app URL used
 * in auth emails, and local SMTP capture (mailpit) for development email.
 *
 * mailpit (https://mailpit.axllent.org/) is expected on 127.0.0.1:1025 for
 * local development; see pocketbase/README.md. Integration tests override the
 * SMTP port on their disposable instance.
 */
migrate(
	(app) => {
		const settings = app.settings();
		settings.meta.appName = 'FliHub';
		settings.meta.appURL = 'http://localhost:5173';
		settings.meta.hideControls = false;
		settings.senderAddress = 'noreply@flihub.local';
		settings.senderName = 'FliHub';
		settings.smtp.enabled = true;
		settings.smtp.host = '127.0.0.1';
		settings.smtp.port = 1025;
		settings.smtp.username = '';
		settings.smtp.password = '';
		settings.smtp.tls = false;
		return app.save(settings);
	},
	(app) => {
		const settings = app.settings();
		settings.meta.appName = 'PocketBase';
		settings.meta.appURL = 'http://127.0.0.1:8090';
		settings.smtp.enabled = false;
		return app.save(settings);
	}
);
