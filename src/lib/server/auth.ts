import { dev } from '$app/env';
import type { Cookies } from '@sveltejs/kit';
import { ClientResponseError } from 'pocketbase';
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import type { RaceDistance, TemplateId } from '$lib/capabilities/catalog';

/**
 * Server-side helpers for Phase 1A authentication and organization state.
 * Everything here runs on the server only; DTOs are safe to serialize to
 * the browser.
 */

/** Cookie that records the user's currently active organization. */
export const ACTIVE_ORG_COOKIE = 'flihub_active_org';

export type OrgRole = 'owner' | 'admin' | 'scorekeeper' | 'viewer';

export interface UserDTO {
	id: string;
	email: string;
	name: string;
	verified: boolean;
}

export interface OrganizationDTO {
	id: string;
	name: string;
	/** Starter template id, or '' when the organization was created without one. */
	template: TemplateId | '';
	/** Enabled capability ids (validated server-side against the catalog). */
	capabilities: string[];
	/** Whether onboarding has been completed. Existing orgs stay false until setup. */
	onboarded: boolean;
	/** Race/Event distance configuration (race-event template only). */
	raceDistances: RaceDistance[];
}

/** Parses a PocketBase JSON field defensively (may arrive as string or value). */
function jsonList<T>(value: unknown): T[] {
	if (Array.isArray(value)) return value as T[];
	if (typeof value === 'string' && value.trim() !== '') {
		try {
			const parsed = JSON.parse(value);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}
	return [];
}

/** Serializes an organization record for the browser. */
export function toOrganizationDTO(record: RecordModel): OrganizationDTO {
	return {
		id: record.id,
		name: String(record.name ?? ''),
		template: (String(record.template ?? '') || '') as OrganizationDTO['template'],
		capabilities: jsonList<string>(record.capabilities),
		onboarded: Boolean(record.onboarded),
		raceDistances: jsonList<RaceDistance>(record.race_distances)
	};
}

export interface MembershipDTO {
	id: string;
	role: OrgRole;
	organization: OrganizationDTO;
}

/** Serializes the authenticated PocketBase user record for the browser. */
export function toUserDTO(record: RecordModel): UserDTO {
	return {
		id: record.id,
		email: String(record.email ?? ''),
		name: String(record.name ?? ''),
		verified: Boolean(record.verified)
	};
}

/**
 * Lists the signed-in user's memberships with the organization expanded.
 * PocketBase collection rules restrict this to the caller's own
 * memberships; the filter is defense-in-depth.
 */
export async function listMyMemberships(pb: PocketBase, userId: string): Promise<MembershipDTO[]> {
	const records = await pb.collection('memberships').getFullList({
		filter: `user = "${userId}"`,
		expand: 'organization',
		sort: 'created'
	});
	return records.map((m) => {
		const org = m.expand?.organization as RecordModel | undefined;
		return {
			id: m.id,
			role: String(m.role) as OrgRole,
			organization: org
				? toOrganizationDTO(org)
				: {
						id: String(m.organization),
						name: '',
						template: '' as const,
						capabilities: [],
						onboarded: false,
						raceDistances: []
					}
		};
	});
}

/**
 * Resolves the active organization id from the cookie, falling back to the
 * first membership. A cookie value the user is not a member of is ignored.
 */
export function resolveActiveOrgId(cookies: Cookies, memberships: MembershipDTO[]): string | null {
	const requested = cookies.get(ACTIVE_ORG_COOKIE);
	if (requested && memberships.some((m) => m.organization.id === requested)) {
		return requested;
	}
	return memberships[0]?.organization.id ?? null;
}

/** Persists the active organization choice. */
export function setActiveOrgCookie(cookies: Cookies, organizationId: string): void {
	cookies.set(ACTIVE_ORG_COOKIE, organizationId, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		secure: !dev
	});
}

/**
 * Validates a post-login redirect target: only same-site absolute paths
 * are allowed, so crafted `?next=` values cannot send users off-site.
 */
export function safeNextPath(value: string | null, fallback = '/account'): string {
	if (value && value.startsWith('/') && !value.startsWith('//')) {
		return value;
	}
	return fallback;
}

/**
 * Extracts a user-facing message from a PocketBase `ClientResponseError`
 * (including the `{ code, message }` contract returned by the Phase 1A
 * trusted hooks in `pocketbase/pb_hooks/flihub.pb.js`).
 */
export function pbErrorMessage(err: unknown, fallback = 'The request failed.'): string {
	if (err instanceof ClientResponseError) {
		if (typeof err.message === 'string' && err.message.trim() !== '') {
			return err.message;
		}
	}
	return fallback;
}

/** Extracts an HTTP status suitable for `fail()` from a PocketBase error. */
export function pbErrorStatus(err: unknown): number {
	if (err instanceof ClientResponseError && err.status >= 400 && err.status < 600) {
		return err.status;
	}
	return 500;
}
