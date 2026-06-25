import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.session || locals.session.type !== 'teacher') {
		throw error(401, 'Nicht angemeldet');
	}
	const { teacherId } = locals.session;

	const studentId = url.searchParams.get('studentId');
	const atomId = url.searchParams.get('atomId');
	if (!studentId || !atomId) throw error(400, 'Fehlende Parameter');

	// Verify student belongs to a class owned by this teacher
	const student = await db.query.students.findFirst({
		where: (s, { eq }) => eq(s.id, studentId),
		with: { class: { columns: { teacherId: true } } }
	});
	if (!student || student.class.teacherId !== teacherId) {
		throw error(403, 'Kein Zugriff');
	}

	const attempts = await db.query.attempts.findMany({
		where: (a, { and, eq }) => and(eq(a.studentId, studentId), eq(a.atomId, atomId)),
		orderBy: (a, { desc }) => [desc(a.answeredAt)],
		limit: 100,
		with: {
			task: { columns: { prompt: true, correctAnswer: true } }
		}
	});

	return json({
		attempts: attempts.map((a) => ({
			id: a.id,
			isCorrect: a.isCorrect,
			answeredAt: a.answeredAt,
			taskPrompt: a.task?.prompt ?? null,
			correctAnswer: a.task?.correctAnswer ?? null
		}))
	});
};
