import { fail, redirect, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { hashPassword } from '$lib/server/auth/passwords.js';
import { passwordResets, teachers } from '$lib/server/db/schema.js';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const reset = await db.query.passwordResets.findFirst({
		where: (r, { and, eq, gt, isNull }) =>
			and(eq(r.token, params.token), gt(r.expiresAt, new Date()), isNull(r.usedAt))
	});
	if (!reset) throw error(404, 'Link ungültig oder abgelaufen.');
	return {};
};

export const actions: Actions = {
	default: async ({ params, request }) => {
		const data = await request.formData();
		const password = (data.get('password') as string) ?? '';
		const confirm = (data.get('confirm') as string) ?? '';

		if (password.length < 8) return fail(400, { error: 'Passwort muss mindestens 8 Zeichen haben.' });
		if (password !== confirm) return fail(400, { error: 'Passwörter stimmen nicht überein.' });

		const reset = await db.query.passwordResets.findFirst({
			where: (r, { and, eq, gt, isNull }) =>
				and(eq(r.token, params.token), gt(r.expiresAt, new Date()), isNull(r.usedAt))
		});
		if (!reset) return fail(400, { error: 'Link ungültig oder abgelaufen.' });

		const hash = await hashPassword(password);
		await db.update(teachers).set({ passwordHash: hash }).where(eq(teachers.id, reset.teacherId));
		await db
			.update(passwordResets)
			.set({ usedAt: new Date() })
			.where(eq(passwordResets.token, params.token));

		throw redirect(303, '/teacher/login?reset=1');
	}
};
