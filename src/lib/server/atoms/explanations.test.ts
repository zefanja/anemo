import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

const ROOT = join(process.cwd(), 'math-knowledge-graph');
const rows: { atom_id: string; explanation: string }[] = JSON.parse(readFileSync(join(ROOT, 'explanations.json'), 'utf8'));
const practicable = readdirSync(join(ROOT, 'atoms'))
	.filter((f) => f.endsWith('.yaml'))
	.map((f) => yaml.load(readFileSync(join(ROOT, 'atoms', f), 'utf8')) as { id: string; level: string })
	.filter((a) => a.level === 'atom')
	.map((a) => a.id);

describe('math-knowledge-graph/explanations.json', () => {
	it('has exactly one explanation for every practicable atom', () => {
		const ids = rows.map((r) => r.atom_id);
		expect(new Set(ids).size).toBe(ids.length);
		expect([...ids].sort()).toEqual([...practicable].sort());
	});

	it('keeps every explanation short and renderable', () => {
		for (const r of rows) {
			const t = r.explanation;
			expect(t.length, r.atom_id).toBeGreaterThanOrEqual(100);
			expect(t.length, r.atom_id).toBeLessThanOrEqual(420); // "kurz und kompakt"
			expect(t.split(/\n\n+/).length, r.atom_id).toBeLessThanOrEqual(2);
			expect(t.split('$').length % 2, `${r.atom_id}: unbalanced $`).toBe(1);
			expect(t, r.atom_id).not.toMatch(/\*\*|^#|^[-*] /m); // no Markdown
		}
	});
});
