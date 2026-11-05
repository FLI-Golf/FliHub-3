<script lang="ts">
	import { resolve } from '$app/paths';
	import { AlertCircle, ArrowLeft, Link2, MailPlus, Users } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import OrgNav from '$lib/components/OrgNav.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const message = $derived(form && 'message' in form ? form.message : null);
	const invite = $derived(form && 'inviteLink' in form ? form : null);

	const isOwner = $derived(data.myRole === 'owner');
	const canManage = $derived(data.myRole === 'owner' || data.myRole === 'admin');
	const myMembership = $derived(data.members.find((m) => m.isYou));

	function roleLabel(role: string): string {
		return role.charAt(0).toUpperCase() + role.slice(1);
	}

	function formatDate(value: string): string {
		const date = new Date(value.replace(' ', 'T'));
		return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
	}

	const eventLabels: Record<string, string> = {
		organization_created: 'Organization created',
		invitation_created: 'Invitation created',
		invitation_accepted: 'Invitation accepted',
		invitation_revoked: 'Invitation revoked',
		role_changed: 'Role changed',
		member_removed: 'Member removed',
		member_left: 'Member left',
		ownership_transferred: 'Ownership transferred'
	};
</script>

<svelte:head>
	<title>{data.organization.name} — FliHub</title>
</svelte:head>

