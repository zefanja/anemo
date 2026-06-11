import { redirect, error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { students, classes } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { generateCode, hashCode } from '$lib/server/auth/codes.js';
import { randomUUID } from 'node:crypto';
import type { Actions, PageServerLoad } from './$types';

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

	// Load gamification + mastery counts for all students in parallel
	const [gamiStates, masteredStatuses, allAtoms] = await Promise.all([
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
		})
	]);

	const gamiMap = new Map(gamiStates.map((g) => [g.studentId, g]));

	// Per-student mastered set
	const masteredByStudent = new Map<string, Set<string>>();
	for (const m of masteredStatuses) {
		if (!masteredByStudent.has(m.studentId)) masteredByStudent.set(m.studentId, new Set());
		masteredByStudent.get(m.studentId)!.add(m.atomId);
	}

	// Domains for heatmap columns
	const domains = [...new Set(allAtoms.map((a) => a.domain))];
	const atomsByDomain = new Map<string, string[]>();
	for (const a of allAtoms) {
		if (!atomsByDomain.has(a.domain)) atomsByDomain.set(a.domain, []);
		atomsByDomain.get(a.domain)!.push(a.id);
	}

	return {
		class: { id: cls.id, name: cls.name },
		totalAtoms: allAtoms.length,
		domains,
		students: studentList.map((s) => {
			const mastered = masteredByStudent.get(s.id) ?? new Set();
			const gami = gamiMap.get(s.id);
			// Per-domain mastery percentage
			const domainPct = domains.map((d) => {
				const ids = atomsByDomain.get(d) ?? [];
				if (ids.length === 0) return 0;
				const done = ids.filter((id) => mastered.has(id)).length;
				return Math.round((done / ids.length) * 100);
			});
			return {
				id: s.id,
				displayName: s.displayName,
				lastActiveAt: s.lastActiveAt,
				xp: gami?.xp ?? 0,
				level: gami?.level ?? 1,
				streakDays: gami?.streakDays ?? 0,
				masteredCount: mastered.size,
				domainPct
			};
		})
	};
};

export const actions: Actions = {
	createStudent: async ({ request, locals, params }) => {
		if (!locals.session || locals.session.type !== 'teacher') return fail(401);

		// Verify class ownership
		const session = locals.session as { type: 'teacher'; teacherId: string; teacherEmail: string };
		const cls = await db.query.classes.findFirst({
			where: (c, { and, eq }) => and(eq(c.id, params.classId), eq(c.teacherId, session.teacherId))
		});
		if (!cls) return fail(404);

		const fd = await request.formData();
		const name = fd.get('name')?.toString().trim();
		if (!name || name.length < 2)
			return fail(400, { createError: 'Name muss mindestens 2 Zeichen haben.' });

		const code = generateCode();
		const codeHash = await hashCode(code);

		await db.insert(students).values({
			id: randomUUID(),
			classId: params.classId,
			displayName: name,
			codeHash
		});

		return { action: 'student_created', code, studentName: name };
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

		return { action: 'code_reset', code, studentName: student.displayName };
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

		return { action: 'student_deleted', studentName: student.displayName };
	},

	updateSettings: async ({ request, locals, params }) => {
		if (!locals.session || locals.session.type !== 'teacher') return fail(401);

		const fd = await request.formData();
		const maxReview = parseInt(fd.get('sessionMaxReview')?.toString() ?? '');
		const maxTotal = parseInt(fd.get('sessionMaxTotal')?.toString() ?? '');

		await db
			.update(classes)
			.set({
				sessionMaxReview: isNaN(maxReview) ? null : maxReview,
				sessionMaxTotal: isNaN(maxTotal) ? null : maxTotal
			})
			.where(eq(classes.id, params.classId));

		return { action: 'settings_saved' };
	}
};
