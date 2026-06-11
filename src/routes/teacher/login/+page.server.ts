import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { verifyPassword } from '$lib/server/auth/passwords.js';
import { createSession } from '$lib/server/auth/session.js';
import { checkRateLimit, recordFailedAttempt, clearAttempts } from '$lib/server/auth/rate-limit.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.session?.type === 'teacher') throw redirect(303, '/teacher/dashboard');
	return { next: url.searchParams.get('next') ?? '/teacher/dashboard' };
};

export const actions: Actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const email = (data.get('email') as string ?? '').trim().toLowerCase();
		const password = (data.get('password') as string) ?? '';
		const next = (data.get('next') as string) || '/teacher/dashboard';

		if (!email || !password) {
			return fail(400, { error: 'E-Mail und Passwort sind erforderlich.' });
		}

		const ip = event.getClientAddress();
		const rl = await checkRateLimit(`teacher:${ip}`);
		if (!rl.allowed) {
			const mins = Math.ceil((rl.lockedUntil!.getTime() - Date.now()) / 60000);
			return fail(429, { error: `Zu viele Versuche. Bitte ${mins} Minute(n) warten.` });
		}

		const teacher = await db.query.teachers.findFirst({
			where: (t, { eq }) => eq(t.email, email)
		});

		if (!teacher || !(await verifyPassword(password, teacher.passwordHash))) {
			await recordFailedAttempt(`teacher:${ip}`);
			return fail(401, { error: 'E-Mail oder Passwort ungültig.' });
		}

		await clearAttempts(`teacher:${ip}`);
		await createSession(event, { teacherId: teacher.id });
		throw redirect(303, next);
	}
};
