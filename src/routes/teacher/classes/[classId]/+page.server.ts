import { redirect, error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { students, classes } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { generateCode, hashCode } from '$lib/server/auth/codes.js';
import { randomUUID } from 'node:crypto';
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

	const masteredByStudent = new Map<string, Set<string>>();
	for (const m of masteredStatuses) {
		if (!masteredByStudent.has(m.studentId)) masteredByStudent.set(m.studentId, new Set());
		masteredByStudent.get(m.studentId)!.add(m.atomId);
	}

	const domains = [...new Set(allAtoms.map((a) => a.domain))];
	const atomsByDomain = new Map<string, string[]>();
	for (const a of allAtoms) {
		if (!atomsByDomain.has(a.domain)) atomsByDomain.set(a.domain, []);
		atomsByDomain.get(a.domain)!.push(a.id);
	}

	return {
		class: { id: cls.id, name: cls.name, enabledDomains: cls.enabledDomains ?? null },
		totalAtoms: allAtoms.length,
		domains,
		students: studentList.map((s) => {
			const mastered = masteredByStudent.get(s.id) ?? new Set();
			const gami = gamiMap.get(s.id);
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
