/// <reference path="../pb_data/types.d.ts" />
/**
 * Environment-specific app URL used in PocketBase auth emails (local
 * development / Codespaces / deployments).
 *
 * The verification email template (pb_migrations/1793832000_phase1a_email_templates.js)
 * builds its link as `{APP_URL}/verify-email/{TOKEN}`, where `{APP_URL}` is
 * `settings.meta.appURL`. The committed settings migration seeds a localhost
 * default, which is correct for plain `localhost` development but wrong inside
 * a GitHub Codespace, where the app is reached through a forwarded HTTPS URL.
 *
 * The URL is supplied via the FLIHUB_APP_URL environment variable, read at send
 * time. That keeps the environment-specific value out of committed migrations
 * and out of pb_data — see pocketbase/README.md for how to set it.
 *
 * Only the app-URL base is rewritten. Verification tokens, recipient checks,
 * and token expiration are unchanged.
 */
// Send-time rewrite, not a settings save: the mailer builds {APP_URL} from the
// persisted settings, and saving settings from a hook panics during bootstrap
// in this PocketBase version, while mutating the in-memory struct doesn't reach
// the mailer. Rewriting the rendered message is reliable, and onMailerSend runs
// at request time after the app is fully initialized.
onMailerSend((e) => {
	try {
		const appUrl = String($os.getenv('FLIHUB_APP_URL') || '')
			.trim()
			.replace(/\/+$/, '');
		if (appUrl && e.message) {
			const base = String(e.app.settings().meta.appURL || '')
				.trim()
				.replace(/\/+$/, '');
			if (base && base !== appUrl) {
				if (e.message.html) e.message.html = e.message.html.split(base).join(appUrl);
				if (e.message.text) e.message.text = e.message.text.split(base).join(appUrl);
			}
		}
	} catch (err) {
		// A rewrite problem must never block delivery of an auth email.
	}
	e.next();
});
