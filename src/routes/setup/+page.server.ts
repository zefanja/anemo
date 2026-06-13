import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { teachers, school } from '$lib/server/db/schema.js';
import { hashPassword } from '$lib/server/auth/passwords.js';
import { createSession } from '$lib/server/auth/session.js';
import { randomUUID } from 'node:crypto';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// If a teacher already exists, setup is done
	const existing = await db.query.teachers.findFirst();
	if (existing) throw redirect(303, '/teacher/login');
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		// Double-check: abort if already set up
		const existing = await db.query.teachers.findFirst();
		if (existing) throw redirect(303, '/teacher/login');

		const fd = await event.request.formData();
		const schoolName = (fd.get('schoolName') as string ?? '').trim();
		const adminName = (fd.get('adminName') as string ?? '').trim();
		const email = (fd.get('email') as string ?? '').trim().toLowerCase();
		const password = (fd.get('password') as string) ?? '';
		const confirm = (fd.get('confirm') as string) ?? '';

		const errors: Record<string, string> = {};
		if (!schoolName) errors.schoolName = 'Schulname ist erforderlich.';
		if (!adminName) errors.adminName = 'Name ist erforderlich.';
		if (!email || !email.includes('@')) errors.email = 'Gültige E-Mail-Adresse erforderlich.';
		if (password.length < 8) errors.password = 'Passwort muss mindestens 8 Zeichen haben.';
		if (password !== confirm) errors.confirm = 'Passwörter stimmen nicht überein.';

		if (Object.keys(errors).length > 0) {
			return fail(400, { errors, schoolName, adminName, email });
		}

		const schoolId = randomUUID();
		const teacherId = randomUUID();
		const passwordHash = await hashPassword(password);

		await db.insert(school).values({ id: schoolId, name: schoolName });
		await db.insert(teachers).values({
			id: teacherId,
			schoolId,
			email,
			passwordHash,
			name: adminName,
			isAdmin: true
		});

		await createSession(event, { teacherId });
		throw redirect(303, '/teacher/dashboard');
	}
};
