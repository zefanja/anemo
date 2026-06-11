import { redirect } from '@sveltejs/kit';
import { buildSession } from '$lib/server/learning/session-builder.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session || locals.session.type !== 'student') {
		throw redirect(303, '/login');
	}
	const { studentId, classId } = locals.session;
	const plan = await buildSession(studentId, classId);
	return { plan };
};
