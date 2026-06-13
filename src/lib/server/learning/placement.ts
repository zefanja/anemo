import { db } from '../db/index.js';
import { studentAtomStatus, students } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { createEmptyCard } from 'ts-fsrs';
import type { FsrsState } from './fsrs.js';
import { hasGenerator } from '../tasks/generators.js';
import { recordPlacementCompletion } from '../gamification/index.js';

export const MAX_PLACEMENT_ATOMS = 15;
const PLACEMENT_MASTERY = 0.85;

export interface PlacementState {
	tested: Record<string, 'passed' | 'failed'>;
	propagated: string[];
	candidates: string[];
	totalTested: number;
}

export interface PlacementGraph {
	atoms: Set<string>;
	centrality: Map<string, number>;
	// atomId → required prerequisite atomIds
	prereqMap: Map<string, string[]>;
	// atomId → atomIds that require this atom
	successorMap: Map<string, string[]>;
}

export async function loadPlacementGraph(): Promise<PlacementGraph> {
	const allAtoms = await db.query.atoms.findMany({
		where: (a, { eq }) => eq(a.level, 'atom'),
		columns: { id: true, curriculumCentrality: true }
	});

	const requiredEdges = await db.query.edges.findMany({
		where: (e, { eq }) => eq(e.edgeType, 'required'),
		columns: { sourceId: true, targetId: true }
	});

	// Only include atoms that have a task generator — avoids 500 errors for atoms
	// from other domains (geometry, algebra, …) that are in the graph but untestable.
	const atomSet = new Set(allAtoms.map((a) => a.id).filter(hasGenerator));
	const centrality = new Map(allAtoms.filter((a) => hasGenerator(a.id)).map((a) => [a.id, a.curriculumCentrality]));
	const prereqMap = new Map<string, string[]>();
	const successorMap = new Map<string, string[]>();

	for (const edge of requiredEdges) {
		if (!atomSet.has(edge.sourceId) || !atomSet.has(edge.targetId)) continue;

		const prereqs = prereqMap.get(edge.targetId) ?? [];
		prereqs.push(edge.sourceId);
		prereqMap.set(edge.targetId, prereqs);

		const successors = successorMap.get(edge.sourceId) ?? [];
		successors.push(edge.targetId);
		successorMap.set(edge.sourceId, successors);
	}

	return { atoms: atomSet, centrality, prereqMap, successorMap };
}

// Starting atoms: have prerequisites (not trivially basic) AND high centrality
function getStartPool(graph: PlacementGraph, handled: Set<string>): string[] {
	return [...graph.atoms]
		.filter((id) => !handled.has(id) && (graph.prereqMap.get(id)?.length ?? 0) > 0)
		.sort((a, b) => (graph.centrality.get(b) ?? 0) - (graph.centrality.get(a) ?? 0));
}

export function initPlacementState(): PlacementState {
	return { tested: {}, propagated: [], candidates: [], totalTested: 0 };
}

export function getNextPlacementAtom(state: PlacementState, graph: PlacementGraph): string | null {
	if (state.totalTested >= MAX_PLACEMENT_ATOMS) return null;

	const handled = new Set([...Object.keys(state.tested), ...state.propagated]);

	for (const id of state.candidates) {
		if (!handled.has(id) && graph.atoms.has(id)) return id;
	}

	return getStartPool(graph, handled)[0] ?? null;
}

// Correct answer: propagate mastery backwards (BFS), add successors as next candidates
export function applyPass(
	atomId: string,
	state: PlacementState,
	graph: PlacementGraph
): PlacementState {
	const newTested = { ...state.tested, [atomId]: 'passed' as const };
	const handled = new Set([...Object.keys(newTested), ...state.propagated]);

	const newPropagated = [...state.propagated];
	const queue = [atomId];
	while (queue.length > 0) {
		const current = queue.shift()!;
		for (const prereq of graph.prereqMap.get(current) ?? []) {
			if (!handled.has(prereq)) {
				handled.add(prereq);
				newPropagated.push(prereq);
				queue.push(prereq);
			}
		}
	}

	const successors = (graph.successorMap.get(atomId) ?? []).filter((s) => !handled.has(s));
	const prevCandidates = state.candidates.filter((c) => !handled.has(c));

	return {
		tested: newTested,
		propagated: newPropagated,
		candidates: [...successors, ...prevCandidates],
		totalTested: state.totalTested + 1
	};
}

// Wrong answer: descend into prerequisites as next candidates
export function applyFail(
	atomId: string,
	state: PlacementState,
	graph: PlacementGraph
): PlacementState {
	const newTested = { ...state.tested, [atomId]: 'failed' as const };
	const handled = new Set([...Object.keys(newTested), ...state.propagated]);

	const prereqs = (graph.prereqMap.get(atomId) ?? []).filter((p) => !handled.has(p));
	const prevCandidates = state.candidates.filter((c) => !handled.has(c));

	return {
		tested: newTested,
		propagated: state.propagated,
		candidates: [...prereqs, ...prevCandidates],
		totalTested: state.totalTested + 1
	};
}

function makeFsrsState(daysUntilDue: number): FsrsState {
	const card = createEmptyCard();
	const due = new Date();
	due.setDate(due.getDate() + daysUntilDue);
	return {
		due: due.toISOString(),
		stability: card.stability,
		difficulty: card.difficulty,
		elapsed_days: card.elapsed_days,
		scheduled_days: card.scheduled_days,
		reps: card.reps,
		lapses: card.lapses,
		learning_steps: (card as Record<string, unknown>).learning_steps as number ?? 0,
		state: card.state as unknown as number,
		last_review: undefined
	};
}

export async function finalizePlacement(
	studentId: string,
	state: PlacementState
): Promise<{ testedPassed: number; assumedMastered: number }> {
	const now = new Date();

	const passedAtomIds = Object.entries(state.tested)
		.filter(([, r]) => r === 'passed')
		.map(([id]) => id);

	type Row = typeof studentAtomStatus.$inferInsert & { placementSource: string };

	const rows: Row[] = [
		...passedAtomIds.map((atomId) => ({
			studentId,
			atomId,
			mastery: PLACEMENT_MASTERY,
			totalAttempts: 1,
			correctAttempts: 1,
			isMastered: true,
			masteredAt: now,
			lastPracticedAt: now,
			updatedAt: now,
			placementSource: 'placement_tested',
			fsrsState: makeFsrsState(7)
		})),
		...state.propagated.map((atomId) => ({
			studentId,
			atomId,
			mastery: PLACEMENT_MASTERY,
			totalAttempts: 0,
			correctAttempts: 0,
			isMastered: true,
			masteredAt: now,
			lastPracticedAt: now,
			updatedAt: now,
			placementSource: 'placement_propagated',
			fsrsState: makeFsrsState(14)
		}))
	];

	for (const row of rows) {
		await db
			.insert(studentAtomStatus)
			.values(row)
			.onConflictDoUpdate({
				target: [studentAtomStatus.studentId, studentAtomStatus.atomId],
				set: {
					mastery: row.mastery,
					totalAttempts: row.totalAttempts,
					correctAttempts: row.correctAttempts,
					isMastered: row.isMastered,
					masteredAt: row.masteredAt,
					lastPracticedAt: row.lastPracticedAt,
					updatedAt: row.updatedAt,
					placementSource: row.placementSource,
					fsrsState: row.fsrsState
				}
			});
	}

	await db.update(students).set({ placementDone: true }).where(eq(students.id, studentId));

	await recordPlacementCompletion(studentId, passedAtomIds.length);

	return { testedPassed: passedAtomIds.length, assumedMastered: state.propagated.length };
}
