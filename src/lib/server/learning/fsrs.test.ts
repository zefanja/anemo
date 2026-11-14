import { describe, it, expect } from 'vitest';
import { fsrs, createEmptyCard, Rating } from 'ts-fsrs';

describe('ts-fsrs – card lifecycle', () => {
	it('createEmptyCard returns a card with a due date', () => {
		const card = createEmptyCard();
		expect(card).toBeDefined();
		expect(card.due).toBeInstanceOf(Date);
	});

	it('Good rating schedules the card in the future', () => {
		const scheduler = fsrs();
		const card = createEmptyCard();
		const now = new Date();
		const { card: next } = scheduler.next(card, now, Rating.Good);
		expect(next.due.getTime()).toBeGreaterThan(now.getTime());
	});

	it('Again rating schedules the card sooner than Good', () => {
		const scheduler = fsrs();
		const card = createEmptyCard();
		const now = new Date();
		const { card: good } = scheduler.next(card, now, Rating.Good);
		const { card: again } = scheduler.next(card, now, Rating.Again);
		expect(again.due.getTime()).toBeLessThan(good.due.getTime());
	});

	it('repeated Good ratings increase stability over time', () => {
		const scheduler = fsrs();
		const day0 = new Date('2024-01-01T10:00:00Z');
		const day5 = new Date('2024-01-06T10:00:00Z');
		const day15 = new Date('2024-01-16T10:00:00Z');
		const card = createEmptyCard();

		const { card: r1 } = scheduler.next(card, day0, Rating.Good);
		const { card: r2 } = scheduler.next(r1, day5, Rating.Good);
		const { card: r3 } = scheduler.next(r2, day15, Rating.Good);

		expect(r3.stability).toBeGreaterThan(r1.stability);
	});

	it('Again after mastery reduces stability (lapse)', () => {
		const scheduler = fsrs();
		const now = new Date();
		let card = createEmptyCard();

		// Build up some stability
		const { card: after1 } = scheduler.next(card, now, Rating.Good);
		const { card: after2 } = scheduler.next(after1, now, Rating.Good);
		const { card: lapse } = scheduler.next(after2, now, Rating.Again);

		// A lapse should reduce stability compared to current
		expect(lapse.stability).toBeLessThan(after2.stability);
	});

	it('returns both card and log from scheduler.next', () => {
		const scheduler = fsrs();
		const result = scheduler.next(createEmptyCard(), new Date(), Rating.Good);
		expect(result).toHaveProperty('card');
		expect(result).toHaveProperty('log');
	});

	it('Easy rating schedules farther than Good on first review', () => {
		const scheduler = fsrs();
		const card = createEmptyCard();
		const now = new Date();
		const { card: good } = scheduler.next(card, now, Rating.Good);
		const { card: easy } = scheduler.next(card, now, Rating.Easy);
		expect(easy.due.getTime()).toBeGreaterThan(good.due.getTime());
	});
});

// ── App scheduling (fsrs.ts) ──────────────────────────────────────────────────

vi.mock('$lib/server/db/index.js', () => ({ db: {} }));
vi.mock('../tasks/generators.js', () => ({ hasGenerator: () => true }));

import { vi } from 'vitest';
import {
	initialRating,
	initialFsrsState,
	nextFsrsState,
	isReviewDue,
	reviewAvailableAt,
	stageForTask,
	type FsrsState
} from './fsrs.js';

const H = 3_600_000;
const D = 24 * H;

