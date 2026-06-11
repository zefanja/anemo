import { db } from '../db/index.js';
import { attempts } from '../db/schema.js';
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
	newLevel: number;
	levelUp: boolean;
	newBadges: string[];
	streakDays: number;
	hint?: string;
}

export async function processAttempt(
	studentId: string,
	atomId: string,
	submittedAnswer: string,
	task: GeneratedTask,
	isReview: boolean
): Promise<AttemptResult> {
	const correct = checkAnswer(submittedAnswer, task.correctAnswer, task.answerType);

	// 1. Update mastery (for non-cluster atoms)
	const atom = await db.query.atoms.findFirst({
		where: (a, { eq }) => eq(a.id, atomId),
		columns: { masteryRequired: true, level: true }
	});

	let mastery = 0;
	let justMastered = false;

	if (atom?.level === 'atom') {
		const result = await updateMastery(studentId, atomId, correct, atom.masteryRequired);
		mastery = result.mastery;
		justMastered = result.justMastered;
	}

	// 2. FSRS scheduling
	if (isReview) {
		const rating = correct ? 3 : 1; // Good or Again
		await scheduleFsrsReview(studentId, atomId, rating as 1 | 3);
	} else if (justMastered) {
		await initFsrsForAtom(studentId, atomId);
	}

	// 3. Record attempt in DB
	await db.insert(attempts).values({
		id: randomUUID(),
		studentId,
		atomId,
		isCorrect: correct,
		fsrsRating: isReview ? (correct ? 3 : 1) : null,
		answeredAt: new Date()
	});

	// 4. Gamification
	const gami = await recordGamification(studentId, correct, isReview, justMastered, atomId);

	return {
		correct,
		mastery,
		justMastered,
		xpGained: gami.xpGained,
		newLevel: gami.newLevel,
		levelUp: gami.levelUp,
		newBadges: gami.newBadges,
		streakDays: gami.streakDays,
		hint: !correct ? task.hint : undefined
	};
}
