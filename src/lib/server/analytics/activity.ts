import { db } from '$lib/server/db/index.js';

// Time-spent is derived from attempts.answeredAt rather than tracked explicitly:
// gaps between consecutive attempts on the same day are summed (capped, so an
// abandoned tab doesn't inflate the total), plus a fixed thinking-time credit
// per attempt for reading/typing that isn't bracketed by another attempt.
const GAP_CAP_SECONDS = 180;
const THINKING_TIME_SECONDS = 20;

export type DailyStat = { date: string; activeMinutes: number; tasksTotal: number; tasksCorrect: number };
export type MasteryPoint = { date: string; cumulativeMastered: number };
export type StudentActivitySummary = {
	studentId: string;
	todayMinutes: number;
	todayTasks: number;
	weekMinutes: number;
	weekTasks: number;
};

function isoDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function startOfUtcDay(daysAgo: number): Date {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() - daysAgo);
	d.setUTCHours(0, 0, 0, 0);
	return d;
}

/** Pure aggregation: groups attempt timestamps by day and estimates active time per day. */
export function computeDailyStatsFromAttempts(
	rows: { answeredAt: Date; isCorrect: boolean }[]
): Map<string, DailyStat> {
	const byDay = new Map<string, { answeredAt: Date; isCorrect: boolean }[]>();
	for (const r of rows) {
		const day = isoDate(r.answeredAt);
		if (!byDay.has(day)) byDay.set(day, []);
		byDay.get(day)!.push(r);
	}

	const result = new Map<string, DailyStat>();
	for (const [day, dayRows] of byDay) {
		const sorted = [...dayRows].sort((a, b) => a.answeredAt.getTime() - b.answeredAt.getTime());
		let activeSeconds = THINKING_TIME_SECONDS;
		for (let i = 1; i < sorted.length; i++) {
			const gapSeconds = (sorted[i].answeredAt.getTime() - sorted[i - 1].answeredAt.getTime()) / 1000;
			activeSeconds += Math.min(gapSeconds, GAP_CAP_SECONDS) + THINKING_TIME_SECONDS;
		}
		result.set(day, {
			date: day,
			activeMinutes: Math.round(activeSeconds / 60),
			tasksTotal: sorted.length,
			tasksCorrect: sorted.filter((r) => r.isCorrect).length
		});
	}
	return result;
}

function fillDayRange(statsByDay: Map<string, DailyStat>, since: Date, days: number): DailyStat[] {
	const result: DailyStat[] = [];
	for (let i = 0; i < days; i++) {
		const d = new Date(since);
		d.setUTCDate(d.getUTCDate() + i);
		const key = isoDate(d);
		result.push(statsByDay.get(key) ?? { date: key, activeMinutes: 0, tasksTotal: 0, tasksCorrect: 0 });
	}
	return result;
}

/** Daily active-minutes / task-count series for one student, oldest first, zero-filled. */
export async function getDailyStats(studentId: string, days: number): Promise<DailyStat[]> {
	const since = startOfUtcDay(days - 1);

	const rows = await db.query.attempts.findMany({
		where: (a, { and, eq, gte }) => and(eq(a.studentId, studentId), gte(a.answeredAt, since)),
		columns: { answeredAt: true, isCorrect: true }
	});

	const statsByDay = computeDailyStatsFromAttempts(rows);
	return fillDayRange(statsByDay, since, days);
}

/** Cumulative mastered-atom count per day for one student, oldest first, zero-filled. */
export async function getMasteryTimeline(studentId: string, days: number): Promise<MasteryPoint[]> {
	const since = startOfUtcDay(days - 1);

	const mastered = await db.query.studentAtomStatus.findMany({
		where: (s, { and, eq, isNotNull }) =>
			and(eq(s.studentId, studentId), eq(s.isMastered, true), isNotNull(s.masteredAt)),
		columns: { masteredAt: true }
	});

	let baseline = 0;
	const countsByDay = new Map<string, number>();
	for (const m of mastered) {
		const d = new Date(m.masteredAt!);
		if (d < since) {
			baseline++;
		} else {
			const key = isoDate(d);
			countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
		}
	}

	const result: MasteryPoint[] = [];
	let running = baseline;
	for (let i = 0; i < days; i++) {
		const d = new Date(since);
		d.setUTCDate(d.getUTCDate() + i);
		const key = isoDate(d);
		running += countsByDay.get(key) ?? 0;
		result.push({ date: key, cumulativeMastered: running });
	}
	return result;
}

/** Today / this-week active-minutes and task counts for a whole class in one query. */
export async function getClassActivitySummary(
	studentIds: string[]
): Promise<Map<string, StudentActivitySummary>> {
	const result = new Map<string, StudentActivitySummary>();
	if (studentIds.length === 0) return result;

	const since = startOfUtcDay(6); // today + 6 previous days
	const rows = await db.query.attempts.findMany({
		where: (a, { and, inArray, gte }) => and(inArray(a.studentId, studentIds), gte(a.answeredAt, since)),
		columns: { studentId: true, answeredAt: true, isCorrect: true }
	});

	const byStudent = new Map<string, { answeredAt: Date; isCorrect: boolean }[]>();
	for (const r of rows) {
		if (!byStudent.has(r.studentId)) byStudent.set(r.studentId, []);
		byStudent.get(r.studentId)!.push(r);
	}

	const todayKey = isoDate(new Date());
	for (const studentId of studentIds) {
		const dailyMap = computeDailyStatsFromAttempts(byStudent.get(studentId) ?? []);
		let weekMinutes = 0;
		let weekTasks = 0;
		for (const stat of dailyMap.values()) {
			weekMinutes += stat.activeMinutes;
			weekTasks += stat.tasksTotal;
		}
		const today = dailyMap.get(todayKey);
		result.set(studentId, {
			studentId,
			todayMinutes: today?.activeMinutes ?? 0,
			todayTasks: today?.tasksTotal ?? 0,
			weekMinutes,
			weekTasks
		});
	}
	return result;
}
