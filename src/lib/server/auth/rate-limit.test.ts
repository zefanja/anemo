import { vi, describe, it, expect, beforeEach } from 'vitest';

// vi.hoisted runs BEFORE vi.mock hoisting, so the variable is available in the mock factory
const mocks = vi.hoisted(() => {
	const findFirst = vi.fn();
	const whereUpdate = vi.fn().mockResolvedValue([]);
	const set = vi.fn().mockReturnValue({ where: whereUpdate });
	const values = vi.fn().mockResolvedValue([]);
	const update = vi.fn().mockReturnValue({ set });
	const insert = vi.fn().mockReturnValue({ values });
	const whereDelete = vi.fn().mockResolvedValue([]);
	const del = vi.fn().mockReturnValue({ where: whereDelete });

	return {
		findFirst,
		db: {
			query: { loginAttempts: { findFirst } },
			update,
			insert,
			delete: del
		}
	};
});

vi.mock('$lib/server/db/index.js', () => ({ db: mocks.db }));

import { checkRateLimit, recordFailedAttempt, clearAttempts } from '$lib/server/auth/rate-limit.js';

beforeEach(() => {
	vi.clearAllMocks();
	// Restore return values cleared by clearAllMocks
	const where = vi.fn().mockResolvedValue([]);
	mocks.db.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where }) });
	mocks.db.insert.mockReturnValue({ values: vi.fn().mockResolvedValue([]) });
	mocks.db.delete.mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
});

describe('checkRateLimit', () => {
	it('allows when no DB record exists', async () => {
		mocks.findFirst.mockResolvedValueOnce(null);
		const result = await checkRateLimit('127.0.0.1');
		expect(result.allowed).toBe(true);
		expect(result.attemptsLeft).toBe(5);
	});

	it('blocks when a future lock exists', async () => {
		const future = new Date(Date.now() + 60_000);
		mocks.findFirst.mockResolvedValueOnce({ attempts: 5, lockedUntil: future });
		const result = await checkRateLimit('127.0.0.1');
		expect(result.allowed).toBe(false);
		expect(result.lockedUntil).toEqual(future);
	});

	it('allows again and resets after the lock has expired', async () => {
		const past = new Date(Date.now() - 1_000);
		mocks.findFirst.mockResolvedValueOnce({ attempts: 5, lockedUntil: past });
		const result = await checkRateLimit('127.0.0.1');
		expect(result.allowed).toBe(true);
	});

	it('reflects remaining attempts below max', async () => {
		mocks.findFirst.mockResolvedValueOnce({ attempts: 3, lockedUntil: null });
		const result = await checkRateLimit('127.0.0.1');
		expect(result.allowed).toBe(true);
		expect(result.attemptsLeft).toBe(2); // MAX_ATTEMPTS(5) − 3
	});

	it('blocks when attempts equal MAX_ATTEMPTS and lock is null', async () => {
		mocks.findFirst.mockResolvedValueOnce({ attempts: 5, lockedUntil: null });
		const result = await checkRateLimit('127.0.0.1');
		expect(result.allowed).toBe(false);
	});
});

describe('recordFailedAttempt', () => {
	it('locks the account on the 5th failed attempt', async () => {
		mocks.findFirst.mockResolvedValueOnce({ attempts: 4, lockedUntil: null });
		const result = await recordFailedAttempt('192.168.1.1');
		expect(result.allowed).toBe(false);
		expect(result.lockedUntil).toBeInstanceOf(Date);
		expect(result.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
	});

	it('still allows and decrements remaining attempts before lockout', async () => {
		mocks.findFirst.mockResolvedValueOnce({ attempts: 2, lockedUntil: null });
		const result = await recordFailedAttempt('192.168.1.1');
		expect(result.allowed).toBe(true);
		expect(result.attemptsLeft).toBe(2); // MAX(5) − 3
	});

	it('creates a new record when none exists', async () => {
		mocks.findFirst.mockResolvedValueOnce(null);
		await recordFailedAttempt('10.0.0.1');
		expect(mocks.db.insert).toHaveBeenCalled();
	});

	it('updates the existing record on repeated failures', async () => {
		mocks.findFirst.mockResolvedValueOnce({ attempts: 1, lockedUntil: null });
		await recordFailedAttempt('10.0.0.1');
		expect(mocks.db.update).toHaveBeenCalled();
	});
});

describe('clearAttempts', () => {
	it('calls db.delete for the given identifier', async () => {
		await clearAttempts('127.0.0.1');
		expect(mocks.db.delete).toHaveBeenCalled();
	});
});
