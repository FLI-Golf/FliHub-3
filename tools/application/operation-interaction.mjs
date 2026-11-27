/**
 * Trusted local operator interaction.
 *
 * The exact plan must be displayed before confirmation.
 * Confirmation is bound to the captured review identity.
 * Publication uses the existing verified operation boundary.
 */

export async function reviewSyntheticOperation(result, { write, question, signal }) {
	if (result.status !== 'review_required') {
		return { status: 'rejected', reason: 'review_required' };
	}

	const { session, plan, review } = result;

	try {
		if (signal?.aborted) {
			return { status: 'cancelled' };
		}

		const current = session.getReview();

		if (
			!current ||
			current.sessionId !== review.sessionId ||
			current.reviewId !== review.reviewId ||
			current.planDigest !== plan.digest ||
			review.planDigest !== plan.digest
		) {
			return { status: 'rejected', reason: 'invalid_review' };
		}

		const proposal = plan.body.proposal;

		write('\nEXACT OPERATION REVIEW');
		write('─'.repeat(52));
		write(`Operation: ${result.operation.label}`);
		write(`Scope: ${plan.body.scope}`);
		write(`Actor: ${proposal.actorId}`);
		write(`Organization: ${proposal.organizationId}`);
		write(`Event: ${proposal.eventId}`);
		write(`State revision: ${proposal.stateRevision}`);
		write(`Algorithm: ${proposal.algorithm}`);
		write(`Plan digest: ${plan.digest}`);
		write(`Session: ${review.sessionId}`);
		write(`Review: ${review.reviewId}`);

		write('\nPROPOSED ASSIGNMENTS');

		for (const group of proposal.groups) {
			write(`\n${group.name} (${group.id})`);

			for (const entry of group.entries) {
				write(`  Entry: ${entry.entryId}`);

				for (const athleteId of entry.athleteIds) {
					write(`    Athlete: ${athleteId}`);
				}
			}
		}

		write('\nPROPOSED EFFECT');
		write(`Groups: ${proposal.summary.groupsBefore} → ${proposal.summary.groupsAfter}`);
		write(`Teams: ${proposal.summary.teamsAssigned}`);
		write(`Athletes: ${proposal.summary.athletesAssigned}`);
		write('Approval required: yes');
		write('Persistent database changes: none');

		write('\nEXACT PLAN CONTENT (JSON)');
		write(JSON.stringify(plan, null, 2));

		if (signal?.aborted) {
			return { status: 'cancelled' };
		}

		write('\nType APPROVE to approve this exact plan.');
		write('Any other response cancels the operation.');

		const answer = await question('Confirmation: ');

		if (signal?.aborted || answer !== 'APPROVE') {
			return { status: 'cancelled' };
		}

		const approval = session.approve({
			action: 'approve-exact-plan',
			sessionId: review.sessionId,
			reviewId: review.reviewId,
			planDigest: review.planDigest
		});

		if (approval.status !== 'approved') {
			return {
				status: 'rejected',
				reason: approval.reason
			};
		}

		if (signal?.aborted) {
			return { status: 'cancelled' };
		}

		return session.executeAndPublishApprovedOperation(approval.receipt);
	} catch {
		return {
			status: 'rejected',
			reason: 'interaction_failed'
		};
	} finally {
		// Cancel any unconsumed approval or unfinished review.
		session.cancel();
	}
}
