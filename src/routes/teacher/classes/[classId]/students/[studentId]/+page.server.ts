import { redirect, error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { eq } from 'drizzle-orm';
import { students } from '$lib/server/db/schema.js';
import { computeRetrievability, type FsrsState } from '$lib/server/learning/fsrs.js';
import { getDailyStats, getMasteryTimeline } from '$lib/server/analytics/activity.js';
import type { Actions, PageServerLoad } from './$types';

const ACTIVITY_DAYS = 90;

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.session || locals.session.type !== 'teacher') {
		throw redirect(303, '/teacher/login');
	}
	const { teacherId } = locals.session;

	const cls = await db.query.classes.findFirst({
		where: (c, { and, eq }) => and(eq(c.id, params.classId), eq(c.teacherId, teacherId))
	});
	if (!cls) throw error(404, 'Klasse nicht gefunden');

	const student = await db.query.students.findFirst({
		where: (s, { and, eq }) => and(eq(s.id, params.studentId), eq(s.classId, params.classId))
	});
	if (!student) throw error(404, 'Schüler nicht gefunden');

	const [allAtoms, atomStatuses, gami, dailyStats, masteryTimeline] = await Promise.all([
		db.query.atoms.findMany({
			where: (a, { eq: eqFn }) => eqFn(a.level, 'atom'),
			columns: { id: true, label: true, domain: true, subdomain: true },
			orderBy: (a, { asc }) => [asc(a.domain), asc(a.label)]
		}),
		db.query.studentAtomStatus.findMany({
			where: (s, { eq }) => eq(s.studentId, params.studentId)
		}),
		db.query.gamificationState.findFirst({
			where: (g, { eq }) => eq(g.studentId, params.studentId)
		}),
		getDailyStats(params.studentId, ACTIVITY_DAYS),
		getMasteryTimeline(params.studentId, ACTIVITY_DAYS)
	]);

	const classDomains = cls.enabledDomains ?? null;
	const studentExtraDomains = student.extraDomains ?? null;
	const effectiveDomains =
		classDomains === null
			? null
			: studentExtraDomains && studentExtraDomains.length > 0
				? [...new Set([...classDomains, ...studentExtraDomains])]
				: classDomains;

	const enabledAtoms = effectiveDomains
		? allAtoms.filter((a) => effectiveDomains.includes(a.domain))
		: allAtoms;
	const enabledAtomIds = new Set(enabledAtoms.map((a) => a.id));

	const statusByAtom = new Map(atomStatuses.map((s) => [s.atomId, s]));

	const domains = [...new Set(enabledAtoms.map((a) => a.domain))];

	const atomsByDomain = domains.map((domain) => ({
		domain,
		atoms: enabledAtoms
			.filter((a) => a.domain === domain)
			.map((a) => {
				const status = statusByAtom.get(a.id);
				return {
					id: a.id,
					label: a.label,
					subdomain: a.subdomain ?? null,
					mastery: status ? Math.round(status.mastery * 100) : 0,
					isMastered: status?.isMastered ?? false,
					totalAttempts: status?.totalAttempts ?? 0,
					correctAttempts: status?.correctAttempts ?? 0,
					lastPracticedAt: status?.lastPracticedAt ?? null,
					masteredAt: status?.masteredAt ?? null,
					retrievability: status?.isMastered && status.fsrsState
						? computeRetrievability(status.fsrsState as FsrsState)
						: null
				};
			})
	}));

	const totalAtoms = enabledAtoms.length;
	const masteredCount = atomStatuses.filter((s) => s.isMastered && enabledAtomIds.has(s.atomId)).length;
	const inProgressCount = atomStatuses.filter((s) => !s.isMastered && s.totalAttempts > 0 && enabledAtomIds.has(s.atomId)).length;
	const startedCount = masteredCount + inProgressCount;

	// All unique domains in the graph for the domain-unlock panel
	const allDomains = [...new Set(allAtoms.map((a) => a.domain))].sort();

	return {
		class: { id: cls.id, name: cls.name, enabledDomains: classDomains },
		student: {
			id: student.id,
			displayName: student.displayName,
			lastActiveAt: student.lastActiveAt,
			placementDone: student.placementDone,
			extraDomains: studentExtraDomains
		},
		allDomains,
		gami: {
			xp: gami?.xp ?? 0,
			level: gami?.level ?? 1,
			streakDays: gami?.streakDays ?? 0
		},
		totalAtoms,
		masteredCount,
		inProgressCount,
		startedCount,
		atomsByDomain,
		dailyStats,
		masteryTimeline
	};
};

export const actions: Actions = {
	updateExtraDomains: async ({ locals, params, request }) => {
		if (!locals.session || locals.session.type !== 'teacher') return fail(401);
		const { teacherId } = locals.session;

		const cls = await db.query.classes.findFirst({
			where: (c, { and }) => and(eq(c.id, params.classId), eq(c.teacherId, teacherId))
		});
		if (!cls) return fail(403, { error: 'Keine Berechtigung' });

		const student = await db.query.students.findFirst({
			where: (s, { and }) => and(eq(s.id, params.studentId), eq(s.classId, params.classId))
		});
		if (!student) return fail(404, { error: 'Schüler nicht gefunden' });

		const formData = await request.formData();
		const selected = formData.getAll('domain') as string[];
		const extra = selected.length > 0 ? selected : null;

		await db
			.update(students)
			.set({ extraDomains: extra })
			.where(eq(students.id, params.studentId));

		return { success: true };
	}
};
