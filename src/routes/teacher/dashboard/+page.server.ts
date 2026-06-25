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

	const [masteredStatuses, totalAtomCount, gamiStates, atomStatuses] = await Promise.all([
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
			: Promise.resolve([]),
		studentIds.length > 0
			? db.query.studentAtomStatus.findMany({
					where: (s, { inArray }) => inArray(s.studentId, studentIds),
					columns: { atomId: true, mastery: true, isMastered: true, totalAttempts: true },
					with: { atom: { columns: { label: true, domain: true } } }
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

	// Atom stats: group by atom, only include atoms practiced by at least 1 student
	const atomStatsMap = new Map<
		string,
		{ label: string; domain: string; studentCount: number; masteredCount: number; masterySum: number }
	>();
	for (const s of atomStatuses) {
		if (s.totalAttempts === 0) continue;
		if (!atomStatsMap.has(s.atomId)) {
			atomStatsMap.set(s.atomId, {
				label: s.atom?.label ?? s.atomId,
				domain: s.atom?.domain ?? '',
				studentCount: 0,
				masteredCount: 0,
				masterySum: 0
			});
		}
		const entry = atomStatsMap.get(s.atomId)!;
		entry.studentCount++;
		if (s.isMastered) entry.masteredCount++;
		entry.masterySum += s.mastery;
	}

	const atomStats = Array.from(atomStatsMap.entries())
		.map(([atomId, v]) => ({
			atomId,
			label: v.label,
			domain: v.domain,
			studentCount: v.studentCount,
			masteredCount: v.masteredCount,
			masteryRate: v.studentCount > 0 ? v.masteredCount / v.studentCount : 0,
			avgMastery: v.studentCount > 0 ? v.masterySum / v.studentCount : 0
		}))
		.sort((a, b) => b.masteryRate - a.masteryRate);

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
		leaderboard,
		atomStats
	};
};
