/**
 * Step-by-step solving of linear equations in one variable (x).
 *
 * The student picks an operation (add / subtract / multiply / divide on both
 * sides, expand brackets, swap sides); this module applies it and writes the
 * simplified result. Brackets of the form k·(ax + b) are kept as a structure
 * until they are expanded or the factor cancels (e.g. 4(x+1) : 4 → x + 1).
 */

// ── Rationals ────────────────────────────────────────────────────────────────

export type Q = { n: number; d: number };

function gcd(a: number, b: number): number {
	a = Math.abs(a);
	b = Math.abs(b);
	while (b) [a, b] = [b, a % b];
	return a || 1;
}

export function q(n: number, d = 1): Q {
	if (d === 0) throw new Error('division by zero');
	if (d < 0) [n, d] = [-n, -d];
	const g = gcd(n, d);
	return { n: n / g, d: d / g };
}

const ZERO = q(0);
const ONE = q(1);
const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Q, b: Q) => q(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n);
const neg = (a: Q) => q(-a.n, a.d);
const isZero = (a: Q) => a.n === 0;
const eqQ = (a: Q, b: Q) => a.n === b.n && a.d === b.d;
const absQ = (a: Q) => q(Math.abs(a.n), a.d);
const isInt = (a: Q) => a.d === 1;

// ── Linear expressions a·x + b ────────────────────────────────────────────────

export type Linear = { a: Q; b: Q };

const lin = (a: Q, b: Q): Linear => ({ a, b });
const L0: Linear = lin(ZERO, ZERO);
const linAdd = (u: Linear, v: Linear) => lin(add(u.a, v.a), add(u.b, v.b));
const linScale = (u: Linear, k: Q) => lin(mul(u.a, k), mul(u.b, k));
const linIsZero = (u: Linear) => isZero(u.a) && isZero(u.b);

/** A bracket k·(inner) whose inner part has an x-term and a constant. */
export type Group = { k: Q; inner: Linear };

/** One side of an equation: brackets plus a fully combined linear rest. */
export type Side = { groups: Group[]; rest: Linear };

export type Equation = { left: Side; right: Side };

function sideValue(s: Side): Linear {
	return s.groups.reduce((acc, g) => linAdd(acc, linScale(g.inner, g.k)), s.rest);
}

/** Fold trivial brackets (factor 1, or inner without x or constant) into the rest. */
function normalizeSide(s: Side): Side {
	let rest = s.rest;
	const groups: Group[] = [];
	for (const g of s.groups) {
		if (isZero(g.k)) continue;
		if (eqQ(g.k, ONE) || isZero(g.inner.a) || isZero(g.inner.b)) rest = linAdd(rest, linScale(g.inner, g.k));
		else groups.push(g);
	}
	return { groups, rest };
}

const hasX = (s: Side) => s.groups.length > 0 || !isZero(s.rest.a);

// ── Parsing (TeX as used in task prompts) ─────────────────────────────────────

type Tok =
	| { t: 'num'; v: Q }
	| { t: 'x' }
	| { t: 'op'; v: '+' | '-' | '*' | '/' }
	| { t: '(' }
	| { t: ')' }
	| { t: 'frac' }
	| { t: '{' }
	| { t: '}' };

class ParseError extends Error {}

function tokenize(src: string): Tok[] {
	const s = src
		.replace(/\\left|\\right|\\,|\\;|\\!|\\ /g, ' ')
		.replace(/\\cdot|\\times|[·×*]/g, '*')
		.replace(/[−–]/g, '-')
		.replace(/\\div|:/g, '/');
	const out: Tok[] = [];
	let i = 0;
	while (i < s.length) {
		const c = s[i];
		if (/\s/.test(c)) { i++; continue; }
		if (s.startsWith('\\frac', i) || s.startsWith('\\dfrac', i) || s.startsWith('\\tfrac', i)) {
			out.push({ t: 'frac' });
			i += s.startsWith('\\frac', i) ? 5 : 6;
			continue;
		}
		const m = /^\d+(?:[.,]\d+)?/.exec(s.slice(i));
		if (m) {
			const [whole, frac = ''] = m[0].split(/[.,]/);
			out.push({ t: 'num', v: q(Number(whole + frac), 10 ** frac.length) });
			i += m[0].length;
			continue;
		}
		if (c === 'x') { out.push({ t: 'x' }); i++; continue; }
		if (c === '+' || c === '-' || c === '*' || c === '/') { out.push({ t: 'op', v: c }); i++; continue; }
		if (c === '(' || c === ')' || c === '{' || c === '}') { out.push({ t: c } as Tok); i++; continue; }
		throw new ParseError(`unexpected "${c}"`);
	}
	return out;
}

