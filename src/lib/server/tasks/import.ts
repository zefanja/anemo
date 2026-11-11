/**
 * Task import: validates and bulk-inserts tasks from JSON.
 *
 * Exchange format (array of objects):
 * {
 *   "atom_id":        "arithmetik__brueche_add_sub_gleichnamig",  // required
 *   "prompt":         "3/7 + 2/7 = ?",                            // required
 *   "answer_type":    "fraction",                                  // "integer"|"number"|"fraction"|"text"|"boolean"|"comparison"
 *   "correct_answer": "5/7",                                       // required
 *   "distractors":    ["4/7", "6/7"],                             // optional
 *   "hint":           "Gleichnamige Brüche: Zähler addieren.",     // optional
 *   "difficulty":     0.4                                          // optional 0–1
 * }
 *
 * Idempotent: tasks are identified by SHA-256 hash of (atom_id + prompt + correct_answer).
 * Unknown atom_ids cause the entire import to fail (atomic).
 */

import { createHash } from 'node:crypto';
import { db } from '../db/index.js';
import { tasks, atoms } from '../db/schema.js';
import { inArray } from 'drizzle-orm';

export interface TaskImportRow {
	atom_id: string;
	prompt: string;
	answer_type: 'integer' | 'number' | 'fraction' | 'text' | 'boolean' | 'comparison';
	correct_answer: string;
	distractors?: string[];
	hint?: string;
	difficulty?: number;
	// accepted absolute deviation for integer/number answers (e.g. 0.05); omit for exact match
	tolerance?: number;
}

export interface ImportResult {
	inserted: number;
	skipped: number;
	errors: string[];
}

function contentHash(row: TaskImportRow): string {
	return createHash('sha256')
		.update(`${row.atom_id}|${row.prompt}|${row.correct_answer}`)
		.digest('hex')
		.slice(0, 32);
}

export async function importTasks(rows: TaskImportRow[]): Promise<ImportResult> {
	const errors: string[] = [];

	// Validate structure
	for (let i = 0; i < rows.length; i++) {
		const r = rows[i];
		if (!r.atom_id) errors.push(`Row ${i}: missing atom_id`);
		if (!r.prompt) errors.push(`Row ${i}: missing prompt`);
		if (!r.correct_answer) errors.push(`Row ${i}: missing correct_answer`);
		if (!['integer', 'number', 'fraction', 'text', 'boolean', 'comparison'].includes(r.answer_type)) {
			errors.push(`Row ${i}: invalid answer_type "${r.answer_type}"`);
		}
		if (r.tolerance !== undefined && (typeof r.tolerance !== 'number' || !(r.tolerance >= 0))) {
			errors.push(`Row ${i}: tolerance must be a non-negative number`);
		}
	}
	if (errors.length > 0) return { inserted: 0, skipped: 0, errors };

	// Validate all atom_ids exist
	const atomIds = [...new Set(rows.map(r => r.atom_id))];
	const existingAtoms = await db.query.atoms.findMany({
		where: (a, { inArray }) => inArray(a.id, atomIds),
		columns: { id: true }
	});
	const knownIds = new Set(existingAtoms.map(a => a.id));
	for (const id of atomIds) {
		if (!knownIds.has(id)) errors.push(`Unknown atom_id: "${id}"`);
	}
	if (errors.length > 0) return { inserted: 0, skipped: 0, errors };

	// Upsert with content-hash deduplication
	let inserted = 0, skipped = 0;
	const { randomUUID } = await import('node:crypto');

	for (const row of rows) {
		const hash = contentHash(row);
		const result = await db
			.insert(tasks)
			.values({
				id: randomUUID(),
				atomId: row.atom_id,
				prompt: row.prompt,
				answerType: row.answer_type,
				correctAnswer: row.correct_answer,
				distractors: row.distractors ?? null,
				hint: row.hint ?? null,
				difficulty: row.difficulty ?? null,
				tolerance: row.tolerance ?? null,
				contentHash: hash,
				importedAt: new Date()
			})
			.onConflictDoNothing({ target: tasks.contentHash })
			.returning({ id: tasks.id });

		if (result.length > 0) inserted++;
		else skipped++;
	}

	return { inserted, skipped, errors: [] };
}
