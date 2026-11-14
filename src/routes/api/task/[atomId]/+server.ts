import { json, error } from '@sveltejs/kit';
import { getTaskForAtom } from '$lib/server/tasks/index.js';
import { stageForTask, type FsrsState } from '$lib/server/learning/fsrs.js';
import { db } from '$lib/server/db/index.js';
import { studentAtomStatus } from '$lib/server/db/schema.js';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.session || locals.session.type !== 'student') {
		throw error(401, 'Nicht angemeldet');
	}

	const atom = await db.query.atoms.findFirst({
		where: (a, { eq }) => eq(a.id, params.atomId),
		columns: { id: true, level: true, explanation: true, illustrationConfig: true }
	});

	if (!atom) throw error(404, 'Atom nicht gefunden');
	if (atom.level === 'cluster') throw error(400, 'Cluster werden nicht direkt geübt');

	const statusRow = await db.query.studentAtomStatus.findFirst({
		where: and(
			eq(studentAtomStatus.studentId, locals.session.studentId),
			eq(studentAtomStatus.atomId, params.atomId)
		),
		columns: { stage: true, isMastered: true, fsrsState: true }
	});
	// Learning: DI expanding sequence. Mastered: harder variants once the memory is stable.
	const stage = stageForTask(
		statusRow?.stage ?? 0,
		statusRow?.isMastered ?? false,
		statusRow?.fsrsState as FsrsState | null
	);

	const excludePrompts = url.searchParams.getAll('ex');
	const task = await getTaskForAtom(params.atomId, excludePrompts, stage);
	if (!task) throw error(404, 'Keine Aufgabe verfügbar');

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
		explanation: atom.explanation ?? null,
		illustrationConfig: atom.illustrationConfig ?? null
	});
};
