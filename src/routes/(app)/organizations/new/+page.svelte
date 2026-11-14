<script lang="ts">
	import SetupWizard from '$lib/components/SetupWizard.svelte';
	import type { PageProps } from './$types';
	let { form }: PageProps = $props();
</script>

<SetupWizard creation feedback={form} />
