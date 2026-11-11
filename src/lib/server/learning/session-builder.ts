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
}

// Build a session for a student.
// Reviews are mandatory and shown first.
// After reviews are done, frontier items are available without limit.
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

	const maxReview = classData?.sessionMaxReview ?? parseInt(env.SESSION_MAX_REVIEW ?? '10');
	const classDomains = classData?.enabledDomains ?? null;
	const extraDomains = studentData?.extraDomains ?? null;
	// Merge: if class has restricted domains, add student's extras on top
	const enabledDomains =
		classDomains === null
			? null
			: extraDomains && extraDomains.length > 0
				? [...new Set([...classDomains, ...extraDomains])]
				: classDomains;

	const [dueReviews, frontier, discriminationSetData] = await Promise.all([
		getDueReviews(studentId),
		computeFrontier(studentId, enabledDomains),
		computeDiscriminationSets(studentId, enabledDomains)
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

	return {
		mandatoryReviews,
		frontierItems,
		discriminationSets,
		reviewsDone: mandatoryReviews.length === 0
	};
}
