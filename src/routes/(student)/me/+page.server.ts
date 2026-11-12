import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { computeFrontier } from '$lib/server/learning/frontier.js';
import { getEffectiveDomains } from '$lib/server/learning/domains.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('app:progress');
	if (!locals.session || locals.session.type !== 'student') throw redirect(303, '/login');
	const { studentId, classId } = locals.session;

	const [allAtoms, statuses, effectiveDomains] = await Promise.all([
		db.query.atoms.findMany({
			orderBy: (a, { asc }) => [asc(a.domain), asc(a.subdomain), asc(a.label)]
		}),
		db.query.studentAtomStatus.findMany({
			where: (s, { eq }) => eq(s.studentId, studentId)
		}),
		getEffectiveDomains(studentId, classId)
	]);

	const frontier = await computeFrontier(studentId, effectiveDomains);
	const activeIds = new Set(frontier.map((f) => f.id));
	const statusMap = new Map(statuses.map((s) => [s.atomId, s]));
	const masteredIds = new Set(statuses.filter((s) => s.isMastered).map((s) => s.atomId));

	function groupAtoms(list: typeof allAtoms) {
		const map = new Map<string, Map<string, typeof allAtoms>>();
		for (const atom of list) {
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
						mastery: st?.mastery ?? 0,
						isMastered: st?.isMastered ?? false
					};
				})
			}))
		}));
	}

	return {
		domains: groupAtoms(allAtoms.filter((a) => activeIds.has(a.id))),
		masteredDomains: groupAtoms(allAtoms.filter((a) => a.level === 'atom' && masteredIds.has(a.id)))
	};
};