/** Intermediate value while parsing: a linear expression, possibly a single bracket. */
type Val = { lin: Linear; group?: Group; plain?: boolean };

class Parser {
	private i = 0;
	constructor(private toks: Tok[]) {}

	private peek() { return this.toks[this.i]; }
	private next() { return this.toks[this.i++]; }
	private expect(t: Tok['t']) {
		const tok = this.next();
		if (!tok || tok.t !== t) throw new ParseError(`expected ${t}`);
	}
	done() { return this.i >= this.toks.length; }

	/** side := term (('+'|'-') term)* — keeps top-level brackets as groups */
	side(): Side {
		const s: Side = { groups: [], rest: L0 };
		let sign = ONE;
		const first = this.peek();
		if (first?.t === 'op' && (first.v === '+' || first.v === '-')) {
			this.next();
			if (first.v === '-') sign = neg(ONE);
		}
		for (;;) {
			const v = this.term();
			if (v.group) s.groups.push({ k: mul(v.group.k, sign), inner: v.group.inner });
			else s.rest = linAdd(s.rest, linScale(v.lin, sign));
			const tok = this.peek();
			if (tok?.t === 'op' && (tok.v === '+' || tok.v === '-')) {
				this.next();
				sign = tok.v === '-' ? neg(ONE) : ONE;
			} else break;
		}
		return normalizeSide(s);
	}

	private sum(): Linear {
		return sideValue(this.side());
	}

	/** term := factor (('*'|'/')? factor)* */
	private term(): Val {
		let v = this.factor();
		for (;;) {
			const tok = this.peek();
			if (tok?.t === 'op' && (tok.v === '*' || tok.v === '/')) {
				this.next();
				const w = this.factor();
				v = tok.v === '*' ? this.times(v, w) : this.over(v, w);
			} else if (tok && (tok.t === 'x' || tok.t === '(' || tok.t === 'frac' || tok.t === 'num')) {
				const w = this.factor();
				v = this.times(v, w);
			} else break;
		}
		return v;
	}

	private times(u: Val, w: Val): Val {
		const uc = isZero(u.lin.a), wc = isZero(w.lin.a);
		if (!uc && !wc) throw new ParseError('not linear');
		const [k, other] = uc ? [u.lin.b, w] : [w.lin.b, u];
		const res = linScale(other.lin, k);
		if (other.group) return { lin: res, group: { k: mul(other.group.k, k), inner: other.group.inner } };
		if (other.plain === false && !isZero(other.lin.a) && !isZero(other.lin.b)) {
			return { lin: res, group: { k, inner: other.lin } };
		}
		return { lin: res };
	}

	private over(u: Val, w: Val): Val {
		if (!isZero(w.lin.a)) throw new ParseError('x in denominator');
		if (isZero(w.lin.b)) throw new ParseError('division by zero');
		return this.times(u, { lin: lin(ZERO, div(ONE, w.lin.b)) });
	}

