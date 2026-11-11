import { vi, describe, it, expect } from 'vitest';

vi.mock('$lib/server/db/index.js', () => ({ db: {} }));

import { checkAnswer } from '$lib/server/tasks/index.js';

describe('checkAnswer – integer', () => {
	it('accepts matching integers', () => {
		expect(checkAnswer('42', '42', 'integer')).toBe(true);
		expect(checkAnswer('0', '0', 'integer')).toBe(true);
		expect(checkAnswer('-7', '-7', 'integer')).toBe(true);
	});

	it('rejects wrong integers', () => {
		expect(checkAnswer('41', '42', 'integer')).toBe(false);
		expect(checkAnswer('', '5', 'integer')).toBe(false);
	});

	it('trims whitespace before comparison', () => {
		expect(checkAnswer('  5  ', '5', 'integer')).toBe(true);
	});
});

describe('checkAnswer – number', () => {
	it('accepts matching floats', () => {
		expect(checkAnswer('3.14', '3.14', 'number')).toBe(true);
		expect(checkAnswer('0.5', '0.5', 'number')).toBe(true);
	});

	it('normalises German comma to decimal point', () => {
		expect(checkAnswer('3,14', '3.14', 'number')).toBe(true);
	});

	it('compares within floating-point epsilon', () => {
		expect(checkAnswer('1.0', '1', 'number')).toBe(true);
	});

	it('requires an exact match without tolerance', () => {
		expect(checkAnswer('12,56', '12,57', 'number')).toBe(false);
	});

	it('accepts answers within the given tolerance', () => {
		expect(checkAnswer('12,56', '12,57', 'number', 0.01)).toBe(true);
		expect(checkAnswer('12,58', '12,57', 'number', 0.01)).toBe(true);
		expect(checkAnswer('37', '36,6', 'number', 0.5)).toBe(true);
	});

	it('rejects answers outside the tolerance', () => {
		expect(checkAnswer('12,55', '12,57', 'number', 0.01)).toBe(false);
		expect(checkAnswer('13', '12,57', 'number', 0.1)).toBe(false);
	});

	it('ignores tolerance for non-numeric answer types', () => {
		expect(checkAnswer('1/2', '2/3', 'fraction', 1)).toBe(false);
		expect(checkAnswer('nein', 'ja', 'boolean', 1)).toBe(false);
	});

	it('rejects wrong floats', () => {
		expect(checkAnswer('3.15', '3.14', 'number')).toBe(false);
	});
});

describe('checkAnswer – fraction', () => {
	it('accepts equal fractions', () => {
		expect(checkAnswer('1/2', '1/2', 'fraction')).toBe(true);
		expect(checkAnswer('3/4', '3/4', 'fraction')).toBe(true);
	});

	it('reduces both sides before comparing', () => {
		expect(checkAnswer('2/4', '1/2', 'fraction')).toBe(true);
		expect(checkAnswer('6/9', '2/3', 'fraction')).toBe(true);
		expect(checkAnswer('4/6', '2/3', 'fraction')).toBe(true);
	});

	it('rejects non-equal fractions', () => {
		expect(checkAnswer('3/4', '2/3', 'fraction')).toBe(false);
		expect(checkAnswer('1/3', '1/2', 'fraction')).toBe(false);
	});

	it('handles whole numbers as fractions', () => {
		expect(checkAnswer('3', '3', 'fraction')).toBe(true);
	});

	it('handles negative fractions', () => {
		expect(checkAnswer('-1/2', '-1/2', 'fraction')).toBe(true);
		expect(checkAnswer('-2/4', '-1/2', 'fraction')).toBe(true);
	});
});

describe('checkAnswer – text', () => {
	it('accepts exact match (case-insensitive)', () => {
		expect(checkAnswer('Hallo', 'hallo', 'text')).toBe(true);
		expect(checkAnswer('HALLO', 'hallo', 'text')).toBe(true);
	});

	it('rejects different text', () => {
		expect(checkAnswer('abc', 'xyz', 'text')).toBe(false);
	});

	it('trims whitespace', () => {
		expect(checkAnswer('  hallo  ', 'hallo', 'text')).toBe(true);
	});
});
