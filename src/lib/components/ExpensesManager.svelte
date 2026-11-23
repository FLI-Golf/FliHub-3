<script lang="ts">
	import { resolve } from '$app/paths';
	import { EyeOff, Plus, ReceiptText } from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { expenseStatuses, type Expense } from '$lib/expenses/model';

	interface ExpenseForm {
		expenseError?: string;
		expenseMessage?: string;
		expenseValues?: {
			expenseOn: string;
			vendor: string;
			category: string;
			purpose: string;
			amount: string;
		};
	}
	let {
		expenses,
		organizationId,
		userId,
		canManage,
		form
	}: {
		expenses: Expense[];
		organizationId: string;
		userId: string;
		canManage: boolean;
		form: unknown;
	} = $props();

	const result = $derived(form as ExpenseForm | null);
	const values = $derived(result?.expenseValues);
	const field = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
	const currency = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD'
	});
	const badgeClass: Record<Expense['status'], string> = {
		submitted: 'bg-blue-100 text-blue-900',
		approved: 'bg-green-100 text-green-900',
		returned: 'bg-amber-100 text-amber-900'
	};
</script>

{#if result?.expenseError}
	<p role="alert" class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
		{result.expenseError}
	</p>
{/if}
{#if result?.expenseMessage}
	<p
		role="status"
		class="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900"
	>
		{result.expenseMessage}
	</p>
{/if}

<details
	class="group/add-expense rounded-xl border border-green-200 bg-green-50 p-4 text-green-950"
	open={Boolean(values)}
>
	<summary class="cursor-pointer list-none font-semibold [&::-webkit-details-marker]:hidden">
		<span class="inline-flex items-center gap-2 group-open/add-expense:hidden">
			<span
				class="inline-flex size-8 items-center justify-center rounded-full bg-green-700 text-white"
			>
				<Plus aria-hidden="true" class="size-4" />
			</span>
			Add expense
		</span>
		<span class="hidden items-center gap-2 group-open/add-expense:inline-flex">
			<span
				class="inline-flex size-8 items-center justify-center rounded-full bg-red-700 text-white"
			>
				<EyeOff aria-hidden="true" class="size-4" />
			</span>
			Close expense form
		</span>
	</summary>

	<form
		method="POST"
		action="?/submitExpense"
		enctype="multipart/form-data"
		class="mt-4 grid gap-3 sm:grid-cols-2"
	>
		<label class="grid gap-1 text-sm font-medium">
			Expense date
			<input class={field} type="date" name="expenseOn" value={values?.expenseOn ?? ''} required />
		</label>
		<label class="grid gap-1 text-sm font-medium">
			Amount (USD)
			<input
				class={field}
				name="amount"
				type="number"
				min="0.01"
				max="9999999.99"
				step="0.01"
				value={values?.amount ?? ''}
				required
			/>
		</label>
		<label class="grid gap-1 text-sm font-medium">
			Vendor
			<input class={field} name="vendor" maxlength="120" value={values?.vendor ?? ''} required />
		</label>
		<label class="grid gap-1 text-sm font-medium">
			Category
			<input
				class={field}
				name="category"
				maxlength="80"
				placeholder="Travel, meals, or supplies"
				value={values?.category ?? ''}
				required
			/>
		</label>
		<label class="grid gap-1 text-sm font-medium sm:col-span-2">
			Business purpose
			<textarea
				class={field}
				name="purpose"
				maxlength="1000"
				rows="3"
				value={values?.purpose ?? ''}
				required></textarea>
		</label>
		<label class="grid gap-1 text-sm font-medium sm:col-span-2">
			Receipt (optional)
			<input
				class={field}
				type="file"
				name="receipt"
				accept="application/pdf,image/jpeg,image/png"
				aria-describedby="expense-receipt-help"
			/>
		</label>
		<p id="expense-receipt-help" class="text-xs sm:col-span-2">
			PDF, JPEG, or PNG up to 5 MB. {values ? 'Select the receipt again before resubmitting.' : ''}
		</p>
		<div class="sm:col-span-2">
			<Button type="submit" class="bg-green-700 text-white hover:bg-green-800"
				>Submit expense</Button
			>
		</div>
	</form>
</details>

<section aria-labelledby="expense-list" class="grid gap-3">
	<h2 id="expense-list" class="text-lg font-semibold">
		{canManage ? 'Organization expenses' : 'My expenses'}
	</h2>
	{#each expenses as expense (expense.id)}
		<article class="grid gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground">
			<div class="flex flex-wrap items-center gap-2">
				<h3 class="font-semibold">{expense.vendor}</h3>
				<Badge variant="secondary" class={badgeClass[expense.status]}
					>{expenseStatuses[expense.status]}</Badge
				>
				{#if canManage && expense.submitter === userId}
					<Badge variant="outline">Your expense</Badge>
				{:else if canManage && expense.submitterName}
					<span class="text-sm text-muted-foreground">Submitted by {expense.submitterName}</span>
				{/if}
			</div>
			<p class="text-sm">
				<strong>{currency.format(expense.amountCents / 100)}</strong>
				<span class="text-muted-foreground">
					· {expense.category} ·
					<time datetime={expense.expenseOn}>{expense.expenseOn}</time></span
				>
			</p>
			<p class="text-sm whitespace-pre-wrap">{expense.purpose}</p>
			<div class="flex flex-wrap items-start gap-3">
				{#if expense.hasReceipt}
					<a
						class="inline-flex items-center gap-2 text-sm text-blue-700 underline"
						href={resolve('/(app)/organizations/[id]/cap/[capability]/receipts/[expense]', {
							id: organizationId,
							capability: 'reimbursements',
							expense: expense.id
						})}
						download
					>
						<ReceiptText aria-hidden="true" class="size-4" /> Download receipt
					</a>
				{/if}
				{#if expense.status === 'returned' && expense.submitter === userId}
					<details>
						<summary class="cursor-pointer text-sm text-blue-700 underline">
							{expense.hasReceipt ? 'Replace receipt' : 'Add replacement receipt'}
						</summary>
						<form
							method="POST"
							action="?/replaceExpenseReceipt"
							enctype="multipart/form-data"
							class="mt-2 grid gap-2"
						>
							<input type="hidden" name="expense" value={expense.id} />
							<label class="grid gap-1 text-sm font-medium">
								New receipt (PDF, JPEG, or PNG up to 5 MB)
								<input
									class={field}
									type="file"
									name="receipt"
									accept="application/pdf,image/jpeg,image/png"
									required
								/>
							</label>
							<Button type="submit">Replace and resubmit</Button>
						</form>
					</details>
				{/if}
			</div>
			{#if expense.returnHistory.length}
				<details class="text-sm">
					<summary class="cursor-pointer font-medium">Review history</summary>
					<ul class="mt-2 grid gap-2">
						{#each expense.returnHistory as review}
							<li class="whitespace-pre-wrap"><strong>Returned</strong> · {review.note}</li>
						{/each}
					</ul>
				</details>
			{/if}
			{#if expense.reviewNote}
				<p class="text-sm whitespace-pre-wrap">
					<strong>Review note</strong>
					{expense.reviewNote}
				</p>
			{/if}
			{#if canManage && expense.status === 'submitted'}
				<form method="POST" action="?/reviewExpense" class="grid gap-3 border-t pt-3">
					<input type="hidden" name="expense" value={expense.id} />
					<label class="grid gap-1 text-sm font-medium">
						Review note (required when returning)
						<textarea class={field} name="note" maxlength="500" rows="2"></textarea>
					</label>
					<div class="flex flex-wrap gap-2">
						<Button type="submit" name="decision" value="approved">Approve</Button>
						<Button type="submit" name="decision" value="returned" variant="outline">Return</Button>
					</div>
				</form>
			{/if}
		</article>
	{:else}
		<p class="text-sm text-muted-foreground">No expenses submitted yet.</p>
	{/each}
</section>