	private factor(): Val {
		const tok = this.next();
		if (!tok) throw new ParseError('unexpected end');
		if (tok.t === 'num') return { lin: lin(ZERO, tok.v) };
		if (tok.t === 'x') return { lin: lin(ONE, ZERO) };
		if (tok.t === 'op' && tok.v === '-') {
			const v = this.factor();
			return this.times({ lin: lin(ZERO, neg(ONE)) }, v);
		}
		if (tok.t === '(') {
			const inner = this.sum();
			this.expect(')');
			return { lin: inner, plain: false };
		}
		if (tok.t === '{') {
			const inner = this.sum();
			this.expect('}');
			return { lin: inner, plain: false };
		}
		if (tok.t === 'frac') {
			this.expect('{');
			const num = this.sum();
			this.expect('}');
			this.expect('{');
			const den = this.sum();
			this.expect('}');
			return this.over({ lin: num, plain: false }, { lin: den });
		}
		throw new ParseError('unexpected token');
	}
}

/** Parse "lhs = rhs". Returns null for anything that is not a linear equation in x. */
export function parseEquation(tex: string): Equation | null {
	const parts = tex.split('=');
	if (parts.length !== 2) return null;
	try {
		const sides = parts.map((p) => {
			const parser = new Parser(tokenize(p));
			const s = parser.side();
			if (!parser.done()) throw new ParseError('trailing input');
			return s;
		});
		return { left: sides[0], right: sides[1] };
	} catch (e) {
		if (e instanceof ParseError || (e instanceof Error && e.message === 'division by zero')) return null;
		throw e;
	}
}

/**
 * Find the one equation in a task prompt that can be solved step by step.
 * Returns its TeX and parsed form, or null if there is none (or more than one).
 */
export function findStepEquation(prompt: string): { tex: string; eq: Equation } | null {
	const segments = [...prompt.matchAll(/\\\((.+?)\\\)/gs)].map((m) => m[1].trim());
	const found: { tex: string; eq: Equation }[] = [];
	for (const tex of segments) {
		if (!/x/.test(tex) || /\\_|_|\?|\^|\\sqrt|[a-wyzA-Z]/.test(tex.replace(/\\[a-zA-Z]+/g, ''))) continue;
		const eq = parseEquation(tex);
		if (!eq) continue;
		if (status(eq).kind !== 'open') continue;
		const v = sub(sideValue(eq.left).a, sideValue(eq.right).a);
		if (isZero(v)) continue; // no unique solution
		found.push({ tex, eq });
	}
	return found.length === 1 ? found[0] : null;
}

// ── Steps ─────────────────────────────────────────────────────────────────────

export type Step =
	| { kind: 'add' | 'sub'; v: Linear }
	| { kind: 'mul' | 'div'; v: Q }
	| { kind: 'expand' }
	| { kind: 'swap' };

function mapSides(e: Equation, f: (s: Side) => Side): Equation {
	return { left: normalizeSide(f(e.left)), right: normalizeSide(f(e.right)) };
}

export function canExpand(e: Equation): boolean {
	return e.left.groups.length > 0 || e.right.groups.length > 0;
}

export function applyStep(e: Equation, step: Step): Equation {
	switch (step.kind) {
		case 'add':
		case 'sub': {
			const v = step.kind === 'add' ? step.v : linScale(step.v, neg(ONE));
			return mapSides(e, (s) => ({ groups: s.groups, rest: linAdd(s.rest, v) }));
		}
		case 'mul':
		case 'div': {
			if (isZero(step.v)) throw new Error('factor must not be zero');
			const k = step.kind === 'mul' ? step.v : div(ONE, step.v);
			return mapSides(e, (s) => ({
				groups: s.groups.map((g) => ({ k: mul(g.k, k), inner: g.inner })),
				rest: linScale(s.rest, k)
			}));
		}
		case 'expand':
			return mapSides(e, (s) => ({ groups: [], rest: sideValue(s) }));
		case 'swap':
			return { left: e.right, right: e.left };
	}
}

export type Status =
	| { kind: 'open' }
	| { kind: 'solved'; value: Q }
	| { kind: 'always' }
	| { kind: 'never' };

const isBareX = (s: Side) => s.groups.length === 0 && eqQ(s.rest.a, ONE) && isZero(s.rest.b);
const isConst = (s: Side) => !hasX(s);

