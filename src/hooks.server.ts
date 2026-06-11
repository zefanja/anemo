import type { Handle } from '@sveltejs/kit';
import { resolveSession } from '$lib/server/auth/session.js';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.session = await resolveSession(event);
	return resolve(event);
};
