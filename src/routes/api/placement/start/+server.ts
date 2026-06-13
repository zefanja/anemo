import { json, error } from '@sveltejs/kit';
import {
	loadPlacementGraph,
	initPlacementState,
	getNextPlacementAtom,
	MAX_PLACEMENT_ATOMS
} from '$lib/server/learning/placement.js';
import { getTaskForAtom } from '$lib/server/tasks/index.js';
import { db } from '$lib/server/db/index.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.session || locals.session.type !== 'student') {
		throw error(401, 'Nicht angemeldet');
	}

	const student = await db.query.students.findFirst({
		where: (s, { eq }) => eq(s.id, locals.session!.studentId),
		columns: { placementDone: true }
	});
	if (student?.placementDone) {
		return json({ alreadyDone: true });
	}

	const graph = await loadPlacementGraph();

	if (graph.atoms.size === 0) {
		throw error(503, 'Keine Atome verfügbar – Wissensgraph wurde noch nicht importiert.');
	}

	const state = initPlacementState();
	const atomId = getNextPlacementAtom(state, graph);

	if (!atomId) {
		return json({ complete: true, state, maxAtoms: MAX_PLACEMENT_ATOMS });
	}

	const [atom, task] = await Promise.all([
		db.query.atoms.findFirst({
			where: (a, { eq }) => eq(a.id, atomId),
			columns: { id: true, label: true }
		}),
		getTaskForAtom(atomId)
	]);

	if (!task) throw error(500, 'Keine Aufgabe verfügbar');

	const baseInputData = task.inputData ?? null;
	const inputData = task.answerType === 'fraction' && task.correctAnswer.includes('/')
		? { ...baseInputData, numDigits: task.correctAnswer.split('/')[0].length }
		: baseInputData;

	return json({
		atomId,
		atomLabel: atom?.label ?? atomId,
		taskId: task.id,
		prompt: task.prompt,
		answerType: task.answerType,
		choices: task.choices ?? null,
		svg: task.svg ?? null,
		inputData,
		hint: task.hint ?? null,
		state,
		maxAtoms: MAX_PLACEMENT_ATOMS
	});
};
