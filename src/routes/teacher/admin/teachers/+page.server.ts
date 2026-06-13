import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { teachers } from '$lib/server/db/schema.js';
import { hashPassword } from '$lib/server/auth/passwords.js';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Actions, PageServerLoad } from './$types';

function requireAdmin(locals: App.Locals) {
	if (!locals.session || locals.session.type !== 'teacher' || !locals.session.isAdmin) {
		throw redirect(303, '/teacher/dashboard');
	}
	return locals.session;
}

export const load: PageServerLoad = async ({ locals }) => {
	const session = requireAdmin(locals);

	const allTeachers = await db.query.teachers.findMany({
		orderBy: (t, { asc }) => asc(t.createdAt)
	});

	return {
		currentTeacherId: session.teacherId,
		teachers: allTeachers.map((t) => ({
			id: t.id,
			name: t.name,
			email: t.email,
			isAdmin: t.isAdmin,
			createdAt: t.createdAt
		}))
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requireAdmin(locals);

		const fd = await request.formData();
		const name = (fd.get('name') as string ?? '').trim();
		const email = (fd.get('email') as string ?? '').trim().toLowerCase();
		const password = (fd.get('password') as string) ?? '';
		const isAdmin = fd.get('isAdmin') === 'on';

		const errors: Record<string, string> = {};
		if (!name) errors.name = 'Name ist erforderlich.';
		if (!email || !email.includes('@')) errors.email = 'Gültige E-Mail-Adresse erforderlich.';
		if (password.length < 8) errors.password = 'Passwort muss mindestens 8 Zeichen haben.';

		if (Object.keys(errors).length > 0) {
			return fail(400, { createErrors: errors, createName: name, createEmail: email });
		}

		const existing = await db.query.teachers.findFirst({
			where: (t, { eq }) => eq(t.email, email)
		});
		if (existing) {
			return fail(400, { createErrors: { email: 'Diese E-Mail-Adresse ist bereits vergeben.' }, createName: name, createEmail: email });
		}

		// Inherit schoolId from the current admin
		const adminTeacher = await db.query.teachers.findFirst({
			where: (t, { eq }) => eq(t.id, (locals.session as { teacherId: string }).teacherId)
		});

		const passwordHash = await hashPassword(password);
		await db.insert(teachers).values({
			id: randomUUID(),
			schoolId: adminTeacher?.schoolId ?? null,
			email,
			passwordHash,
			name,
			isAdmin
		});

		return { createSuccess: true };
	},

	delete: async ({ request, locals }) => {
		const session = requireAdmin(locals);

		const fd = await request.formData();
		const targetId = fd.get('teacherId') as string;

		if (!targetId || targetId === session.teacherId) {
			return fail(400, { deleteError: 'Eigenes Konto kann nicht gelöscht werden.' });
		}

		await db.delete(teachers).where(eq(teachers.id, targetId));
		return { deleteSuccess: true };
	},

	toggleAdmin: async ({ request, locals }) => {
		const session = requireAdmin(locals);

		const fd = await request.formData();
		const targetId = fd.get('teacherId') as string;

		if (!targetId || targetId === session.teacherId) {
			return fail(400, { toggleError: 'Eigene Admin-Rechte können nicht geändert werden.' });
		}

		const target = await db.query.teachers.findFirst({
			where: (t, { eq }) => eq(t.id, targetId)
		});
		if (!target) return fail(404);

		await db.update(teachers)
			.set({ isAdmin: !target.isAdmin })
			.where(eq(teachers.id, targetId));

		return { toggleSuccess: true };
	}
};
