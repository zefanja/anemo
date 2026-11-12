import { db } from '$lib/server/db/index.js';
import { getPeriodXp } from './period-xp.js';

export type LbEntry = { id: string; displayName: string; xp: number; level: number; masteredCount: number };
export type LbPeriod = 'day' | 'week' | 'month';

// Class leaderboard: all-time XP plus XP earned in the current day / week
// (Mon–Sun) / month in server time zone.
export async function getClassLeaderboard(
	classId: string
): Promise<{ leaderboard: LbEntry[]; periodBoards: Record<LbPeriod, LbEntry[]> }> {
	const periodBoards: Record<LbPeriod, LbEntry[]> = { day: [], week: [], month: [] };
	const classmates = await db.query.students.findMany({
		where: (s, { eq }) => eq(s.classId, classId),
		columns: { id: true, displayName: true }
	});
	const ids = classmates.map((s) => s.id);
	if (ids.length === 0) return { leaderboard: [], periodBoards };

	const [gami, mastered, periodMap] = await Promise.all([
		db.query.gamificationState.findMany({
			where: (g, { inArray }) => inArray(g.studentId, ids)
		}),
		db.query.studentAtomStatus.findMany({
			where: (s, { and, inArray, eq }) => and(inArray(s.studentId, ids), eq(s.isMastered, true)),
			columns: { studentId: true }
		}),
		getPeriodXp(ids)
	]);
	const gamiMap = new Map(gami.map((g) => [g.studentId, g]));
	const masteredCount = new Map<string, number>();
	for (const m of mastered) masteredCount.set(m.studentId, (masteredCount.get(m.studentId) ?? 0) + 1);

	const leaderboard = classmates
		.map((s) => ({
			id: s.id,
			displayName: s.displayName,
			xp: gamiMap.get(s.id)?.xp ?? 0,
			level: gamiMap.get(s.id)?.level ?? 1,
			masteredCount: masteredCount.get(s.id) ?? 0
		}))
		.sort((a, b) => b.xp - a.xp);

	for (const period of ['day', 'week', 'month'] as const) {
		periodBoards[period] = leaderboard
			.map((e) => ({ ...e, xp: periodMap.get(e.id)?.[period] ?? 0 }))
			.filter((e) => e.xp > 0)
			.sort((a, b) => b.xp - a.xp || a.displayName.localeCompare(b.displayName, 'de'));
	}
	return { leaderboard, periodBoards };
}
