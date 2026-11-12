#!/usr/bin/env tsx
/**
 * Generates short atom explanations via the Claude API and writes them to
 * explanations-output.json, ready for import at /teacher/atoms/import.
 *
 * Requirements:
 *   ANTHROPIC_API_KEY in .env or environment
 *
 * Usage:
 *   npx tsx scripts/generate-explanations.ts
 *   npx tsx scripts/generate-explanations.ts --domain arithmetik
 *   npx tsx scripts/generate-explanations.ts --missing   (only atoms without explanation)
 *
 * Output: explanations-output.json
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { config } from 'dotenv';

config({ path: '.env' });

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ATOMS_DIR = join(ROOT, 'math-knowledge-graph', 'atoms');
const OUTPUT_FILE = join(ROOT, 'explanations-output.json');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
	console.error('Error: ANTHROPIC_API_KEY not set in .env');
	process.exit(1);
}

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const domainFilter = args.includes('--domain') ? args[args.indexOf('--domain') + 1] : null;
const missingOnly = args.includes('--missing');

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawAtom {
	id: string;
	label: string;
	description?: string;
	domain: string;
	subdomain?: string;
	level: 'atom' | 'cluster';
	tags?: string[];
}

interface ExplanationRow {
	atom_id: string;
	explanation: string;
}

// ── Load atoms ────────────────────────────────────────────────────────────────

function loadAtoms(): RawAtom[] {
	const files = readdirSync(ATOMS_DIR).filter((f) => f.endsWith('.yaml'));
	return files
		.map((f) => yaml.load(readFileSync(join(ATOMS_DIR, f), 'utf8')) as RawAtom)
		.filter((a) => a.level === 'atom') // clusters haben keine eigenen Aufgaben
		.filter((a) => !domainFilter || a.domain === domainFilter);
}

// ── Load existing output (for --missing) ──────────────────────────────────────

function loadExistingOutput(): Set<string> {
	try {
		const rows: ExplanationRow[] = JSON.parse(readFileSync(OUTPUT_FILE, 'utf8'));
		return new Set(rows.map((r) => r.atom_id));
	} catch {
		return new Set();
	}
}

// ── Claude API call ───────────────────────────────────────────────────────────

async function generateExplanation(atom: RawAtom): Promise<string> {
	const systemPrompt = `Du bist ein erfahrener Mathematiklehrer. Du schreibst kurze, klare Erklärungen für Lernende (Schüler:innen).

Regeln:
- Maximal 3 kurze Absätze, getrennt durch Leerzeilen (\\n\\n)
- Erkläre das Konzept verständlich, ohne Fachjargon zu übertreiben
- Füge 1–2 konkrete Mini-Beispiele direkt im Text ein
- Mathematische Ausdrücke mit LaTeX: inline $…$, Display $$…$$
- Keine Markdown-Formatierung (keine **, *, #, -, Listen)
- Sprich die Lernenden direkt an ("du", "wenn du", "stell dir vor")
- Auf Deutsch`;

	const userPrompt = `Schreibe eine kurze Erklärung für das folgende Lern-Atom:

Name: ${atom.label}
Beschreibung: ${atom.description ?? '(keine)'}
Domain: ${atom.domain}${atom.subdomain ? ` / ${atom.subdomain}` : ''}
Tags: ${atom.tags?.join(', ') ?? '(keine)'}

Erklärung:`;

	const response = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': ANTHROPIC_API_KEY!,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model: 'claude-haiku-4-5-20251001',
			max_tokens: 400,
			system: systemPrompt,
			messages: [{ role: 'user', content: userPrompt }]
		})
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`API error ${response.status}: ${body}`);
	}

	const data = (await response.json()) as {
		content: Array<{ type: string; text: string }>;
	};
	return data.content
		.filter((b) => b.type === 'text')
		.map((b) => b.text)
		.join('')
		.trim();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
	const atoms = loadAtoms();
	console.log(`Found ${atoms.length} atoms${domainFilter ? ` in domain "${domainFilter}"` : ''}`);

	let toProcess = atoms;
	if (missingOnly) {
		const existing = loadExistingOutput();
		toProcess = atoms.filter((a) => !existing.has(a.id));
		console.log(`Skipping ${atoms.length - toProcess.length} already processed, ${toProcess.length} remaining`);
	}

	if (toProcess.length === 0) {
		console.log('Nothing to do.');
		return;
	}

	// Load existing rows to merge with
	let existingRows: ExplanationRow[] = [];
	if (missingOnly) {
		try {
			existingRows = JSON.parse(readFileSync(OUTPUT_FILE, 'utf8'));
		} catch {
			/* file doesn't exist yet */
		}
	}

	const results: ExplanationRow[] = [...existingRows];
	let done = 0;

	for (const atom of toProcess) {
		process.stdout.write(`\r[${done + 1}/${toProcess.length}] ${atom.id.slice(0, 60).padEnd(60)}`);
		try {
			const explanation = await generateExplanation(atom);
			results.push({ atom_id: atom.id, explanation });
		} catch (err) {
			console.error(`\nError for ${atom.id}: ${(err as Error).message}`);
		}
		done++;
		// Polite rate-limit pause
		await new Promise((r) => setTimeout(r, 300));
	}

	console.log(`\nWriting ${results.length} explanations to ${OUTPUT_FILE}`);
	writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), 'utf8');
	console.log('Done. Import the file at /teacher/atoms/import');
}

main().catch((err) => {
	console.error('\nFailed:', err.message);
	process.exit(1);
});
