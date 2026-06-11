import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { verifyCode } from '$lib/server/auth/codes.js';
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

		// Verify code against all students.
		// School stays small enough that sequential argon2 verify is acceptable.
		// If it grows: add a code prefix index to narrow candidates first.
		const allStudents = await db.query.students.findMany();
		let matched: typeof allStudents[0] | null = null;
		for (const s of allStudents) {
			if (await verifyCode(code, s.codeHash)) { matched = s; break; }
		}

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
