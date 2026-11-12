/**
 * Atom explanation import: validates and bulk-updates explanations from JSON.
 *
 * Exchange format (array of objects):
 * {
 *   "atom_id":            "arithmetik__brueche_add_sub_gleichnamig",  // required
 *   "explanation":        "Gleichnamige Brüche haben denselben Nenner…", // required
 *   "illustration_config": { "type": "fraction_bar", "parts": 7 }        // optional
 * }
 *
 * Overwrites existing explanation texts unconditionally (last-write wins). An illustration
 * already stored for the atom is kept unless the row brings its own illustration_config.
 * Unknown atom_ids cause the entire import to fail (atomic).
 */

import { db } from '../db/index.js';
import { atoms } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export interface ExplanationImportRow {
	atom_id: string;
	explanation: string;
	illustration_config?: Record<string, unknown>;
}

export interface ExplanationImportResult {
	updated: number;
	skipped: number;
	errors: string[];
}

export async function importExplanations(
	rows: ExplanationImportRow[]
): Promise<ExplanationImportResult> {
	const errors: string[] = [];

	for (let i = 0; i < rows.length; i++) {
		const r = rows[i];
		if (!r.atom_id) errors.push(`Row ${i}: missing atom_id`);
		if (!r.explanation?.trim()) errors.push(`Row ${i}: missing explanation`);
	}
	if (errors.length > 0) return { updated: 0, skipped: 0, errors };

	const atomIds = [...new Set(rows.map((r) => r.atom_id))];
	const existing = await db.query.atoms.findMany({
		where: (a, { inArray }) => inArray(a.id, atomIds),
		columns: { id: true }
	});
	const knownIds = new Set(existing.map((a) => a.id));
	for (const id of atomIds) {
		if (!knownIds.has(id)) errors.push(`Unknown atom_id: "${id}"`);
	}
	if (errors.length > 0) return { updated: 0, skipped: 0, errors };

	let updated = 0,
		skipped = 0;

	for (const row of rows) {
		const result = await db
			.update(atoms)
			.set({
				explanation: row.explanation.trim(),
				...(row.illustration_config ? { illustrationConfig: row.illustration_config } : {})
			})
			.where(eq(atoms.id, row.atom_id))
			.returning({ id: atoms.id });

		if (result.length > 0) updated++;
		else skipped++;
	}

	return { updated, skipped, errors: [] };
}
