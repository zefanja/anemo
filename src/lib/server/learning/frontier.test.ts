import { describe, it, expect } from 'vitest';
import { buildAncestorSet, buildDiscriminationSets, computeGraphDepths } from './frontier.js';

// arithmetik graph example:
// add_sub_bis_100_mit_uebergang → add_sub_bis_100_ohne_uebergang → stellenwert_bis_100 → zahlverstaendnis_bis_20
const edges = [
	{ sourceId: 'add_sub_bis_100_ohne_uebergang', targetId: 'add_sub_bis_100_mit_uebergang' },
	{ sourceId: 'zehnerueberschreitung_bis_20', targetId: 'add_sub_bis_100_mit_uebergang' },
	{ sourceId: 'stellenwert_bis_100', targetId: 'add_sub_bis_100_ohne_uebergang' },
	{ sourceId: 'zahlverstaendnis_bis_20', targetId: 'stellenwert_bis_100' }
];

describe('buildAncestorSet', () => {
	it('returns an empty set when there are no active atoms', () => {
		expect(buildAncestorSet(edges, [])).toEqual(new Set());
	});

	it('follows the chain up through a direct prerequisite', () => {
		const result = buildAncestorSet(edges, ['add_sub_bis_100_ohne_uebergang']);
		expect(result).toEqual(new Set(['stellenwert_bis_100', 'zahlverstaendnis_bis_20']));
	});

	it('follows the required-prerequisite chain transitively', () => {
		const result = buildAncestorSet(edges, ['add_sub_bis_100_mit_uebergang']);
		expect(result).toEqual(
			new Set([
				'add_sub_bis_100_ohne_uebergang',
				'zehnerueberschreitung_bis_20',
				'stellenwert_bis_100',
				'zahlverstaendnis_bis_20'
			])
		);
	});

	it('unions ancestors across multiple active atoms', () => {
		const result = buildAncestorSet(edges, [
			'add_sub_bis_100_ohne_uebergang',
			'zehnerueberschreitung_bis_20'
		]);
		expect(result).toEqual(new Set(['stellenwert_bis_100', 'zahlverstaendnis_bis_20']));
	});

	it('does not include atoms unrelated to the active atom', () => {
		const result = buildAncestorSet(edges, ['zehnerueberschreitung_bis_20']);
		expect(result).toEqual(new Set());
	});

	it('handles atoms with no prerequisites', () => {
		expect(buildAncestorSet(edges, ['zahlverstaendnis_bis_20'])).toEqual(new Set());
	});
});

// M5: DI discrimination phase — mixed practice once a cluster's atom-level
// sub-atoms are all individually mastered.
describe('buildDiscriminationSets', () => {
	const cluster = { id: 'add_sub_bis_100', label: 'Addition/Subtraktion bis 100', domain: 'arithmetik' };
	const requiredEdges = [
		// atom-level siblings
		{ sourceId: 'add_ohne_uebergang', targetId: 'add_sub_bis_100' },
		{ sourceId: 'add_mit_uebergang', targetId: 'add_sub_bis_100' },
		// a chained sub-cluster required by the same cluster — not itself an atom
		{ sourceId: 'addition_bis_20', targetId: 'add_sub_bis_100' }
	];
	const atomLevelIds = new Set(['add_ohne_uebergang', 'add_mit_uebergang']);

	it('includes a cluster once all its atom-level required siblings are mastered', () => {
		const mastered = new Set(['add_ohne_uebergang', 'add_mit_uebergang']);
		const result = buildDiscriminationSets([cluster], requiredEdges, atomLevelIds, mastered);
		expect(result).toEqual([
			{ clusterId: 'add_sub_bis_100', label: cluster.label, domain: cluster.domain, subAtomIds: ['add_ohne_uebergang', 'add_mit_uebergang'] }
		]);
	});

	it('excludes a cluster when only some siblings are mastered', () => {
		const mastered = new Set(['add_ohne_uebergang']);
		const result = buildDiscriminationSets([cluster], requiredEdges, atomLevelIds, mastered);
		expect(result).toEqual([]);
	});

	it('excludes clusters with fewer than 2 atom-level required siblings', () => {
		const singleSiblingEdges = [{ sourceId: 'add_ohne_uebergang', targetId: 'add_sub_bis_100' }];
		const mastered = new Set(['add_ohne_uebergang']);
		const result = buildDiscriminationSets([cluster], singleSiblingEdges, atomLevelIds, mastered);
		expect(result).toEqual([]);
	});

	it('ignores nested sub-cluster requirements when building the discrimination pool', () => {
		const mastered = new Set(['add_ohne_uebergang', 'add_mit_uebergang', 'addition_bis_20']);
		const result = buildDiscriminationSets([cluster], requiredEdges, atomLevelIds, mastered);
		expect(result[0].subAtomIds).not.toContain('addition_bis_20');
	});
});

describe('computeGraphDepths', () => {
	it('returns the longest required-prerequisite chain for each node', () => {
		const depths = computeGraphDepths(edges);
		expect(depths.get('zahlverstaendnis_bis_20')).toBeUndefined(); // root → depth 0
		expect(depths.get('stellenwert_bis_100')).toBe(1);
		expect(depths.get('add_sub_bis_100_ohne_uebergang')).toBe(2);
		expect(depths.get('add_sub_bis_100_mit_uebergang')).toBe(3);
	});

	it('uses the longest path when a node has several prerequisites', () => {
		const depths = computeGraphDepths([
			{ sourceId: 'a', targetId: 'b' },
			{ sourceId: 'b', targetId: 'c' },
			{ sourceId: 'a', targetId: 'c' }
		]);
		expect(depths.get('c')).toBe(2);
	});

	it('terminates on cyclic input', () => {
		const depths = computeGraphDepths([
			{ sourceId: 'a', targetId: 'b' },
			{ sourceId: 'b', targetId: 'a' }
		]);
		expect(depths.size).toBeGreaterThan(0);
	});
});