describe('first review after mastery', () => {
	const masteredAt = new Date('2026-03-02T10:00:00Z'); // Monday, during a lesson

	it('is not due right after mastering, nor an hour later', () => {
		const state = initialFsrsState(3, masteredAt);
		expect(isReviewDue(state, masteredAt)).toBe(false);
		expect(isReviewDue(state, new Date(masteredAt.getTime() + H))).toBe(false);
		expect(isReviewDue(state, new Date(masteredAt.getTime() + 12 * H))).toBe(false);
	});

	it('Good (smooth run) comes back after a few days, Hard sooner', () => {
		const good = initialFsrsState(3, masteredAt);
		const hard = initialFsrsState(2, masteredAt);
		const goodDays = (reviewAvailableAt(good).getTime() - masteredAt.getTime()) / D;
		const hardDays = (reviewAvailableAt(hard).getTime() - masteredAt.getTime()) / D;
		expect(goodDays).toBeGreaterThanOrEqual(1);
		expect(goodDays).toBeLessThanOrEqual(4);
		expect(hardDays).toBeGreaterThanOrEqual(20 / 24);
		expect(hardDays).toBeLessThanOrEqual(goodDays); // Good gets fuzz (±1 day)
	});

	// A card reviewed at `last` with a one-day interval (as FSRS gives after a lapse).
	const oneDayCard = (last: Date): FsrsState => ({
		due: new Date(last.getTime() + D).toISOString(), stability: 0.6, difficulty: 6, elapsed_days: 0,
		scheduled_days: 1, reps: 2, lapses: 1, learning_steps: 0, state: 3, last_review: last.toISOString()
	});

	it('a review due "tomorrow" is available from the start of that day, not only at 10:00', () => {
		const tuesdayMorning = new Date('2026-03-03T07:30:00Z');
		expect(isReviewDue(oneDayCard(masteredAt), tuesdayMorning)).toBe(true);
	});

	it('the minimum delay holds even when the due day starts earlier', () => {
		const lateEvening = new Date('2026-03-02T22:00:00Z'); // due day Tuesday 00:00 UTC
		expect(isReviewDue(oneDayCard(lateEvening), new Date('2026-03-03T06:00:00Z'))).toBe(false); // only 8 h later
		expect(isReviewDue(oneDayCard(lateEvening), new Date('2026-03-03T18:00:00Z'))).toBe(true); // 20 h later
	});

	it('legacy empty cards (due at mastery time) wait for the minimum delay', () => {
		const legacy: FsrsState = {
			due: masteredAt.toISOString(), stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0,
			reps: 0, lapses: 0, learning_steps: 0, state: 0
		};
		expect(isReviewDue(legacy, new Date(masteredAt.getTime() + H), masteredAt)).toBe(false);
		expect(isReviewDue(legacy, new Date(masteredAt.getTime() + D), masteredAt)).toBe(true);
	});
});

describe('initialRating', () => {
	it('smooth learning run → Good, bumpy → Hard', () => {
		expect(initialRating(6, 6)).toBe(3);
		expect(initialRating(8, 10)).toBe(3);
		expect(initialRating(6, 10)).toBe(2);
	});
});

describe('reviews never return within the same day', () => {
	it('a forgotten review (Again) is scheduled for a later day', () => {
		const t0 = new Date('2026-03-02T10:00:00Z');
		const s1 = initialFsrsState(3, t0);
		const t1 = new Date(t0.getTime() + 3 * D);
		const lapse = nextFsrsState(s1, 1, t1);
		expect(isReviewDue(lapse, new Date(t1.getTime() + H))).toBe(false);
		expect(lapse.stability).toBeLessThan(s1.stability);
	});
});

describe('stageForTask', () => {
	const reviewed = (stability: number): FsrsState => ({
		due: new Date().toISOString(), stability, difficulty: 5, elapsed_days: 0, scheduled_days: 0,
		reps: 2, lapses: 0, learning_steps: 0, state: 2, last_review: new Date().toISOString()
	});

	it('keeps the learning stage while the atom is not mastered', () => {
		expect(stageForTask(1, false, reviewed(30))).toBe(1);
	});
	it('fragile mastery stays on the reached stage', () => {
		expect(stageForTask(1, true, reviewed(2.3))).toBe(1);
		expect(stageForTask(1, true, null)).toBe(1);
	});
	it('stable mastery earns harder variants', () => {
		expect(stageForTask(1, true, reviewed(10))).toBe(2);
		expect(stageForTask(1, true, reviewed(40))).toBe(3);
	});
});
