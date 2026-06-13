import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { resolveSession } from '$lib/server/auth/session.js';
import { db } from '$lib/server/db/index.js';

// Cached once setup is complete — avoids a DB round-trip on every request.
// Safe because teachers are only added, never removed after setup.
let setupComplete = false;

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.session = await resolveSession(event);

	// On first run (no teachers exist), redirect everything to /setup
	if (!event.url.pathname.startsWith('/setup')) {
		if (!setupComplete) {
			const anyTeacher = await db.query.teachers.findFirst({ columns: { id: true } });
			setupComplete = !!anyTeacher;
		}
		if (!setupComplete) {
			throw redirect(303, '/setup');
		}
	}

	return resolve(event);
};
