/**
 * Tests for the DFS-based cycle detection algorithm used in scripts/import-graph.ts.
 * The algorithm is re-implemented here as a pure function to enable isolated testing.
 */

import { describe, it, expect } from 'vitest';

function detectCycle(nodeIds: string[], edges: [string, string][]): boolean {
	const adj = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
	for (const [src, tgt] of edges) adj.get(src)?.push(tgt);

	const WHITE = 0, GRAY = 1, BLACK = 2;
	const color = new Map<string, number>(nodeIds.map((id) => [id, WHITE]));

	function dfs(node: string): boolean {
		color.set(node, GRAY);
		for (const neighbor of adj.get(node) ?? []) {
			if (color.get(neighbor) === GRAY) return true;
			if (color.get(neighbor) === WHITE && dfs(neighbor)) return true;
		}
		color.set(node, BLACK);
		return false;
	}

	for (const id of nodeIds) {
		if (color.get(id) === WHITE && dfs(id)) return true;
	}
	return false;
}

describe('Graph cycle detection', () => {
	it('reports no cycle for an empty graph', () => {
		expect(detectCycle([], [])).toBe(false);
	});

	it('reports no cycle for a single isolated node', () => {
		expect(detectCycle(['A'], [])).toBe(false);
	});

	it('reports no cycle for a simple chain A → B → C', () => {
		expect(detectCycle(['A', 'B', 'C'], [['A', 'B'], ['B', 'C']])).toBe(false);
	});

	it('detects a direct 2-node cycle A → B → A', () => {
		expect(detectCycle(['A', 'B'], [['A', 'B'], ['B', 'A']])).toBe(true);
	});

	it('detects a 3-node cycle A → B → C → A', () => {
		expect(
			detectCycle(['A', 'B', 'C'], [
				['A', 'B'],
				['B', 'C'],
				['C', 'A']
			])
		).toBe(true);
	});

	it('detects a self-loop A → A', () => {
		expect(detectCycle(['A'], [['A', 'A']])).toBe(true);
	});

	it('reports no cycle for a diamond (shared dependency)', () => {
		// A → B, A → C, B → D, C → D  (D is a shared prerequisite)
		expect(
			detectCycle(['A', 'B', 'C', 'D'], [
				['A', 'B'],
				['A', 'C'],
				['B', 'D'],
				['C', 'D']
			])
		).toBe(false);
	});

	it('reports no cycle for disconnected sub-graphs with no cycles', () => {
		// A → B and C → D are separate chains
		expect(
			detectCycle(['A', 'B', 'C', 'D'], [
				['A', 'B'],
				['C', 'D']
			])
		).toBe(false);
	});

	it('detects a cycle in one component while others are clean', () => {
		// A → B (clean chain) and C → D → C (cycle)
		expect(
			detectCycle(['A', 'B', 'C', 'D'], [
				['A', 'B'],
				['C', 'D'],
				['D', 'C']
			])
		).toBe(true);
	});

	it('reports no cycle for a tree with multiple branches', () => {
		//       root
		//      /    \
		//    n1      n2
		//   /  \      \
		// n3   n4      n5
		expect(
			detectCycle(['root', 'n1', 'n2', 'n3', 'n4', 'n5'], [
				['root', 'n1'],
				['root', 'n2'],
				['n1', 'n3'],
				['n1', 'n4'],
				['n2', 'n5']
			])
		).toBe(false);
	});

	it('idempotency: running twice on same graph gives same result', () => {
		const nodes = ['A', 'B', 'C'];
		const edges: [string, string][] = [['A', 'B'], ['B', 'C']];
		expect(detectCycle(nodes, edges)).toBe(false);
		expect(detectCycle(nodes, edges)).toBe(false);
	});
});
