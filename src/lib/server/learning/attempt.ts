import { db } from '../db/index.js';
import { attempts } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { checkAnswer } from '../tasks/index.js';
import { updateMastery } from './mastery.js';
import { initFsrsForAtom, scheduleFsrsReview } from './fsrs.js';
import { recordAttempt as recordGamification } from '../gamification/index.js';
import { randomUUID } from 'node:crypto';
import type { GeneratedTask } from '../tasks/generators.js';

export interface AttemptResult {
	correct: boolean;
	mastery: number;
	justMastered: boolean;
	xpGained: number;
	newXp: number;
	newLevel: number;
	levelUp: boolean;
	newBadges: string[];
	streakDays: number;
	combo: number;
	comboBonus: number;
	dailyXp: number;
	dailyGoal: number;
	dailyGoalReached: boolean;
	streakFreezes: number;
	freezeUsed: boolean;
	freezeEarned: boolean;
	hint?: string;
	/** Rationale for the concrete task ("Warum?") – sent for right and wrong answers alike. */
	why?: string;
	correctAnswer?: string;
	submittedAnswer?: string;
}

export async function processAttempt(
	studentId: string,
	atomId: string,
	submittedAnswer: string,
	task: GeneratedTask,
	isReview: boolean
): Promise<AttemptResult> {
	const correct = checkAnswer(submittedAnswer, task.correctAnswer, task.answerType, task.tolerance);

	// 1. Update mastery (for non-cluster atoms)
	const atom = await db.query.atoms.findFirst({
		where: (a, { eq }) => eq(a.id, atomId),
		columns: { masteryRequired: true, level: true, jahrgangsstufen: true }
	});

	const atomGrade = atom?.jahrgangsstufen?.length
		? Math.min(...atom.jahrgangsstufen)
		: null;

	let mastery = 0;
	let justMastered = false;
	let correctAttempts = 0;
	let totalAttempts = 0;

	if (atom?.level === 'atom') {
		const result = await updateMastery(studentId, atomId, correct, atom.masteryRequired);
		mastery = result.mastery;
		justMastered = result.justMastered;
		correctAttempts = result.correctAttempts;
		totalAttempts = result.totalAttempts;
	}

	// 2. FSRS scheduling
	if (isReview) {
		const rating = correct ? 3 : 1; // Good or Again
		await scheduleFsrsReview(studentId, atomId, rating as 1 | 3);
	} else if (justMastered) {
		// The mastery run counts as the first review: the first repetition comes days
		// later (sooner after a bumpy run), never right after the atom was completed.
		await initFsrsForAtom(studentId, atomId, correctAttempts, totalAttempts);
	}

	// 3. Record attempt in DB
	const attemptId = randomUUID();
	await db.insert(attempts).values({
		id: attemptId,
		studentId,
		atomId,
		isCorrect: correct,
		givenAnswer: submittedAnswer,
		taskPrompt: task.prompt,
		correctAnswer: task.correctAnswer,
		fsrsRating: isReview ? (correct ? 3 : 1) : null,
		answeredAt: new Date()
	});

	// 4. Gamification
	const gami = await recordGamification(studentId, correct, isReview, justMastered, atomId, atomGrade);
	if (gami.xpGained > 0) {
		await db.update(attempts).set({ xpGained: gami.xpGained }).where(eq(attempts.id, attemptId));
	}

	return {
		correct,
		mastery,
		justMastered,
		xpGained: gami.xpGained,
		newXp: gami.newXp,
		newLevel: gami.newLevel,
		levelUp: gami.levelUp,
		newBadges: gami.newBadges,
		streakDays: gami.streakDays,
		combo: gami.combo,
		comboBonus: gami.comboBonus,
		dailyXp: gami.dailyXp,
		dailyGoal: gami.dailyGoal,
		dailyGoalReached: gami.dailyGoalReached,
		streakFreezes: gami.streakFreezes,
		freezeUsed: gami.freezeUsed,
		freezeEarned: gami.freezeEarned,
		hint: !correct ? task.hint : undefined,
		why: task.why,
		correctAnswer: !correct ? task.correctAnswer : undefined,
		submittedAnswer: !correct ? submittedAnswer : undefined
	};
}
