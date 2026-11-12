import { fsrs, createEmptyCard, Rating, type Card, type Grade } from 'ts-fsrs';
import { db } from '../db/index.js';
import { studentAtomStatus } from '../db/schema.js';
import { and, eq, lte } from 'drizzle-orm';
import { hasGenerator } from '../tasks/generators.js';

export { Rating };

export interface FsrsState {
	due: string;
	stability: number;
	difficulty: number;
	elapsed_days: number;
	scheduled_days: number;
	reps: number;
	lapses: number;
	learning_steps: number;
	state: number;
	last_review?: string;
}

function cardFromState(state: FsrsState): Card {
	return {
		...state,
		due: new Date(state.due),
		last_review: state.last_review ? new Date(state.last_review) : undefined
	} as Card;
}

function stateFromCard(card: Card): FsrsState {
	return {
		...card,
		due: card.due.toISOString(),
		last_review: card.last_review?.toISOString()
	};
}

const scheduler = fsrs();

// R = (1 + elapsed_days / (9 * stability))^(-1); returns 0 for new/unreviewed cards
export function computeRetrievability(state: FsrsState): number {
	if (!state.last_review || state.stability <= 0) return 0;
	const elapsedMs = Date.now() - new Date(state.last_review).getTime();
	const elapsedDays = elapsedMs / 86_400_000;
	const card = cardFromState(state);
	return scheduler.get_retrievability(card, new Date(), false) as number;
}

// Initialize FSRS for a newly mastered atom
export async function initFsrsForAtom(studentId: string, atomId: string): Promise<void> {
	const card = createEmptyCard();
	const fsrsState = stateFromCard(card);

	await db
		.update(studentAtomStatus)
		.set({ fsrsState })
		.where(and(eq(studentAtomStatus.studentId, studentId), eq(studentAtomStatus.atomId, atomId)));
}

// Schedule next review after a practice attempt on a mastered atom.
// rating: 1=Again (forgot), 2=Hard, 3=Good, 4=Easy
export async function scheduleFsrsReview(
	studentId: string,
	atomId: string,
	rating: 1 | 2 | 3 | 4
): Promise<FsrsState> {
	const status = await db.query.studentAtomStatus.findFirst({
		where: (s, { and, eq }) => and(eq(s.studentId, studentId), eq(s.atomId, atomId))
	});

	const card = status?.fsrsState
		? cardFromState(status.fsrsState as FsrsState)
		: createEmptyCard();

	const grades: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];
	const grade = grades[rating - 1];
	const { card: nextCard } = scheduler.next(card, new Date(), grade);
	const nextState = stateFromCard(nextCard);

	await db
		.update(studentAtomStatus)
		.set({ fsrsState: nextState })
		.where(and(eq(studentAtomStatus.studentId, studentId), eq(studentAtomStatus.atomId, atomId)));

	return nextState;
}

// Return all mastered atoms that are due for review right now
export async function getDueReviews(
	studentId: string
): Promise<Array<{ atomId: string; label: string; fsrsState: FsrsState }>> {
	const now = new Date();

	const dueStatuses = await db.query.studentAtomStatus.findMany({
		where: (s, { and, eq }) => and(eq(s.studentId, studentId), eq(s.isMastered, true)),
		with: { atom: true }
	});

	return dueStatuses
		.filter((s) => {
			if (!s.fsrsState) return false;
			// Status rows can outlive graph changes: an atom mastered before it became a
			// cluster (e.g. arithmetik__groessen_geld_laenge_zeit since graph v4) keeps its
			// fsrsState, but clusters have no generator and would fail to load as a task.
			if (s.atom.level !== 'atom' || !hasGenerator(s.atomId)) return false;
			const state = s.fsrsState as FsrsState;
			return new Date(state.due) <= now;
		})
		.map((s) => ({
			atomId: s.atomId,
			label: s.atom.label,
			fsrsState: s.fsrsState as FsrsState
		}));
}
