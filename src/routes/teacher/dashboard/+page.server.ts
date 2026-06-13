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
			with: { students: { columns: { id: true, displayName: true } } }
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

	const [masteredStatuses, totalAtomCount, gamiStates] = await Promise.all([
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
		}),
		studentIds.length > 0
			? db.query.gamificationState.findMany({
					where: (g, { inArray }) => inArray(g.studentId, studentIds)
				})
			: Promise.resolve([])
	]);

	const masteredByStudent = new Map<string, number>();
	for (const m of masteredStatuses) {
		masteredByStudent.set(m.studentId, (masteredByStudent.get(m.studentId) ?? 0) + 1);
	}

	const gamiMap = new Map(gamiStates.map((g) => [g.studentId, g]));

	const leaderboard = classes
		.flatMap((c) =>
			c.students.map((s) => ({
				id: s.id,
				displayName: s.displayName,
				className: c.name,
				classId: c.id,
				xp: gamiMap.get(s.id)?.xp ?? 0,
				level: gamiMap.get(s.id)?.level ?? 1,
				streakDays: gamiMap.get(s.id)?.streakDays ?? 0,
				masteredCount: masteredByStudent.get(s.id) ?? 0
			}))
		)
		.sort((a, b) => b.xp - a.xp)
		.slice(0, 10);

	return {
		stats: {
			classCount: classes.length,
			studentCount: studentIds.length,
			masteredCount: masteredStatuses.length,
			totalAtoms: totalAtomCount.length
		},
		classes: classes.map((c) => ({ id: c.id, name: c.name, studentCount: c.students.length })),
		recentAttempts: recentAttempts.map((a) => ({
			id: a.id,
			studentName: a.student?.displayName ?? '?',
			atomLabel: a.atom?.label ?? a.atomId,
			isCorrect: a.isCorrect,
			answeredAt: a.answeredAt
		})),
		leaderboard
	};
};
