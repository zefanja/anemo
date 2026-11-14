import { json, error } from '@sveltejs/kit';
import { getTaskForCluster } from '$lib/server/tasks/index.js';
import { getClusterSubAtomIds } from '$lib/server/learning/frontier.js';
import { db } from '$lib/server/db/index.js';
import type { RequestHandler } from './$types';

// Discrimination practice: resolves to one random already-mastered sub-atom
// of the cluster and returns a task for it, same shape as /api/task/[atomId].
// The returned atomId is the real sub-atom, so /api/attempt needs no changes.
export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.session || locals.session.type !== 'student') {
		throw error(401, 'Nicht angemeldet');
	}

	const cluster = await db.query.atoms.findFirst({
		where: (a, { eq }) => eq(a.id, params.clusterId),
		columns: { id: true, level: true }
	});
	if (!cluster || cluster.level !== 'cluster') throw error(404, 'Cluster nicht gefunden');

	const subAtomIds = await getClusterSubAtomIds(params.clusterId);
	const excludePrompts = url.searchParams.getAll('ex');
	const task = await getTaskForCluster(locals.session.studentId, subAtomIds, excludePrompts);
	if (!task) throw error(404, 'Keine Aufgabe verfügbar');

	const atom = await db.query.atoms.findFirst({
		where: (a, { eq }) => eq(a.id, task.atomId),
		columns: { explanation: true, illustrationConfig: true }
	});

	const baseInputData = task.inputData ?? null;
	const inputData = task.answerType === 'fraction' && task.correctAnswer.includes('/')
		? { ...baseInputData, numDigits: task.correctAnswer.split('/')[0].length }
		: baseInputData;

	// Never expose the correct answer to the client
	return json({
		taskId: task.id,
		// identity of the displayed task; the client sends recent keys back as `ex` to avoid repeats
		key: task.key,
		atomId: task.atomId,
		prompt: task.prompt,
		answerType: task.answerType,
		choices: task.choices ?? null,
		svg: task.svg ?? null,
		inputData,
		hint: task.hint ?? null,
		difficulty: task.difficulty ?? null,
		explanation: atom?.explanation ?? null,
		illustrationConfig: atom?.illustrationConfig ?? null
	});
};
