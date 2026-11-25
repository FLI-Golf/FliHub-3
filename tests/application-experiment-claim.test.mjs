import test from 'node:test';
import assert from 'node:assert/strict';
import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
	statSync,
	chmodSync,
	symlinkSync,
	rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import { claimExperimentAuthorization } from '../tools/application/experiment-claim.ts';

const digest = 'a'.repeat(64);
const filename = 'synthetic-event-assessment.claim';

function fixture(t) {
	const root = mkdtempSync(join(tmpdir(), 'flihub-claim-test-'));

	t.after(() =>
		rmSync(root, {
			recursive: true,
			force: true
		})
	);

	return join(root, 'claims');
}

test('first authorization creates a private persistent claim', (t) => {
	const directory = fixture(t);

	assert.equal(claimExperimentAuthorization(directory, digest).status, 'claimed');

	const path = join(directory, filename);
	const record = JSON.parse(readFileSync(path, 'utf8'));

	assert.equal(record.experiment, 'synthetic_event_assessment');
	assert.equal(record.requestSha256, digest);
	assert.ok(record.claimedAt);
	assert.equal(statSync(path).mode & 0o777, 0o600);
	assert.equal(statSync(directory).mode & 0o777, 0o700);
});

test('existing authorization cannot be reused', (t) => {
	const directory = fixture(t);

	assert.equal(claimExperimentAuthorization(directory, digest).status, 'claimed');

	assert.deepEqual(claimExperimentAuthorization(directory, digest), {
		status: 'rejected',
		reason: 'already_claimed'
	});
});

test('changing the digest cannot reopen the first experiment', (t) => {
	const directory = fixture(t);

	claimExperimentAuthorization(directory, digest);

	assert.deepEqual(claimExperimentAuthorization(directory, 'b'.repeat(64)), {
		status: 'rejected',
		reason: 'already_claimed'
	});
});

test('malformed digests and relative directories are rejected', (t) => {
	const directory = fixture(t);

	for (const value of ['', '../claim', 'A'.repeat(64)]) {
		assert.deepEqual(claimExperimentAuthorization(directory, value), {
			status: 'rejected',
			reason: 'invalid_claim'
		});
	}

	assert.deepEqual(claimExperimentAuthorization('relative', digest), {
		status: 'rejected',
		reason: 'invalid_claim'
	});
});

test('insecure directory permissions fail closed', (t) => {
	const directory = fixture(t);

	mkdirSync(directory);
	chmodSync(directory, 0o755);

	assert.deepEqual(claimExperimentAuthorization(directory, digest), {
		status: 'rejected',
		reason: 'storage_unavailable'
	});
});

test('symbolic link storage is rejected', (t) => {
	const directory = fixture(t);
	const target = directory + '-target';

	mkdirSync(target, { mode: 0o700 });
	symlinkSync(target, directory);

	assert.deepEqual(claimExperimentAuthorization(directory, digest), {
		status: 'rejected',
		reason: 'storage_unavailable'
	});
});

test('incomplete existing claims are never reopened', (t) => {
	const directory = fixture(t);

	mkdirSync(directory, { mode: 0o700 });
	writeFileSync(join(directory, filename), '', { mode: 0o600 });

	assert.deepEqual(claimExperimentAuthorization(directory, digest), {
		status: 'rejected',
		reason: 'already_claimed'
	});
});

test('independent processes can claim the experiment only once', async (t) => {
	const directory = fixture(t);

	const moduleUrl = new URL('../tools/application/experiment-claim.ts', import.meta.url).href;

	const script = `
        import { claimExperimentAuthorization } from ${JSON.stringify(moduleUrl)};
        console.log(JSON.stringify(
            claimExperimentAuthorization(process.argv[1], process.argv[2])
        ));
    `;

	function worker() {
		return new Promise((resolve, reject) => {
			const child = spawn(process.execPath, [
				'--input-type=module',
				'-e',
				script,
				directory,
				digest
			]);

			let output = '';
			let stderr = '';

			child.stderr.on('data', (chunk) => {
				stderr += chunk;
			});

			child.stdout.on('data', (chunk) => {
				output += chunk;
			});

			child.on('error', reject);

			child.on('close', (code) => {
				if (code !== 0) {
					reject(new Error(`Claim worker failed (exit ${code}): ${stderr}`));
					return;
				}

				try {
					resolve(JSON.parse(output));
				} catch (error) {
					reject(error);
				}
			});
		});
	}

	const results = await Promise.all([worker(), worker(), worker(), worker()]);

	assert.equal(results.filter((result) => result.status === 'claimed').length, 1);

	assert.equal(results.filter((result) => result.reason === 'already_claimed').length, 3);
});
