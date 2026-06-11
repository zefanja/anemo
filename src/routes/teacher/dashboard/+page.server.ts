import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session || locals.session.type !== 'teacher') {
		throw redirect(303, '/teacher/login');
	}
	const { teacherId } = locals.session;

	const [classes, recentAttempts] = await Promise.all([
		db.query.classes.findMany({
			where: (c, { eq }) => eq(c.teacherId, teacherId),
			with: { students: { columns: { id: true } } }
		}),
		db.query.attempts.findMany({
			orderBy: (a, { desc }) => [desc(a.answeredAt)],
			limit: 15,
			with: {
				student: { columns: { displayName: true, classId: true } },
				atom: { columns: { label: true } }
			}
		})
	]);

	const studentIds = classes.flatMap((c) => c.students.map((s) => s.id));

	const [masteredCount, totalAtomCount] = await Promise.all([
		studentIds.length > 0
			? db.query.studentAtomStatus.findMany({
					where: (s, { and, inArray, eq }) =>
						and(inArray(s.studentId, studentIds), eq(s.isMastered, true)),
					columns: { studentId: true }
				})
			: Promise.resolve([]),
		db.query.atoms.findMany({
			where: (a, { eq }) => eq(a.level, 'atom'),
			columns: { id: true }
		})
	]);

	return {
		stats: {
			classCount: classes.length,
			studentCount: studentIds.length,
			masteredCount: masteredCount.length,
			totalAtoms: totalAtomCount.length
		},
		classes: classes.map((c) => ({ id: c.id, name: c.name, studentCount: c.students.length })),
		recentAttempts: recentAttempts.map((a) => ({
			id: a.id,
			studentName: a.student?.displayName ?? '?',
			atomLabel: a.atom?.label ?? a.atomId,
			isCorrect: a.isCorrect,
			answeredAt: a.answeredAt
		}))
	};
};