<section class="flex flex-col gap-8 py-4">
	<div class="flex flex-col gap-2">
		<Button variant="ghost" size="sm" href={resolve('/(app)/organizations')} class="w-fit">
			<ArrowLeft class="size-4" />
			All organizations
		</Button>
		<div class="flex flex-wrap items-center gap-3">
			<h1 class="text-2xl font-semibold tracking-tight">{data.organization.name}</h1>
			<Badge variant="secondary">Your role: {roleLabel(data.myRole)}</Badge>
		</div>
		<OrgNav
			orgId={data.organization.id}
			enabledCapabilities={data.enabledCapabilities}
			canManage={data.canManage}
			current="overview"
		/>
	</div>

	{#if !data.organization.onboarded && canManage}
		<Alert.Root>
			<AlertCircle class="size-4" />
			<Alert.Title>Setup pending</Alert.Title>
			<Alert.Description>
				This organization predates onboarding. Review its template and capabilities to finish setup
				— existing memberships and records are preserved.
				<Button
					variant="outline"
					size="sm"
					class="ml-2"
					href={resolve('/(app)/organizations/[id]/settings', { id: data.organization.id })}
				>
					Complete setup
				</Button>
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if message}
		<Alert.Root variant="destructive">
			<AlertCircle class="size-4" />
			<Alert.Title>Action failed</Alert.Title>
			<Alert.Description>{message}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if invite}
		<Alert.Root>
			<Link2 class="size-4" />
			<Alert.Title>Invitation created for {invite.inviteEmail}</Alert.Title>
			<Alert.Description class="flex flex-col gap-2">
				<span>
					Copy this single-use link and send it to the invitee. It expires in 7 days. Email delivery
					is not implemented — invitations are shared by link.
				</span>
				<Input readonly value={invite.inviteLink} onclick={(e) => e.currentTarget.select()} />
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if canManage}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<MailPlus class="size-5" />
					Invite a member
				</Card.Title>
				<Card.Description>
					The invitee must register with this exact email address and verify it before accepting.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form method="POST" action="?/invite" class="flex flex-col gap-4">
					<div class="flex flex-col gap-2">
						<Label for="invite-email">Invitee email</Label>
						<Input id="invite-email" name="email" type="email" required />
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<span class="text-sm text-muted-foreground">Invite as:</span>
						<Button type="submit" name="role" value="viewer" variant="outline" size="sm">
							Viewer
						</Button>
						<Button type="submit" name="role" value="scorekeeper" variant="outline" size="sm">
							Scorekeeper
						</Button>
						{#if isOwner}
							<Button type="submit" name="role" value="admin" variant="outline" size="sm">
								Admin
							</Button>
						{/if}
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<Users class="size-5" />
				Members ({data.members.length})
			</Card.Title>
		</Card.Header>
		<Card.Content class="flex flex-col">
			{#each data.members as member, index (member.id)}
				{#if index > 0}
					<Separator class="my-3" />
				{/if}
				<div class="flex flex-wrap items-center gap-2">
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="truncate font-medium">
							{member.name}
							{#if member.isYou}
								<span class="text-muted-foreground">(you)</span>
							{/if}
						</span>
						{#if member.email}
							<span class="truncate text-sm text-muted-foreground">{member.email}</span>
						{/if}
					</div>
					<Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
						{roleLabel(member.role)}
					</Badge>

					{#if isOwner && member.role !== 'owner'}
						<div class="flex flex-wrap gap-1">
							{#each ['admin', 'scorekeeper', 'viewer'] as role (role)}
								{#if role !== member.role}
									<form method="POST" action="?/changeRole">
										<input type="hidden" name="membership" value={member.id} />
										<input type="hidden" name="role" value={role} />
										<Button type="submit" variant="ghost" size="xs">
											Make {role}
										</Button>
									</form>
								{/if}
							{/each}
							<form method="POST" action="?/transfer">
								<input type="hidden" name="membership" value={member.id} />
								<Button
									type="submit"
									variant="ghost"
									size="xs"
									onclick={(e) => {
										if (!confirm(`Transfer ownership to ${member.name}? You become Admin.`))
											e.preventDefault();
									}}
								>
									Transfer ownership
								</Button>
							</form>
							<form method="POST" action="?/removeMember">
								<input type="hidden" name="membership" value={member.id} />
								<Button
									type="submit"
									variant="destructive"
									size="xs"
									onclick={(e) => {
										if (!confirm(`Remove ${member.name} from the organization?`))
											e.preventDefault();
									}}
								>
									Remove
								</Button>
							</form>
						</div>
					{/if}
				</div>
			{/each}
		</Card.Content>
		{#if myMembership && myMembership.role !== 'owner'}
			<Card.Footer>
				<form method="POST" action="?/leave">
					<Button
						type="submit"
						variant="outline"
						onclick={(e) => {
							if (!confirm('Leave this organization?')) e.preventDefault();
						}}
					>
						Leave organization
					</Button>
				</form>
			</Card.Footer>
		{/if}
	</Card.Root>

	{#if canManage && data.invitations}
		<Card.Root>
			<Card.Header>
				<Card.Title>Invitations</Card.Title>
				<Card.Description>Only Owners and Admins can see this list.</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col">
				{#if data.invitations.length === 0}
					<p class="text-sm text-muted-foreground">No invitations yet.</p>
				{/if}
				{#each data.invitations as invitation, index (invitation.id)}
					{#if index > 0}
						<Separator class="my-3" />
					{/if}
					<div class="flex flex-wrap items-center gap-2">
						<div class="flex min-w-0 flex-1 flex-col">
							<span class="truncate font-medium">{invitation.email}</span>
							<span class="text-sm text-muted-foreground">
								{roleLabel(invitation.role)} · expires {formatDate(invitation.expiresAt)}
							</span>
						</div>
						<Badge
							variant={invitation.status === 'pending'
								? 'default'
								: invitation.status === 'accepted'
									? 'secondary'
									: 'outline'}
						>
							{invitation.status}
						</Badge>
						{#if invitation.status === 'pending'}
							<form method="POST" action="?/revokeInvitation">
								<input type="hidden" name="invitation" value={invitation.id} />
								<Button type="submit" variant="destructive" size="xs">Revoke</Button>
							</form>
						{/if}
					</div>
				{/each}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Membership activity</Card.Title>
				<Card.Description>
					Audit trail of membership changes. Only Owners and Admins can see this.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col">
				{#if !data.events || data.events.length === 0}
					<p class="text-sm text-muted-foreground">No activity yet.</p>
				{/if}
				{#each data.events ?? [] as event, index (event.id)}
					{#if index > 0}
						<Separator class="my-3" />
					{/if}
					<div class="flex flex-col gap-0.5">
						<span class="text-sm font-medium">
							{eventLabels[event.action] ?? event.action}
						</span>
						<span class="text-sm text-muted-foreground">
							{formatDate(event.created)} · by {event.actorName ?? 'unknown'}
							{#if event.subjectName}
								· member: {event.subjectName}
							{/if}
							{#if event.subjectEmail}
								· email: {event.subjectEmail}
							{/if}
							{#if event.details}
								· {event.details}
							{/if}
						</span>
					</div>
				{/each}
			</Card.Content>
		</Card.Root>
	{/if}
</section>
