import { json, error } from '@sveltejs/kit';
import { getTaskForAtom } from '$lib/server/tasks/index.js';
import { db } from '$lib/server/db/index.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.session || locals.session.type !== 'student') {
		throw error(401, 'Nicht angemeldet');
	}

	const atom = await db.query.atoms.findFirst({
		where: (a, { eq }) => eq(a.id, params.atomId),
		columns: { id: true, level: true, explanation: true }
	});

	if (!atom) throw error(404, 'Atom nicht gefunden');
	if (atom.level === 'cluster') throw error(400, 'Cluster werden nicht direkt geübt');

	const excludePrompts = url.searchParams.getAll('ex');
	const task = await getTaskForAtom(params.atomId, excludePrompts);
	if (!task) throw error(404, 'Keine Aufgabe verfügbar');

	// Never expose the correct answer to the client
	return json({
		taskId: task.id,
		atomId: task.atomId,
		prompt: task.prompt,
		answerType: task.answerType,
		choices: task.choices ?? null,
		svg: task.svg ?? null,
		inputData: task.inputData ?? null,
		hint: task.hint ?? null,
		difficulty: task.difficulty ?? null,
		explanation: atom.explanation ?? null
	});
};