export function status(e: Equation): Status {
	if (isBareX(e.left) && isConst(e.right)) return { kind: 'solved', value: e.right.rest.b };
	if (isBareX(e.right) && isConst(e.left)) return { kind: 'solved', value: e.left.rest.b };
	if (isConst(e.left) && isConst(e.right)) {
		return eqQ(e.left.rest.b, e.right.rest.b) ? { kind: 'always' } : { kind: 'never' };
	}
	return { kind: 'open' };
}

/** The textbook next step (used for the "Tipp" / guided choice). */
export function bestStep(e: Equation): Step | null {
	if (status(e).kind !== 'open') return null;
	// 1. Brackets: divide a lone bracket away, otherwise expand.
	for (const [side, other] of [[e.left, e.right], [e.right, e.left]] as const) {
		if (side.groups.length === 1 && linIsZero(side.rest) && isConst(other)) {
			const k = side.groups[0].k;
			if (isInt(k)) return { kind: 'div', v: k };
			if (k.n === 1 || k.n === -1) return { kind: 'mul', v: q(k.d * k.n) };
			return { kind: 'mul', v: q(k.d) };
		}
	}
	if (canExpand(e)) return { kind: 'expand' };
	// 2. x on both sides: remove the smaller x-term.
	const aL = e.left.rest.a, aR = e.right.rest.a;
	if (!isZero(aL) && !isZero(aR)) {
		const smaller = sub(aL, aR).n >= 0 ? aR : aL;
		return { kind: smaller.n > 0 ? 'sub' : 'add', v: lin(absQ(smaller), ZERO) };
	}
	// 3. Constant next to the x-term.
	const xs = isZero(aL) ? e.right : e.left;
	const b = xs.rest.b;
	if (!isZero(b)) return { kind: b.n > 0 ? 'sub' : 'add', v: lin(ZERO, absQ(b)) };
	// 4. Coefficient.
	const a = xs.rest.a;
	if (isInt(a)) return { kind: 'div', v: a };
	if (a.n === 1 || a.n === -1) return { kind: 'mul', v: q(a.d * a.n) };
	return { kind: 'mul', v: q(a.d) };
}

function sameStep(a: Step, b: Step): boolean {
	if (a.kind !== b.kind) return false;
	if (a.kind === 'add' || a.kind === 'sub') {
		const bv = (b as typeof a).v;
		return eqQ(a.v.a, bv.a) && eqQ(a.v.b, bv.b);
	}
	if (a.kind === 'mul' || a.kind === 'div') return eqQ(a.v, (b as typeof a).v);
	return true;
}

/** Three options for the guided choice: the best step plus two plausible alternatives, shuffled. */
export function stepChoices(e: Equation, rnd: () => number = Math.random): { options: Step[]; best: Step } | null {
	const best = bestStep(e);
	if (!best) return null;
	const alts: Step[] = [];
	const push = (s: Step) => {
		// Steps that change nothing (· 1, : 1, + 0) are no real alternative.
		if ((s.kind === 'mul' || s.kind === 'div') && (isZero(s.v) || eqQ(absQ(s.v), ONE))) return;
		if ((s.kind === 'add' || s.kind === 'sub') && linIsZero(s.v)) return;
		if (![best, ...alts].some((x) => sameStep(x, s))) alts.push(s);
	};
	switch (best.kind) {
		case 'sub':
			push({ kind: 'add', v: best.v });
			if (isZero(best.v.a)) push({ kind: 'div', v: best.v.b });
			push({ kind: 'mul', v: isZero(best.v.a) ? best.v.b : best.v.a });
			break;
		case 'add':
			push({ kind: 'sub', v: best.v });
			if (isZero(best.v.a)) push({ kind: 'mul', v: best.v.b });
			push({ kind: 'div', v: isZero(best.v.a) ? best.v.b : best.v.a });
			break;
		case 'div':
			push({ kind: 'mul', v: best.v });
			push({ kind: 'sub', v: lin(ZERO, absQ(best.v)) });
			break;
		case 'mul':
			push({ kind: 'div', v: best.v });
			push({ kind: 'add', v: lin(ZERO, absQ(best.v)) });
			break;
		case 'expand': {
			const g = (e.left.groups[0] ?? e.right.groups[0])!;
			push({ kind: 'sub', v: lin(ZERO, absQ(g.inner.b)) });
			push({ kind: 'mul', v: absQ(g.k) });
			break;
		}
		case 'swap':
			break;
	}
	// Fallbacks: the constant of the other side, or doubling.
	const xSide = hasX(e.left) ? e.left : e.right;
	const other = xSide === e.left ? e.right : e.left;
	if (!isZero(other.rest.b)) push({ kind: 'sub', v: lin(ZERO, absQ(other.rest.b)) });
	push({ kind: 'mul', v: q(2) });
	push({ kind: 'add', v: lin(ZERO, q(1)) });
	const options = [best, ...alts.slice(0, 2)];
	for (let i = options.length - 1; i > 0; i--) {
		const j = Math.floor(rnd() * (i + 1));
		[options[i], options[j]] = [options[j], options[i]];
	}
	return { options, best };
}

