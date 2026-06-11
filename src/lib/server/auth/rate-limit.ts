import { db } from '../db/index.js';
import { loginAttempts } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export interface RateLimitResult {
	allowed: boolean;
	lockedUntil?: Date;
	attemptsLeft?: number;
}

export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
	const row = await db.query.loginAttempts.findFirst({
		where: (r, { eq }) => eq(r.identifier, identifier)
	});

	if (!row) return { allowed: true, attemptsLeft: MAX_ATTEMPTS };

	if (row.lockedUntil && row.lockedUntil > new Date()) {
		return { allowed: false, lockedUntil: row.lockedUntil };
	}

	// lock expired – reset if applicable
	if (row.lockedUntil && row.lockedUntil <= new Date()) {
		await db
			.update(loginAttempts)
			.set({ attempts: 0, lockedUntil: null })
			.where(eq(loginAttempts.identifier, identifier));
		return { allowed: true, attemptsLeft: MAX_ATTEMPTS };
	}

	return {
		allowed: row.attempts < MAX_ATTEMPTS,
		attemptsLeft: Math.max(0, MAX_ATTEMPTS - row.attempts)
	};
}

export async function recordFailedAttempt(identifier: string): Promise<RateLimitResult> {
	const existing = await db.query.loginAttempts.findFirst({
		where: (r, { eq }) => eq(r.identifier, identifier)
	});

	const newAttempts = (existing?.attempts ?? 0) + 1;
	const shouldLock = newAttempts >= MAX_ATTEMPTS;
	const lockedUntil = shouldLock ? new Date(Date.now() + LOCK_DURATION_MS) : null;

	if (existing) {
		await db
			.update(loginAttempts)
			.set({ attempts: newAttempts, lockedUntil, lastAttemptAt: new Date() })
			.where(eq(loginAttempts.identifier, identifier));
	} else {
		await db.insert(loginAttempts).values({
			identifier,
			attempts: newAttempts,
			lockedUntil,
			lastAttemptAt: new Date()
		});
	}

	return shouldLock
		? { allowed: false, lockedUntil: lockedUntil! }
		: { allowed: true, attemptsLeft: MAX_ATTEMPTS - newAttempts };
}

export async function clearAttempts(identifier: string): Promise<void> {
	await db.delete(loginAttempts).where(eq(loginAttempts.identifier, identifier));
}
