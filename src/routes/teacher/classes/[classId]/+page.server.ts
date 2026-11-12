import { redirect, error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { students, classes } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { generateCode, hashCode } from '$lib/server/auth/codes.js';
import { randomUUID } from 'node:crypto';
import { getClassActivitySummary } from '$lib/server/analytics/activity.js';
import type { Actions, PageServerLoad } from './$types';

const ADJECTIVES = [
	'Starker', 'Mutiger', 'Schneller', 'Kluger', 'Tapferer',
	'Flinker', 'Wilder', 'Frecher', 'Lustiger', 'Fleißiger',
	'Bunter', 'Cooler', 'Fixer', 'Scharfer', 'Fröhlicher'
];
const ANIMALS = [
	'Tiger', 'Falke', 'Adler', 'Wolf', 'Bär',
	'Fuchs', 'Dachs', 'Igel', 'Löwe', 'Gepard',
	'Panda', 'Koala', 'Delphin', 'Pinguin', 'Elefant',
	'Eule', 'Luchs', 'Storch', 'Hamster', 'Biber'
];

function generateAnimalName(existing: Set<string>): string {
	const adjs = [...ADJECTIVES].sort(() => Math.random() - 0.5);
	const anis = [...ANIMALS].sort(() => Math.random() - 0.5);
	for (const adj of adjs) {
		for (const ani of anis) {
			const name = `${adj}${ani}`;
			if (!existing.has(name)) return name;
		}
	}
	return `Tier${Date.now()}`;
}

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.session || locals.session.type !== 'teacher') {
		throw redirect(303, '/teacher/login');
	}
	const { teacherId } = locals.session;

	const cls = await db.query.classes.findFirst({
		where: (c, { and, eq }) => and(eq(c.id, params.classId), eq(c.teacherId, teacherId))
	});
	if (!cls) throw error(404, 'Klasse nicht gefunden');

	const studentList = await db.query.students.findMany({
		where: (s, { eq }) => eq(s.classId, params.classId),
		orderBy: (s, { asc }) => [asc(s.displayName)]
	});

	const studentIds = studentList.map((s) => s.id);

	const [gamiStates, masteredStatuses, allAtoms, allAtomStatuses, rawAttempts, activitySummary] = await Promise.all([
		studentIds.length > 0
			? db.query.gamificationState.findMany({
					where: (g, { inArray }) => inArray(g.studentId, studentIds)
				})
			: Promise.resolve([]),
		studentIds.length > 0
			? db.query.studentAtomStatus.findMany({
					where: (s, { and, inArray, eq }) =>
						and(inArray(s.studentId, studentIds), eq(s.isMastered, true)),
					columns: { studentId: true, atomId: true }
				})
			: Promise.resolve([]),
		db.query.atoms.findMany({
			where: (a, { eq }) => eq(a.level, 'atom'),
			columns: { id: true, domain: true },
			orderBy: (a, { asc }) => [asc(a.domain)]
		}),
		studentIds.length > 0
			? db.query.studentAtomStatus.findMany({
					where: (s, { inArray }) => inArray(s.studentId, studentIds),
					columns: { atomId: true, studentId: true, mastery: true, isMastered: true, totalAttempts: true },
					with: { atom: { columns: { label: true, domain: true } } }
				})
			: Promise.resolve([]),
		studentIds.length > 0
			? db.query.attempts.findMany({
					where: (a, { inArray }) => inArray(a.studentId, studentIds),
					orderBy: (a, { desc }) => [desc(a.answeredAt)],
					limit: 500,
					with: {
						student: { columns: { id: true, displayName: true } },
						atom: { columns: { label: true } }
					}
				})
			: Promise.resolve([]),
		getClassActivitySummary(studentIds)
	]);

	const enabledAtoms = cls.enabledDomains
		? allAtoms.filter((a) => cls.enabledDomains!.includes(a.domain))
		: allAtoms;
	const enabledAtomIds = new Set(enabledAtoms.map((a) => a.id));

	const gamiMap = new Map(gamiStates.map((g) => [g.studentId, g]));

	const masteredByStudent = new Map<string, Set<string>>();
	for (const m of masteredStatuses) {
		if (!enabledAtomIds.has(m.atomId)) continue;
		if (!masteredByStudent.has(m.studentId)) masteredByStudent.set(m.studentId, new Set());
		masteredByStudent.get(m.studentId)!.add(m.atomId);
	}

	const domains = [...new Set(enabledAtoms.map((a) => a.domain))];
	const allDomains = [...new Set(allAtoms.map((a) => a.domain))].sort();
	const atomsByDomain = new Map<string, string[]>();
	for (const a of enabledAtoms) {
		if (!atomsByDomain.has(a.domain)) atomsByDomain.set(a.domain, []);
		atomsByDomain.get(a.domain)!.push(a.id);
	}

	// Atom stats with per-student detail
	const studentNameMap = new Map(studentList.map((s) => [s.id, s.displayName]));

	type AtomStudentDetail = { studentId: string; displayName: string; mastery: number; isMastered: boolean };
	type AtomEntry = { label: string; domain: string; studentCount: number; masteredCount: number; masterySum: number; students: AtomStudentDetail[] };
	const atomStatsMap = new Map<string, AtomEntry>();

	for (const s of allAtomStatuses) {
		if (s.totalAttempts === 0) continue;
		const displayName = studentNameMap.get(s.studentId);
		if (!displayName) continue;
		if (!atomStatsMap.has(s.atomId)) {
			atomStatsMap.set(s.atomId, { label: s.atom?.label ?? s.atomId, domain: s.atom?.domain ?? '', studentCount: 0, masteredCount: 0, masterySum: 0, students: [] });
		}
		const entry = atomStatsMap.get(s.atomId)!;
		entry.studentCount++;
		if (s.isMastered) entry.masteredCount++;
		entry.masterySum += s.mastery;
		entry.students.push({ studentId: s.studentId, displayName, mastery: s.mastery, isMastered: s.isMastered });
	}

	const atomStats = Array.from(atomStatsMap.entries())
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

	// Recent activity per student
	const activityMap = new Map<string, { studentId: string; displayName: string; total: number; correct: number; lastAtomLabel: string; lastAnsweredAt: Date | string }>();
	for (const a of rawAttempts) {
		const sid = a.studentId;
		if (!activityMap.has(sid)) {
			activityMap.set(sid, {
				studentId: sid,
				displayName: a.student?.displayName ?? studentNameMap.get(sid) ?? '?',
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
		class: {
			id: cls.id,
			name: cls.name,
			enabledDomains: cls.enabledDomains ?? null,
			showLeaderboard: cls.showLeaderboard,
			sessionMaxReview: cls.sessionMaxReview,
			sessionMaxTotal: cls.sessionMaxTotal,
			reviewUnlockDaily: cls.reviewUnlockDaily,
			reviewUnlockPercent: cls.reviewUnlockPercent
		},
		totalAtoms: enabledAtoms.length,
		domains,
		allDomains,
		atomStats,
		recentActivity,
		students: studentList.map((s) => {
			const mastered = masteredByStudent.get(s.id) ?? new Set();
			const gami = gamiMap.get(s.id);
			const domainPct = domains.map((d) => {
				const ids = atomsByDomain.get(d) ?? [];
				if (ids.length === 0) return 0;
				const done = ids.filter((id) => mastered.has(id)).length;
				return Math.round((done / ids.length) * 100);
			});
			const activity = activitySummary.get(s.id);
			return {
				id: s.id,
				displayName: s.displayName,
				lastActiveAt: s.lastActiveAt,
				xp: gami?.xp ?? 0,
				level: gami?.level ?? 1,
				streakDays: gami?.streakDays ?? 0,
				masteredCount: mastered.size,
				domainPct,
				todayMinutes: activity?.todayMinutes ?? 0,
				todayTasks: activity?.todayTasks ?? 0,
				weekMinutes: activity?.weekMinutes ?? 0,
				weekTasks: activity?.weekTasks ?? 0
			};
		})
	};
};

export const actions: Actions = {
	createStudent: async ({ request, locals, params }) => {
		if (!locals.session || locals.session.type !== 'teacher') return fail(401);

		const session = locals.session as { type: 'teacher'; teacherId: string; teacherEmail: string };
		const cls = await db.query.classes.findFirst({
			where: (c, { and, eq }) => and(eq(c.id, params.classId), eq(c.teacherId, session.teacherId))
		});
		if (!cls) return fail(404);

		const fd = await request.formData();
		const name = fd.get('name')?.toString().trim();
		if (!name || name.length < 2)
			return fail(400, { action: 'create_error' as const, createError: 'Name muss mindestens 2 Zeichen haben.' });

		const code = generateCode();
		const codeHash = await hashCode(code);

		await db.insert(students).values({
			id: randomUUID(),
			classId: params.classId,
			displayName: name,
			codeHash
		});

		return { action: 'student_created' as const, code, studentName: name };
	},

	bulkCreate: async ({ request, locals, params }) => {
		if (!locals.session || locals.session.type !== 'teacher') return fail(401);
		const session = locals.session as { type: 'teacher'; teacherId: string };

		const cls = await db.query.classes.findFirst({
			where: (c, { and, eq }) => and(eq(c.id, params.classId), eq(c.teacherId, session.teacherId))
		});
		if (!cls) return fail(404);

		const fd = await request.formData();
		const count = parseInt(fd.get('count')?.toString() ?? '');
		if (isNaN(count) || count < 1 || count > 40)
			return fail(400, { action: 'bulk_error' as const, bulkError: 'Anzahl muss zwischen 1 und 40 liegen.' });

		const existing = await db.query.students.findMany({
			where: (s, { eq }) => eq(s.classId, params.classId),
			columns: { displayName: true }
		});
		const existingNames = new Set(existing.map((s) => s.displayName));

		const created: { name: string; code: string }[] = [];
		for (let i = 0; i < count; i++) {
			const name = generateAnimalName(existingNames);
			existingNames.add(name);
			const code = generateCode();
			const codeHash = await hashCode(code);
			await db.insert(students).values({
				id: randomUUID(),
				classId: params.classId,
				displayName: name,
				codeHash
			});
			created.push({ name, code });
		}

		return { action: 'bulk_created' as const, created };
	},

	resetAllCodes: async ({ locals, params }) => {
		if (!locals.session || locals.session.type !== 'teacher') return fail(401);
		const session = locals.session as { type: 'teacher'; teacherId: string };

		const cls = await db.query.classes.findFirst({
			where: (c, { and, eq }) => and(eq(c.id, params.classId), eq(c.teacherId, session.teacherId))
		});
		if (!cls) return fail(404);

		const studentList = await db.query.students.findMany({
			where: (s, { eq }) => eq(s.classId, params.classId),
			columns: { id: true, displayName: true },
			orderBy: (s, { asc }) => [asc(s.displayName)]
		});

		const reset: { name: string; code: string }[] = [];
		for (const s of studentList) {
			const code = generateCode();
			const codeHash = await hashCode(code);
			await db.update(students).set({ codeHash }).where(eq(students.id, s.id));
			reset.push({ name: s.displayName, code });
		}

		return { action: 'all_codes_reset' as const, reset };
	},

	renameStudent: async ({ request, locals, params }) => {
		if (!locals.session || locals.session.type !== 'teacher') return fail(401);

		const fd = await request.formData();
		const studentId = fd.get('studentId')?.toString();
		const name = fd.get('name')?.toString().trim();
		if (!studentId || !name || name.length < 2)
			return fail(400, { action: 'rename_error' as const, renameError: 'Name muss mindestens 2 Zeichen haben.' });

		const student = await db.query.students.findFirst({
			where: (s, { and, eq }) => and(eq(s.id, studentId), eq(s.classId, params.classId))
		});
		if (!student) return fail(404);

		await db.update(students).set({ displayName: name }).where(eq(students.id, studentId));
		return { action: 'student_renamed' as const };
	},

	resetCode: async ({ request, locals, params }) => {
		if (!locals.session || locals.session.type !== 'teacher') return fail(401);

		const fd = await request.formData();
		const studentId = fd.get('studentId')?.toString();
		if (!studentId) return fail(400);

		const student = await db.query.students.findFirst({
			where: (s, { and, eq }) => and(eq(s.id, studentId), eq(s.classId, params.classId))
		});
		if (!student) return fail(404);

		const code = generateCode();
		const codeHash = await hashCode(code);
		await db.update(students).set({ codeHash }).where(eq(students.id, studentId));

		return { action: 'code_reset' as const, code, studentName: student.displayName };
	},

	deleteStudent: async ({ request, locals, params }) => {
		if (!locals.session || locals.session.type !== 'teacher') return fail(401);

		const fd = await request.formData();
		const studentId = fd.get('studentId')?.toString();
		if (!studentId) return fail(400);

		const student = await db.query.students.findFirst({
			where: (s, { and, eq }) => and(eq(s.id, studentId), eq(s.classId, params.classId))
		});
		if (!student) return fail(404);

		await db.delete(students).where(eq(students.id, studentId));

		return { action: 'student_deleted' as const, studentName: student.displayName };
	},

	renameClass: async ({ request, locals, params }) => {
		if (!locals.session || locals.session.type !== 'teacher') return fail(401);
		const session = locals.session as { type: 'teacher'; teacherId: string };

		const cls = await db.query.classes.findFirst({
			where: (c, { and, eq }) => and(eq(c.id, params.classId), eq(c.teacherId, session.teacherId))
		});
		if (!cls) return fail(404);

		const fd = await request.formData();
		const name = fd.get('name')?.toString().trim();
		if (!name || name.length < 2)
			return fail(400, { action: 'class_rename_error' as const, classRenameError: 'Name muss mindestens 2 Zeichen haben.' });

		await db.update(classes).set({ name }).where(eq(classes.id, params.classId));
		return { action: 'class_renamed' as const };
	},

	updateSettings: async ({ request, locals, params }) => {
		if (!locals.session || locals.session.type !== 'teacher') return fail(401);
		const session = locals.session as { type: 'teacher'; teacherId: string };

		const cls = await db.query.classes.findFirst({
			where: (c, { and, eq }) => and(eq(c.id, params.classId), eq(c.teacherId, session.teacherId))
		});
		if (!cls) return fail(404);

		const fd = await request.formData();
		// Empty / invalid → null (server default); clamped to the input's range
		const intSetting = (name: string, min: number, max: number) => {
			const n = parseInt(fd.get(name)?.toString() ?? '');
			return isNaN(n) ? null : Math.min(max, Math.max(min, n));
		};
		const showLeaderboard = fd.get('showLeaderboard') === 'true';

		await db
			.update(classes)
			.set({
				sessionMaxReview: intSetting('sessionMaxReview', 1, 50),
				sessionMaxTotal: intSetting('sessionMaxTotal', 1, 100),
				reviewUnlockDaily: intSetting('reviewUnlockDaily', 0, 500),
				reviewUnlockPercent: intSetting('reviewUnlockPercent', 0, 100),
				showLeaderboard
			})
			.where(eq(classes.id, params.classId));

		return { action: 'settings_saved' as const };
	},

	updateDomains: async ({ request, locals, params }) => {
		if (!locals.session || locals.session.type !== 'teacher') return fail(401);
		const session = locals.session as { type: 'teacher'; teacherId: string };

		const cls = await db.query.classes.findFirst({
			where: (c, { and, eq }) => and(eq(c.id, params.classId), eq(c.teacherId, session.teacherId))
		});
		if (!cls) return fail(404);

		const fd = await request.formData();
		const enabled = fd.getAll('domain').map((v) => v.toString());

		// null means "all domains enabled"
		await db
			.update(classes)
			.set({ enabledDomains: enabled.length === 0 ? null : enabled })
			.where(eq(classes.id, params.classId));

		return { action: 'domains_saved' as const };
	}
};
