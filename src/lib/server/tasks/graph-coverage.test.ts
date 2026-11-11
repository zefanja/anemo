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
	const STAGES = 6;
	const SAMPLES = 120;

	it.each(registeredAtomIds)('%s yields well-formed tasks at every stage', (id) => {
		for (let stage = 0; stage < STAGES; stage++) {
			const answers = new Set<string>();
			let binary = true;
			for (let i = 0; i < SAMPLES; i++) {
				const task = generateTask(id, stage)!;
				const text = [task.prompt, task.correctAnswer, task.hint ?? '', ...(task.choices ?? []), JSON.stringify(task.inputData ?? '')].join(' ');
				expect(task.atomId).toBe(id);
				expect(text + (task.svg ?? '')).not.toMatch(/undefined|NaN|Infinity|\[object/);
				// German decimal comma everywhere the student can see a number ("3. Vielfache" is fine)
				expect(text.replace(/\d\. /g, '')).not.toMatch(/\d\.\d/);
				if (task.answerType === 'integer') expect(task.correctAnswer).toMatch(/^-?\d+$/);
				if (task.answerType === 'boolean') expect(['ja', 'nein']).toContain(task.correctAnswer);
				if (task.tolerance !== undefined) {
					// tolerance only makes sense for numeric answers and must stay small relative to the result
					expect(['integer', 'number']).toContain(task.answerType);
					expect(task.tolerance).toBeGreaterThanOrEqual(0);
					expect(task.tolerance).toBeLessThanOrEqual(Math.max(0.1, Math.abs(parseFloat(task.correctAnswer.replace(',', '.'))) * 0.001 + 0.01));
				}
				if (task.choices) {
					// exactly one offered choice is accepted — answers are compared case-insensitively,
					// so "b = A : a" and "b = a : A" would both count as correct
					const accepted = task.choices.filter((c) => checkAnswer(c, task.correctAnswer, task.answerType));
					expect(accepted, `${task.prompt} ${JSON.stringify(task.choices)}`).toHaveLength(1);
					if (task.answerType === 'text') expect(task.choices).toContain(task.correctAnswer);
				}
				if (!(task.answerType === 'boolean' || task.answerType === 'comparison' || task.choices?.length === 2)) binary = false;
				answers.add(task.correctAnswer);
			}
			// A stage whose tasks are all two-way decisions must not always have the same answer,
			// otherwise it can be mastered by always pressing the same button.
			if (binary) expect(answers.size, `stage ${stage} always answers "${[...answers][0]}"`).toBeGreaterThan(1);
		}
	});
});
