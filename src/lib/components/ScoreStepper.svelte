<script lang="ts">
  import { enhance } from "$app/forms";
  let {
    roundId,
    groupId,
    athleteId,
    holeId,
    athleteName,
    holeNumber,
    par,
    strokes,
    onPending,
  }: {
    roundId: string;
    groupId: string;
    athleteId: string;
    holeId: string;
    athleteName: string;
    holeNumber: number;
    par: number;
    strokes: number | null;
    onPending: (change: number) => void;
  } = $props();
  let pending = $state(false);
  const shown = $derived(strokes ?? par);
  const relative = $derived(shown - par);
</script>

<form
  method="POST"
  action="?/enterScore"
  class="inline-flex flex-col items-center gap-1"
  use:enhance={() => {
    pending = true;
    onPending(1);
    return async ({ update }) => {
      try {
        await update({ reset: false });
      } finally {
        pending = false;
        onPending(-1);
      }
    };
  }}
>
  <input type="hidden" name="round" value={roundId} />
  <input type="hidden" name="group" value={groupId} />
  <input type="hidden" name="athlete" value={athleteId} />
  <input type="hidden" name="hole" value={holeId} />
  <div class="flex items-center gap-1">
    <button
      type="submit"
      name="strokes"
      value={shown - 1}
      disabled={pending || shown <= 1}
      aria-label="One fewer stroke for {athleteName} on hole {holeNumber}"
      class="size-11 rounded-md border bg-background text-xl disabled:opacity-40"
      >−</button
    >
    <span class={`min-w-7 text-center font-semibold ${
    relative < 0 ? 'text-red-600' : relative === 0 ? 'text-blue-600' : 'text-black'
  }`} aria-label="{shown} strokes"
      >{shown}</span
    >
    <button
      type="submit"
      name="strokes"
      value={shown + 1}
      disabled={pending}
      aria-label="One more stroke for {athleteName} on hole {holeNumber}"
      class="size-11 rounded-md border bg-background text-xl disabled:opacity-40"
      >+</button
    >
  </div>
  <span class="text-xs text-muted-foreground"
    >{relative === 0 ? "Even" : relative > 0 ? `+${relative}` : relative}</span
  >
  {#if strokes === null}
    <button
      type="submit"
      name="strokes"
      value={par}
      disabled={pending}
      aria-label="Confirm par for {athleteName} on hole {holeNumber}"
      class="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
      >Confirm par</button
    >
  {/if}
  <span class="text-xs text-muted-foreground" role="status">
    {pending ? "Saving…" : strokes === null ? "Not recorded" : "Saved"}
  </span>
</form>
