import { describe, it, expect } from 'vitest';
import { advanceStreak, displayedStreak, countCombo, daysBetween } from './streak.js';
import { comboBonus, levelProgress, xpToLevel } from '$lib/gamification.js';

describe('daysBetween', () => {
	it('counts calendar days across month borders', () => {
		expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1);
		expect(daysBetween('2026-03-01', '2026-03-01')).toBe(0);
	});
});

describe('advanceStreak', () => {
	it('starts a new streak on first activity', () => {
		expect(advanceStreak(null, '2026-05-10', 0, 1)).toMatchObject({ streakDays: 1, freezes: 1 });
	});
	it('does not change on a second activity the same day', () => {
		expect(advanceStreak('2026-05-10', '2026-05-10', 4, 1)).toMatchObject({ streakDays: 4, freezesUsed: 0 });
	});
	it('continues after yesterday', () => {
		expect(advanceStreak('2026-05-09', '2026-05-10', 4, 1)).toMatchObject({ streakDays: 5, freezesUsed: 0 });
	});
	it('bridges one missed day with a freeze', () => {
		expect(advanceStreak('2026-05-08', '2026-05-10', 4, 1)).toMatchObject({ streakDays: 5, freezes: 0, freezesUsed: 1 });
	});
	it('resets when more days are missed than freezes are left', () => {
		expect(advanceStreak('2026-05-07', '2026-05-10', 4, 1)).toMatchObject({ streakDays: 1, freezes: 1, freezesUsed: 0 });
	});
	it('earns a freeze every 7th day, capped at 2', () => {
		expect(advanceStreak('2026-05-09', '2026-05-10', 6, 0)).toMatchObject({ streakDays: 7, freezes: 1, freezeEarned: true });
		expect(advanceStreak('2026-05-09', '2026-05-10', 13, 2)).toMatchObject({ streakDays: 14, freezes: 2, freezeEarned: false });
	});
});

describe('displayedStreak', () => {
	it('is safe when practised today', () => {
		expect(displayedStreak('2026-05-10', '2026-05-10', 3, 1)).toEqual({ streakDays: 3, atRisk: false });
	});
	it('is at risk when last practised yesterday', () => {
		expect(displayedStreak('2026-05-09', '2026-05-10', 3, 0)).toEqual({ streakDays: 3, atRisk: true });
	});
	it('survives a missed day while a freeze is left', () => {
		expect(displayedStreak('2026-05-08', '2026-05-10', 3, 1)).toEqual({ streakDays: 3, atRisk: true });
	});
	it('shows 0 once the streak is lost', () => {
		expect(displayedStreak('2026-05-08', '2026-05-10', 3, 0)).toEqual({ streakDays: 0, atRisk: false });
	});
});

describe('countCombo', () => {
	const t = (min: number) => new Date(Date.UTC(2026, 4, 10, 10, min));
	it('counts leading correct answers', () => {
		expect(countCombo([
			{ isCorrect: true, answeredAt: t(5) },
			{ isCorrect: true, answeredAt: t(4) },
			{ isCorrect: false, answeredAt: t(3) },
			{ isCorrect: true, answeredAt: t(2) }
		])).toBe(2);
	});
	it('stops at a long pause', () => {
		expect(countCombo([
			{ isCorrect: true, answeredAt: t(40) },
			{ isCorrect: true, answeredAt: t(5) }
		])).toBe(1);
	});
	it('is 0 after a wrong answer', () => {
		expect(countCombo([{ isCorrect: false, answeredAt: t(1) }])).toBe(0);
	});
});

describe('comboBonus / levels', () => {
	it('grows with the combo', () => {
		expect([1, 2, 3, 4, 5, 9, 10, 25].map(comboBonus)).toEqual([0, 0, 2, 2, 3, 3, 5, 5]);
	});
	it('computes level progress', () => {
		expect(xpToLevel(2840)).toBe(7);
		expect(levelProgress(2840, 7)).toEqual({ pct: 84, remaining: 160, nextLevelXp: 3000 });
	});
});
