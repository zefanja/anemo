#!/usr/bin/env tsx
/**
 * Imports the atom explanations from math-knowledge-graph/explanations.json into the database.
 *
 * Usage:
 *   npx tsx scripts/import-explanations.ts             overwrite all explanation texts
 *   npx tsx scripts/import-explanations.ts --missing   only fill atoms that have no explanation yet
 *
 * Illustrations (illustration_config) already stored in the DB are kept unless a row in the
 * JSON file brings its own.
 */

import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/lib/server/db/schema.js';
import { config } from 'dotenv';

config({ path: '.env' });

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(resolve(__dirname, '..'), 'math-knowledge-graph', 'explanations.json');

interface Row {
	atom_id: string;
	explanation: string;
	illustration_config?: Record<string, unknown>;
}

async function main(): Promise<void> {
	const missingOnly = process.argv.includes('--missing');
	const rows: Row[] = JSON.parse(readFileSync(FILE, 'utf8'));

	const client = postgres(process.env.DATABASE_URL!);
	const db = drizzle(client, { schema });

	const stored = await db.query.atoms.findMany({ columns: { id: true, explanation: true } });
	const current = new Map(stored.map((a) => [a.id, a.explanation]));

	let updated = 0, kept = 0, unknown = 0;
	for (const row of rows) {
		if (!current.has(row.atom_id)) { unknown++; continue; }
		if (missingOnly && current.get(row.atom_id)?.trim()) { kept++; continue; }
		await db
			.update(schema.atoms)
			.set({
				explanation: row.explanation.trim(),
				...(row.illustration_config ? { illustrationConfig: row.illustration_config } : {})
			})
			.where(eq(schema.atoms.id, row.atom_id));
		updated++;
	}

	await client.end();
	console.log(`✓ ${updated} explanation(s) written, ${kept} existing kept, ${unknown} unknown atom id(s) skipped.`);
	if (unknown > 0) console.log('  Run "npm run import-graph -- --update" first so that all atoms exist.');
}

main().catch((err) => {
	console.error('Import failed:', err.message);
	process.exit(1);
});
