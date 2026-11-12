import { describe, it, expect } from 'vitest';
import { generateTask, registeredAtomIds } from './generators.js';

/**
 * Every generated task must be able to answer "Warum?": either a `why` text written for the
 * concrete task, or a worked solution (`inputData.steps` / pq sub-steps) the UI shows instead.
 */
describe('task rationale ("Warum?")', () => {
	for (const atomId of registeredAtomIds) {
		it(`${atomId} explains every task`, () => {
			for (let stage = 0; stage <= 5; stage++) {
				for (let i = 0; i < 40; i++) {
					const task = generateTask(atomId, stage)!;
					const steps = task.inputData?.steps;
					const hasSteps = Array.isArray(steps) && steps.length > 0;
					const label = `stage ${stage}: ${task.prompt}`;
					if (!hasSteps) {
						expect(task.why, label).toBeTypeOf('string');
						expect(task.why!.trim().length, label).toBeGreaterThan(15);
					}
					if (task.why) {
						expect(task.why, label).not.toMatch(/undefined|NaN|null|Infinity|\[object/);
						// short enough to read at a glance
						expect(task.why.length, `${label} → ${task.why}`).toBeLessThanOrEqual(330);
						// balanced inline-math delimiters
						expect(task.why.split('\\(').length, label).toBe(task.why.split('\\)').length);
					}
				}
			}
		});
	}
});
