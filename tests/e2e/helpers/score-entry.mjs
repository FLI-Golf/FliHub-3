function scoreForm(page, hole, athlete) {
	return page.locator('form[action="?/enterScore"]').filter({
		has: page.getByRole('button', {
			name: `One more stroke for ${athlete} on hole ${hole}`,
			exact: true
		})
	});
}

export function scoreCell(page, hole, athlete) {
	return scoreForm(page, hole, athlete).locator('span[aria-label$=" strokes"]');
}

export async function enterScore(page, hole, athlete, target) {
	const form = scoreForm(page, hole, athlete);
	const value = scoreCell(page, hole, athlete);
	await form.waitFor({ state: 'visible' });

	const saved = form.getByRole('status').filter({ hasText: /^Saved$/ });
	const confirm = form.getByRole('button', {
		name: `Confirm par for ${athlete} on hole ${hole}`,
		exact: true
	});

	for (let attempt = 0; attempt < 30; attempt++) {
		const current = Number(await value.innerText());
		if (!Number.isInteger(current) || current < 1) {
			throw new Error(`Invalid displayed score: ${current}`);
		}

		if (current === target) {
			if (await confirm.isVisible()) await confirm.click();
			await saved.waitFor({ state: 'visible' });
			if (Number(await value.innerText()) !== target) {
				throw new Error('Saved score differs from requested score');
			}
			return;
		}

		const direction = current < target ? 'more' : 'fewer';
		await form
			.getByRole('button', {
				name: `One ${direction} stroke for ${athlete} on hole ${hole}`,
				exact: true
			})
			.click();

		await saved.waitFor({ state: 'visible' });
	}

	throw new Error(`Unable to save ${target} strokes for ${athlete}`);
}
