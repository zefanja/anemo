import { describe, it, expect } from 'vitest';
import {
	parseEquation, findStepEquation, applyStep, status, bestStep, stepChoices,
	parseOperand, equationTex, stepTex, formatAnswer, q, type Equation, type Step
} from './equation.js';

const p = (tex: string) => {
	const e = parseEquation(tex);
	if (!e) throw new Error(`could not parse ${tex}`);
	return e;
};

/** Follow bestStep until solved; returns the TeX of every line. */
function solve(e: Equation): { lines: string[]; result: ReturnType<typeof status> } {
	const lines = [equationTex(e)];
	for (let i = 0; i < 10; i++) {
		const step = bestStep(e);
		if (!step) break;
		e = applyStep(e, step);
		lines.push(equationTex(e));
	}
	return { lines, result: status(e) };
}

describe('parseEquation', () => {
	it('keeps a bracket with its factor', () => {
		expect(equationTex(p('4(x + 1) = 8'))).toBe('4(x + 1) = 8');
	});
	it('reads fractions, implicit multiplication and unicode minus', () => {
		expect(equationTex(p('\\frac{x}{3} + 5 = 7'))).toBe('\\frac{x}{3} + 5 = 7');
		expect(equationTex(p('7x −3 = 2x + 12'))).toBe('7x - 3 = 2x + 12');
		expect(equationTex(p('2 \\cdot x = 6'))).toBe('2x = 6');
		expect(equationTex(p('\\frac{x}{6} = \\frac{2}{3}'))).toBe('\\frac{x}{6} = \\frac{2}{3}');
	});
	it('keeps a fraction bar over a sum as a bracket', () => {
		expect(equationTex(p('\\frac{x + 1}{2} = 3'))).toBe('\\frac{x + 1}{2} = 3');
	});
	it('rejects non-linear or foreign input', () => {
		expect(parseEquation('x^2 = 4')).toBeNull();
		expect(parseEquation('\\frac{2}{3} = \\frac{4}{x}')).toBeNull();
		expect(parseEquation('x \\cdot x = 4')).toBeNull();
		expect(parseEquation('2x + 3')).toBeNull();
		expect(parseEquation('y = 2x + 1')).toBeNull();
	});
});

describe('applyStep', () => {
	it('divides a bracket away: 4(x+1) : 4 → x + 1', () => {
		const e = applyStep(p('4(x + 1) = 8'), { kind: 'div', v: q(4) });
		expect(equationTex(e)).toBe('x + 1 = 2');
	});
	it('expands brackets', () => {
		expect(equationTex(applyStep(p('3(x - 2) = 9'), { kind: 'expand' }))).toBe('3x - 6 = 9');
	});
	it('adds x-terms and combines', () => {
		expect(equationTex(applyStep(p('5x + 2 = 3x + 8'), { kind: 'sub', v: parseOperand('3x')! }))).toBe('2x + 2 = 8');
	});
	it('allows detours and still reaches the solution', () => {
		let e = p('2x + 4 = 10');
		e = applyStep(e, { kind: 'mul', v: q(3) });
		expect(equationTex(e)).toBe('6x + 12 = 30');
		e = applyStep(e, { kind: 'div', v: q(6) });
		expect(equationTex(e)).toBe('x + 2 = 5');
		e = applyStep(e, { kind: 'sub', v: parseOperand('2')! });
		expect(status(e)).toEqual({ kind: 'solved', value: q(3) });
	});
	it('detects "always" and "never"', () => {
		expect(status(applyStep(p('2x + 1 = 2x + 1'), { kind: 'sub', v: parseOperand('2x')! })).kind).toBe('always');
		expect(status(applyStep(p('2x + 1 = 2x + 3'), { kind: 'sub', v: parseOperand('2x')! })).kind).toBe('never');
	});
	it('accepts "c = x" as solved', () => {
		expect(status(p('5 = x'))).toEqual({ kind: 'solved', value: q(5) });
	});
});

