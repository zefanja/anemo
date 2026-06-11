import { db } from '../db/index.js';
import { env } from '$env/dynamic/private';

export interface FrontierAtom {
	id: string;
	label: string;
	domain: string;
	score: number;
	mastery: number;
	masteryRequired: number;
}

// Returns all practicable atoms for a student:
// level=atom, not yet mastered, all required prerequisites satisfied.
export async function computeFrontier(
	studentId: string,
	enabledDomains: string[] | null
): Promise<FrontierAtom[]> {
	const cognitiveWeight = parseFloat(env.COGNITIVE_WEIGHT ?? '0.5');

	// Load all non-cluster atoms in enabled domains
	const allAtoms = await db.query.atoms.findMany({
		where: (a, { and, eq, inArray }) => {
			const conditions = [eq(a.level, 'atom')];
			if (enabledDomains && enabledDomains.length > 0) {
				conditions.push(inArray(a.domain, enabledDomains));
			}
			return and(...conditions);
		}
	});

	// Load all required edges (source → target means source is prereq for target)
	const requiredEdges = await db.query.edges.findMany({
		where: (e, { eq }) => eq(e.edgeType, 'required')
	});

	// Load student mastery status for all atoms
	const statuses = await db.query.studentAtomStatus.findMany({
		where: (s, { eq }) => eq(s.studentId, studentId)
	});
	const masteryMap = new Map(statuses.map((s) => [s.atomId, s]));

	// Build prereq map: atomId → list of required prereqs
	const prereqMap = new Map<string, { sourceId: string; masteryLevelNeeded: number }[]>();
	for (const edge of requiredEdges) {
		const existing = prereqMap.get(edge.targetId) ?? [];
		existing.push({ sourceId: edge.sourceId, masteryLevelNeeded: edge.masteryLevelNeeded });
		prereqMap.set(edge.targetId, existing);
	}

	// Cluster atoms are never practiced directly and have no student_atom_status entry.
	// Inject their effective mastery (min of required sub-atoms) so prereq checks work.
	// Iterate until stable to handle clusters that depend on other clusters.
	const clusterIds = new Set(
		requiredEdges.map((e) => e.sourceId).filter((id) => !masteryMap.has(id))
	);
	const clusterMastery = new Map<string, number>();
	let changed = true;
	while (changed) {
		changed = false;
		for (const clusterId of clusterIds) {
			const subEdges = requiredEdges.filter((e) => e.targetId === clusterId);
			if (subEdges.length === 0) continue;
			const mastery = Math.min(
				...subEdges.map(
					(e) => masteryMap.get(e.sourceId)?.mastery ?? clusterMastery.get(e.sourceId) ?? 0
				)
			);
			if (mastery !== (clusterMastery.get(clusterId) ?? 0)) {
				clusterMastery.set(clusterId, mastery);
				changed = true;
			}
		}
	}

	const frontier: FrontierAtom[] = [];

	for (const atom of allAtoms) {
		const status = masteryMap.get(atom.id);
		const mastery = status?.mastery ?? 0;

		// Skip already mastered atoms (they go to FSRS review, not frontier)
		if (status?.isMastered) continue;

		// Check all required prerequisites are satisfied
		const prereqs = prereqMap.get(atom.id) ?? [];
		const allSatisfied = prereqs.every((p) => {
			const prereqMastery =
				masteryMap.get(p.sourceId)?.mastery ?? clusterMastery.get(p.sourceId) ?? 0;
			return prereqMastery >= p.masteryLevelNeeded;
		});

		if (!allSatisfied) continue;

		const score =
			atom.transferValue + atom.curriculumCentrality - cognitiveWeight * atom.cognitiveLoad;

		frontier.push({
			id: atom.id,
			label: atom.label,
			domain: atom.domain,
			score,
			mastery,
			masteryRequired: atom.masteryRequired
		});
	}

	// Sort by score descending
	frontier.sort((a, b) => b.score - a.score);

	return frontier;
}
