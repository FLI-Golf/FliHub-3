<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { Mail } from 'lucide-svelte';
	import type { InvitationNoticeState } from '$lib/server/invitation-notifications';

	let notice = $state<InvitationNoticeState>('none');
	let checking = $state(false);
	let disposed = false;
	let controller: AbortController | undefined;
	async function refresh() {
		if (disposed || checking || document.visibilityState === 'hidden') return;
		checking = true;
		controller = new AbortController();
		try {
			const response = await fetch(resolve('/(app)/invitations/notice'), {
				cache: 'no-store',
				signal: controller.signal
			});
			if (disposed) return;
			if (response.status === 401) {
				notice = 'none';
				return;
			}
			if (!response.ok) {
				notice = 'unavailable';
				return;
			}
			const payload = await response.json();
			if (disposed) return;
			notice =
				payload.state === 'pending' ? 'pending' : payload.state === 'none' ? 'none' : 'unavailable';
		} catch {
			if (!disposed) notice = 'unavailable';
		} finally {
			if (!disposed) checking = false;
		}
	}
	onMount(() => {
		void refresh();
		const timer = window.setInterval(() => void refresh(), 30000);
		const focus = () => {
			void refresh();
		};
		window.addEventListener('focus', focus);
		document.addEventListener('visibilitychange', focus);
		return () => {
			disposed = true;
			controller?.abort();
			window.clearInterval(timer);
			window.removeEventListener('focus', focus);
			document.removeEventListener('visibilitychange', focus);
		};
	});
</script>

{#if notice !== 'none'}
	<aside
		role="status"
		class="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950"
	>
		<Mail aria-hidden="true" class="size-5 shrink-0" />
		<p class="flex-1 text-sm font-medium">
			{notice === 'pending'
				? 'You have pending organization invitations.'
				: 'Organization invitations could not be checked.'}
		</p>
		<a
			class="inline-flex min-h-11 items-center rounded-md border border-amber-300 bg-white/80 px-3 py-2 text-sm font-medium underline underline-offset-4"
			href={resolve('/(app)/invitations')}
			>{notice === 'pending' ? 'Review invitations' : 'Open invitations'}</a
		>
		<button
			type="button"
			disabled={checking}
			onclick={refresh}
			class="min-h-11 rounded-md px-3 py-2 text-sm underline underline-offset-4 disabled:opacity-50"
			>{checking ? 'Checking…' : 'Check again'}</button
		>
	</aside>
{/if}