describe('bestStep', () => {
	const cases: [string, number][] = [
		['4(x + 1) = 8', 1],
		['3(x + 5) = 2x + 20', 5],
		['3x + 7 = 1', -2],
		['-2x + 3 = 11', -4],
		['5x + 2 = 3x + 8', 3],
		['2x + 9 = 5x', 3],
		['\\frac{x}{4} + 3 = 5', 8],
		['\\frac{x}{6} = \\frac{2}{3}', 4],
		['\\frac{x + 1}{2} = 3', 5],
		['x - 4 = 9', 13]
	];
	for (const [tex, x] of cases) {
		it(`solves ${tex}`, () => {
			const { result } = solve(p(tex));
			expect(result).toEqual({ kind: 'solved', value: q(x) });
		});
	}
	it('uses the textbook route for 4(x+1)=8', () => {
		expect(solve(p('4(x + 1) = 8')).lines).toEqual(['4(x + 1) = 8', 'x + 1 = 2', 'x = 1']);
	});
});

describe('stepChoices', () => {
	it('offers the best step and two different alternatives', () => {
		const c = stepChoices(p('x + 1 = 2'), () => 0)!;
		expect(c.options).toHaveLength(3);
		expect(c.options).toContainEqual(c.best);
		expect(new Set(c.options.map((s: Step) => JSON.stringify(s))).size).toBe(3);
	});
	it('never offers steps that change nothing', () => {
		for (const tex of ['x + 1 = 2', '4(x + 1) = 8', 'x - 1 = 3', '\\frac{x}{2} = 3', '-x = 4']) {
			const c = stepChoices(p(tex))!;
			expect(c.options).toHaveLength(3);
			for (const s of c.options) {
				if (s !== c.best && (s.kind === 'mul' || s.kind === 'div')) expect(Math.abs(s.v.n) === 1 && s.v.d === 1).toBe(false);
			}
		}
	});
});

describe('findStepEquation', () => {
	it('finds the equation in a prompt', () => {
		expect(findStepEquation('Löse: \\(4(x + 1) = 8\\)')?.tex).toBe('4(x + 1) = 8');
		expect(findStepEquation('\\(x + 5 = 12\\)  →  \\(x = ?\\)')?.tex).toBe('x + 5 = 12');
	});
	it('ignores prompts without a solvable linear equation', () => {
		expect(findStepEquation('Löse: \\(x^2 = 16\\)')).toBeNull();
		expect(findStepEquation('Vereinfache: \\(3x + 4x = \\_ \\_ x\\)')).toBeNull();
		expect(findStepEquation('Berechne \\(3x − 2\\) für \\(x = 4\\).')).toBeNull();
		expect(findStepEquation('Löse mit dem Einsetzungsverfahren:\n\\(y = 2x + 1\\)\n\\(3x + y = 11\\)\nGesucht: \\(x = ?\\)')).toBeNull();
		expect(findStepEquation('Wie viele Lösungen hat \\(2x + 1 = 2x + 3\\)?')).toBeNull();
	});
});

describe('parseOperand / output', () => {
	it('reads numbers, fractions, decimals and x-terms', () => {
		expect(parseOperand('3')).toEqual({ a: q(0), b: q(3) });
		expect(parseOperand('-3/4')).toEqual({ a: q(0), b: q(-3, 4) });
		expect(parseOperand('1,5')).toEqual({ a: q(0), b: q(3, 2) });
		expect(parseOperand('2x')).toEqual({ a: q(2), b: q(0) });
		expect(parseOperand('-x')).toEqual({ a: q(-1), b: q(0) });
		expect(parseOperand('')).toBeNull();
		expect(parseOperand('x2')).toBeNull();
		expect(parseOperand('3/0')).toBeNull();
	});
	it('writes the usual annotation', () => {
		expect(stepTex({ kind: 'div', v: q(4) })).toBe(': 4');
		expect(stepTex({ kind: 'mul', v: q(-2) })).toBe('\\cdot (-2)');
		expect(stepTex({ kind: 'sub', v: parseOperand('3x')! })).toBe('- 3x');
	});
	it('formats answers per answer type', () => {
		expect(formatAnswer(q(3), 'integer')).toBe('3');
		expect(formatAnswer(q(3, 4), 'fraction')).toBe('3/4');
		expect(formatAnswer(q(3, 2), 'number')).toBe('1,5');
	});
});
