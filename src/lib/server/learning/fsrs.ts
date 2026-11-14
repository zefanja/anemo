import { fsrs, generatorParameters, createEmptyCard, Rating, type Card, type Grade } from 'ts-fsrs';
import { db } from '../db/index.js';
import { studentAtomStatus } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
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

// Long-term scheduling only (enable_short_term: false).
// FSRS' short-term "learning steps" (1 min / 10 min) are meant for flashcards that are
// seen for the first time in the review queue. Here the learning phase happens *before*
// FSRS takes over: an atom only reaches FSRS after the mastery EWMA was met with several
// correct answers in a row. Those answers are the learning steps — reviewing the same atom
// again minutes later would only measure short-term memory and block new topics.
// With short-term off every interval is at least one day; the first interval follows from
// FSRS' initial stability for the rating (≈2 days Hard, ≈3 days Good).
// Fuzz spreads reviews of atoms mastered on the same day over neighbouring days.
const scheduler = fsrs(generatorParameters({ enable_short_term: false, enable_fuzz: true }));

const DAY_MS = 86_400_000;

function minReviewDelayMs(): number {
	const hours = parseFloat(env.REVIEW_MIN_DELAY_HOURS ?? '');
	return (isNaN(hours) ? 20 : Math.max(0, hours)) * 3_600_000;
}

function startOfUtcDay(d: Date): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * When a review actually becomes available to the student.
 *
 * - Day granularity: FSRS intervals are whole days counted from the time of the last
 *   review. An atom mastered Monday 10:00 with a 1-day interval would only be due
 *   Tuesday 10:00 — after a morning lesson. Like Anki, a card is due from the start of
 *   its due day (UTC, the same day boundary as the streak logic).
 * - Minimum delay: never earlier than REVIEW_MIN_DELAY_HOURS (default 20 h) after the
 *   last contact with the atom, so a review never directly follows the learning phase.
 *   `lastContact` is the fallback for cards without last_review (legacy empty cards
 *   created at mastery time, placement cards).
 */
export function reviewAvailableAt(state: FsrsState, lastContact?: Date | null): Date {
	const due = startOfUtcDay(new Date(state.due));
	const last = state.last_review ? new Date(state.last_review) : (lastContact ?? null);
	if (!last) return due;
	const earliest = new Date(last.getTime() + minReviewDelayMs());
	return due > earliest ? due : earliest;
}

export function isReviewDue(state: FsrsState, now: Date = new Date(), lastContact?: Date | null): boolean {
	return reviewAvailableAt(state, lastContact) <= now;
}

// Current recall probability; 0 for new/unreviewed cards
export function computeRetrievability(state: FsrsState): number {
	if (!state.last_review || state.stability <= 0) return 0;
	return scheduler.get_retrievability(cardFromState(state), new Date(), false) as number;
}

/**
 * First FSRS rating at the moment of mastery, derived from how the learning phase went.
 * A smooth run (≥ 80 % correct) counts as Good, a bumpy one as Hard → shorter first
 * interval. Easy is never given: freshly learned material should come back within days.
 */
export function initialRating(correctAttempts: number, totalAttempts: number): 2 | 3 {
	if (totalAttempts <= 0) return 3;
	return correctAttempts / totalAttempts >= 0.8 ? 3 : 2;
}

/** Card after the learning phase, treated as its first (successful) review. */
export function initialFsrsState(rating: 2 | 3, now: Date = new Date()): FsrsState {
	const { card } = scheduler.next(createEmptyCard(now), now, rating as Grade);
	return stateFromCard(card);
}

/** Next state after a review. rating: 1=Again (forgot), 2=Hard, 3=Good, 4=Easy */
export function nextFsrsState(prev: FsrsState | null, rating: 1 | 2 | 3 | 4, now: Date = new Date()): FsrsState {
	const card = prev ? cardFromState(prev) : createEmptyCard(now);
	const grades: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];
	const { card: nextCard } = scheduler.next(card, now, grades[rating - 1]);
	return stateFromCard(nextCard);
}

// Initialize FSRS for a newly mastered atom. The mastery run counts as the first review,
// so the first repetition is scheduled days ahead instead of being due immediately.
// An atom that is mastered again after a lapse keeps its memory history: the new run
// is recorded as one more review on the existing card.
export async function initFsrsForAtom(
	studentId: string,
	atomId: string,
	correctAttempts = 0,
	totalAttempts = 0
): Promise<void> {
	const status = await db.query.studentAtomStatus.findFirst({
		where: (s, { and, eq }) => and(eq(s.studentId, studentId), eq(s.atomId, atomId)),
		columns: { fsrsState: true }
	});
	const prev = (status?.fsrsState as FsrsState | null) ?? null;
	const rating = initialRating(correctAttempts, totalAttempts);
	const fsrsState = prev?.last_review ? nextFsrsState(prev, rating) : initialFsrsState(rating);
	await db
		.update(studentAtomStatus)
		.set({ fsrsState })
		.where(and(eq(studentAtomStatus.studentId, studentId), eq(studentAtomStatus.atomId, atomId)));
}

// Schedule next review after a practice attempt on a mastered atom.
export async function scheduleFsrsReview(
	studentId: string,
	atomId: string,
	rating: 1 | 2 | 3 | 4
): Promise<FsrsState> {
	const status = await db.query.studentAtomStatus.findFirst({
		where: (s, { and, eq }) => and(eq(s.studentId, studentId), eq(s.atomId, atomId))
	});

	const nextState = nextFsrsState((status?.fsrsState as FsrsState | null) ?? null, rating);

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
			const lastContact = s.masteredAt ?? s.lastPracticedAt ?? null;
			return isReviewDue(s.fsrsState as FsrsState, now, lastContact ? new Date(lastContact) : null);
		})
		.map((s) => ({
			atomId: s.atomId,
			label: s.atom.label,
			fsrsState: s.fsrsState as FsrsState
		}));
}

/**
 * Difficulty stage for the next task of an atom.
 *
 * While learning, the stage comes from the DI expanding sequence (mastery.ts computeStage):
 * easy variants first, harder ones only after a streak. Once an atom is mastered, FSRS
 * stability measures how firm that mastery is (days until recall drops to 90 %). Firm
 * knowledge earns harder variants on top of the stage reached while learning:
 *   stability < 7 days  → same stage (consolidate, recall is still fragile)
 *   7–20 days           → +1 stage
 *   ≥ 21 days           → +2 stages
 * A forgotten review (Again) lowers stability, so the bonus shrinks again by itself.
 * Generators clamp stages beyond their last variant to the hardest one.
 */
export function stageForTask(
	stage: number,
	isMastered: boolean,
	fsrsState: FsrsState | null | undefined
): number {
	if (!isMastered || !fsrsState || !fsrsState.last_review) return stage;
	const s = fsrsState.stability;
	const bonus = s >= 21 ? 2 : s >= 7 ? 1 : 0;
	return stage + bonus;
}
