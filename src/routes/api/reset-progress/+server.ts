import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { studentAtomStatus, attempts, gamificationState, badges, students } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.session || locals.session.type !== 'student') {
		throw error(401, 'Nicht angemeldet');
	}

	const { studentId } = locals.session;

	await db.transaction(async (tx) => {
		await tx.delete(attempts).where(eq(attempts.studentId, studentId));
		await tx.delete(studentAtomStatus).where(eq(studentAtomStatus.studentId, studentId));
		await tx.delete(badges).where(eq(badges.studentId, studentId));
		await tx.delete(gamificationState).where(eq(gamificationState.studentId, studentId));
		await tx.update(students)
			.set({ placementDone: false })
			.where(eq(students.id, studentId));
	});

	return json({ ok: true });
};
