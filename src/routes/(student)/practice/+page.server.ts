import { redirect } from '@sveltejs/kit';
import { and, eq, gte } from 'drizzle-orm';
import { buildSession } from '$lib/server/learning/session-builder.js';
import { db } from '$lib/server/db/index.js';
import { attempts } from '$lib/server/db/schema.js';
import { isoDate } from '$lib/server/gamification/streak.js';
import type { PageServerLoad } from './$types';

const DAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.session || locals.session.type !== 'student') {
		throw redirect(303, '/login');
	}
	depends('app:practice');
	const { studentId, classId } = locals.session;

	// Current week (Mon–Sun), same UTC day boundaries as the streak logic
	const now = new Date();
	const today = isoDate(now);
	const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));

	const [plan, weekAttempts] = await Promise.all([
		buildSession(studentId, classId),
		db
			.select({ answeredAt: attempts.answeredAt })
			.from(attempts)
			.where(and(eq(attempts.studentId, studentId), gte(attempts.answeredAt, monday)))
	]);

	const activeDays = new Set(weekAttempts.map((a) => isoDate(a.answeredAt)));
	const week = DAY_NAMES.map((label, i) => {
		const d = new Date(monday);
		d.setUTCDate(monday.getUTCDate() + i);
		const date = isoDate(d);
		return { label, date, active: activeDays.has(date), isToday: date === today, isFuture: date > today };
	});

	return { plan, week };
};
