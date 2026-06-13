import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { hashCode } from '$lib/server/auth/codes.js';
import { createSession } from '$lib/server/auth/session.js';
import { checkRateLimit, recordFailedAttempt, clearAttempts } from '$lib/server/auth/rate-limit.js';
import { students } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.session?.type === 'student') throw redirect(303, '/practice');
	if (locals.session?.type === 'teacher') throw redirect(303, '/teacher/dashboard');
	return { next: url.searchParams.get('next') ?? '/practice' };
};

export const actions: Actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const code = (data.get('code') as string ?? '').trim().toUpperCase();
		const next = (data.get('next') as string) || '/practice';

		if (!/^[A-Z0-9]{6}$/.test(code)) {
			return fail(400, { error: 'Ungültiger Code. Bitte genau 6 Zeichen eingeben.' });
		}

		const ip = event.getClientAddress();
		const rl = await checkRateLimit(ip);
		if (!rl.allowed) {
			const mins = Math.ceil((rl.lockedUntil!.getTime() - Date.now()) / 60000);
			return fail(429, { error: `Zu viele Versuche. Bitte ${mins} Minute(n) warten.` });
		}

		const codeHash = await hashCode(code);
		const matched = await db.query.students.findFirst({
			where: (s, { eq }) => eq(s.codeHash, codeHash)
		});

		if (!matched) {
			await recordFailedAttempt(ip);
			return fail(401, { error: 'Code ungültig. Bitte erneut versuchen.' });
		}

		await clearAttempts(ip);
		await db.update(students).set({ lastActiveAt: new Date() }).where(eq(students.id, matched.id));
		await createSession(event, { studentId: matched.id });
		throw redirect(303, next);
	}
};
