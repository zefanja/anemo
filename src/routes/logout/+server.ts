import { redirect } from '@sveltejs/kit';
import { destroySession } from '$lib/server/auth/session.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const session = event.locals.session;
	await destroySession(event);
	const dest = session?.type === 'teacher' ? '/teacher/login' : '/login';
	throw redirect(303, dest);
};

// Allow GET for convenience (e.g. link in nav)
export const GET: RequestHandler = async (event) => {
	const session = event.locals.session;
	await destroySession(event);
	const dest = session?.type === 'teacher' ? '/teacher/login' : '/login';
	throw redirect(303, dest);
};