// ── Input of the operand ("3", "-2", "3/4", "1,5", "2x", "-x") ────────────────

export function parseOperand(input: string): Linear | null {
	const s = input.replace(/\s/g, '').replace(/[−–]/g, '-').replace(',', '.');
	const m = /^(-?)(\d+(?:\.\d+)?)?(?:\/(\d+))?(x?)$/.exec(s);
	if (!m || (!m[2] && !m[4]) || (m[3] && !m[2])) return null;
	const [, sign, num, den, x] = m;
	let v = ONE;
	if (num) {
		const [w, f = ''] = num.split('.');
		v = q(Number(w + f), 10 ** f.length);
	}
	if (den) {
		if (Number(den) === 0) return null;
		v = div(v, q(Number(den)));
	}
	if (sign) v = neg(v);
	return x ? lin(v, ZERO) : lin(ZERO, v);
}

// ── TeX output ────────────────────────────────────────────────────────────────

export function qTex(v: Q): string {
	if (v.d === 1) return String(v.n);
	return `${v.n < 0 ? '-' : ''}\\frac{${Math.abs(v.n)}}{${v.d}}`;
}

/** Signed terms of a linear expression, e.g. [["+","3x"],["-","2"]]. */
function linTerms(u: Linear): [string, string][] {
	const out: [string, string][] = [];
	if (!isZero(u.a)) {
		const a = absQ(u.a);
		const body = eqQ(a, ONE) ? 'x' : a.n === 1 ? `\\frac{x}{${a.d}}` : a.d === 1 ? `${a.n}x` : `\\frac{${a.n}}{${a.d}}x`;
		out.push([u.a.n < 0 ? '-' : '+', body]);
	}
	if (!isZero(u.b)) out.push([u.b.n < 0 ? '-' : '+', qTex(absQ(u.b))]);
	return out;
}

function joinTerms(terms: [string, string][]): string {
	if (terms.length === 0) return '0';
	return terms.map(([s, t], i) => (i === 0 ? (s === '-' ? `-${t}` : t) : ` ${s} ${t}`)).join('');
}

export function linTex(u: Linear): string {
	return joinTerms(linTerms(u));
}

function groupTerm(g: Group): [string, string] {
	const k = absQ(g.k);
	const inner = linTex(g.inner);
	let body: string;
	if (k.n === 1 && k.d !== 1) body = `\\frac{${inner}}{${k.d}}`;
	else body = `${eqQ(k, ONE) ? '' : qTex(k)}(${inner})`;
	return [g.k.n < 0 ? '-' : '+', body];
}

export function sideTex(s: Side): string {
	return joinTerms([...s.groups.map(groupTerm), ...linTerms(s.rest)]);
}

export function equationTex(e: Equation): string {
	return `${sideTex(e.left)} = ${sideTex(e.right)}`;
}

const paren = (t: string) => (t.startsWith('-') ? `(${t})` : t);

