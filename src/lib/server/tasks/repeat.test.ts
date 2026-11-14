import { vi, describe, it, expect } from 'vitest';

// No imported tasks; generated tasks are "saved" without a database.
vi.mock('$lib/server/db/index.js', () => ({
	db: {
		query: { tasks: { findFirst: async () => undefined }, studentAtomStatus: { findFirst: async () => undefined } },
		insert: () => ({ values: async () => undefined })
	}
}));

import { getTaskForAtom, taskKey } from './index.js';
import { generateTask, registeredAtomIds } from './generators.js';

// Simulates the practice page: it sends the keys of the last 5 tasks as `ex`.
async function sequence(atomId: string, stage: number, n: number) {
	const recent: string[] = [];
	const keys: string[] = [];
	for (let i = 0; i < n; i++) {
		const t = (await getTaskForAtom(atomId, recent.slice(-5), stage))!;
		keys.push(t.key);
		recent.push(t.key);
	}
	return keys;
}

describe('no identical task twice in a row', () => {
	it('tasks with a fixed prompt are told apart by their sketch', () => {
		const a = generateTask('geometrie__innenwinkelsatz_dreieck', 0)!;
		let b = generateTask('geometrie__innenwinkelsatz_dreieck', 0)!;
		while (b.svg === a.svg) b = generateTask('geometrie__innenwinkelsatz_dreieck', 0)!;
		expect(a.prompt).toBe(b.prompt);
		expect(taskKey(a)).not.toBe(taskKey(b));
	});

	it('the key does not depend on the correct answer', () => {
		const t = generateTask('geometrie__pythagoras_kathete', 0)!;
		expect(taskKey({ ...t })).toBe(taskKey({ ...t, correctAnswer: '999' } as typeof t));
	});

	for (const atomId of registeredAtomIds) {
		it(atomId, async () => {
			for (const stage of [0, 1, 3]) {
				const keys = await sequence(atomId, stage, 25);
				const distinct = new Set(keys.map((k) => k)).size;
				for (let i = 1; i < keys.length; i++) {
					// a repeat is only acceptable when the stage has a single possible task
					if (distinct > 1) expect(keys[i], `stage ${stage}, task ${i}`).not.toBe(keys[i - 1]);
				}
			}
		});
	}
});
