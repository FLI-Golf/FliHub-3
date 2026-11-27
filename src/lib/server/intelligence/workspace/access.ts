type AccessInput = {
	development: boolean;
	enabled: string | undefined;
	allowedUserIds: string | undefined;
	userId: string | null;
	sessionVerified: boolean;
};

export type WorkspaceAccess =
	{ allowed: true; userId: string } | { allowed: false; status: 401 | 403 | 404 };

const userIdPattern = /^[a-zA-Z0-9]{15}$/;

export function workspaceAllowedOwners(
	input: Pick<AccessInput, 'development' | 'enabled' | 'allowedUserIds'>
): ReadonlySet<string> {
	if (!input.development || input.enabled !== 'true') {
		return new Set();
	}

	const ids = input.allowedUserIds?.split(',').map((id) => id.trim()) ?? [];

	if (
		ids.length === 0 ||
		ids.length > 100 ||
		ids.some((id) => !userIdPattern.test(id)) ||
		new Set(ids).size !== ids.length
	) {
		return new Set();
	}

	return new Set(ids);
}

export function workspaceAccess(input: AccessInput): WorkspaceAccess {
	const ids = workspaceAllowedOwners(input);

	if (ids.size === 0) {
		return { allowed: false, status: 404 };
	}

	if (!input.userId || input.sessionVerified !== true) {
		return { allowed: false, status: 401 };
	}

	if (!ids.has(input.userId)) {
		return { allowed: false, status: 403 };
	}

	return { allowed: true, userId: input.userId };
}
