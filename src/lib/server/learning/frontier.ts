import { db } from '../db/index.js';
import { env } from '$env/dynamic/private';

export interface FrontierAtom {
	id: string;
	label: string;
	domain: string;
	score: number;
	cognitiveLoad: number;
	mastery: number;
	masteryRequired: number;
	graphDepth: number;
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

	// Load ALL edges once — required edges gate the frontier,
	// all edge types (required + helpful + deepens) inform graph depth for ordering.
	const allEdges = await db.query.edges.findMany();
	const requiredEdges = allEdges.filter((e) => e.edgeType === 'required');

	// Load student mastery status for all atoms
	const statuses = await db.query.studentAtomStatus.findMany({
		where: (s, { eq }) => eq(s.studentId, studentId)
	});
	const masteryMap = new Map(statuses.map((s) => [s.atomId, s]));

	// Build prereq map for gate checks: atomId → required prereqs
	const prereqMap = new Map<string, { sourceId: string; masteryLevelNeeded: number }[]>();
	for (const edge of requiredEdges) {
		const existing = prereqMap.get(edge.targetId) ?? [];
		existing.push({ sourceId: edge.sourceId, masteryLevelNeeded: edge.masteryLevelNeeded });
		prereqMap.set(edge.targetId, existing);
	}

	// Build full incoming-edge map (all types) for topological depth
	// targetId → list of sourceIds
	const incomingMap = new Map<string, string[]>();
	for (const edge of allEdges) {
		const existing = incomingMap.get(edge.targetId) ?? [];
		existing.push(edge.sourceId);
		incomingMap.set(edge.targetId, existing);
	}

	// Compute topological depth (longest path from any root) for each atom.
	// Depth 0 = no prerequisites of any kind → foundational atom.
	// This reflects the natural learning order in the graph.
	const depthCache = new Map<string, number>();
	function getDepth(id: string, visiting: Set<string>): number {
		if (depthCache.has(id)) return depthCache.get(id)!;
		if (visiting.has(id)) return 0; // cycle guard
		visiting.add(id);
		const parents = incomingMap.get(id) ?? [];
		const depth =
			parents.length === 0 ? 0 : Math.max(...parents.map((p) => getDepth(p, visiting))) + 1;
		depthCache.set(id, depth);
		visiting.delete(id);
		return depth;
	}
	for (const atom of allAtoms) getDepth(atom.id, new Set());

	// Cluster atoms are never practiced directly and have no student_atom_status entry.
	// Inject their effective mastery (min of required sub-atoms) so prereq checks work.
	// Only include actual cluster atoms (not level=atom atoms that aren't mastered yet),
	// otherwise mastery would propagate transitively through the whole dependency chain.
	const atomLevelIds = new Set(allAtoms.map((a) => a.id));
	const clusterIds = new Set(
		requiredEdges.map((e) => e.sourceId).filter((id) => !atomLevelIds.has(id))
	);
	const clusterMastery = new Map<string, number>();
	// Helper: effective mastery for prereq checks.
	// A mastered atom counts as 1.0 regardless of its raw mastery value, so that
	// edges with masteryLevelNeeded > atom.masteryRequired never permanently block progress.
	function effectiveMastery(atomId: string): number {
		const status = masteryMap.get(atomId);
		if (status?.isMastered) return 1.0;
		return status?.mastery ?? clusterMastery.get(atomId) ?? 0;
	}

	let changed = true;
	while (changed) {
		changed = false;
		for (const clusterId of clusterIds) {
			const subEdges = requiredEdges.filter((e) => e.targetId === clusterId);
			if (subEdges.length === 0) continue;
			const mastery = Math.min(...subEdges.map((e) => effectiveMastery(e.sourceId)));
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
			return effectiveMastery(p.sourceId) >= p.masteryLevelNeeded;
		});

		if (!allSatisfied) continue;

		const score =
			atom.transferValue + atom.curriculumCentrality - cognitiveWeight * atom.cognitiveLoad;

		frontier.push({
			id: atom.id,
			label: atom.label,
			domain: atom.domain,
			score,
			cognitiveLoad: atom.cognitiveLoad,
			mastery,
			masteryRequired: atom.masteryRequired,
			graphDepth: depthCache.get(atom.id) ?? 0
		});
	}

	// Sort by graph depth ascending (foundational concepts first),
	// then by score descending as tiebreaker within the same depth.
	frontier.sort((a, b) => a.graphDepth - b.graphDepth || b.score - a.score);

	return frontier;
}

