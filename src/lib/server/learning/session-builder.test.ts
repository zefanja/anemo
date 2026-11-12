import { vi, describe, it, expect, beforeEach } from 'vitest';

// Fixtures, reassigned per test — the mocked db reads from these.
let atoms: any[];
let edgesFixture: any[];
let statuses: any[];
let classRow: any;
let studentRow: any;

vi.mock('$lib/server/db/index.js', () => ({
	db: {
		query: {
			classes: { findFirst: async () => classRow },
			students: { findFirst: async () => studentRow },
			atoms: { findMany: async () => atoms },
			edges: {
				// computeReinforcedAncestors passes a `where` filtering on edgeType='required';
				// computeFrontier calls findMany() with no args and filters in JS instead.
				findMany: async (opts?: { where?: unknown }) =>
					opts?.where ? edgesFixture.filter((e) => e.edgeType === 'required') : edgesFixture
			},
			studentAtomStatus: {
				// getDueReviews passes `with: { atom: true }` and filters to isMastered rows;
				// computeFrontier just wants every status row for the student.
				findMany: async (opts?: { with?: { atom?: boolean } }) =>
					opts?.with?.atom
						? statuses
								.filter((s) => s.isMastered)
								.map((s) => ({ ...s, atom: atoms.find((a) => a.id === s.atomId) }))
						: statuses
			}
		}
	}
}));

// Fixture ids are made up; treat every id as having a generator except those prefixed `no_gen_`.
vi.mock('../tasks/generators.js', () => ({
	hasGenerator: (id: string) => !id.startsWith('no_gen_')
}));

import { buildSession } from './session-builder.js';

const dueYesterday = new Date(Date.now() - 86_400_000).toISOString();

function atom(id: string, overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id,
		label: id,
		domain: 'arithmetik',
		level: 'atom',
		masteryRequired: 0.8,
		curriculumCentrality: 0.5,
		transferValue: 0.5,
		cognitiveLoad: 0.5,
		...overrides
	};
}

function masteredStatus(atomId: string, overrides: Partial<Record<string, unknown>> = {}) {
	return {
		studentId: 'student-1',
		atomId,
		mastery: 0.95,
		isMastered: true,
		fsrsState: { due: dueYesterday },
		...overrides
	};
}

beforeEach(() => {
	classRow = { sessionMaxReview: 10, enabledDomains: null };
	studentRow = { extraDomains: null };
});

describe('buildSession – relevant reviews', () => {
	it('suppresses mastered prerequisites of an atom the student is actively working on', async () => {
		// stellenwert → add_ohne → add_mit (required chain); add_mit is in progress.
		atoms = [atom('stellenwert'), atom('add_ohne'), atom('add_mit'), atom('geometrie_winkel')];
		edgesFixture = [
			{ sourceId: 'stellenwert', targetId: 'add_ohne', edgeType: 'required', masteryLevelNeeded: 0.8 },
			{ sourceId: 'add_ohne', targetId: 'add_mit', edgeType: 'required', masteryLevelNeeded: 0.8 }
		];
		statuses = [
			masteredStatus('stellenwert'),
			masteredStatus('add_ohne'),
			{ studentId: 'student-1', atomId: 'add_mit', mastery: 0.5, isMastered: false },
			masteredStatus('geometrie_winkel') // unrelated branch, no edge to add_mit
		];

		const session = await buildSession('student-1', 'class-1');
		const reviewIds = session.mandatoryReviews.map((r) => r.atomId);

		expect(reviewIds).not.toContain('stellenwert');
		expect(reviewIds).not.toContain('add_ohne');
		expect(reviewIds).toContain('geometrie_winkel');
	});

	it('shows all due reviews when the student has no active atom', async () => {
		atoms = [atom('stellenwert'), atom('geometrie_winkel')];
		edgesFixture = [];
		statuses = [masteredStatus('stellenwert'), masteredStatus('geometrie_winkel')];

		const session = await buildSession('student-1', 'class-1');
		const reviewIds = session.mandatoryReviews.map((r) => r.atomId);

		expect(reviewIds).toEqual(expect.arrayContaining(['stellenwert', 'geometrie_winkel']));
	});

	it('still reviews a mastered atom that is a prerequisite of a not-yet-started atom', async () => {
		// add_mit has mastery 0 (not started, type 'new'), so its prerequisites are not
		// yet being reinforced and should remain in the mandatory review queue.
		atoms = [atom('stellenwert'), atom('add_ohne'), atom('add_mit')];
		edgesFixture = [
			{ sourceId: 'stellenwert', targetId: 'add_ohne', edgeType: 'required', masteryLevelNeeded: 0.8 },
			{ sourceId: 'add_ohne', targetId: 'add_mit', edgeType: 'required', masteryLevelNeeded: 0.8 }
		];
		statuses = [masteredStatus('stellenwert'), masteredStatus('add_ohne')];

		const session = await buildSession('student-1', 'class-1');
		const reviewIds = session.mandatoryReviews.map((r) => r.atomId);

		expect(reviewIds).toEqual(expect.arrayContaining(['stellenwert', 'add_ohne']));
	});

	it('skips legacy mastered rows of clusters and atoms without a generator', async () => {
		// A status row can outlive a graph change: groessen_geld_laenge_zeit was an atom
		// before graph v4 and is now a cluster, which has no task generator.
		atoms = [atom('stellenwert'), atom('groessen_cluster', { level: 'cluster' }), atom('no_gen_atom')];
		edgesFixture = [];
		statuses = [masteredStatus('stellenwert'), masteredStatus('groessen_cluster'), masteredStatus('no_gen_atom')];

		const session = await buildSession('student-1', 'class-1');
		const reviewIds = session.mandatoryReviews.map((r) => r.atomId);

		expect(reviewIds).toEqual(['stellenwert']);
	});
});
