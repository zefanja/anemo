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
