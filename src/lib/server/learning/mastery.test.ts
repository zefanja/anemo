import { vi, describe, it, expect } from 'vitest';

vi.mock('$lib/server/db/index.js', () => ({ db: {} }));

import { computeMastery } from '$lib/server/learning/mastery.js';

// EWMA with DECAY_FACTOR=0.7, MIN_ATTEMPTS=2
// computeMastery(prevMastery, isCorrect, totalAttempts)

describe('computeMastery', () => {
	it('returns 0 when totalAttempts is 0', () => {
		expect(computeMastery(0, true, 0)).toBe(0);
	});

	it('dampens first attempt (below MIN_ATTEMPTS)', () => {
		// raw = 0.3*1 + 0.7*0 = 0.3, dampened = 0.3 * (1/2) = 0.15
		expect(computeMastery(0, true, 1)).toBeCloseTo(0.15, 5);
		// raw = 0.3*0 + 0.7*0 = 0, dampened = 0
		expect(computeMastery(0, false, 1)).toBeCloseTo(0, 5);
	});

	it('no dampening at MIN_ATTEMPTS (2)', () => {
		// raw = 0.3*1 + 0.7*0.15 = 0.405
		expect(computeMastery(0.15, true, 2)).toBeCloseTo(0.405, 5);
	});

	it('increases mastery with correct answers', () => {
		// simulate 6 consecutive correct answers from 0
		let m = 0;
		for (let i = 1; i <= 6; i++) m = computeMastery(m, true, i);
		expect(m).toBeGreaterThan(0.8);
	});

	it('drops mastery with a wrong answer', () => {
		const before = 0.86;
		const after = computeMastery(before, false, 10);
		expect(after).toBeLessThan(before);
		// wrong: raw = 0.7 * 0.86 = 0.602
		expect(after).toBeCloseTo(0.7 * 0.86, 5);
	});

	it('allows recovery after mistakes', () => {
		let m = computeMastery(0.86, false, 10); // wrong: ~0.60
		m = computeMastery(m, true, 11);
		m = computeMastery(m, true, 12);
		m = computeMastery(m, true, 13);
		expect(m).toBeGreaterThan(0.8);
	});

	it('never exceeds 1.0', () => {
		let m = 0;
		for (let i = 1; i <= 50; i++) m = computeMastery(m, true, i);
		expect(m).toBeLessThanOrEqual(1.0);
	});
});
