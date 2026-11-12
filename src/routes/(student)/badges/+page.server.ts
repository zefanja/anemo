import { redirect, fail } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { studentAtomStatus, students } from '$lib/server/db/schema.js';
import { getClassLeaderboard, type LbEntry, type LbPeriod } from '$lib/server/gamification/leaderboard.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.session || locals.session.type !== 'student') throw redirect(303, '/login');
	depends('app:gami');
	depends('app:progress');
	const { studentId, classId } = locals.session;

	const [[row], classRecord, studentRecord] = await Promise.all([
		db
			.select({ n: sql<number>`cast(count(*) as int)` })
			.from(studentAtomStatus)
			.where(and(eq(studentAtomStatus.studentId, studentId), eq(studentAtomStatus.isMastered, true))),
		db.query.classes.findFirst({
			where: (c, { eq }) => eq(c.id, classId),
			columns: { showLeaderboard: true }
		}),
		db.query.students.findFirst({
			where: (s, { eq }) => eq(s.id, studentId),
			columns: { hideLeaderboard: true }
		})
	]);

	const showLeaderboard = classRecord?.showLeaderboard ?? false;
	let leaderboard: LbEntry[] = [];
	let periodBoards: Record<LbPeriod, LbEntry[]> = { day: [], week: [], month: [] };
	if (showLeaderboard) ({ leaderboard, periodBoards } = await getClassLeaderboard(classId));

	return {
		masteredCount: row?.n ?? 0,
		showLeaderboard,
		studentHidesLeaderboard: studentRecord?.hideLeaderboard ?? false,
		leaderboard,
		periodBoards
	};
};

export const actions: Actions = {
	toggleLeaderboard: async ({ locals }) => {
		if (!locals.session || locals.session.type !== 'student') return fail(401);
		const { studentId } = locals.session;
		const current = await db.query.students.findFirst({
			where: (s, { eq }) => eq(s.id, studentId),
			columns: { hideLeaderboard: true }
		});
		if (!current) return fail(404);
		await db
			.update(students)
			.set({ hideLeaderboard: !current.hideLeaderboard })
			.where(eq(students.id, studentId));
		return { toggled: true };
	}
};
