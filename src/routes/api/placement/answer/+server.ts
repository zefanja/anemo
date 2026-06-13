import { json, error } from '@sveltejs/kit';
import {
	loadPlacementGraph,
	applyPass,
	applyFail,
	getNextPlacementAtom,
	type PlacementState
} from '$lib/server/learning/placement.js';
import { getTaskForAtom, checkAnswer } from '$lib/server/tasks/index.js';
import { db } from '$lib/server/db/index.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || locals.session.type !== 'student') {
		throw error(401, 'Nicht angemeldet');
	}

	const body = await request.json().catch(() => null);
	if (!body?.atomId || typeof body.answer !== 'string' || !body.state) {
		throw error(400, 'Ungültige Anfrage');
	}

	const { atomId, taskId, answer, state } = body as {
		atomId: string;
		taskId: string;
		answer: string;
		state: PlacementState;
	};

	// Resolve the task the student was shown
	let correctAnswer = '';
	let answerType: 'number' | 'integer' | 'fraction' | 'text' | 'boolean' | 'comparison' = 'number';
	let hint: string | null = null;

	if (taskId) {
		const dbTask = await db.query.tasks.findFirst({
			where: (t, { eq }) => eq(t.id, taskId),
			columns: { correctAnswer: true, answerType: true, hint: true }
		});
		if (dbTask?.correctAnswer) {
			correctAnswer = dbTask.correctAnswer;
			answerType = dbTask.answerType as typeof answerType;
			hint = dbTask.hint ?? null;
		}
	}
	if (!correctAnswer) {
		const fallback = await getTaskForAtom(atomId);
		if (!fallback) throw error(404, 'Aufgabe nicht gefunden');
		correctAnswer = fallback.correctAnswer;
		answerType = fallback.answerType;
		hint = fallback.hint ?? null;
	}

	const correct = checkAnswer(answer, correctAnswer, answerType);

	const graph = await loadPlacementGraph();
	const newState = correct ? applyPass(atomId, state, graph) : applyFail(atomId, state, graph);

	const nextAtomId = getNextPlacementAtom(newState, graph);

	if (!nextAtomId) {
		return json({ correct, complete: true, state: newState, hint: !correct ? hint : null });
	}

	const [nextAtom, nextTask] = await Promise.all([
		db.query.atoms.findFirst({
			where: (a, { eq }) => eq(a.id, nextAtomId),
			columns: { id: true, label: true }
		}),
		getTaskForAtom(nextAtomId)
	]);

	if (!nextTask) throw error(500, 'Keine Aufgabe verfügbar');

	return json({
		correct,
		complete: false,
		hint: !correct ? hint : null,
		atomId: nextAtomId,
		atomLabel: nextAtom?.label ?? nextAtomId,
		taskId: nextTask.id,
		prompt: nextTask.prompt,
		answerType: nextTask.answerType,
		choices: nextTask.choices ?? null,
		svg: nextTask.svg ?? null,
		inputData: nextTask.inputData ?? null,
		nextHint: nextTask.hint ?? null,
		state: newState
	});
};
