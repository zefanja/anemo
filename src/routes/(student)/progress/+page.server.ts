import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { attempts as attemptsTable } from '$lib/server/db/schema.js';
import { and, eq, gte, sql } from 'drizzle-orm';
import { computeFrontier } from '$lib/server/learning/frontier.js';
import { getEffectiveDomains } from '$lib/server/learning/domains.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('app:progress');
	if (!locals.session || locals.session.type !== 'student') {
		throw redirect(303, '/login');
	}
	const { studentId, classId } = locals.session;

	const [allAtoms, statuses, effectiveDomains, activityRows] = await Promise.all([
		db.query.atoms.findMany({
			orderBy: (a, { asc }) => [asc(a.domain), asc(a.subdomain), asc(a.label)]
		}),
		db.query.studentAtomStatus.findMany({
			where: (s, { eq }) => eq(s.studentId, studentId)
		}),
		getEffectiveDomains(studentId, classId),
		db
			.select({
				date: sql<string>`to_char(date_trunc('day', ${attemptsTable.answeredAt} AT TIME ZONE current_setting('timezone')), 'YYYY-MM-DD')`,
				count: sql<number>`cast(count(*) as int)`
			})
			.from(attemptsTable)
			.where(
				and(
					eq(attemptsTable.studentId, studentId),
					gte(attemptsTable.answeredAt, sql`now() - interval '84 days'`)
				)
			)
			.groupBy(sql`date_trunc('day', ${attemptsTable.answeredAt} AT TIME ZONE current_setting('timezone'))`)
	]);

	const frontier = await computeFrontier(studentId, effectiveDomains);
	const activeIds = new Set(frontier.map((f) => f.id));
	const statusMap = new Map(statuses.map((s) => [s.atomId, s]));

	const starMapAtoms = allAtoms
		.filter((a) => !effectiveDomains || effectiveDomains.includes(a.domain))
		.map((a) => {
			const st = statusMap.get(a.id);
			return {
				id: a.id,
				label: a.label,
				domain: a.domain,
				subdomain: a.subdomain ?? null,
				level: a.level as 'atom' | 'cluster',
				mastery: st?.mastery ?? 0,
				isMastered: st?.isMastered ?? false,
				isActive: activeIds.has(a.id)
			};
		});

	return { activityDays: activityRows, starMapAtoms };
};
