import { generateTask, hasGenerator } from './generators.js';
import { db } from '../db/index.js';
import { tasks } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import type { GeneratedTask } from './generators.js';

export type { GeneratedTask };
export type TaskWithId = GeneratedTask & { id: string };

/**
 * Get one task for a given atom.
 * Priority: imported static tasks (random pick) → procedural generator.
 * Procedural tasks are saved to DB so the attempt handler can look up the
 * correct answer by ID without re-generating a different task.
 */
export async function getTaskForAtom(atomId: string): Promise<TaskWithId | null> {
	// Try to pick a random imported task first
	const imported = await db.query.tasks.findFirst({
		where: (t, { and, eq, isNull }) => and(eq(t.atomId, atomId), isNull(t.generatorId)),
		orderBy: sql`RANDOM()`
	});

	if (imported?.prompt && imported.correctAnswer) {
		return {
			id: imported.id,
			atomId,
			prompt: imported.prompt,
			answerType: imported.answerType as GeneratedTask['answerType'],
			correctAnswer: imported.correctAnswer,
			hint: imported.hint ?? undefined,
			difficulty: imported.difficulty ?? undefined
		};
	}

	// Fall back to procedural generator — save to DB so the correct answer is
	// retrievable by taskId when the student submits their answer.
	if (hasGenerator(atomId)) {
		const generated = generateTask(atomId);
		if (!generated) return null;
		const id = crypto.randomUUID();
		await db.insert(tasks).values({
			id,
			atomId: generated.atomId,
			prompt: generated.prompt,
			answerType: generated.answerType,
			correctAnswer: generated.correctAnswer,
			hint: generated.hint ?? null,
			difficulty: generated.difficulty ?? null,
			generatorId: atomId
		});
		return { ...generated, id };
	}

	return null;
}

/**
 * Check a submitted answer against the correct answer.
 * Handles integer, number, fraction, and text answer types.
 */
export function checkAnswer(
	submitted: string,
	correctAnswer: string,
	answerType: GeneratedTask['answerType']
): boolean {
	const s = submitted.trim().toLowerCase().replace(',', '.');
	const c = correctAnswer.trim().toLowerCase().replace(',', '.');

	if (answerType === 'text') {
		return s === c;
	}

	if (answerType === 'fraction') {
		// Both in form "num/den" — compare as reduced fractions
		const parse = (v: string) => {
			const [n, d] = v.split('/').map(Number);
			if (!d) return { n: v === '' ? NaN : Number(v), d: 1 };
			const g = gcd(Math.abs(n), Math.abs(d));
			return { n: n / g, d: d / g };
		};
		const sv = parse(s), cv = parse(c);
		return sv.n === cv.n && sv.d === cv.d;
	}

	// integer or number: compare as floats with small epsilon
	const sn = parseFloat(s), cn = parseFloat(c);
	if (isNaN(sn) || isNaN(cn)) return false;
	return Math.abs(sn - cn) < 1e-9;
}

function gcd(a: number, b: number): number {
	a = Math.abs(a); b = Math.abs(b);
	while (b) { [a, b] = [b, a % b]; }
	return a;
}
