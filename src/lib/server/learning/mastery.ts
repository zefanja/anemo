import { db } from '../db/index.js';
import { studentAtomStatus } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

// Mastery uses an Exponentially Weighted Moving Average (EWMA).
// α = 1 - DECAY_FACTOR is the weight of the current answer; older answers decay.
// This lets mastery recover from early mistakes and rewards consistent performance.
// MIN_ATTEMPTS dampens the value until enough data is collected.
const DECAY_FACTOR = 0.7; // α = 0.3 — ~6 consecutive correct → mastery 0.86
const MIN_ATTEMPTS = 2;

// prevMastery: EWMA state stored in DB; isCorrect: result of this attempt
export function computeMastery(prevMastery: number, isCorrect: boolean, totalAttempts: number): number {
	if (totalAttempts === 0) return 0;
	const raw = (1 - DECAY_FACTOR) * (isCorrect ? 1 : 0) + DECAY_FACTOR * prevMastery;
	if (totalAttempts < MIN_ATTEMPTS) {
		return raw * (totalAttempts / MIN_ATTEMPTS);
	}
	return raw;
}

export async function updateMastery(
	studentId: string,
	atomId: string,
	isCorrect: boolean,
	masteryRequired: number
): Promise<{ mastery: number; justMastered: boolean }> {
	const existing = await db.query.studentAtomStatus.findFirst({
		where: (s, { and, eq }) => and(eq(s.studentId, studentId), eq(s.atomId, atomId))
	});

	const prevTotal = existing?.totalAttempts ?? 0;
	const prevCorrect = existing?.correctAttempts ?? 0;
	const newTotal = prevTotal + 1;
	const newCorrect = prevCorrect + (isCorrect ? 1 : 0);
	const mastery = computeMastery(existing?.mastery ?? 0, isCorrect, newTotal);
	const wasMastered = existing?.isMastered ?? false;
	const isMastered = mastery >= masteryRequired;
	const justMastered = !wasMastered && isMastered;

	const now = new Date();

	if (existing) {
		await db
			.update(studentAtomStatus)
			.set({
				totalAttempts: newTotal,
				correctAttempts: newCorrect,
				mastery,
				isMastered,
				masteredAt: justMastered ? now : existing.masteredAt,
				lastPracticedAt: now,
				updatedAt: now
			})
			.where(and(eq(studentAtomStatus.studentId, studentId), eq(studentAtomStatus.atomId, atomId)));
	} else {
		await db.insert(studentAtomStatus).values({
			studentId,
			atomId,
			totalAttempts: newTotal,
			correctAttempts: newCorrect,
			mastery,
			isMastered,
			masteredAt: justMastered ? now : null,
			lastPracticedAt: now,
			updatedAt: now
		});
	}

	return { mastery, justMastered };
}

// Cluster mastery = minimum mastery of all required sub-atoms.
// Never directly written; always computed on the fly.
export async function getClusterMastery(
	studentId: string,
	clusterAtomId: string
): Promise<number> {
	const edges = await db.query.edges.findMany({
		where: (e, { and, eq }) =>
			and(eq(e.targetId, clusterAtomId), eq(e.edgeType, 'required'))
	});

	if (edges.length === 0) return 0;

	const statuses = await Promise.all(
		edges.map((e) =>
			db.query.studentAtomStatus.findFirst({
				where: (s, { and, eq }) => and(eq(s.studentId, studentId), eq(s.atomId, e.sourceId))
			})
		)
	);

	return Math.min(...statuses.map((s) => s?.mastery ?? 0));
}
