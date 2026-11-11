import { vi, describe, it, expect } from 'vitest';

vi.mock('$lib/server/db/index.js', () => ({ db: {} }));

import { computeMastery, computeStage } from '$lib/server/learning/mastery.js';

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

// computeStage(prevStage, prevStreak, isCorrect) — STAGE_STREAK_TARGET=4 in test env mock
describe('computeStage', () => {
	it('increments the streak on a correct answer without reaching target', () => {
		expect(computeStage(0, 0, true)).toEqual({ stage: 0, stageStreak: 1 });
		expect(computeStage(0, 2, true)).toEqual({ stage: 0, stageStreak: 3 });
	});

	it('advances to the next stage once the streak hits target and resets the streak', () => {
		expect(computeStage(0, 3, true)).toEqual({ stage: 1, stageStreak: 0 });
	});

	it('resets the streak and steps back one stage on a wrong answer', () => {
		expect(computeStage(2, 2, false)).toEqual({ stage: 1, stageStreak: 0 });
	});

	it('never drops below stage 0', () => {
		expect(computeStage(0, 3, false)).toEqual({ stage: 0, stageStreak: 0 });
	});

	it('advances through a full sequence: 4 correct in a row reaches stage 1', () => {
		let s = { stage: 0, stageStreak: 0 };
		for (let i = 0; i < 4; i++) s = computeStage(s.stage, s.stageStreak, true);
		expect(s).toEqual({ stage: 1, stageStreak: 0 });
	});

	it('a single mistake mid-streak resets progress toward the current stage', () => {
		let s = computeStage(0, 0, true); // {0,1}
		s = computeStage(s.stage, s.stageStreak, true); // {0,2}
		s = computeStage(s.stage, s.stageStreak, false); // wrong -> back to stage -1 clamped to 0, streak 0
		expect(s).toEqual({ stage: 0, stageStreak: 0 });
	});
});
