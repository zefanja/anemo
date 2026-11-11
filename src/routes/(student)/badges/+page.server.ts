import { redirect } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { studentAtomStatus } from '$lib/server/db/schema.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.session || locals.session.type !== 'student') throw redirect(303, '/login');
	depends('app:gami');
	const [row] = await db
		.select({ n: sql<number>`cast(count(*) as int)` })
		.from(studentAtomStatus)
		.where(and(eq(studentAtomStatus.studentId, locals.session.studentId), eq(studentAtomStatus.isMastered, true)));
	return { masteredCount: row?.n ?? 0 };
};
