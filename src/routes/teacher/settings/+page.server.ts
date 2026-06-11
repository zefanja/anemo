import { redirect, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { teachers } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { verifyPassword, hashPassword } from '$lib/server/auth/passwords.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session || locals.session.type !== 'teacher') {
		throw redirect(303, '/teacher/login');
	}
	const { teacherEmail } = locals.session;
	return { teacherEmail };
};

export const actions: Actions = {
	changePassword: async ({ request, locals }) => {
		if (!locals.session || locals.session.type !== 'teacher') return fail(401);
		const { teacherId } = locals.session;

		const fd = await request.formData();
		const current = fd.get('current')?.toString();
		const newPw = fd.get('new')?.toString();
		const confirm = fd.get('confirm')?.toString();

		if (!current || !newPw || !confirm)
			return fail(400, { pwError: 'Alle Felder sind erforderlich.' });
		if (newPw.length < 8)
			return fail(400, { pwError: 'Neues Passwort muss mindestens 8 Zeichen haben.' });
		if (newPw !== confirm)
			return fail(400, { pwError: 'Passwörter stimmen nicht überein.' });

		const teacher = await db.query.teachers.findFirst({
			where: (t, { eq }) => eq(t.id, teacherId)
		});
		if (!teacher) return fail(404);

		const valid = await verifyPassword(current, teacher.passwordHash);
		if (!valid) return fail(400, { pwError: 'Aktuelles Passwort ist falsch.' });

		const newHash = await hashPassword(newPw);
		await db.update(teachers).set({ passwordHash: newHash }).where(eq(teachers.id, teacherId));

		return { pwSuccess: true };
	}
};
