import { generateTask, hasGenerator } from './generators.js';
import { db } from '../db/index.js';
import { tasks } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import type { GeneratedTask } from './generators.js';

export type { GeneratedTask };
export type TaskWithId = GeneratedTask & { id: string };

/**
 * Discrimination practice (DI mixed/interleaved review, see frontier.ts
 * computeDiscriminationSets): pick one random sub-atom from the cluster's
 * already-mastered pool and serve a task for it at that atom's current stage.
 * The returned task carries the real sub-atom's atomId, so submission via
 * /api/attempt needs no special handling — it looks like a normal atom task.
 */
export async function getTaskForCluster(
	studentId: string,
	subAtomIds: string[],
	excludePrompts: string[] = []
): Promise<TaskWithId | null> {
	if (subAtomIds.length === 0) return null;
	const atomId = subAtomIds[Math.floor(Math.random() * subAtomIds.length)];
	const status = await db.query.studentAtomStatus.findFirst({
		where: (s, { and, eq }) => and(eq(s.studentId, studentId), eq(s.atomId, atomId)),
		columns: { stage: true }
	});
	return getTaskForAtom(atomId, excludePrompts, status?.stage ?? 0);
}

/**
 * Get one task for a given atom.
 * Priority: imported static tasks (random pick) → procedural generator.
 * Procedural tasks are saved to DB so the attempt handler can look up the
 * correct answer by ID without re-generating a different task.
 *
 * excludePrompts: prompts recently shown to the student — avoided when possible.
 * stage: current difficulty stage within the atom's generator (DI expanding sequence, see mastery.ts computeStage).
 */
export async function getTaskForAtom(atomId: string, excludePrompts: string[] = [], stage?: number): Promise<TaskWithId | null> {
	// Try to pick an imported task not recently seen
	let imported = excludePrompts.length > 0
		? await db.query.tasks.findFirst({
			where: (t, { and, eq, isNull, notInArray }) => and(
				eq(t.atomId, atomId),
				isNull(t.generatorId),
				notInArray(t.prompt, excludePrompts)
			),
			orderBy: sql`RANDOM()`
		})
		: undefined;

	// Fallback: any imported task (all excluded or none provided)
	if (!imported) {
		imported = await db.query.tasks.findFirst({
			where: (t, { and, eq, isNull }) => and(eq(t.atomId, atomId), isNull(t.generatorId)),
			orderBy: sql`RANDOM()`
		});
	}

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

	// Fall back to procedural generator — retry up to 5× to avoid recently seen prompts.
	// Saves the chosen task to DB so the attempt handler can look up the correct answer by ID.
	if (hasGenerator(atomId)) {
		const excludeSet = new Set(excludePrompts);
		let generated: GeneratedTask | null = null;
		for (let attempt = 0; attempt < 5; attempt++) {
			const candidate = generateTask(atomId, stage);
			if (!candidate) break;
			if (!excludeSet.has(candidate.prompt)) { generated = candidate; break; }
			if (!generated) generated = candidate; // keep as last-resort fallback
		}
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
 * Handles integer, number, fraction, text, boolean, and comparison answer types.
 */
export function checkAnswer(
	submitted: string,
	correctAnswer: string,
	answerType: GeneratedTask['answerType']
): boolean {
	const s = submitted.trim().toLowerCase().replace(',', '.');
	const c = correctAnswer.trim().toLowerCase().replace(',', '.');

	if (answerType === 'text' || answerType === 'boolean' || answerType === 'comparison') {
		if (s === c) return true;
		// Order-independent check for "oder"/"und"-separated solutions (e.g. x=-1 oder x=-2 == x=-2 oder x=-1)
		for (const sep of [' oder ', ' und ']) {
			if (s.includes(sep) && c.includes(sep)) {
				const sParts = s.split(sep).map(p => p.trim()).sort();
				const cParts = c.split(sep).map(p => p.trim()).sort();
				if (sParts.length === cParts.length && sParts.every((p, i) => p === cParts[i])) return true;
			}
		}
		return false;
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
