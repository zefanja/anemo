import { describe, it, expect } from 'vitest';
import { generateTask } from '$lib/server/tasks/generators.js';

// Verifies the DI-style expanding sequence: each stage must only ever produce
// its own variant (never leak into a harder/easier one), and stages beyond
// the last authored one must clamp to the hardest variant instead of
// erroring or wrapping around.
const REPEATS = 25;

function samples(atomId: string, stage: number) {
	return Array.from({ length: REPEATS }, () => generateTask(atomId, stage)!);
}

describe('arithmetik__runden_natuerliche_zahlen stages', () => {
	it('stage 0 always rounds to tens', () => {
		for (const t of samples('arithmetik__runden_natuerliche_zahlen', 0)) {
			expect(t.prompt).toContain('auf 10er');
		}
	});
	it('stage 1 always rounds to hundreds', () => {
		for (const t of samples('arithmetik__runden_natuerliche_zahlen', 1)) {
			expect(t.prompt).toContain('auf 100er');
		}
	});
	it('stage 2 and beyond always round to thousands', () => {
		for (const stage of [2, 3, 10]) {
			for (const t of samples('arithmetik__runden_natuerliche_zahlen', stage)) {
				expect(t.prompt).toContain('auf 1000er');
			}
		}
	});
});

describe('arithmetik__einmaleins_ableiten stages', () => {
	const expected: [number, number][] = [
		[2, 3], [5, 6], [2, 4], [4, 8], [5, 7], [10, 9]
	];
	it.each(expected.map((pair, i) => [i, pair] as const))(
		'stage %i always uses base/derived %j',
		(stage, [base, derived]) => {
			for (const t of samples('arithmetik__einmaleins_ableiten', stage)) {
				expect(t.prompt).toContain(`${base} ·`);
				expect(t.prompt).toContain(`${derived} ·`);
			}
		}
	);
	it('stage beyond the last strategy clamps to the hardest one', () => {
		for (const t of samples('arithmetik__einmaleins_ableiten', 99)) {
			expect(t.prompt).toContain('10 ·');
			expect(t.prompt).toContain('9 ·');
		}
	});
});

describe('arithmetik__schriftliche_multiplikation stages', () => {
	it('stage 0 uses a single-digit multiplier', () => {
		for (const t of samples('arithmetik__schriftliche_multiplikation', 0)) {
			const b = Number(t.prompt.split('·')[1].split('=')[0].trim());
			expect(b).toBeGreaterThanOrEqual(2);
			expect(b).toBeLessThanOrEqual(9);
		}
	});
	it('stage 1 uses a two-digit multiplier', () => {
		for (const t of samples('arithmetik__schriftliche_multiplikation', 1)) {
			const b = Number(t.prompt.split('·')[1].split('=')[0].trim());
			expect(b).toBeGreaterThanOrEqual(11);
			expect(b).toBeLessThanOrEqual(39);
		}
	});
	it('stage 2 and beyond uses a three-digit multiplicand', () => {
		for (const stage of [2, 5]) {
			for (const t of samples('arithmetik__schriftliche_multiplikation', stage)) {
				const b = Number(t.prompt.split('·')[1].split('=')[0].trim());
				expect(b).toBeGreaterThanOrEqual(101);
				expect(b).toBeLessThanOrEqual(299);
			}
		}
	});
});

describe('arithmetik__vorrangregeln stages', () => {
	it('stage 0 is always Punkt-vor-Strich (addition first)', () => {
		for (const t of samples('arithmetik__vorrangregeln', 0)) {
			expect(t.prompt).toContain('Punkt vor Strich');
		}
	});
	it('stage 1 always has parentheses', () => {
		for (const t of samples('arithmetik__vorrangregeln', 1)) {
			expect(t.prompt).toContain('(');
		}
	});
	it('stage 2 and beyond is always the subtraction variant', () => {
		for (const stage of [2, 4]) {
			for (const t of samples('arithmetik__vorrangregeln', stage)) {
				expect(t.prompt).toContain('−');
				expect(t.prompt).not.toContain('(');
			}
		}
	});
});

describe('algebra__terme_zusammenfassen stages', () => {
	it('stage 0 only adds same-variable terms (x)', () => {
		for (const t of samples('algebra__terme_zusammenfassen', 0)) {
			expect(t.prompt).toContain('x + ');
		}
	});
	it('stage 1 only subtracts same-variable terms (a)', () => {
		for (const t of samples('algebra__terme_zusammenfassen', 1)) {
			expect(t.prompt).toContain('a −');
		}
	});
	it('stage 2 and beyond mixes two variables (a and b)', () => {
		for (const stage of [2, 6]) {
			for (const t of samples('algebra__terme_zusammenfassen', stage)) {
				expect(t.prompt).toContain('a +');
				expect(t.prompt).toContain('b');
			}
		}
	});
});

describe('algebra__ausmultiplizieren_distributiv stages', () => {
	it('stage 0 is always a(x+b)', () => {
		for (const t of samples('algebra__ausmultiplizieren_distributiv', 0)) {
			expect(t.prompt).toContain('x + ');
		}
	});
	it('stage 1 is always a(x−b)', () => {
		for (const t of samples('algebra__ausmultiplizieren_distributiv', 1)) {
			expect(t.prompt).toContain('x −');
		}
	});
	it('stage 2 and beyond is always (x+p)(x+q)', () => {
		for (const stage of [2, 5]) {
			for (const t of samples('algebra__ausmultiplizieren_distributiv', stage)) {
				expect(t.prompt).toContain('(x + ');
				expect(t.prompt).toContain(')(x + ');
			}
		}
	});
});

describe('algebra__lineare_gleichung_zweischritt stages', () => {
	it('stage 0 keeps b and x positive', () => {
		for (const t of samples('algebra__lineare_gleichung_zweischritt', 0)) {
			expect(t.prompt).toContain('+');
			expect(t.prompt).not.toContain('-');
			expect(Number(t.correctAnswer)).toBeGreaterThan(0);
		}
	});
	it('stage 1 makes b negative, x stays positive', () => {
		for (const t of samples('algebra__lineare_gleichung_zweischritt', 1)) {
			expect(t.prompt).toContain('-');
			expect(Number(t.correctAnswer)).toBeGreaterThan(0);
		}
	});
	it('stage 2 makes x negative, b positive', () => {
		for (const t of samples('algebra__lineare_gleichung_zweischritt', 2)) {
			expect(Number(t.correctAnswer)).toBeLessThan(0);
		}
	});
});
