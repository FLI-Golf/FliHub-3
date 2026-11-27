import test from 'node:test';
import assert from 'node:assert/strict';
const { discount } = await import(new URL('file:///work/discount.mjs').href);

test('applies a 20% discount to integer cents', () => {
	assert.equal(discount(100), 80);
	assert.equal(discount(1001), 801);
	assert.equal(discount(0), 0);
});
