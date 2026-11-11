#!/usr/bin/env tsx
/**
 * Imports all atoms from math-knowledge-graph/atoms/*.yaml and
 * edges from math-knowledge-graph/edges.csv into the database.
 *
 * Idempotent: re-running updates atoms where the YAML version is higher,
 * upserts edges unconditionally (edge_type/mastery_level_needed may change)
 * and deletes edges that are no longer listed in edges.csv.
 * Validates referential integrity and acyclicity before writing anything.
 * Aborts with a non-zero exit code on any validation error.
 */

import { readFileSync, readdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/lib/server/db/schema.js';
import { config } from 'dotenv';
import { and, eq, sql } from 'drizzle-orm';

config({ path: '.env' });

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ATOMS_DIR = join(ROOT, 'math-knowledge-graph', 'atoms');
const EDGES_FILE = join(ROOT, 'math-knowledge-graph', 'edges.csv');

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawAtom {
	id: string;
	label: string;
	description?: string;
	domain: string;
	subdomain?: string;
	level: 'atom' | 'cluster';
	granularity?: number;
	schulformen?: string[];
	jahrgangsstufen?: number[];
	weight?: {
		mastery_required?: number;
		curriculum_centrality?: number;
		transfer_value?: number;
		cognitive_load?: number;
	};
	lehrplan_ref?: unknown;
	related?: unknown;
	tags?: string[];
	status?: string;
	created_by?: string;
	version?: number;
}

interface RawEdge {
	source_id: string;
	target_id: string;
	edge_type: 'required' | 'helpful' | 'deepens';
	mastery_level_needed: number;
}

// ── Parsing ───────────────────────────────────────────────────────────────────

function parseAtoms(): RawAtom[] {
	const files = readdirSync(ATOMS_DIR).filter((f) => f.endsWith('.yaml'));
	return files.map((file) => {
		const raw = yaml.load(readFileSync(join(ATOMS_DIR, file), 'utf8')) as RawAtom;
		if (!raw.id) throw new Error(`Missing id in ${file}`);
		return raw;
	});
}

function parseEdges(): RawEdge[] {
	const lines = readFileSync(EDGES_FILE, 'utf8').trim().split('\n');
	return lines.slice(1).map((line) => {
		const [source_id, target_id, edge_type, mastery_level_needed] = line.split(',');
		return {
			source_id: source_id.trim(),
			target_id: target_id.trim(),
			edge_type: edge_type.trim() as RawEdge['edge_type'],
			mastery_level_needed: parseFloat(mastery_level_needed.trim())
		};
	});
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateIntegrity(atoms: RawAtom[], edges: RawEdge[]): void {
	const atomIds = new Set(atoms.map((a) => a.id));
	const errors: string[] = [];
	for (const edge of edges) {
		if (!atomIds.has(edge.source_id)) errors.push(`Edge source not found: ${edge.source_id}`);
		if (!atomIds.has(edge.target_id)) errors.push(`Edge target not found: ${edge.target_id}`);
	}
	if (errors.length > 0) {
		console.error('Referential integrity errors:');
		errors.forEach((e) => console.error('  ', e));
		process.exit(1);
	}
}

function validateAcyclicity(atoms: RawAtom[], edges: RawEdge[]): void {
	const adj = new Map<string, string[]>();
	for (const a of atoms) adj.set(a.id, []);
	for (const e of edges) adj.get(e.source_id)!.push(e.target_id);

	const WHITE = 0, GRAY = 1, BLACK = 2;
	const color = new Map<string, number>(atoms.map((a) => [a.id, WHITE]));
	const cyclePath: string[] = [];

	function dfs(node: string): boolean {
		color.set(node, GRAY);
		for (const neighbor of adj.get(node) ?? []) {
			if (color.get(neighbor) === GRAY) {
				cyclePath.push(neighbor, node);
				return true;
			}
			if (color.get(neighbor) === WHITE && dfs(neighbor)) {
				cyclePath.push(node);
				return true;
			}
		}
		color.set(node, BLACK);
		return false;
	}

	for (const a of atoms) {
		if (color.get(a.id) === WHITE && dfs(a.id)) {
			console.error(`Cycle detected: ${cyclePath.reverse().join(' → ')}`);
			process.exit(1);
		}
	}
}

// ── Import ────────────────────────────────────────────────────────────────────

const BATCH = 50;

async function importGraph(): Promise<void> {
	const forceUpdate = process.argv.includes('--update');

	const client = postgres(process.env.DATABASE_URL!);
	const db = drizzle(client, { schema });

	if (!forceUpdate) {
		const existing = await db.query.atoms.findFirst();
		if (existing) {
			console.log('Graph already in DB – skipping. Use --update to force re-import.');
			await client.end();
			return;
		}
	}

	console.log('Parsing atoms...');
	const atoms = parseAtoms();
	console.log(`  Found ${atoms.length} atoms`);

	console.log('Parsing edges...');
	const edges = parseEdges();
	console.log(`  Found ${edges.length} edges`);

	console.log('Validating referential integrity...');
	validateIntegrity(atoms, edges);
	console.log('  ✓ OK');

	console.log('Validating acyclicity...');
	validateAcyclicity(atoms, edges);
	console.log('  ✓ OK');

	// ── Atoms: upsert, but only overwrite if incoming version > stored version ──
	console.log('Importing atoms...');
	let atomsProcessed = 0;

	for (let i = 0; i < atoms.length; i += BATCH) {
		const batch = atoms.slice(i, i + BATCH);
		const values = batch.map((atom) => ({
			id: atom.id,
			label: atom.label,
			description: atom.description ?? null,
			domain: atom.domain,
			subdomain: atom.subdomain ?? null,
			level: atom.level,
			granularity: atom.granularity ?? null,
			schulformen: atom.schulformen ?? null,
			jahrgangsstufen: atom.jahrgangsstufen ?? null,
			masteryRequired: atom.weight?.mastery_required ?? 0.8,
			curriculumCentrality: atom.weight?.curriculum_centrality ?? 0.5,
			transferValue: atom.weight?.transfer_value ?? 0.5,
			cognitiveLoad: atom.weight?.cognitive_load ?? 0.5,
			lehrplanRef: atom.lehrplan_ref ?? null,
			related: atom.related ?? null,
			tags: atom.tags ?? null,
			status: atom.status ?? 'draft',
			createdBy: atom.created_by ?? null,
			version: atom.version ?? 1
		}));

		await db
			.insert(schema.atoms)
			.values(values)
			.onConflictDoUpdate({
				target: schema.atoms.id,
				set: {
					label: sql`CASE WHEN excluded.version > atoms.version THEN excluded.label ELSE atoms.label END`,
					description: sql`CASE WHEN excluded.version > atoms.version THEN excluded.description ELSE atoms.description END`,
					domain: sql`CASE WHEN excluded.version > atoms.version THEN excluded.domain ELSE atoms.domain END`,
					subdomain: sql`CASE WHEN excluded.version > atoms.version THEN excluded.subdomain ELSE atoms.subdomain END`,
					level: sql`CASE WHEN excluded.version > atoms.version THEN excluded.level ELSE atoms.level END`,
					granularity: sql`CASE WHEN excluded.version > atoms.version THEN excluded.granularity ELSE atoms.granularity END`,
					schulformen: sql`CASE WHEN excluded.version > atoms.version THEN excluded.schulformen ELSE atoms.schulformen END`,
					jahrgangsstufen: sql`CASE WHEN excluded.version > atoms.version THEN excluded.jahrgangsstufen ELSE atoms.jahrgangsstufen END`,
					masteryRequired: sql`CASE WHEN excluded.version > atoms.version THEN excluded.mastery_required ELSE atoms.mastery_required END`,
					curriculumCentrality: sql`CASE WHEN excluded.version > atoms.version THEN excluded.curriculum_centrality ELSE atoms.curriculum_centrality END`,
					transferValue: sql`CASE WHEN excluded.version > atoms.version THEN excluded.transfer_value ELSE atoms.transfer_value END`,
					cognitiveLoad: sql`CASE WHEN excluded.version > atoms.version THEN excluded.cognitive_load ELSE atoms.cognitive_load END`,
					lehrplanRef: sql`CASE WHEN excluded.version > atoms.version THEN excluded.lehrplan_ref ELSE atoms.lehrplan_ref END`,
					related: sql`CASE WHEN excluded.version > atoms.version THEN excluded.related ELSE atoms.related END`,
					tags: sql`CASE WHEN excluded.version > atoms.version THEN excluded.tags ELSE atoms.tags END`,
					status: sql`CASE WHEN excluded.version > atoms.version THEN excluded.status ELSE atoms.status END`,
					createdBy: sql`CASE WHEN excluded.version > atoms.version THEN excluded.created_by ELSE atoms.created_by END`,
					version: sql`CASE WHEN excluded.version > atoms.version THEN excluded.version ELSE atoms.version END`
				}
			});

		atomsProcessed += batch.length;
		process.stdout.write(`\r  ${atomsProcessed}/${atoms.length}`);
	}
	console.log(`\n  Done.`);

	// ── Edges: always upsert (edge_type/mastery_level_needed can change) ─────
	console.log('Importing edges...');
	let edgesProcessed = 0;

	for (let i = 0; i < edges.length; i += BATCH) {
		const batch = edges.slice(i, i + BATCH);
		await db
			.insert(schema.edges)
			.values(
				batch.map((e) => ({
					sourceId: e.source_id,
					targetId: e.target_id,
					edgeType: e.edge_type,
					masteryLevelNeeded: e.mastery_level_needed
				}))
			)
			.onConflictDoUpdate({
				target: [schema.edges.sourceId, schema.edges.targetId],
				set: {
					edgeType: sql`excluded.edge_type`,
					masteryLevelNeeded: sql`excluded.mastery_level_needed`
				}
			});

		edgesProcessed += batch.length;
		process.stdout.write(`\r  ${edgesProcessed}/${edges.length}`);
	}
	console.log(`\n  Done.`);

	// ── Edges: remove edges that no longer exist in edges.csv ────────────────
	// Without this, an edge that was rewired or dropped in the YAML sources would
	// stay in the DB forever and keep gating the frontier.
	const wanted = new Set(edges.map((e) => `${e.source_id}→${e.target_id}`));
	const stored = await db.query.edges.findMany({ columns: { sourceId: true, targetId: true } });
	const stale = stored.filter((e) => !wanted.has(`${e.sourceId}→${e.targetId}`));
	for (const e of stale) {
		await db
			.delete(schema.edges)
			.where(and(eq(schema.edges.sourceId, e.sourceId), eq(schema.edges.targetId, e.targetId)));
	}
	console.log(`Removed ${stale.length} stale edge(s).`);

	await client.end();
	console.log('\n✓ Graph import complete.');
}

importGraph().catch((err) => {
	console.error('\nImport failed:', err.message);
	process.exit(1);
});
