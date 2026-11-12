import { redirect, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { attempts as attemptsTable, students } from '$lib/server/db/schema.js';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { computeFrontier } from '$lib/server/learning/frontier.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('app:progress');
	if (!locals.session || locals.session.type !== 'student') {
		throw redirect(303, '/login');
	}
	const { studentId, classId } = locals.session;

	const [allAtoms, statuses, earnedBadges, classRecord, studentRecord, activityRows] = await Promise.all([
		db.query.atoms.findMany({
			orderBy: (a, { asc }) => [asc(a.domain), asc(a.subdomain), asc(a.label)]
		}),
		db.query.studentAtomStatus.findMany({
			where: (s, { eq }) => eq(s.studentId, studentId)
		}),
		db.query.badges.findMany({
			where: (b, { eq }) => eq(b.studentId, studentId)
		}),
		db.query.classes.findFirst({
			where: (c, { eq }) => eq(c.id, classId)
		}),
		db.query.students.findFirst({
			where: (s, { eq }) => eq(s.id, studentId),
			columns: { hideLeaderboard: true, extraDomains: true }
		}),
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

	// Class leaderboard (only if enabled)
	type LbEntry = { id: string; displayName: string; xp: number; level: number; masteredCount: number };
	let leaderboard: LbEntry[] = [];
	// XP earned in the current day / week (Mon–Sun) / month — server time zone,
	// same as the activity heatmap
	const periodBoards: Record<'day' | 'week' | 'month', LbEntry[]> = { day: [], week: [], month: [] };
	if (classRecord?.showLeaderboard) {
		const classmates = await db.query.students.findMany({
			where: (s, { eq: eqFn }) => eqFn(s.classId, classId),
			columns: { id: true, displayName: true }
		});
		const classmateIds = classmates.map((s) => s.id);
		const [classmateGami, classmateMastered, periodRows] = await Promise.all([
			classmateIds.length > 0
				? db.query.gamificationState.findMany({
						where: (g, { inArray }) => inArray(g.studentId, classmateIds)
					})
				: Promise.resolve([]),
			classmateIds.length > 0
				? db.query.studentAtomStatus.findMany({
						where: (s, { and: andFn, inArray, eq: eqFn }) =>
							andFn(inArray(s.studentId, classmateIds), eqFn(s.isMastered, true)),
						columns: { studentId: true }
					})
				: Promise.resolve([]),
			classmateIds.length > 0
				? db
						.select({
							studentId: attemptsTable.studentId,
							day: sql<number>`cast(coalesce(sum(${attemptsTable.xpGained}) filter (where ${attemptsTable.answeredAt} >= date_trunc('day', now())), 0) as int)`,
							week: sql<number>`cast(coalesce(sum(${attemptsTable.xpGained}) filter (where ${attemptsTable.answeredAt} >= date_trunc('week', now())), 0) as int)`,
							month: sql<number>`cast(coalesce(sum(${attemptsTable.xpGained}) filter (where ${attemptsTable.answeredAt} >= date_trunc('month', now())), 0) as int)`
						})
						.from(attemptsTable)
						.where(
							and(
								inArray(attemptsTable.studentId, classmateIds),
								gte(
									attemptsTable.answeredAt,
									sql`least(date_trunc('week', now()), date_trunc('month', now()))`
								)
							)
						)
						.groupBy(attemptsTable.studentId)
				: Promise.resolve([])
		]);
		const gamiMap = new Map(classmateGami.map((g) => [g.studentId, g]));
		const masteredCountMap = new Map<string, number>();
		for (const m of classmateMastered) {
			masteredCountMap.set(m.studentId, (masteredCountMap.get(m.studentId) ?? 0) + 1);
		}
		leaderboard = classmates
			.map((s) => ({
				id: s.id,
				displayName: s.displayName,
				xp: gamiMap.get(s.id)?.xp ?? 0,
				level: gamiMap.get(s.id)?.level ?? 1,
				masteredCount: masteredCountMap.get(s.id) ?? 0
			}))
			.sort((a, b) => b.xp - a.xp);

		const periodMap = new Map(periodRows.map((r) => [r.studentId, r]));
		for (const period of ['day', 'week', 'month'] as const) {
			periodBoards[period] = leaderboard
				.map((e) => ({ ...e, xp: periodMap.get(e.id)?.[period] ?? 0 }))
				.filter((e) => e.xp > 0)
				.sort((a, b) => b.xp - a.xp || a.displayName.localeCompare(b.displayName, 'de'));
		}
	}

	const classDomains = classRecord?.enabledDomains ?? null;
	const extraDomains = studentRecord?.extraDomains ?? null;
	const effectiveDomains =
		classDomains === null
			? null
			: extraDomains && extraDomains.length > 0
				? [...new Set([...classDomains, ...extraDomains])]
				: classDomains;

	const frontier = await computeFrontier(studentId, effectiveDomains);
	const activeIds = new Set(frontier.map((f) => f.id));

	const statusMap = new Map(statuses.map((s) => [s.atomId, s]));
	const masteredAtomIds = new Set(statuses.filter((s) => s.isMastered).map((s) => s.atomId));

	function groupAtoms(atomList: typeof allAtoms) {
		const map = new Map<string, Map<string, typeof allAtoms>>();
		for (const atom of atomList) {
			if (!map.has(atom.domain)) map.set(atom.domain, new Map());
			const sub = atom.subdomain ?? '_';
			const subMap = map.get(atom.domain)!;
			if (!subMap.has(sub)) subMap.set(sub, []);
			subMap.get(sub)!.push(atom);
		}
		return Array.from(map.entries()).map(([domain, subdomains]) => ({
			name: domain,
			groups: Array.from(subdomains.entries()).map(([sub, atoms]) => ({
				name: sub === '_' ? null : sub,
				atoms: atoms.map((a) => {
					const st = statusMap.get(a.id);
					return {
						id: a.id,
						label: a.label,
						level: a.level,
						masteryRequired: a.masteryRequired,
						mastery: st?.mastery ?? 0,
						isMastered: st?.isMastered ?? false,
						totalAttempts: st?.totalAttempts ?? 0
					};
				})
			}))
		}));
	}

	const activeAtoms = allAtoms.filter((a) => activeIds.has(a.id));
	const masteredAtomsList = allAtoms.filter(
		(a) => a.level === 'atom' && masteredAtomIds.has(a.id)
	);

	const domains = groupAtoms(activeAtoms);
	const masteredDomains = groupAtoms(masteredAtomsList);

	// Summary stats — count only unlocked atoms (frontier + mastered)
	const unlockedAtomIds = new Set([
		...activeAtoms.filter((a) => a.level === 'atom').map((a) => a.id),
		...masteredAtomsList.map((a) => a.id)
	]);
	const totalAtoms = unlockedAtomIds.size;
	const masteredAtoms = statuses.filter((s) => s.isMastered).length;

	const starMapAtoms = allAtoms.filter(
		(a) => !effectiveDomains || effectiveDomains.includes(a.domain)
	).map((a) => {
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

	return {
		domains,
		masteredDomains,
		totalAtoms,
		masteredAtoms,
		badges: earnedBadges.map((b) => b.badgeType),
		activityDays: activityRows,
		leaderboard,
		periodBoards,
		showLeaderboard: classRecord?.showLeaderboard ?? false,
		studentHidesLeaderboard: studentRecord?.hideLeaderboard ?? false,
		studentId,
		starMapAtoms
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
