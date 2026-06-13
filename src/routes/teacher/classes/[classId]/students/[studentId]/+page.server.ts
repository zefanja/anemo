import { redirect, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.session || locals.session.type !== 'teacher') {
		throw redirect(303, '/teacher/login');
	}
	const { teacherId } = locals.session;

	const cls = await db.query.classes.findFirst({
		where: (c, { and, eq }) => and(eq(c.id, params.classId), eq(c.teacherId, teacherId))
	});
	if (!cls) throw error(404, 'Klasse nicht gefunden');

	const student = await db.query.students.findFirst({
		where: (s, { and, eq }) => and(eq(s.id, params.studentId), eq(s.classId, params.classId))
	});
	if (!student) throw error(404, 'Schüler nicht gefunden');

	const [allAtoms, atomStatuses, gami, recentAttempts] = await Promise.all([
		db.query.atoms.findMany({
			where: (a, { eq }) => eq(a.level, 'atom'),
			columns: { id: true, label: true, domain: true, subdomain: true },
			orderBy: (a, { asc }) => [asc(a.domain), asc(a.label)]
		}),
		db.query.studentAtomStatus.findMany({
			where: (s, { eq }) => eq(s.studentId, params.studentId)
		}),
		db.query.gamificationState.findFirst({
			where: (g, { eq }) => eq(g.studentId, params.studentId)
		}),
		db.query.attempts.findMany({
			where: (a, { eq }) => eq(a.studentId, params.studentId),
			orderBy: (a, { desc }) => [desc(a.answeredAt)],
			limit: 50,
			columns: { atomId: true, isCorrect: true, answeredAt: true }
		})
	]);

	const statusByAtom = new Map(atomStatuses.map((s) => [s.atomId, s]));

	const domains = [...new Set(allAtoms.map((a) => a.domain))];

	const atomsByDomain = domains.map((domain) => ({
		domain,
		atoms: allAtoms
			.filter((a) => a.domain === domain)
			.map((a) => {
				const status = statusByAtom.get(a.id);
				return {
					id: a.id,
					label: a.label,
					subdomain: a.subdomain ?? null,
					mastery: status ? Math.round(status.mastery * 100) : 0,
					isMastered: status?.isMastered ?? false,
					totalAttempts: status?.totalAttempts ?? 0,
					correctAttempts: status?.correctAttempts ?? 0,
					lastPracticedAt: status?.lastPracticedAt ?? null,
					masteredAt: status?.masteredAt ?? null
				};
			})
	}));

	const totalAtoms = allAtoms.length;
	const masteredCount = atomStatuses.filter((s) => s.isMastered).length;
	const startedCount = atomStatuses.filter((s) => s.totalAttempts > 0).length;

	// Recent activity: last 7 days per day
	const activityByDay: Record<string, { correct: number; total: number }> = {};
	for (const a of recentAttempts) {
		const day = new Date(a.answeredAt).toISOString().slice(0, 10);
		if (!activityByDay[day]) activityByDay[day] = { correct: 0, total: 0 };
		activityByDay[day].total++;
		if (a.isCorrect) activityByDay[day].correct++;
	}

	return {
		class: { id: cls.id, name: cls.name },
		student: {
			id: student.id,
			displayName: student.displayName,
			lastActiveAt: student.lastActiveAt,
			placementDone: student.placementDone
		},
		gami: {
			xp: gami?.xp ?? 0,
			level: gami?.level ?? 1,
			streakDays: gami?.streakDays ?? 0
		},
		totalAtoms,
		masteredCount,
		startedCount,
		atomsByDomain,
		activityByDay
	};
};
