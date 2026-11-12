import { db } from '../db/index.js';
import { attempts } from '../db/schema.js';
import { and, gte, inArray, sql } from 'drizzle-orm';

export type XpPeriod = 'day' | 'week' | 'month';
export type PeriodXp = Record<XpPeriod, number>;

/**
 * XP each student earned in the current day, week (Mon–Sun) and month.
 * Period boundaries use the database time zone, like the activity heatmap.
 * Students without XP in the window are missing from the map.
 */
export async function getPeriodXp(studentIds: string[]): Promise<Map<string, PeriodXp>> {
	if (studentIds.length === 0) return new Map();
	const since = (unit: XpPeriod) =>
		sql<number>`cast(coalesce(sum(${attempts.xpGained}) filter (where ${attempts.answeredAt} >= date_trunc(${sql.raw(`'${unit}'`)}, now())), 0) as int)`;
	const rows = await db
		.select({
			studentId: attempts.studentId,
			day: since('day'),
			week: since('week'),
			month: since('month')
		})
		.from(attempts)
		.where(
			and(
				inArray(attempts.studentId, studentIds),
				// the week can start in the previous month
				gte(attempts.answeredAt, sql`least(date_trunc('week', now()), date_trunc('month', now()))`)
			)
		)
		.groupBy(attempts.studentId);
	return new Map(rows.map((r) => [r.studentId, { day: r.day, week: r.week, month: r.month }]));
}