// Direct required atom-level children of a cluster — the discrimination pool
// used by getTaskForCluster. Doesn't re-check mastery; callers that need the
// readiness gate should use computeDiscriminationSets instead.
export async function getClusterSubAtomIds(clusterId: string): Promise<string[]> {
	const edges = await db.query.edges.findMany({
		where: (e, { and, eq }) => and(eq(e.targetId, clusterId), eq(e.edgeType, 'required'))
	});
	const atomLevelAtoms = await db.query.atoms.findMany({
		where: (a, { eq }) => eq(a.level, 'atom'),
		columns: { id: true }
	});
	const atomLevelIds = new Set(atomLevelAtoms.map((a) => a.id));
	return edges.map((e) => e.sourceId).filter((id) => atomLevelIds.has(id));
}

// Pure helper: transitive closure of required-prerequisite ancestors for a set of atoms.
// Used to find mastered atoms that are implicitly reinforced by practicing an active atom.
export function buildAncestorSet(
	requiredEdges: { sourceId: string; targetId: string }[],
	activeAtomIds: string[]
): Set<string> {
	const bySource = new Map<string, string[]>();
	for (const edge of requiredEdges) {
		const existing = bySource.get(edge.targetId) ?? [];
		existing.push(edge.sourceId);
		bySource.set(edge.targetId, existing);
	}

	const ancestors = new Set<string>();
	const queue = [...activeAtomIds];
	while (queue.length > 0) {
		const id = queue.pop()!;
		for (const parentId of bySource.get(id) ?? []) {
			if (!ancestors.has(parentId)) {
				ancestors.add(parentId);
				queue.push(parentId);
			}
		}
	}
	return ancestors;
}

export interface DiscriminationSet {
	clusterId: string;
	label: string;
	domain: string;
	subAtomIds: string[];
}

// Pure helper: a cluster becomes a "discrimination set" once all of its direct
// required atom-level sub-atoms are individually mastered. DI calls for mixed/
// interleaved practice at that point — students who can execute each strategy in
// isolation still need practice telling them apart when presented unlabeled.
// Clusters with fewer than 2 atom-level required children have nothing to
// discriminate between and are skipped.
export function buildDiscriminationSets(
	clusters: { id: string; label: string; domain: string }[],
	requiredEdges: { sourceId: string; targetId: string }[],
	atomLevelIds: Set<string>,
	masteredAtomIds: Set<string>
): DiscriminationSet[] {
	const sets: DiscriminationSet[] = [];
	for (const cluster of clusters) {
		const subAtomIds = requiredEdges
			.filter((e) => e.targetId === cluster.id && atomLevelIds.has(e.sourceId))
			.map((e) => e.sourceId);
		if (subAtomIds.length < 2) continue;
		if (!subAtomIds.every((id) => masteredAtomIds.has(id))) continue;
		sets.push({ clusterId: cluster.id, label: cluster.label, domain: cluster.domain, subAtomIds });
	}
	return sets;
}

export async function computeDiscriminationSets(
	studentId: string,
	enabledDomains: string[] | null
): Promise<DiscriminationSet[]> {
	const clusters = await db.query.atoms.findMany({
		where: (a, { and, eq, inArray }) => {
			const conditions = [eq(a.level, 'cluster')];
			if (enabledDomains && enabledDomains.length > 0) {
				conditions.push(inArray(a.domain, enabledDomains));
			}
			return and(...conditions);
		}
	});
	if (clusters.length === 0) return [];

	const [requiredEdges, statuses, atomLevelAtoms] = await Promise.all([
		db.query.edges.findMany({ where: (e, { eq }) => eq(e.edgeType, 'required') }),
		db.query.studentAtomStatus.findMany({ where: (s, { eq }) => eq(s.studentId, studentId) }),
		db.query.atoms.findMany({ where: (a, { eq }) => eq(a.level, 'atom'), columns: { id: true } })
	]);

	const atomLevelIds = new Set(atomLevelAtoms.map((a) => a.id));
	const masteredAtomIds = new Set(statuses.filter((s) => s.isMastered).map((s) => s.atomId));

	return buildDiscriminationSets(clusters, requiredEdges, atomLevelIds, masteredAtomIds);
}

// Mastered atoms whose required-prerequisite chain overlaps with what the student is
// actively working on (mastery > 0, not yet mastered) don't need a separate FSRS review —
// practicing the active atom already exercises them. Reviews for those stay suppressed
// only while the descendant remains active; their FSRS due date is untouched, so they
// resurface as soon as the active atom is mastered or the student moves on.
export async function computeReinforcedAncestors(activeAtomIds: string[]): Promise<Set<string>> {
	if (activeAtomIds.length === 0) return new Set();

	const requiredEdges = await db.query.edges.findMany({
		where: (e, { eq }) => eq(e.edgeType, 'required')
	});

	return buildAncestorSet(requiredEdges, activeAtomIds);
}
