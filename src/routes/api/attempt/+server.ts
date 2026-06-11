import { json, error } from '@sveltejs/kit';
import { getTaskForAtom } from '$lib/server/tasks/index.js';
import type { GeneratedTask } from '$lib/server/tasks/index.js';
import { processAttempt } from '$lib/server/learning/attempt.js';
import { db } from '$lib/server/db/index.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || locals.session.type !== 'student') {
		throw error(401, 'Nicht angemeldet');
	}

	const body = await request.json().catch(() => null);
	if (!body?.atomId || typeof body.answer !== 'string') {
		throw error(400, 'Ungültige Anfrage');
	}

	const { atomId, answer, isReview = false, taskId } = body as {
		atomId: string;
		answer: string;
		isReview?: boolean;
		taskId?: string;
	};

	// Verify atom exists and is practicable
	const atom = await db.query.atoms.findFirst({
		where: (a, { eq }) => eq(a.id, atomId),
		columns: { level: true }
	});
	if (!atom || atom.level === 'cluster') throw error(400, 'Nicht übbar');

	// Look up the exact task the student was shown via taskId.
	// Falling back to re-generating would compare against a different random task.
	let task = null;
	if (taskId) {
		const dbTask = await db.query.tasks.findFirst({
			where: (t, { eq }) => eq(t.id, taskId)
		});
		if (dbTask?.prompt && dbTask.correctAnswer) {
			task = {
				atomId,
				prompt: dbTask.prompt,
				answerType: dbTask.answerType as GeneratedTask['answerType'],
				correctAnswer: dbTask.correctAnswer,
				hint: dbTask.hint ?? undefined,
				difficulty: dbTask.difficulty ?? undefined
			};
		}
	}
	if (!task) task = await getTaskForAtom(atomId);
	if (!task) throw error(404, 'Aufgabe nicht gefunden');

	const result = await processAttempt(
		locals.session.studentId,
		atomId,
		answer,
		task,
		isReview
	);

	return json(result);
};
