import { redirect } from '@sveltejs/kit';
import { getGamificationState } from '$lib/server/gamification/index.js';
import { db } from '$lib/server/db/index.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url, depends }) => {
	if (!locals.session || locals.session.type !== 'student') {
		throw redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	}
	depends('app:gami');
	const { studentId, studentName, classId } = locals.session;

	// Redirect new students to placement test (skip if already on /placement)
	if (url.pathname !== '/placement') {
		const student = await db.query.students.findFirst({
			where: (s, { eq }) => eq(s.id, studentId),
			columns: { placementDone: true }
		});
		if (!student?.placementDone) {
			throw redirect(303, '/placement');
		}
	}

	const gami = await getGamificationState(studentId);
	return { studentId, studentName, classId, ...gami };
};
