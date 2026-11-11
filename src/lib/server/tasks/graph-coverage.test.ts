/**
 * Guards the contract between the knowledge graph (math-knowledge-graph/atoms/*.yaml)
 * and the procedural generators: an atom without tasks can never be mastered, so a
 * generator-less atom on the required-prerequisite path of a practicable atom would
 * silently block that whole branch of the graph.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { generateTask, registeredAtomIds } from './generators.js';
import { checkAnswer } from './index.js';

interface RawAtom {
	id: string;
	level?: string;
	prerequisites?: { id: string; type: string }[];
}

const ATOMS_DIR = join(process.cwd(), 'math-knowledge-graph', 'atoms');
const atoms = new Map<string, RawAtom>(
	readdirSync(ATOMS_DIR)
		.filter((f) => f.endsWith('.yaml'))
		.map((f) => yaml.load(readFileSync(join(ATOMS_DIR, f), 'utf8')) as RawAtom)
		.map((a) => [a.id, a])
);
const generators = new Set(registeredAtomIds);
const isCluster = (id: string) => atoms.get(id)?.level === 'cluster';

function requiredAncestors(id: string, seen = new Set<string>()): Set<string> {
	for (const p of atoms.get(id)?.prerequisites ?? []) {
		if (p.type !== 'required' || seen.has(p.id)) continue;
		seen.add(p.id);
		requiredAncestors(p.id, seen);
	}
	return seen;
}

describe('generators ↔ knowledge graph', () => {
	it('registers generators only for existing, practicable atoms (never clusters)', () => {
		const invalid = registeredAtomIds.filter((id) => !atoms.has(id) || isCluster(id));
		expect(invalid).toEqual([]);
	});

	it('never leaves a generator-backed atom behind a prerequisite without generator', () => {
		const blockers = new Set<string>();
		for (const id of registeredAtomIds) {
			for (const anc of requiredAncestors(id)) {
				if (!isCluster(anc) && !generators.has(anc)) blockers.add(`${anc} (blockiert u. a. ${id})`);
			}
		}
		expect([...blockers]).toEqual([]);
	});
});

describe('every generator', () => {
	it.each(registeredAtomIds)('%s yields well-formed tasks at every stage', (id) => {
		for (let stage = 0; stage < 5; stage++) {
			for (let i = 0; i < 40; i++) {
				const task = generateTask(id, stage)!;
				expect(task.atomId).toBe(id);
				expect(task.prompt).not.toMatch(/undefined|NaN|Infinity/);
				expect(task.correctAnswer).not.toMatch(/undefined|NaN|Infinity/);
				if (task.choices) {
					// one of the offered choices must be accepted as the correct answer
					const accepted = task.choices.filter((c) =>
						checkAnswer(c, task.correctAnswer, task.answerType)
					);
					expect(accepted.length).toBeGreaterThan(0);
				}
			}
		}
	});
});
