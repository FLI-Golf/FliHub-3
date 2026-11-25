import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute } from 'node:path';

const flags = ['shell_tool', 'unified_exec', 'apps', 'hooks', 'multi_agent'].flatMap((feature) => [
	'--disable',
	feature
]);

// Empty credentials and config by construction. These are metadata commands;
// this preflight never starts a turn or accesses the operator's Codex home.
export function inspectProposalTransport(executable: string) {
	if (!isAbsolute(executable)) throw new Error('Specify a trusted absolute Codex executable.');
	const codex = realpathSync(executable);
	const root = mkdtempSync(`${tmpdir()}/flihub-proposal-preflight-`);
	try {
		const read = (args: string[]) => {
			const child = spawnSync(codex, args, {
				cwd: root,
				env: {
					HOME: root,
					CODEX_HOME: root,
					PATH: dirname(realpathSync(process.execPath)) + ':/usr/bin:/bin',
					LANG: 'C.UTF-8'
				},
				encoding: 'utf8',
				timeout: 5000,
				maxBuffer: 65_536,
				stdio: ['ignore', 'pipe', 'pipe']
			});
			if (child.error || child.status !== 0) throw new Error('Codex metadata unavailable.');
			return child.stdout;
		};
		const version = /^codex-cli (\d+\.\d+\.\d+)\s*$/.exec(read(['--version']))?.[1];
		if (!version) throw new Error('Unrecognized Codex version.');
		const features = read([...flags, 'features', 'list']);
		const unified = /^unified_exec\s+.+?\s+(true|false)$/m.exec(features)?.[1];
		const shell = /^shell_tool\s+.+?\s+(true|false)$/m.exec(features)?.[1];
		return {
			version,
			localManagedPolicy: existsSync('/etc/codex/requirements.toml')
				? 'present_unverified'
				: 'absent',
			workspacePolicy: 'unverified',
			shellTool: shell === undefined ? 'unknown' : shell === 'true',
			unifiedExec: unified === undefined ? 'unknown' : unified === 'true',
			admitted: false,
			reason:
				unified === 'true' ? 'unified_exec_still_enabled' : 'effective_tool_boundary_unverified'
		};
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	if (process.argv.length !== 3) throw new Error('Specify the trusted Codex executable.');
	console.log(JSON.stringify(inspectProposalTransport(process.argv[2])));
}
