// Pure streak / daily-goal helpers (no DB access) — unit tested in streak.test.ts.
import { MAX_STREAK_FREEZES } from '$lib/gamification.js';

export function isoDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

/** Whole days between two ISO dates (b − a). */
export function daysBetween(a: string, b: string): number {
	return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);
}

export interface StreakUpdate {
	streakDays: number;
	freezes: number;
	freezesUsed: number;
	freezeEarned: boolean;
}

/**
 * Advance the streak for activity on `today`.
 * Missed days are bridged by streak freezes ("Streak-Schutz") as long as enough are left;
 * otherwise the streak restarts at 1. Every 7th streak day earns a freeze (max MAX_STREAK_FREEZES).
 */
export function advanceStreak(
	lastDate: string | null,
	today: string,
	streakDays: number,
	freezes: number
): StreakUpdate {
	if (lastDate === today) {
		return { streakDays: Math.max(streakDays, 1), freezes, freezesUsed: 0, freezeEarned: false };
	}
	let next = 1;
	let freezesUsed = 0;
	if (lastDate && streakDays > 0) {
		const missed = daysBetween(lastDate, today) - 1;
		if (missed <= 0) {
			next = streakDays + 1;
		} else if (missed <= freezes) {
			freezesUsed = missed;
			next = streakDays + 1;
		}
	}
	let newFreezes = freezes - freezesUsed;
	let freezeEarned = false;
	if (next % 7 === 0 && newFreezes < MAX_STREAK_FREEZES) {
		newFreezes += 1;
		freezeEarned = true;
	}
	return { streakDays: next, freezes: newFreezes, freezesUsed, freezeEarned };
}

/**
 * Streak as it should be displayed today (before any activity today):
 * still alive if practised today/yesterday or if the missed days can be covered by freezes.
 * `frozen` is true while missed days are being bridged by streak freezes.
 */
export function displayedStreak(
	lastDate: string | null,
	today: string,
	streakDays: number,
	freezes: number
): { streakDays: number; atRisk: boolean; frozen: boolean } {
	if (!lastDate || streakDays <= 0) return { streakDays: 0, atRisk: false, frozen: false };
	const missed = daysBetween(lastDate, today) - 1;
	if (missed < 0) return { streakDays, atRisk: false, frozen: false };
	if (missed === 0) return { streakDays, atRisk: true, frozen: false };
	if (missed <= freezes) return { streakDays, atRisk: true, frozen: true };
	return { streakDays: 0, atRisk: false, frozen: false };
}

/** Number of consecutive correct answers at the head of a newest-first attempt list. */
export function countCombo(
	recent: { isCorrect: boolean; answeredAt: Date }[],
	maxGapMs = 15 * 60_000
): number {
	let combo = 0;
	let prev: Date | null = null;
	for (const a of recent) {
		if (!a.isCorrect) break;
		if (prev && prev.getTime() - a.answeredAt.getTime() > maxGapMs) break;
		combo++;
		prev = a.answeredAt;
	}
	return combo;
}
