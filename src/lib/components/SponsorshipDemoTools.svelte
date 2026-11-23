<script lang="ts">
	import { Layers } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	let {
		targets,
		seedAgreementCount,
		form
	}: {
		targets: { value: string; label: string }[];
		seedAgreementCount: number;
		form: unknown;
	} = $props();

	const result = $derived(
		form as {
			seedMessage?: string;
			seedError?: string;
			seedCoverage?: string;
		} | null
	);
</script>

<details
	open={Boolean(result?.seedError || result?.seedMessage)}
	class="rounded-md border-2 border-amber-300 bg-amber-50 text-amber-950"
>
	<summary
		class="cursor-pointer rounded-md p-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
	>
		<Layers class="mr-1 inline-block size-5 align-middle" aria-hidden="true" />
		Demo testing — seed sponsorship deals
	</summary>
	<div class="space-y-3 px-4 pb-4">
		<p class="text-sm">Add one $1,000 USD sample agreement per target under Demo Sponsor.</p>
		{#if result?.seedError}<p role="alert" class="mt-2 text-sm text-destructive">
				{result.seedError}
			</p>{/if}
		{#if result?.seedMessage}<p role="status" class="mt-2 text-sm">{result.seedMessage}</p>{/if}
		<form method="POST" action="?/saveSponsor" class="mt-3 flex flex-wrap items-end gap-3">
			<input type="hidden" name="intent" value="seed-agreement" />
			<label class="grid min-w-0 gap-1 text-sm">
				Sponsorship target
				<select
					name="coverage"
					required
					value={result?.seedCoverage ?? ''}
					class="min-w-0 rounded border border-blue-500 bg-blue-50 p-2 text-blue-950"
				>
					<option value="">Select coverage</option>
					{#each targets as target (target.value)}
						<option value={target.value}>{target.label}</option>
					{/each}
				</select>
			</label>
			<Button type="submit" class="bg-green-700 text-white hover:bg-green-800"
				>Seed demo deal</Button
			>
		</form>
		{#if seedAgreementCount > 0}
			<details class="mt-4 border-t pt-3">
				<summary class="cursor-pointer text-sm font-semibold text-destructive"
					>Clear seeded demo deals</summary
				>
				<form method="POST" action="?/saveSponsor" class="mt-2 grid gap-3">
					<input type="hidden" name="intent" value="clear-seed-agreements" />
					<input type="hidden" name="expectedCount" value={seedAgreementCount} />
					<label class="flex items-start gap-2 text-sm">
						<input type="checkbox" name="confirm" value="CLEAR" required class="mt-1" />
						Remove {seedAgreementCount} seeded {seedAgreementCount === 1
							? 'agreement'
							: 'agreements'} from this organization.
					</label>
					<div><Button type="submit" variant="destructive">Clear demo deals</Button></div>
				</form>
			</details>
		{:else}
			<div class="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
				<Button type="button" variant="destructive" disabled>Clear seeded demo deals</Button>
				<span class="text-sm">No seeded demo deals to clear.</span>
			</div>
		{/if}
	</div>
</details>
