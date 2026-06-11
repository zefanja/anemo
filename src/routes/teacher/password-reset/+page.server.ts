import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { generateResetToken } from '$lib/server/auth/passwords.js';
import { passwordResets } from '$lib/server/db/schema.js';
import { env } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ sent: false });

export const actions: Actions = {
	default: async ({ request }) => {
		const data = await request.formData();
		const email = (data.get('email') as string ?? '').trim().toLowerCase();

		if (!email) return fail(400, { error: 'E-Mail ist erforderlich.' });

		const teacher = await db.query.teachers.findFirst({
			where: (t, { eq }) => eq(t.email, email)
		});

		// Always show success to avoid user enumeration
		if (teacher) {
			const token = generateResetToken();
			const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

			await db.insert(passwordResets).values({ token, teacherId: teacher.id, expiresAt });

			const baseUrl = env.PUBLIC_APP_URL ?? 'http://localhost:5173';
			// In production, send via email. For now: print to server console.
			console.log(
				`\n[PASSWORT-RESET] Anfrage für ${email}\n` +
					`Link (gültig 1 Stunde):\n${baseUrl}/teacher/password-reset/${token}\n`
			);
		}

		return { sent: true };
	}
};
