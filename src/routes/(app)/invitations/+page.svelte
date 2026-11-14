<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let pending = $state(false);
	function expiry(value: string): string {
		const date = new Date(value.replace(' ', 'T'));
		return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Unavailable';
	}
</script>

<svelte:head><title>Organization invitations — FliHub</title></svelte:head>
<section class="mx-auto flex max-w-3xl flex-col gap-5 py-4">
	<a class="w-fit underline underline-offset-4" href={resolve('/(app)/account')}
		>Back to activities</a
	>
	<div>
		<h1 class="text-2xl font-semibold">Organization invitations</h1>
		<p class="mt-2 text-sm text-muted-foreground">
			Review the organization and role before accepting. An invitation alone grants no organization
			access.
		</p>
	</div>
	<a
		class="w-fit underline underline-offset-4"
		data-sveltekit-reload
		href={resolve('/(app)/invitations')}>Refresh invitations</a
	>
	{#if form?.message}<p
			role="alert"
			class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-950"
		>
			{form.message}
		</p>{/if}
	{#if data.verifyRequired}
		<p class="rounded-lg border bg-muted p-4">
			Verify your account email before reviewing organization invitations. Use an existing
			verification email or the account verification flow.
		</p>
	{:else if data.loadError}
		<p role="alert" class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
			{data.loadError}
		</p>
	{:else}
		{#if data.items.length === 0}<p class="rounded-lg border p-4">
				No pending invitations on this page. Accepted, revoked, and expired invitations are not
				listed.
			</p>{/if}
		{#each data.items as invitation (invitation.invitationId)}
			<article
				class="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 p-5 text-blue-950"
			>
				<h2 class="text-lg font-semibold">{invitation.organizationName}</h2>
				<p>Invited role: <strong>{invitation.role}</strong></p>
				<p class="text-sm">Expires: {expiry(invitation.expiresAt)}</p>
				<p class="text-sm">
					Accepting adds membership in this organization with the role shown. Existing memberships
					stay unchanged.
				</p>
				<form
					method="POST"
					action="?/accept"
					onsubmit={(event) => {
						if (pending) event.preventDefault();
						else pending = true;
					}}
				>
					<input type="hidden" name="invitationId" value={invitation.invitationId} />
					<button
						type="submit"
						disabled={pending}
						class="min-h-11 rounded-md bg-blue-700 px-4 py-2 font-medium text-white disabled:opacity-50"
						>{pending ? 'Accepting…' : 'Accept invitation'}</button
					>
				</form>
			</article>
		{/each}
		<div class="flex flex-wrap gap-4">
			{#if data.page > 1}<form method="GET" action={resolve('/(app)/invitations')}>
					<button
						type="submit"
						class="min-h-11 rounded-md border px-4 py-2"
						name="page"
						value={data.page - 1}>Previous page</button
					>
				</form>{/if}
			{#if data.hasMore}<form method="GET" action={resolve('/(app)/invitations')}>
					<button
						type="submit"
						class="min-h-11 rounded-md border px-4 py-2"
						name="page"
						value={data.page + 1}>Next page</button
					>
				</form>{/if}
		</div>
	{/if}
</section>