/** Annotation written next to the equation, e.g. "| :4" or "| −2x". */
export function stepTex(step: Step): string {
	switch (step.kind) {
		case 'add': return `+ ${paren(linTex(step.v))}`;
		case 'sub': return `- ${paren(linTex(step.v))}`;
		case 'mul': return `\\cdot ${paren(qTex(step.v))}`;
		case 'div': return `: ${paren(qTex(step.v))}`;
		case 'expand': return '';
		case 'swap': return '';
	}
}

/** Plain-language label of a step for buttons and the guided choice. */
export function stepLabel(step: Step): string {
	const plain = (t: string) => t.replace(/\\frac\{(\d+)\}\{(\d+)\}/g, '$1/$2').replace(/\\frac\{x\}\{(\d+)\}/g, 'x/$1');
	switch (step.kind) {
		case 'add': return `Beide Seiten + ${plain(linTex(step.v))}`;
		case 'sub': return `Beide Seiten − ${plain(linTex(step.v))}`;
		case 'mul': return `Beide Seiten · ${plain(paren(qTex(step.v)))}`;
		case 'div': return `Beide Seiten : ${plain(paren(qTex(step.v)))}`;
		case 'expand': return 'Klammer auflösen';
		case 'swap': return 'Seiten tauschen';
	}
}

/** Why the best step helps (shown after the right choice in the guided mode). */
export function stepReason(e: Equation, step: Step): string {
	switch (step.kind) {
		case 'expand': return 'Erst die Klammer auflösen, dann kannst du weiter umformen.';
		case 'div':
		case 'mul':
			if (canExpand(e)) return 'So fällt die Klammer weg.';
			if (step.kind === 'mul' && step.v.d === 1 && !isInt(sideValue(hasX(e.left) ? e.left : e.right).a)) return 'So verschwindet der Bruch.';
			return 'Dann steht x allein.';
		case 'add':
		case 'sub':
			return isZero(step.v.a) ? 'So verschwindet die Zahl auf der Seite mit x.' : 'Dann steht x nur noch auf einer Seite.';
		case 'swap':
			return 'Dann steht x links.';
	}
}

/** Answer string for submission, matching the task's answer type. */
export function formatAnswer(v: Q, answerType: string): string {
	if (v.d === 1) return String(v.n);
	if (answerType === 'fraction') return `${v.n}/${v.d}`;
	if (answerType === 'number') return String(Math.round((v.n / v.d) * 1e6) / 1e6).replace('.', ',');
	return `${v.n}/${v.d}`;
}

/** Numbers (and x-terms) from the current equation, offered as quick picks for the operand. */
export function operandSuggestions(e: Equation, kind: 'add' | 'sub' | 'mul' | 'div'): string[] {
	const plain = (v: Q) => (v.d === 1 ? String(v.n) : `${v.n}/${v.d}`);
	const out: string[] = [];
	const push = (s: string) => { if (s !== '0' && s !== '1' && !out.includes(s)) out.push(s); };
	const sides = [e.left, e.right];
	if (kind === 'add' || kind === 'sub') {
		for (const s of sides) if (!isZero(s.rest.b)) push(plain(absQ(s.rest.b)));
		for (const s of sides) if (!isZero(s.rest.a)) {
			const a = absQ(s.rest.a);
			push(eqQ(a, ONE) ? 'x' : `${plain(a)}x`);
		}
		for (const s of sides) for (const g of s.groups) push(plain(absQ(mul(g.k, g.inner.b))));
	} else {
		for (const s of sides) for (const g of s.groups) {
			const k = absQ(g.k);
			push(plain(k.n === 1 ? q(k.d) : k));
		}
		for (const s of sides) if (!isZero(s.rest.a)) {
			const a = absQ(s.rest.a);
			if (a.d !== 1) push(String(a.d));
			if (a.n !== 1) push(String(a.n));
		}
		for (const s of sides) if (s.rest.b.d !== 1) push(String(s.rest.b.d));
		if (out.length === 0) push('-1');
	}
	return out.slice(0, 5);
}
