import { computeFrontier, type FrontierAtom } from './frontier.js';
import { getDueReviews } from './fsrs.js';
import { db } from '../db/index.js';
import { env } from '$env/dynamic/private';

export type SessionItemType = 'review' | 'new' | 'active';

export interface SessionItem {
	atomId: string;
	label: string;
	type: SessionItemType;
	mastery: number;
	masteryRequired: number;
}

export interface PracticeSession {
	// Must complete reviews first before free practice unlocks
	mandatoryReviews: SessionItem[];
	// Available frontier items for free practice (after reviews done)
	frontierItems: SessionItem[];
	reviewsDone: boolean;
}

// Build a session for a student.
// Reviews are mandatory and shown first.
// After reviews are done, frontier items are available without limit.
export async function buildSession(
	studentId: string,
	classId: string
): Promise<PracticeSession> {
	const classData = await db.query.classes.findFirst({
		where: (c, { eq }) => eq(c.id, classId)
	});

	const maxReview = classData?.sessionMaxReview ?? parseInt(env.SESSION_MAX_REVIEW ?? '10');
	const enabledDomains = classData?.enabledDomains ?? null;

	// FSRS reviews – mandatory, capped at maxReview
	const dueReviews = await getDueReviews(studentId);
	const mandatoryReviews: SessionItem[] = dueReviews.slice(0, maxReview).map((r) => ({
		atomId: r.atomId,
		label: r.label,
		type: 'review',
		mastery: 1, // mastered
		masteryRequired: 1
	}));

	// Frontier atoms for free practice
	const frontier = await computeFrontier(studentId, enabledDomains);
	const frontierItems: SessionItem[] = frontier.map((a) => ({
		atomId: a.id,
		label: a.label,
		type: a.mastery > 0 ? 'active' : 'new',
		mastery: a.mastery,
		masteryRequired: a.masteryRequired
	}));

	return {
		mandatoryReviews,
		frontierItems,
		reviewsDone: mandatoryReviews.length === 0
	};
}
