import { describe, it, expect } from 'vitest';
import { computeDailyStatsFromAttempts } from './activity.js';

function at(iso: string, isCorrect = true) {
	return { answeredAt: new Date(iso), isCorrect };
}

describe('computeDailyStatsFromAttempts', () => {
	it('credits a single attempt with the base thinking-time only', () => {
		const result = computeDailyStatsFromAttempts([at('2026-01-05T10:00:00Z')]);
		const day = result.get('2026-01-05')!;
		expect(day.tasksTotal).toBe(1);
		expect(day.tasksCorrect).toBe(1);
		expect(day.activeMinutes).toBe(0); // 20s rounds down to 0 minutes
	});

	it('sums real gaps between attempts on the same day', () => {
		// 3 attempts, 2 minutes apart each: 20s + (120s+20s) + (120s+20s) = 300s = 5min
		const result = computeDailyStatsFromAttempts([
			at('2026-01-05T10:00:00Z'),
			at('2026-01-05T10:02:00Z', false),
			at('2026-01-05T10:04:00Z')
		]);
		const day = result.get('2026-01-05')!;
		expect(day.tasksTotal).toBe(3);
		expect(day.tasksCorrect).toBe(2);
		expect(day.activeMinutes).toBe(5);
	});

	it('caps long idle gaps instead of counting them as active time', () => {
		// 1 hour gap should be capped at GAP_CAP_SECONDS (180s), not counted in full
		const result = computeDailyStatsFromAttempts([
			at('2026-01-05T10:00:00Z'),
			at('2026-01-05T11:00:00Z')
		]);
		const day = result.get('2026-01-05')!;
		// 20s + (180s capped + 20s) = 220s -> rounds to 4 min, nowhere near 60
		expect(day.activeMinutes).toBe(4);
	});

	it('keeps attempts on different days in separate buckets', () => {
		const result = computeDailyStatsFromAttempts([
			at('2026-01-05T23:59:00Z'),
			at('2026-01-06T00:01:00Z')
		]);
		expect(result.get('2026-01-05')!.tasksTotal).toBe(1);
		expect(result.get('2026-01-06')!.tasksTotal).toBe(1);
	});

	it('handles attempts arriving out of order', () => {
		const result = computeDailyStatsFromAttempts([
			at('2026-01-05T10:04:00Z'),
			at('2026-01-05T10:00:00Z'),
			at('2026-01-05T10:02:00Z')
		]);
		expect(result.get('2026-01-05')!.activeMinutes).toBe(5);
	});

	it('returns an empty map for no attempts', () => {
		expect(computeDailyStatsFromAttempts([]).size).toBe(0);
	});
});
