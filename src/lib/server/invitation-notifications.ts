export interface PendingInvitation {
	invitationId: string;
	organizationName: string;
	role: string;
	expiresAt: string;
}
export interface PendingInvitations {
	items: PendingInvitation[];
	page: number;
	hasMore: boolean;
}
export type InvitationNoticeState = 'none' | 'pending' | 'unavailable';
interface Reader {
	send<T>(path: string, options: { method: string; query: Record<string, number> }): Promise<T>;
}
/** Read failure is unknown, never a false claim that there are no invitations. */
export async function invitationNotice(
	pb: Reader,
	verified: boolean
): Promise<InvitationNoticeState> {
	if (!verified) return 'none';
	try {
		const result = await pb.send<PendingInvitations>('/api/flihub/invitations/pending', {
			method: 'GET',
			query: { page: 1, perPage: 1 }
		});
		return result.items.length > 0 ? 'pending' : 'none';
	} catch {
		return 'unavailable';
	}
}
