import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { students } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session || locals.session.type !== 'student') {
		throw redirect(303, '/login');
	}
	const { studentId } = locals.session;
	const student = await db.query.students.findFirst({
		where: (s, { eq }) => eq(s.id, studentId),
		columns: { placementDone: true }
	});
	if (student?.placementDone) {
		throw redirect(303, '/practice');
	}
	return {};
};

// "Überspringen" — mark done without writing any assumed mastery
export const actions: Actions = {
	skip: async ({ locals }) => {
		if (!locals.session || locals.session.type !== 'student') {
			throw redirect(303, '/login');
		}
		await db
			.update(students)
			.set({ placementDone: true })
			.where(eq(students.id, locals.session.studentId));
		throw redirect(303, '/practice');
	}
};
