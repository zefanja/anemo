import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session || locals.session.type !== 'teacher') {
		throw redirect(303, '/teacher/login');
	}
	const { teacherId } = locals.session;

	const [classes, rawAttempts] = await Promise.all([
		db.query.classes.findMany({
			where: (c, { eq }) => eq(c.teacherId, teacherId),
			with: { students: { columns: { id: true, displayName: true } } }
		}),
		db.query.attempts.findMany({
			orderBy: (a, { desc }) => [desc(a.answeredAt)],
			limit: 1000,
			with: {
				student: { columns: { id: true, displayName: true, classId: true } },
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
					columns: { atomId: true, studentId: true, mastery: true, isMastered: true, totalAttempts: true },
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

	// Build student info lookup
	const studentInfoMap = new Map<string, { displayName: string; classId: string; className: string }>();
	for (const c of classes) {
		for (const s of c.students) {
			studentInfoMap.set(s.id, { displayName: s.displayName, classId: c.id, className: c.name });
		}
	}

	type AtomStudentDetail = {
		studentId: string;
		displayName: string;
		classId: string;
		className: string;
		mastery: number;
		isMastered: boolean;
	};
	type AtomEntry = {
		label: string;
		domain: string;
		studentCount: number;
		masteredCount: number;
		masterySum: number;
		students: AtomStudentDetail[];
	};

	const allAtomStatsMap = new Map<string, AtomEntry>();
	const classAtomStatsMap = new Map<string, Map<string, AtomEntry>>();

	for (const s of atomStatuses) {
		if (s.totalAttempts === 0) continue;
		const info = studentInfoMap.get(s.studentId);
		if (!info) continue;

		const detail: AtomStudentDetail = {
			studentId: s.studentId,
			displayName: info.displayName,
			classId: info.classId,
			className: info.className,
			mastery: s.mastery,
			isMastered: s.isMastered
		};

		if (!allAtomStatsMap.has(s.atomId)) {
			allAtomStatsMap.set(s.atomId, {
				label: s.atom?.label ?? s.atomId,
				domain: s.atom?.domain ?? '',
				studentCount: 0,
				masteredCount: 0,
				masterySum: 0,
				students: []
			});
		}
		const allEntry = allAtomStatsMap.get(s.atomId)!;
		allEntry.studentCount++;
		if (s.isMastered) allEntry.masteredCount++;
		allEntry.masterySum += s.mastery;
		allEntry.students.push(detail);

		if (!classAtomStatsMap.has(info.classId)) classAtomStatsMap.set(info.classId, new Map());
		const classMap = classAtomStatsMap.get(info.classId)!;
		if (!classMap.has(s.atomId)) {
			classMap.set(s.atomId, {
				label: s.atom?.label ?? s.atomId,
				domain: s.atom?.domain ?? '',
				studentCount: 0,
				masteredCount: 0,
				masterySum: 0,
				students: []
			});
		}
		const classEntry = classMap.get(s.atomId)!;
		classEntry.studentCount++;
		if (s.isMastered) classEntry.masteredCount++;
		classEntry.masterySum += s.mastery;
		classEntry.students.push(detail);
	}

	function buildAtomStats(map: Map<string, AtomEntry>) {
		return Array.from(map.entries())
			.map(([atomId, v]) => ({
				atomId,
				label: v.label,
				domain: v.domain,
				studentCount: v.studentCount,
				masteredCount: v.masteredCount,
				masteryRate: v.studentCount > 0 ? v.masteredCount / v.studentCount : 0,
				avgMastery: v.studentCount > 0 ? v.masterySum / v.studentCount : 0,
				students: v.students.sort((a, b) => a.mastery - b.mastery)
			}))
			.sort((a, b) => b.masteryRate - a.masteryRate);
	}

	const atomStats = buildAtomStats(allAtomStatsMap);
	const classAtomStats = classes.map((c) => ({
		classId: c.id,
		className: c.name,
		atomStats: buildAtomStats(classAtomStatsMap.get(c.id) ?? new Map())
	}));

	// Group recent attempts by student, keeping order by last activity
	const activityMap = new Map<
		string,
		{
			studentId: string;
			studentName: string;
			classId: string;
			total: number;
			correct: number;
			lastAtomLabel: string;
			lastAnsweredAt: Date | string;
		}
	>();
	for (const a of rawAttempts) {
		const sid = a.student?.id ?? a.studentId;
		if (!activityMap.has(sid)) {
			activityMap.set(sid, {
				studentId: sid,
				studentName: a.student?.displayName ?? '?',
				classId: a.student?.classId ?? '',
				total: 0,
				correct: 0,
				lastAtomLabel: a.atom?.label ?? a.atomId,
				lastAnsweredAt: a.answeredAt
			});
		}
		const entry = activityMap.get(sid)!;
		entry.total++;
		if (a.isCorrect) entry.correct++;
	}
	const recentActivity = Array.from(activityMap.values()).slice(0, 15);

	return {
		stats: {
			classCount: classes.length,
			studentCount: studentIds.length,
			masteredCount: masteredStatuses.length,
			totalAtoms: totalAtomCount.length
		},
		classes: classes.map((c) => ({ id: c.id, name: c.name, studentCount: c.students.length })),
		recentActivity,
		leaderboard,
		atomStats,
		classAtomStats
	};
};
