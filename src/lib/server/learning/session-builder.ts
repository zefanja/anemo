import { computeFrontier, computeReinforcedAncestors, computeDiscriminationSets } from './frontier.js';
import { getDueReviews } from './fsrs.js';
import { db } from '../db/index.js';
import { env } from '$env/dynamic/private';

export type SessionItemType = 'review' | 'new' | 'active' | 'discrimination';

export interface SessionItem {
	atomId: string;
	label: string;
	type: SessionItemType;
	mastery: number;
	masteryRequired: number;
	cognitiveLoad: number;
	graphDepth: number;
}

export interface PracticeSession {
	// Must complete reviews first before free practice unlocks
	mandatoryReviews: SessionItem[];
	// Available frontier items for free practice (after reviews done)
	frontierItems: SessionItem[];
	// Clusters whose sub-atoms are all individually mastered — mixed/interleaved
	// practice across them (DI discrimination phase), available like frontier items.
	discriminationSets: SessionItem[];
	reviewsDone: boolean;
	// All relevant due reviews, not just this round (mandatoryReviews is capped)
	totalDueReviews: number;
	// Distinct atoms reviewed today (UTC day, same boundary as the streak logic)
	reviewsDoneToday: number;
	// Topics are open: no reviews pending, or one of the unlock rules is met
	topicsUnlocked: boolean;
	// Reviews still needed until an unlock rule is met (0 when unlocked)
	reviewsUntilUnlock: number;
}

export interface ReviewUnlockRules {
	/** Unlock after this many reviews today; 0 = rule off */
	daily: number;
	/** Unlock after this percentage of today's backlog (done today + still due); 0 = rule off */
	percent: number;
}

// Whether topics unlock despite pending reviews, and how many reviews are still needed.
// Today's backlog is approximated as doneToday + dueNow: each review moves one item
// from "due" to "done", so the backlog stays constant while the student works.
export function evaluateReviewUnlock(
	doneToday: number,
	dueNow: number,
	rules: ReviewUnlockRules
): { unlocked: boolean; remaining: number } {
	if (dueNow === 0) return { unlocked: true, remaining: 0 };
	const candidates: number[] = [];
	if (rules.daily > 0) candidates.push(Math.max(0, rules.daily - doneToday));
	if (rules.percent > 0) {
		const backlog = doneToday + dueNow;
		const needed = Math.ceil((Math.min(rules.percent, 100) / 100) * backlog);
		candidates.push(Math.max(0, needed - doneToday));
	}
	// No rule active → all due reviews must be done
	const remaining = candidates.length > 0 ? Math.min(dueNow, ...candidates) : dueNow;
	return { unlocked: remaining === 0, remaining };
}

function parseSetting(classValue: number | null | undefined, envValue: string | undefined, fallback: number) {
	if (classValue !== null && classValue !== undefined) return classValue;
	const parsed = parseInt(envValue ?? '');
	return isNaN(parsed) ? fallback : parsed;
}

async function countReviewsToday(studentId: string): Promise<number> {
	const now = new Date();
	const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	const rows = await db.query.attempts.findMany({
		where: (a, { and, eq, gte, isNotNull }) =>
			and(eq(a.studentId, studentId), isNotNull(a.fsrsRating), gte(a.answeredAt, startOfDay)),
		columns: { atomId: true }
	});
	return new Set(rows.map((r) => r.atomId)).size;
}

// Build a session for a student.
// Reviews are shown first and lock new topics until they are done — or until one of the
// unlock rules (reviews today / share of today's backlog) is met.
// Once unlocked, frontier items are available without limit.
export async function buildSession(
	studentId: string,
	classId: string
): Promise<PracticeSession> {
	const [classData, studentData] = await Promise.all([
		db.query.classes.findFirst({ where: (c, { eq }) => eq(c.id, classId) }),
		db.query.students.findFirst({
			where: (s, { eq }) => eq(s.id, studentId),
			columns: { extraDomains: true }
		})
	]);

	const maxReview = parseSetting(classData?.sessionMaxReview, env.SESSION_MAX_REVIEW, 10);
	const unlockRules: ReviewUnlockRules = {
		daily: parseSetting(classData?.reviewUnlockDaily, env.REVIEW_UNLOCK_DAILY, 50),
		percent: parseSetting(classData?.reviewUnlockPercent, env.REVIEW_UNLOCK_PERCENT, 80)
	};
	const classDomains = classData?.enabledDomains ?? null;
	const extraDomains = studentData?.extraDomains ?? null;
	// Merge: if class has restricted domains, add student's extras on top
	const enabledDomains =
		classDomains === null
			? null
			: extraDomains && extraDomains.length > 0
				? [...new Set([...classDomains, ...extraDomains])]
				: classDomains;

	const [dueReviews, frontier, discriminationSetData, reviewsDoneToday] = await Promise.all([
		getDueReviews(studentId),
		computeFrontier(studentId, enabledDomains),
		computeDiscriminationSets(studentId, enabledDomains),
		countReviewsToday(studentId)
	]);

	// Atoms the student is actively working on (started, not yet mastered) implicitly
	// reinforce their own required prerequisites — those don't need a separate review.
	const activeAtomIds = frontier.filter((a) => a.mastery > 0).map((a) => a.id);
	const reinforcedAncestors = await computeReinforcedAncestors(activeAtomIds);
	const relevantReviews = dueReviews.filter((r) => !reinforcedAncestors.has(r.atomId));

	// FSRS reviews – mandatory, capped at maxReview
	const mandatoryReviews: SessionItem[] = relevantReviews.slice(0, maxReview).map((r) => ({
		atomId: r.atomId,
		label: r.label,
		type: 'review',
		mastery: 1, // mastered
		masteryRequired: 1,
		cognitiveLoad: 0.5,
		graphDepth: 0
	}));

	// Frontier atoms for free practice
	const frontierItems: SessionItem[] = frontier.map((a) => ({
		atomId: a.id,
		label: a.label,
		type: a.mastery > 0 ? 'active' : 'new',
		mastery: a.mastery,
		masteryRequired: a.masteryRequired,
		cognitiveLoad: a.cognitiveLoad,
		graphDepth: a.graphDepth
	}));

	const discriminationSets: SessionItem[] = discriminationSetData.map((d) => ({
		atomId: d.clusterId,
		label: d.label,
		type: 'discrimination',
		mastery: 1,
		masteryRequired: 1,
		cognitiveLoad: 0.5,
		graphDepth: 0
	}));

	const unlock = evaluateReviewUnlock(reviewsDoneToday, relevantReviews.length, unlockRules);

	return {
		mandatoryReviews,
		frontierItems,
		discriminationSets,
		reviewsDone: mandatoryReviews.length === 0,
		totalDueReviews: relevantReviews.length,
		reviewsDoneToday,
		topicsUnlocked: unlock.unlocked,
		reviewsUntilUnlock: unlock.remaining
	};
}
