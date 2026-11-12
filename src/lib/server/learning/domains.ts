import { db } from '$lib/server/db/index.js';

// Domains a student works in: the class's enabled domains plus any extra
// domains unlocked for this student. null = all domains.
export async function getEffectiveDomains(studentId: string, classId: string): Promise<string[] | null> {
	const [classRecord, studentRecord] = await Promise.all([
		db.query.classes.findFirst({
			where: (c, { eq }) => eq(c.id, classId),
			columns: { enabledDomains: true }
		}),
		db.query.students.findFirst({
			where: (s, { eq }) => eq(s.id, studentId),
			columns: { extraDomains: true }
		})
	]);
	const classDomains = classRecord?.enabledDomains ?? null;
	const extraDomains = studentRecord?.extraDomains ?? null;
	if (classDomains === null) return null;
	return extraDomains && extraDomains.length > 0
		? [...new Set([...classDomains, ...extraDomains])]
		: classDomains;
}
