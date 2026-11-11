import { db } from '../db/index.js';
import { studentAtomStatus } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { env } from '$env/dynamic/private';

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

// Stage progression implements a DI-style expanding sequence within an atom's
// generator: a stage only counts as firm once STAGE_STREAK_TARGET consecutive
// answers were correct, at which point the student advances to the next
// (harder) stage. A wrong answer resets the streak and steps back one stage
// (correction procedure) rather than dropping straight to stage 0.
export function computeStage(
	prevStage: number,
	prevStreak: number,
	isCorrect: boolean
): { stage: number; stageStreak: number } {
	const target = parseInt(env.STAGE_STREAK_TARGET ?? '4');
	if (isCorrect) {
		const streak = prevStreak + 1;
		if (streak >= target) return { stage: prevStage + 1, stageStreak: 0 };
		return { stage: prevStage, stageStreak: streak };
	}
	return { stage: Math.max(0, prevStage - 1), stageStreak: 0 };
}

export async function updateMastery(
	studentId: string,
	atomId: string,
	isCorrect: boolean,
	masteryRequired: number
): Promise<{ mastery: number; justMastered: boolean; stage: number }> {
	const existing = await db.query.studentAtomStatus.findFirst({
		where: (s, { and, eq }) => and(eq(s.studentId, studentId), eq(s.atomId, atomId))
	});

	const prevTotal = existing?.totalAttempts ?? 0;
	const prevCorrect = existing?.correctAttempts ?? 0;
	const newTotal = prevTotal + 1;
	const newCorrect = prevCorrect + (isCorrect ? 1 : 0);
	const mastery = computeMastery(existing?.mastery ?? 0, isCorrect, newTotal);
	const wasMastered = existing?.isMastered ?? false;
	// Cap at 0.95 — the EWMA formula is asymptotic and can never reach 1.0,
	// so mastery_required: 1.0 in atom data would make an atom permanently unmasterable.
	const effectiveRequired = Math.min(masteryRequired, 0.95);
	const isMastered = mastery >= effectiveRequired;
	const justMastered = !wasMastered && isMastered;
	const { stage, stageStreak } = computeStage(existing?.stage ?? 0, existing?.stageStreak ?? 0, isCorrect);

	const now = new Date();

	if (existing) {
		await db
			.update(studentAtomStatus)
			.set({
				totalAttempts: newTotal,
				correctAttempts: newCorrect,
				mastery,
				isMastered,
				stage,
				stageStreak,
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
			stage,
			stageStreak,
			masteredAt: justMastered ? now : null,
			lastPracticedAt: now,
			updatedAt: now
		});
	}

	return { mastery, justMastered, stage };
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
