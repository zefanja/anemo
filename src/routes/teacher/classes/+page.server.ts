import { redirect, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { classes } from '$lib/server/db/schema.js';
import { randomUUID } from 'node:crypto';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session || locals.session.type !== 'teacher') {
		throw redirect(303, '/teacher/login');
	}
	const { teacherId } = locals.session;

	const schoolData = await db.query.school.findFirst({ columns: { id: true } });

	const classList = await db.query.classes.findMany({
		where: (c, { eq }) => eq(c.teacherId, teacherId),
		orderBy: (c, { asc }) => [asc(c.name)],
		with: { students: { columns: { id: true } } }
	});

	return {
		schoolId: schoolData?.id ?? null,
		classes: classList.map((c) => ({
			id: c.id,
			name: c.name,
			studentCount: c.students.length,
			createdAt: c.createdAt
		}))
	};
};

export const actions: Actions = {
	createClass: async ({ request, locals }) => {
		if (!locals.session || locals.session.type !== 'teacher') return fail(401);
		const { teacherId } = locals.session;

		const schoolData = await db.query.school.findFirst({ columns: { id: true } });
		if (!schoolData) return fail(500, { error: 'Schule nicht konfiguriert.' });

		const fd = await request.formData();
		const name = fd.get('name')?.toString().trim();
		if (!name || name.length < 2) return fail(400, { error: 'Name muss mindestens 2 Zeichen haben.' });

		await db.insert(classes).values({
			id: randomUUID(),
			schoolId: schoolData.id,
			teacherId,
			name
		});

		return { success: true, created: name };
	},

	deleteClass: async ({ request, locals }) => {
		if (!locals.session || locals.session.type !== 'teacher') return fail(401);
		const { teacherId } = locals.session;

		const fd = await request.formData();
		const classId = fd.get('classId')?.toString();
		if (!classId) return fail(400);

		const cls = await db.query.classes.findFirst({
			where: (c, { and, eq }) => and(eq(c.id, classId), eq(c.teacherId, teacherId)),
			with: { students: { columns: { id: true } } }
		});
		if (!cls) return fail(404);
		if (cls.students.length > 0)
			return fail(400, { error: 'Klasse hat noch Schüler. Bitte zuerst alle Schüler entfernen.' });

		const { eq } = await import('drizzle-orm');
		await db.delete(classes).where(eq(classes.id, classId));

		return { success: true, deleted: cls.name };
	}
};
