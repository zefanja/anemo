import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { attempts } from '$lib/server/db/schema.js';
import { inArray, asc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import type { FsrsState } from '$lib/server/learning/fsrs.js';

const FSRS_STATE_LABELS = ['new', 'learning', 'review', 'relearning'] as const;
export type FsrsStateLabel = 'none' | (typeof FSRS_STATE_LABELS)[number];

function fsrsStateLabel(fsrsState: unknown): FsrsStateLabel {
	if (!fsrsState || typeof fsrsState !== 'object') return 'none';
	const state = (fsrsState as FsrsState).state;
	return FSRS_STATE_LABELS[state] ?? 'none';
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session || locals.session.type !== 'teacher') {
		throw redirect(303, '/teacher/login');
	}
	const { teacherId } = locals.session;

	const classes = await db.query.classes.findMany({
		where: (c, { eq }) => eq(c.teacherId, teacherId),
		with: { students: { columns: { id: true, displayName: true } } }
	});

	const studentIds = classes.flatMap((c) => c.students.map((s) => s.id));

	const [atomStatuses, firstAttempts] = await Promise.all([
		studentIds.length > 0
			? db.query.studentAtomStatus.findMany({
					where: (s, { inArray }) => inArray(s.studentId, studentIds),
					columns: {
						studentId: true,
						atomId: true,
						mastery: true,
						isMastered: true,
						totalAttempts: true,
						fsrsState: true
					},
					with: { atom: { columns: { label: true, domain: true, subdomain: true } } }
				})
			: Promise.resolve([]),
		// earliest attempt per (student, atom) pair, to derive first-try correctness
		studentIds.length > 0
			? db
					.selectDistinctOn([attempts.studentId, attempts.atomId], {
						studentId: attempts.studentId,
						atomId: attempts.atomId,
						isCorrect: attempts.isCorrect
					})
					.from(attempts)
					.where(inArray(attempts.studentId, studentIds))
					.orderBy(attempts.studentId, attempts.atomId, asc(attempts.answeredAt))
			: Promise.resolve([])
	]);

	const studentInfoMap = new Map<
		string,
		{ displayName: string; classId: string; className: string }
	>();
	for (const c of classes) {
		for (const s of c.students) {
			studentInfoMap.set(s.id, { displayName: s.displayName, classId: c.id, className: c.name });
		}
	}

	const firstTryMap = new Map<string, boolean>();
	for (const fa of firstAttempts) {
		firstTryMap.set(`${fa.studentId}:${fa.atomId}`, fa.isCorrect);
	}

	const domainSet = new Set<string>();
	const rows = atomStatuses
		.filter((s) => s.totalAttempts > 0)
		.map((s) => {
			const info = studentInfoMap.get(s.studentId);
			const domain = s.atom?.domain ?? '';
			domainSet.add(domain);
			return {
				atomId: s.atomId,
				atomLabel: s.atom?.label ?? s.atomId,
				domain,
				subdomain: s.atom?.subdomain ?? '',
				studentId: s.studentId,
				displayName: info?.displayName ?? '?',
				classId: info?.classId ?? '',
				className: info?.className ?? '',
				mastery: s.mastery,
				isMastered: s.isMastered,
				fsrsState: fsrsStateLabel(s.fsrsState),
				firstTryCorrect: firstTryMap.get(`${s.studentId}:${s.atomId}`) ?? null
			};
		})
		.filter((r) => r.classId);

	return {
		classes: classes.map((c) => ({ id: c.id, name: c.name })),
		domains: Array.from(domainSet).sort((a, b) => a.localeCompare(b, 'de')),
		rows
	};
};
