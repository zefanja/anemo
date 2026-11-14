/**
 * Procedural task generators for practicable atoms (level=atom) across domains.
 * Each generator returns a fresh, randomly parameterized task every call.
 * Clusters (level=cluster) are intentionally absent — they are never practiced directly.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type AnswerType = 'integer' | 'number' | 'fraction' | 'text' | 'boolean' | 'comparison';

export interface GeneratedTask {
	atomId: string;
	prompt: string;
	answerType: AnswerType;
	correctAnswer: string; // integer: "7", number: "3.5", fraction: "3/4", text: "nein"
	choices?: string[]; // if set, render as buttons instead of text input
	svg?: string;         // optional inline SVG for visual tasks
	inputData?: Record<string, unknown>; // extra data for interactive components
	hint?: string;
	// Short rationale for this concrete task ("Warum?" button after answering): why the correct
	// answer is correct, with the task's own numbers. Tasks with inputData.steps may omit it.
	why?: string;
	difficulty?: number; // 0–1
	// Accepted absolute deviation for integer/number answers. Set it where the result is rounded
	// or depends on intermediate rounding (π ≈ 3,14 vs. calculator π, sin/cos values, roots);
	// leave it out for exact results.
	tolerance?: number;
}

// stage: current difficulty stage within this atom's expanding sequence (0 = easiest).
// Generators that haven't been migrated to explicit stages yet simply ignore it.
type Gen = (stage?: number) => GeneratedTask;

// ── Math helpers ──────────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Random multiple of `step` in [min, max] (falls back to min when no multiple fits).
function randStep(min: number, max: number, step: number): number {
	const lo = Math.ceil(min / step), hi = Math.floor(max / step);
	return hi < lo ? min : rand(lo, hi) * step;
}

// Number granularity for stage-dependent arithmetic load: round numbers first, so a new
// concept is practised without arithmetic getting in the way, arbitrary ones later.
// Default: stage 0 → multiples of 10, stage 1 → multiples of 5, stage 2+ → any integer.
function stageStep(stage: number, steps: number[] = [10, 5, 1]): number {
	return steps[Math.min(Math.max(stage, 0), steps.length - 1)];
}

// Expanding sequence with retention: at stage s the newest variant (index min(s, n−1)) is
// practised most, earlier variants stay in the mix (DI: new material + review of old).
// Beyond the last variant all variants are mixed evenly.
function stageVariant(stage: number, count: number): number {
	if (stage >= count) return rand(0, count - 1);
	if (stage <= 0) return 0;
	return Math.random() < 0.6 ? stage : rand(0, stage - 1);
}

function pick<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

function pickWeighted<T>(weighted: [T, number][]): T {
	const total = weighted.reduce((s, [, w]) => s + w, 0);
	let r = Math.random() * total;
	for (const [item, w] of weighted) {
		r -= w;
		if (r <= 0) return item;
	}
	return weighted[weighted.length - 1][0];
}

function gcd(a: number, b: number): number {
	a = Math.abs(a); b = Math.abs(b);
	while (b) { [a, b] = [b, a % b]; }
	return a;
}

function lcm(a: number, b: number): number {
	return Math.abs(a * b) / gcd(a, b);
}

// Returns fraction string in lowest terms, always positive denominator
// Used for correctAnswer values — keep as "n/d" for checkAnswer parsing.
function frac(num: number, den: number): string {
	if (den < 0) { num = -num; den = -den; }
	const g = gcd(Math.abs(num), den);
	return `${num / g}/${den / g}`;
}

// LaTeX inline fraction for display in task prompts (rendered by MathJax).
function fmtFrac(n: number, d: number): string {
	return `\\(\\frac{${n}}{${d}}\\)`;
}

// LaTeX inline power notation: e.g. 13^2
function pow(base: number | string, exp: number | string): string {
	return `\\(${base}^{${exp}}\\)`;
}

// Mixed number with visual fraction: e.g. 2 3/4
function fmtMixed(whole: number, n: number, d: number): string {
	return `${whole}\\(\\frac{${n}}{${d}}\\)`;
}

// Round to N decimal places
function round(n: number, places = 2): number {
	return Math.round(n * 10 ** places) / 10 ** places;
}

// Format decimal with trailing zeros removed, German comma separator
function dec(n: number): string {
	const s = String(round(n, 4));
	const trimmed = s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
	return (trimmed || '0').replace('.', ',');
}

// Polynomial formatting for LaTeX prompts: drops zero terms, coefficient 1 and "+ -".
// terms: [coefficient, variable part] — use '' as variable part for the constant term.
function fmtPoly(terms: [number, string][]): string {
	let out = '';
	for (const [c, v] of terms) {
		if (c === 0) continue;
		const abs = Math.abs(c);
		const body = v === '' ? String(abs) : abs === 1 ? v : `${abs}${v}`;
		out += out === '' ? (c < 0 ? `-${body}` : body) : (c < 0 ? ` - ${body}` : ` + ${body}`);
	}
	return out || '0';
}

function fmtLin(m: number, n: number, v = 'x'): string {
	return fmtPoly([[m, v], [n, '']]);
}

function fmtQuad(a: number, b: number, c: number): string {
	return fmtPoly([[a, 'x^2'], [b, 'x'], [c, '']]);
}

// Linear factor with root r for factorised quadratics: (x − r), (x + |r|) or plain x.
function fmtFactor(r: number): string {
	return r === 0 ? 'x' : `(x ${r > 0 ? '-' : '+'} ${Math.abs(r)})`;
}

// Negative numbers get parentheses when they follow an operator.
function paren(n: number): string {
	return n < 0 ? `(${n})` : String(n);
}

function shuffled<T>(arr: T[]): T[] {
	return [...arr].sort(() => Math.random() - 0.5);
}

// Tolerance for results computed with π ≈ 3,14: also accepts the calculator's π (differs by
// 0,05 %) and a rounding step in the last decimal.
function piTol(value: number): number {
	return round(Math.abs(value) * 0.0006 + 0.01, 2);
}

// ── "Warum?" helpers: short rationales for the concrete task (GeneratedTask.why) ──

// Reduced fraction as LaTeX (or a plain integer when the denominator cancels).
function fr(n: number, d: number): string {
	const g = gcd(n, d) || 1;
	const rn = n / g, rd = d / g;
	if (rd === 1) return String(rn);
	return rn < 0 ? `−${fmtFrac(-rn, rd)}` : fmtFrac(rn, rd);
}

// Place-value parts of a natural number: 347 → [300, 40, 7]
function placeParts(n: number): number[] {
	return [...String(n)].map((ch, i, arr) => Number(ch) * 10 ** (arr.length - 1 - i)).filter(v => v > 0);
}

// a ± b in place-value steps: "540 + 30 = 570, dann 570 + 7 = 577."
function chainWhy(a: number, b: number, sign: 1 | -1): string {
	let cur = a;
	const steps = placeParts(b).map(p => {
		const s = `${cur} ${sign === 1 ? '+' : '−'} ${p} = ${cur + sign * p}`;
		cur += sign * p;
		return s;
	});
	if (steps.length > 1) return `Schritt für Schritt: ${steps.join(', dann ')}.`;
	const place = b >= 100 ? 'Hunderter' : b >= 10 ? 'Zehner' : 'Einer';
	return `Es ändern sich nur die ${place}: ${steps[0]}.`;
}

// Written addition, column by column with carries.
function addWhy(a: number, b: number): string {
	const names = ['Einer', 'Zehner', 'Hunderter', 'Tausender'];
	const parts: string[] = [];
	let carry = 0;
	for (let i = 0; a > 0 || b > 0; i++) {
		const s = (a % 10) + (b % 10) + carry;
		parts.push(`${names[i]}: ${a % 10} + ${b % 10}${carry ? ' + 1' : ''} = ${s}${s >= 10 ? ` (schreibe ${s % 10}, übertrage 1)` : ''}`);
		carry = s >= 10 ? 1 : 0;
		a = Math.floor(a / 10); b = Math.floor(b / 10);
	}
	return `Stellenweise von rechts – ${parts.join('; ')}.`;
}

// Partial products: x times each place-value part of y.
function partialWhy(x: number, y: number): string {
	return `Teilprodukte: ${placeParts(y).map(p => `${x} · ${p} = ${x * p}`).join(', ')}.`;
}

// Derive a·b from an easy anchor task.
function einmaleinsWhy(a: number, b: number): string {
	if (a === 1) return `1-mal eine Zahl ist die Zahl selbst: ${b}.`;
	if (a === 2) return `2 · ${b} ist das Doppelte: ${b} + ${b} = ${2 * b}.`;
	if (a === 10) return `10 · ${b}: Jeder Einer wird ein Zehner → ${10 * b}.`;
	if (a === 5) return `5 · ${b} ist die Hälfte von 10 · ${b} = ${10 * b}, also ${5 * b}.`;
	if (a === 9) return `Von 10 · ${b} = ${10 * b} einmal ${b} abziehen: ${9 * b}.`;
	if (a > 5) return `Von einer Kernaufgabe aus: 5 · ${b} = ${5 * b}, dazu ${a - 5} · ${b} = ${(a - 5) * b} → ${a * b}.`;
	return `Von einer Kernaufgabe aus: 2 · ${b} = ${2 * b}, dazu ${a - 2} · ${b} = ${(a - 2) * b} → ${a * b}.`;
}

function teilbarWhy(n: number, rule: number): string {
	const ok = n % rule === 0;
	if (rule === 3 || rule === 9) {
		const digits = [...String(n)].map(Number);
		const qs = digits.reduce((s, x) => s + x, 0);
		return `Quersumme: ${digits.join(' + ')} = ${qs}. ${qs} ist ${qs % rule === 0 ? '' : 'nicht '}durch ${rule} teilbar – ${n} deshalb auch ${ok ? '' : 'nicht'}.`.replace(' .', '.');
	}
	const need = rule === 2 ? '0, 2, 4, 6 oder 8' : rule === 5 ? '0 oder 5' : '0';
	return `Es zählt nur die letzte Ziffer: ${n % 10}. Durch ${rule} teilbar sind Zahlen, die auf ${need} enden – ${n} also ${ok ? '' : 'nicht'}.`.replace(' .', '.');
}

function anteilWhy(n: number, d: number, total: number): string {
	const part = total / d;
	return `Teile ${total} in ${d} gleiche Teile: ${total} : ${d} = ${part}.${n > 1 ? ` Davon ${n} Teile: ${n} · ${part} = ${n * part}.` : ''}`;
}

function decToFracWhy(n: number, d: number): string {
	const s = dec(n / d);
	const places = s.includes(',') ? s.split(',')[1].length : 0;
	const P = 10 ** places;
	const num = Math.round(n / d * P);
	const g = gcd(num, P);
	return `${s} hat ${places} ${places === 1 ? 'Nachkommastelle' : 'Nachkommastellen'}, also Nenner ${P}: ${fmtFrac(num, P)}.${g > 1 ? ` Mit ${g} kürzen: ${fmtFrac(n, d)}.` : ''}`;
}

function trigSideWhy(ask: string, given: string, alphaDeg: number, givenVal: string, result: string): string {
	const table: Record<string, [string, string, string]> = {
		'gegenkathete|ankathete': ['tan', '·', 'tan(α) = Gegenkathete : Ankathete'],
		'gegenkathete|hypotenuse': ['sin', '·', 'sin(α) = Gegenkathete : Hypotenuse'],
		'ankathete|gegenkathete': ['tan', ':', 'tan(α) = Gegenkathete : Ankathete'],
		'ankathete|hypotenuse': ['cos', '·', 'cos(α) = Ankathete : Hypotenuse'],
		'hypotenuse|ankathete': ['cos', ':', 'cos(α) = Ankathete : Hypotenuse'],
		'hypotenuse|gegenkathete': ['sin', ':', 'sin(α) = Gegenkathete : Hypotenuse']
	};
	const names: Record<string, string> = { ankathete: 'Ankathete', gegenkathete: 'Gegenkathete', hypotenuse: 'Hypotenuse' };
	const [fn, op, rel] = table[`${ask}|${given}`];
	return `Gegeben und gesucht sind ${names[given]} und ${names[ask]}, dazu passt ${rel}. Umgestellt: ${names[ask]} = ${givenVal} ${op} ${fn}(${alphaDeg}°) ≈ ${result} cm.`;
}

function halbDivWhy(d: number, q: number): string {
	const tens = Math.floor(q / 10) * 10, ones = q % 10;
	if (ones === 0) return `${d * q} : ${d}: Rechne ${d * q / 10} : ${d} = ${q / 10} und hänge die Null wieder an → ${q}.`;
	return `Zerlege ${d * q} in ${d * tens} + ${d * ones}: ${d * tens} : ${d} = ${tens} und ${d * ones} : ${d} = ${ones}. Zusammen ${q}.`;
}

function romanWhy(roman: string, n: number): string {
	const val: Record<string, number> = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 };
	const groups = roman.match(/CM|CD|XC|XL|IX|IV|M+|D|C+|L|X+|V|I+/g) ?? [];
	const parts = groups.map(g => `${g} = ${val[g] ?? val[g[0]] * g.length}`);
	const sub = groups.find(g => g.length === 2 && val[g] !== undefined);
	const tail = sub ? ` In ${sub} steht das kleinere Zeichen vorn und wird abgezogen.` : ' Gleiche und kleinere Zeichen dahinter werden addiert.';
	return `${parts.join(', ')}${parts.length > 1 ? ` – zusammen ${n}` : ''}.${tail}`;
}

// Fully reduced fraction n/d < 1 with a terminating decimal expansion.
function terminatingFraction(dens: number[]): [number, number] {
	const d = pick(dens);
	let n = rand(1, d - 1);
	while (gcd(n, d) !== 1) n = rand(1, d - 1);
	return [n, d];
}

// ── SVG helpers ───────────────────────────────────────────────────────────────

// Number line from 0 to 2 with d*2 equal sections.
// Major ticks (labeled 0, 1, 2) at positions 0, d, 2*d.
// Minor ticks unlabeled — student locates fraction by counting.
// Optional markerAt: section index (0…2d) to highlight with a downward arrow.
function svgFractionLine(d: number, markerAt?: number): string {
	const total = d * 2;
	const W = 340, H = markerAt !== undefined ? 80 : 68;
	const lineY = markerAt !== undefined ? 50 : 36;
	const x0 = 22, x1 = 308;
	const linePx = x1 - x0;
	const step = linePx / total;
	const col = '#374151';
	const accent = '#4f46e5';

	let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" `
		+ `style="max-width:100%;display:block;margin:0 auto">`;

	// Main line + right arrow
	s += `<line x1="${x0}" y1="${lineY}" x2="${x1}" y2="${lineY}" `
		+ `stroke="${col}" stroke-width="2" stroke-linecap="round"/>`;
	s += `<polygon points="${x1},${lineY - 5} ${x1 + 12},${lineY} ${x1},${lineY + 5}" fill="${col}"/>`;

	for (let i = 0; i <= total; i++) {
		const x = +(x0 + i * step).toFixed(1);
		const major = i % d === 0;
		const h = major ? 12 : 7;
		s += `<line x1="${x}" y1="${lineY - h}" x2="${x}" y2="${lineY + h}" `
			+ `stroke="${col}" stroke-width="${major ? 2 : 1.5}"/>`;
		if (major) {
			s += `<text x="${x}" y="${lineY + h + 15}" text-anchor="middle" `
				+ `font-size="14" font-weight="bold" fill="${col}" `
				+ `font-family="system-ui,-apple-system,sans-serif">${i / d}</text>`;
		}
	}

	// Optional downward arrow marker at a specific section
	if (markerAt !== undefined) {
		const mx = +(x0 + markerAt * step).toFixed(1);
		// Triangle tip sits just above the tick; base is 16px wide, 14px tall
		s += `<polygon points="${(+mx - 8).toFixed(1)},${lineY - 26} `
			+ `${(+mx + 8).toFixed(1)},${lineY - 26} `
			+ `${mx},${lineY - 12}" `
			+ `fill="${accent}"/>`;
	}

	s += `</svg>`;
	return s;
}

// Integer number line (bidirectional) from lo to hi.
// Marks each integer with a tick and label; dots at the given highlight positions.
function svgIntegerLine(lo: number, hi: number, highlights: number[]): string {
	const range = hi - lo;
	const W = 320, H = 68;
	const lineY = 36;
	const x0 = 28, x1 = 292;
	const linePx = x1 - x0;
	const step = linePx / range;
	const col = '#374151';
	const dot = '#4f46e5';

	let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" `
		+ `style="max-width:100%;display:block;margin:0 auto">`;

	// Bidirectional line + arrows
	s += `<line x1="${x0 - 10}" y1="${lineY}" x2="${x1 + 10}" y2="${lineY}" `
		+ `stroke="${col}" stroke-width="2" stroke-linecap="round"/>`;
	s += `<polygon points="${x1 + 10},${lineY - 4} ${x1 + 20},${lineY} ${x1 + 10},${lineY + 4}" fill="${col}"/>`;
	s += `<polygon points="${x0 - 10},${lineY - 4} ${x0 - 20},${lineY} ${x0 - 10},${lineY + 4}" fill="${col}"/>`;

	for (let i = lo; i <= hi; i++) {
		const x = +(x0 + (i - lo) * step).toFixed(1);
		const isZero = i === 0;
		const h = isZero ? 12 : 8;
		s += `<line x1="${x}" y1="${lineY - h}" x2="${x}" y2="${lineY + h}" `
			+ `stroke="${col}" stroke-width="${isZero ? 2 : 1.5}"/>`;
		s += `<text x="${x}" y="${lineY + h + 13}" text-anchor="middle" `
			+ `font-size="12"${isZero ? ' font-weight="bold"' : ''} fill="${col}" `
			+ `font-family="system-ui,-apple-system,sans-serif">${i}</text>`;
	}

	// Highlighted dots + labels above the line
	highlights.forEach((n, idx) => {
		const x = +(x0 + (n - lo) * step).toFixed(1);
		// Stagger labels if positions are adjacent to avoid overlap
		const labelY = lineY - (highlights.length > 1 && Math.abs(highlights[0] - highlights[1]) === 1
			? (idx === 0 ? 10 : 22) : 14);
		s += `<circle cx="${x}" cy="${lineY}" r="6" fill="${dot}" stroke="white" stroke-width="1.5"/>`;
		s += `<text x="${x}" y="${labelY}" text-anchor="middle" `
			+ `font-size="13" font-weight="bold" fill="${dot}" `
			+ `font-family="system-ui,-apple-system,sans-serif">${n}</text>`;
	});

	s += `</svg>`;
	return s;
}

// Coordinate system SVG with two lines for LGS visualisation.
// lines: up to 2 entries with slope m and y-intercept b.
function svgCoordSystem(
	lines: { m: number; b: number; color: string; label: string }[],
	range = 4
): string {
	const W = 260, H = 260, pad = 28;
	const plotW = W - 2 * pad, plotH = H - 2 * pad;
	const sx = plotW / (range * 2), sy = plotH / (range * 2);
	const ox = pad + plotW / 2, oy = pad + plotH / 2;
	const tx = (x: number) => +(ox + x * sx).toFixed(1);
	const ty = (y: number) => +(oy - y * sy).toFixed(1);
	const gc = '#e5e7eb', ac = '#6b7280';
	let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" `
		+ `style="max-width:100%;display:block;margin:0 auto;border-radius:8px;background:#f9fafb">`;
	for (let i = -range; i <= range; i++) {
		s += `<line x1="${tx(i)}" y1="${pad}" x2="${tx(i)}" y2="${H - pad}" stroke="${gc}" stroke-width="1"/>`;
		s += `<line x1="${pad}" y1="${ty(i)}" x2="${W - pad}" y2="${ty(i)}" stroke="${gc}" stroke-width="1"/>`;
	}
	s += `<line x1="${pad}" y1="${oy}" x2="${W - pad}" y2="${oy}" stroke="${ac}" stroke-width="2"/>`;
	s += `<line x1="${ox}" y1="${pad}" x2="${ox}" y2="${H - pad}" stroke="${ac}" stroke-width="2"/>`;
	s += `<polygon points="${W - pad},${oy - 4} ${W - pad + 8},${oy} ${W - pad},${oy + 4}" fill="${ac}"/>`;
	s += `<polygon points="${ox - 4},${pad} ${ox},${pad - 8} ${ox + 4},${pad}" fill="${ac}"/>`;
	for (let i = -range; i <= range; i++) {
		if (i === 0) continue;
		if (i % 2 === 0) {
			s += `<text x="${tx(i)}" y="${oy + 16}" text-anchor="middle" font-size="9" fill="${ac}" font-family="system-ui,sans-serif">${i}</text>`;
			s += `<text x="${ox - 14}" y="${ty(i) + 4}" text-anchor="middle" font-size="9" fill="${ac}" font-family="system-ui,sans-serif">${i}</text>`;
		}
	}
	s += `<text x="${W - pad + 4}" y="${oy + 4}" font-size="11" fill="${ac}" font-family="system-ui,sans-serif">x</text>`;
	s += `<text x="${ox + 4}" y="${pad - 4}" font-size="11" fill="${ac}" font-family="system-ui,sans-serif">y</text>`;
	const colors = ['#4f46e5', '#dc2626'];
	for (let li = 0; li < lines.length; li++) {
		const { m, b, color, label } = lines[li];
		const c = color || colors[li];
		s += `<line x1="${tx(-range)}" y1="${ty(m * -range + b)}" x2="${tx(range)}" y2="${ty(m * range + b)}" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>`;
		const lx = tx(range - 0.8), ly = ty(m * (range - 0.8) + b) - 8;
		if (ly > pad && ly < H - pad)
			s += `<text x="${lx}" y="${ly}" font-size="11" font-weight="bold" fill="${c}" font-family="system-ui,sans-serif">${label}</text>`;
	}
	s += '</svg>';
	return s;
}

// ── SVG helpers: Geometrie ──────────────────────────────────────────────────────
// Shared conventions: viewBox ~300×230, main stroke #374151, fill #eef2ff/#4f46e5 accent,
// dashed gray (#9ca3af) for construction lines (heights, radii, diagonals).
// All shape-builder functions below place their own coordinates so that any right angle
// that needs a marker is trivial to detect from the supplied reference points — the marker
// itself is computed generically via unit vectors, so it works regardless of orientation.

type Pt = [number, number];

function vSub(a: Pt, b: Pt): Pt { return [a[0] - b[0], a[1] - b[1]]; }
function vAdd(a: Pt, b: Pt): Pt { return [a[0] + b[0], a[1] + b[1]]; }
function vScale(a: Pt, k: number): Pt { return [a[0] * k, a[1] * k]; }
function vUnit(a: Pt): Pt { const len = Math.hypot(a[0], a[1]) || 1; return [a[0] / len, a[1] / len]; }

function svgOpen(w: number, h: number): string {
	return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" `
		+ `style="max-width:100%;display:block;margin:0 auto">`;
}

function svgLineSeg(a: Pt, b: Pt, opts: { color?: string; width?: number; dash?: boolean } = {}): string {
	const { color = '#374151', width = 2, dash = false } = opts;
	return `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" `
		+ `stroke="${color}" stroke-width="${width}" stroke-linecap="round"${dash ? ' stroke-dasharray="4,3"' : ''}/>`;
}

/** Rough width of a bold label in px (system-ui), good enough to keep labels clear of lines. */
function textWidth(str: string, size = 13): number {
	return [...str].reduce((w, c) => w + (c === ' ' ? 0.3 : /[0-9]/.test(c) ? 0.6 : /[mw]/.test(c) ? 0.9 : 0.58), 0) * size;
}

function svgLabel(p: Pt, str: string, opts: { size?: number; color?: string; bold?: boolean; anchor?: 'start' | 'middle' | 'end' } = {}): string {
	const { size = 13, color = '#374151', bold = true, anchor = 'middle' } = opts;
	return `<text x="${p[0].toFixed(1)}" y="${p[1].toFixed(1)}" text-anchor="${anchor}" font-size="${size}" `
		+ `${bold ? 'font-weight="bold"' : ''} fill="${color}" font-family="system-ui,-apple-system,sans-serif" `
		// white halo behind the glyphs: a line crossing the label never makes it unreadable
		+ `stroke="#fff" stroke-width="3" stroke-linejoin="round" paint-order="stroke">${str}</text>`;
}

function svgPoly(points: Pt[], opts: { fill?: string; stroke?: string; width?: number; dash?: boolean } = {}): string {
	const { fill = '#eef2ff', stroke = '#4f46e5', width = 2, dash = false } = opts;
	const pts = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
	return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" `
		+ `stroke-linejoin="round"${dash ? ' stroke-dasharray="4,3"' : ''}/>`;
}

// Right-angle marker at point P, using two reference points that indicate the two edge directions.
// Right-angle mark as used in German schools: a quarter arc with a dot inside (not a square).
function rightAngleMarker(P: Pt, ref1: Pt, ref2: Pt, size = 10): string {
	const r = size * 1.5;
	const u1 = vUnit(vSub(ref1, P)), u2 = vUnit(vSub(ref2, P));
	const a = vAdd(P, vScale(u1, r)), b = vAdd(P, vScale(u2, r));
	// sweep flag: arc runs from ref1's ray to ref2's ray the short way (screen coords, y down)
	const sweep = u1[0] * u2[1] - u1[1] * u2[0] > 0 ? 1 : 0;
	const dot = vAdd(P, vScale(vUnit(vAdd(u1, u2)), r * 0.5));
	return `<path d="M ${a[0].toFixed(1)} ${a[1].toFixed(1)} A ${r} ${r} 0 0 ${sweep} ${b[0].toFixed(1)} ${b[1].toFixed(1)}" `
		+ `fill="none" stroke="#374151" stroke-width="1.5"/>`
		+ `<circle cx="${dot[0].toFixed(1)}" cy="${dot[1].toFixed(1)}" r="1.8" fill="#374151"/>`;
}

// Angle arc + label at vertex P, opening between the directions toward ref1 and ref2.
function angleArc(P: Pt, ref1: Pt, ref2: Pt, label: string, radius = 22): string {
	const a1 = Math.atan2(...([vSub(ref1, P)[1], vSub(ref1, P)[0]] as [number, number]));
	const a2 = Math.atan2(...([vSub(ref2, P)[1], vSub(ref2, P)[0]] as [number, number]));
	let start = a1, end = a2;
	let delta = end - start;
	while (delta <= -Math.PI) delta += 2 * Math.PI;
	while (delta > Math.PI) delta -= 2 * Math.PI;
	end = start + delta;
	const large = Math.abs(delta) > Math.PI ? 1 : 0;
	const sweep = delta > 0 ? 1 : 0;
	const sx = P[0] + radius * Math.cos(start), sy = P[1] + radius * Math.sin(start);
	const ex = P[0] + radius * Math.cos(end), ey = P[1] + radius * Math.sin(end);
	const mid = start + delta / 2;
	// Along the bisector, far enough that the label's box fits between the two rays – for acute
	// angles the default distance would put the text on top of the legs.
	const w = textWidth(label, 12), h = 12;
	const half = Math.max(Math.abs(delta) / 2, 0.05);
	let d = radius + 14;
	for (const a of [start, end]) {
		const n: Pt = [-Math.sin(a), Math.cos(a)]; // normal of the ray
		const ext = Math.abs(n[0]) * w / 2 + Math.abs(n[1]) * h / 2;
		d = Math.max(d, (ext + 3) / Math.sin(half));
	}
	d = Math.min(d, 110);
	const lx = P[0] + d * Math.cos(mid), ly = P[1] + d * Math.sin(mid) + 4;
	let s = `<path d="M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${radius} ${radius} 0 ${large} ${sweep} ${ex.toFixed(1)} ${ey.toFixed(1)}" `
		+ `fill="none" stroke="#4f46e5" stroke-width="1.5"/>`;
	s += svgLabel([lx, ly], label, { size: 12, color: '#4f46e5' });
	return s;
}

// General triangle/polygon diagram: pass math-space vertices (function scales+flips to fit).
// edgeLabels/angleLabels index into `points`. rightAngleVertices mark a polygon corner.
// extraSegments/extraPoints are extra math-space geometry (e.g. an altitude + its foot).
function svgPolyDiagram(
	points: Pt[],
	opts: {
		edgeLabels?: { from: number; to: number; text: string }[];
		angleLabels?: { at: number; text: string; useArc?: boolean }[];
		rightAngleVertices?: number[];
		extraSegments?: { from: Pt; to: Pt; dash?: boolean; color?: string }[];
		// pos: where the label goes relative to the point (default above); 'right' for labels on a
		// vertical height line, so the dashed line does not run through the text
		extraPoints?: { at: Pt; label: string; pos?: 'above' | 'below' | 'right' }[];
		rightAngleFeet?: { at: Pt; ref1: Pt; ref2: Pt }[];
		fill?: string;
	} = {}
): string {
	// wider side margins: labels next to vertical edges extend sideways
	const W = 300, H = 230, padX = 62, padY = 40;
	const all: Pt[] = [...points, ...(opts.extraSegments?.flatMap(s => [s.from, s.to]) ?? [])];
	const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
	const minX = Math.min(...xs), maxX = Math.max(...xs);
	const minY = Math.min(...ys), maxY = Math.max(...ys);
	const spanX = Math.max(maxX - minX, 0.01), spanY = Math.max(maxY - minY, 0.01);
	const scale = Math.min((W - 2 * padX) / spanX, (H - 2 * padY) / spanY);
	const ccx = (minX + maxX) / 2, ccy = (minY + maxY) / 2;
	const tx = (p: Pt): Pt => [W / 2 + (p[0] - ccx) * scale, H / 2 - (p[1] - ccy) * scale];

	const tp = points.map(tx);
	const centroid: Pt = [tp.reduce((s, p) => s + p[0], 0) / tp.length, tp.reduce((s, p) => s + p[1], 0) / tp.length];

	let s = svgOpen(W, H);
	s += svgPoly(tp, { fill: opts.fill });
	// on top of the filled polygon, otherwise e.g. a dashed height inside the shape is hidden
	for (const seg of opts.extraSegments ?? []) {
		s += svgLineSeg(tx(seg.from), tx(seg.to), { color: seg.color ?? '#9ca3af', width: 1.5, dash: seg.dash });
	}

	for (const v of opts.rightAngleVertices ?? []) {
		const prev = tp[(v - 1 + tp.length) % tp.length], next = tp[(v + 1) % tp.length];
		s += rightAngleMarker(tp[v], prev, next);
	}
	for (const f of opts.rightAngleFeet ?? []) {
		s += rightAngleMarker(tx(f.at), tx(f.ref1), tx(f.ref2), 9);
	}

	// orientation of the polygon (screen coordinates) – used to find each edge's outward normal,
	// which also works for concave shapes (L-shapes) where "away from the centroid" points inwards
	let area2 = 0;
	for (let i = 0; i < tp.length; i++) {
		const a = tp[i], b = tp[(i + 1) % tp.length];
		area2 += a[0] * b[1] - b[0] * a[1];
	}
	for (const el of opts.edgeLabels ?? []) {
		const P = tp[el.from], Q = tp[el.to];
		const mid: Pt = [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2];
		const e = vUnit(vSub(Q, P));
		let n: Pt = area2 >= 0 ? [e[1], -e[0]] : [-e[1], e[0]];
		const forward = el.to === (el.from + 1) % tp.length;
		const backward = el.from === (el.to + 1) % tp.length;
		if (backward) n = [-n[0], -n[1]]; // edge given against the polygon's winding
		// edges that are not polygon sides (e.g. a diagonal): fall back to "away from the centroid"
		if (!forward && !backward) {
			n = vUnit(vSub(mid, centroid));
			if (Math.hypot(n[0], n[1]) < 0.01) n = [0, -1];
		}
		// Push the label's box (not just its centre) off the edge: the distance needed depends on
		// the text width when the label sits beside the edge and on its height when above/below.
		const w = textWidth(el.text, 13), h = 13;
		const d = 6 + Math.abs(n[0]) * w / 2 + Math.abs(n[1]) * h / 2;
		s += svgLabel([mid[0] + n[0] * d, mid[1] + n[1] * d + 4.5], el.text);
	}
	for (const al of opts.angleLabels ?? []) {
		const P = tp[al.at];
		const prev = tp[(al.at - 1 + tp.length) % tp.length], next = tp[(al.at + 1) % tp.length];
		if (al.useArc) {
			s += angleArc(P, prev, next, al.text);
		} else {
			const dir = vUnit(vSub(centroid, P));
			s += svgLabel([P[0] + dir[0] * 24, P[1] + dir[1] * 24 + 4], al.text, { size: 12, color: '#4f46e5' });
		}
	}
	for (const ep of opts.extraPoints ?? []) {
		const p = tx(ep.at);
		s += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="#374151"/>`;
		const lp: Pt = ep.pos === 'right' ? [p[0] + 6, p[1] + 4] : ep.pos === 'below' ? [p[0], p[1] + 16] : [p[0], p[1] - 9];
		s += svgLabel(lp, ep.label, { size: 11, color: '#6b7280', bold: false, anchor: ep.pos === 'right' ? 'start' : 'middle' });
	}
	s += '</svg>';
	return s;
}

// Right triangle with the right angle always at the origin (bottom-left): legs along the axes.
// This keeps the right-angle marker and altitude constructions trivially axis-aligned.
function svgRightTriangle(
	legA: number, legB: number,
	opts: { labelA?: string; labelB?: string; labelC?: string; angleLabel?: string; angleAt?: 'A' | 'B' } = {}
): string {
	const A: Pt = [0, 0], B: Pt = [legA, 0], C: Pt = [0, legB];
	const edgeLabels = [
		...(opts.labelA ? [{ from: 0, to: 1, text: opts.labelA }] : []),
		...(opts.labelB ? [{ from: 0, to: 2, text: opts.labelB }] : []),
		...(opts.labelC ? [{ from: 1, to: 2, text: opts.labelC }] : [])
	];
	const angleLabels = opts.angleLabel
		? [{ at: opts.angleAt === 'A' ? 2 : 1, text: opts.angleLabel, useArc: true }]
		: [];
	return svgPolyDiagram([A, B, C], { edgeLabels, angleLabels, rightAngleVertices: [0] });
}

// General triangle from three side lengths (SSS layout, hypotenuse-style base placement).
function svgTriangleSSS(
	a: number, b: number, c: number, // a = BC, b = CA, c = AB
	opts: {
		labelA?: string; labelB?: string; labelC?: string;
		angleA?: string; angleB?: string; angleC?: string;
	} = {}
): string {
	const A: Pt = [0, 0], B: Pt = [c, 0];
	const x = (b * b + c * c - a * a) / (2 * c);
	const y = Math.sqrt(Math.max(b * b - x * x, 0.01));
	const C: Pt = [x, y];
	const edgeLabels = [
		...(opts.labelC ? [{ from: 0, to: 1, text: opts.labelC }] : []),
		...(opts.labelB ? [{ from: 0, to: 2, text: opts.labelB }] : []),
		...(opts.labelA ? [{ from: 1, to: 2, text: opts.labelA }] : [])
	];
	const angleLabels = [
		...(opts.angleA ? [{ at: 0, text: opts.angleA, useArc: true }] : []),
		...(opts.angleB ? [{ at: 1, text: opts.angleB, useArc: true }] : []),
		...(opts.angleC ? [{ at: 2, text: opts.angleC, useArc: true }] : [])
	];
	return svgPolyDiagram([A, B, C], { edgeLabels, angleLabels });
}

// Axis-aligned quadrilateral diagram (rectangle / parallelogram / trapezoid) given 4 corners
// counter-clockwise starting bottom-left, plus an optional dashed height from top edge to base.
function svgQuad(
	pts: [Pt, Pt, Pt, Pt],
	opts: {
		baseLabel?: string; topLabel?: string; leftLabel?: string; rightLabel?: string;
		heightFrom?: Pt; heightTo?: Pt; heightLabel?: string;
		rightAngleVertices?: number[];
	} = {}
): string {
	const edgeLabels = [
		...(opts.baseLabel ? [{ from: 0, to: 1, text: opts.baseLabel }] : []),
		...(opts.rightLabel ? [{ from: 1, to: 2, text: opts.rightLabel }] : []),
		...(opts.topLabel ? [{ from: 2, to: 3, text: opts.topLabel }] : []),
		...(opts.leftLabel ? [{ from: 3, to: 0, text: opts.leftLabel }] : [])
	];
	const extraSegments = opts.heightFrom && opts.heightTo
		? [{ from: opts.heightFrom, to: opts.heightTo, dash: true }]
		: [];
	const rightAngleFeet = opts.heightFrom && opts.heightTo
		? [{ at: opts.heightTo, ref1: opts.heightFrom, ref2: pts[1] }]
		: [];
	const extraPoints = opts.heightLabel && opts.heightFrom && opts.heightTo
		? [{ at: [(opts.heightFrom[0] + opts.heightTo[0]) / 2, (opts.heightFrom[1] + opts.heightTo[1]) / 2] as Pt, label: opts.heightLabel, pos: 'right' as const }]
		: [];
	return svgPolyDiagram(pts, { edgeLabels, extraSegments, rightAngleFeet, rightAngleVertices: opts.rightAngleVertices, extraPoints });
}

function svgCircleDiagram(r: number, opts: { label?: string; showDiameter?: boolean } = {}): string {
	const W = 260, H = 220, pad = 30;
	const scale = Math.min(W - 2 * pad, H - 2 * pad) / (2 * r);
	const cx = W / 2, cy = H / 2, R = r * scale;
	let s = svgOpen(W, H);
	s += `<circle cx="${cx}" cy="${cy}" r="${R.toFixed(1)}" fill="#eef2ff" stroke="#4f46e5" stroke-width="2"/>`;
	s += `<circle cx="${cx}" cy="${cy}" r="2" fill="#374151"/>`;
	if (opts.showDiameter) {
		s += svgLineSeg([cx - R, cy], [cx + R, cy], { color: '#374151', width: 1.5 });
	} else {
		s += svgLineSeg([cx, cy], [cx + R, cy], { color: '#374151', width: 1.5 });
	}
	if (opts.label) {
		const lx = opts.showDiameter ? cx : cx + R / 2;
		s += svgLabel([lx, cy - 8], opts.label, { size: 13 });
	}
	s += '</svg>';
	return s;
}

// Grid of unit squares with an m×n rectangle highlighted (Grundschule: Flächeninhalt/Umfang auszählen).
function svgUnitGrid(cols: number, rows: number, hlCols: number, hlRows: number): string {
	const cell = 26, pad = 20;
	const W = cols * cell + 2 * pad, H = rows * cell + 2 * pad;
	let s = svgOpen(W, H);
	// tinted background for the highlighted region, drawn first so the grid lines stay visible on top
	s += `<rect x="${pad}" y="${pad}" width="${hlCols * cell}" height="${hlRows * cell}" fill="#eef2ff"/>`;
	for (let i = 0; i <= cols; i++) {
		s += svgLineSeg([pad + i * cell, pad], [pad + i * cell, pad + rows * cell], { color: '#9ca3af', width: 1 });
	}
	for (let j = 0; j <= rows; j++) {
		s += svgLineSeg([pad, pad + j * cell], [pad + cols * cell, pad + j * cell], { color: '#9ca3af', width: 1 });
	}
	s += `<rect x="${pad}" y="${pad}" width="${hlCols * cell}" height="${hlRows * cell}" `
		+ `fill="none" stroke="#4f46e5" stroke-width="2.5"/>`;
	s += '</svg>';
	return s;
}

// Oblique-projection cuboid (Schrägbild): front face w×h, depth d drawn at ~30° offset.
function svgCuboid(w: number, h: number, d: number, labels: { w?: string; h?: string; d?: string } = {}): string {
	const W = 300, H = 230, pad = 36;
	const dx = 0.5, dy = -0.32; // oblique offset direction (unit-ish)
	const spanX = w + Math.abs(d * dx), spanY = h + Math.abs(d * dy);
	const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
	const ox = pad + Math.abs(d * dx) * scale * (dx < 0 ? 1 : 0), oy = H - pad;
	const P = (x: number, y: number): Pt => [ox + x * scale, oy - y * scale];
	const A = P(0, 0), B = P(w, 0), Cc = P(w, h), D = P(0, h);
	const off: Pt = [d * dx * scale, d * dy * scale];
	const shift = (p: Pt): Pt => [p[0] + off[0], p[1] + off[1]];
	const A3 = shift(A), B3 = shift(B), C3 = shift(Cc), D3 = shift(D);
	let s = svgOpen(W, H);
	// back face (dashed, partially hidden)
	s += svgPoly([A3, B3, C3, D3], { fill: '#f9fafb', stroke: '#c7d2fe', dash: true });
	// connecting edges
	s += svgLineSeg(A, A3, { color: '#c7d2fe', dash: true });
	s += svgLineSeg(B, B3, { color: '#374151' });
	s += svgLineSeg(Cc, C3, { color: '#374151' });
	s += svgLineSeg(D, D3, { color: '#374151' });
	// front face
	s += svgPoly([A, B, Cc, D], { fill: '#eef2ff', stroke: '#4f46e5' });
	if (labels.w) s += svgLabel([(A[0] + B[0]) / 2, oy + 16], labels.w);
	if (labels.h) s += svgLabel([A[0] - 18, (A[1] + D[1]) / 2 + 4], labels.h);
	if (labels.d) s += svgLabel([(B[0] + B3[0]) / 2 + 10, (B[1] + B3[1]) / 2 - 4], labels.d, { color: '#6b7280' });
	s += '</svg>';
	return s;
}

function svgCylinder(r: number, h: number, labels: { r?: string; h?: string } = {}): string {
	const W = 260, H = 260, pad = 30;
	const ry = r * 0.35;
	const scale = Math.min((W - 2 * pad) / (2 * r), (H - 2 * pad) / (h + 2 * ry));
	const cx = W / 2, topY = pad + ry * scale, botY = topY + h * scale;
	const R = r * scale, RY = ry * scale;
	let s = svgOpen(W, H);
	s += svgLineSeg([cx - R, topY], [cx - R, botY], { color: '#4f46e5' });
	s += svgLineSeg([cx + R, topY], [cx + R, botY], { color: '#4f46e5' });
	s += `<path d="M ${(cx - R).toFixed(1)} ${botY.toFixed(1)} A ${R.toFixed(1)} ${RY.toFixed(1)} 0 0 0 ${(cx + R).toFixed(1)} ${botY.toFixed(1)}" fill="none" stroke="#4f46e5" stroke-width="2"/>`;
	s += `<path d="M ${(cx - R).toFixed(1)} ${botY.toFixed(1)} A ${R.toFixed(1)} ${RY.toFixed(1)} 0 0 1 ${(cx + R).toFixed(1)} ${botY.toFixed(1)}" fill="none" stroke="#4f46e5" stroke-width="1.5" stroke-dasharray="4,3"/>`;
	s += `<ellipse cx="${cx}" cy="${topY.toFixed(1)}" rx="${R.toFixed(1)}" ry="${RY.toFixed(1)}" fill="#eef2ff" stroke="#4f46e5" stroke-width="2"/>`;
	s += svgLineSeg([cx, topY], [cx + R, topY], { color: '#374151', width: 1.5 });
	if (labels.r) s += svgLabel([cx + R / 2, topY - 6], labels.r, { size: 12 });
	if (labels.h) s += svgLabel([cx + R + 22, (topY + botY) / 2], labels.h);
	s += '</svg>';
	return s;
}

function svgCone(r: number, h: number, labels: { r?: string; h?: string; s?: string } = {}): string {
	const W = 260, H = 260, pad = 30;
	const ry = r * 0.35;
	const scale = Math.min((W - 2 * pad) / (2 * r), (H - 2 * pad) / (h + ry));
	const cx = W / 2, botY = H - pad, apexY = botY - h * scale;
	const R = r * scale, RY = ry * scale;
	let s = svgOpen(W, H);
	s += svgLineSeg([cx, apexY], [cx - R, botY], { color: '#4f46e5' });
	s += svgLineSeg([cx, apexY], [cx + R, botY], { color: '#4f46e5' });
	s += svgLineSeg([cx, apexY], [cx, botY], { color: '#9ca3af', dash: true });
	s += `<path d="M ${(cx - R).toFixed(1)} ${botY.toFixed(1)} A ${R.toFixed(1)} ${RY.toFixed(1)} 0 0 0 ${(cx + R).toFixed(1)} ${botY.toFixed(1)}" fill="none" stroke="#4f46e5" stroke-width="2"/>`;
	s += `<path d="M ${(cx - R).toFixed(1)} ${botY.toFixed(1)} A ${R.toFixed(1)} ${RY.toFixed(1)} 0 0 1 ${(cx + R).toFixed(1)} ${botY.toFixed(1)}" fill="none" stroke="#4f46e5" stroke-width="1.5" stroke-dasharray="4,3"/>`;
	s += svgLineSeg([cx, botY], [cx + R, botY], { color: '#374151', width: 1.5 });
	if (labels.r) s += svgLabel([cx + R / 2, botY + 16], labels.r, { size: 12 });
	if (labels.h) s += svgLabel([cx - 16, (apexY + botY) / 2], labels.h);
	if (labels.s) s += svgLabel([(cx + cx + R) / 2 + 8, (apexY + botY) / 2 - 6], labels.s, { color: '#6b7280' });
	s += '</svg>';
	return s;
}

function svgSphere(r: number, label?: string): string {
	const W = 220, H = 220, pad = 26;
	const scale = (W - 2 * pad) / (2 * r);
	const cx = W / 2, cy = H / 2, R = r * scale;
	let s = svgOpen(W, H);
	s += `<circle cx="${cx}" cy="${cy}" r="${R.toFixed(1)}" fill="#eef2ff" stroke="#4f46e5" stroke-width="2"/>`;
	s += `<ellipse cx="${cx}" cy="${cy}" rx="${R.toFixed(1)}" ry="${(R * 0.32).toFixed(1)}" fill="none" stroke="#4f46e5" stroke-width="1.2" stroke-dasharray="3,3"/>`;
	s += svgLineSeg([cx, cy], [cx + R, cy], { color: '#374151', width: 1.5 });
	if (label) s += svgLabel([cx + R / 2, cy - 8], label, { size: 12 });
	s += '</svg>';
	return s;
}

// Triangular prism (Schrägbild): triangular front face extruded along an oblique depth.
function svgPrism(base: number, triHeight: number, depth: number, labels: { g?: string; h?: string; l?: string } = {}): string {
	const W = 300, H = 230, pad = 34;
	const dx = 0.5, dy = -0.3;
	const spanX = base + depth * dx, spanY = triHeight + depth * Math.abs(dy);
	const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
	const ox = pad, oy = H - pad;
	const P = (x: number, y: number): Pt => [ox + x * scale, oy - y * scale];
	const A = P(0, 0), B = P(base, 0), C = P(base / 2, triHeight);
	const off: Pt = [depth * dx * scale, depth * dy * scale];
	const shift = (p: Pt): Pt => [p[0] + off[0], p[1] + off[1]];
	const A2 = shift(A), B2 = shift(B), C2 = shift(C);
	let s = svgOpen(W, H);
	s += svgPoly([A2, B2, C2], { fill: '#f9fafb', stroke: '#c7d2fe', dash: true });
	s += svgLineSeg(A, A2, { color: '#c7d2fe', dash: true });
	s += svgLineSeg(B, B2, { color: '#374151' });
	s += svgLineSeg(C, C2, { color: '#374151' });
	s += svgPoly([A, B, C], { fill: '#eef2ff', stroke: '#4f46e5' });
	if (labels.g) s += svgLabel([(A[0] + B[0]) / 2, oy + 16], labels.g);
	if (labels.h) s += svgLabel([C[0] - 20, (C[1] + A[1]) / 2], labels.h);
	if (labels.l) s += svgLabel([(B[0] + B2[0]) / 2 + 10, (B[1] + B2[1]) / 2 - 4], labels.l, { color: '#6b7280' });
	s += '</svg>';
	return s;
}

// Square pyramid (Schrägbild): oblique base square + apex.
function svgPyramid(a: number, h: number, labels: { a?: string; h?: string } = {}): string {
	const W = 280, H = 250, pad = 34;
	const dx = 0.5, dy = -0.28;
	const scale = Math.min((W - 2 * pad) / (a + a * dx), (H - 2 * pad) / (h + a * Math.abs(dy) + 10));
	const cx = W / 2, baseY = H - pad;
	const half = (a * scale) / 2;
	const off: Pt = [a * dx * scale, a * dy * scale];
	const FL: Pt = [cx - half, baseY], FR: Pt = [cx + half, baseY];
	const BL: Pt = vAdd(FL, off), BR: Pt = vAdd(FR, off);
	const centerBase: Pt = [(FL[0] + FR[0] + BL[0] + BR[0]) / 4, (FL[1] + FR[1] + BL[1] + BR[1]) / 4];
	const apex: Pt = [centerBase[0], centerBase[1] - h * scale];
	let s = svgOpen(W, H);
	s += svgPoly([FL, FR, BR, BL], { fill: '#f9fafb', stroke: '#c7d2fe', dash: true });
	s += svgLineSeg(apex, BL, { color: '#c7d2fe', dash: true });
	s += svgLineSeg(apex, BR, { color: '#374151' });
	s += svgLineSeg(apex, FL, { color: '#374151' });
	s += svgLineSeg(apex, FR, { color: '#374151' });
	s += svgLineSeg(centerBase, apex, { color: '#9ca3af', dash: true });
	s += svgLineSeg(FL, FR, { color: '#4f46e5', width: 2 });
	if (labels.a) s += svgLabel([(FL[0] + FR[0]) / 2, baseY + 16], labels.a);
	if (labels.h) s += svgLabel([centerBase[0] + 16, (centerBase[1] + apex[1]) / 2], labels.h, { color: '#6b7280' });
	s += '</svg>';
	return s;
}

// Two rays from apex Z through two parallel transversals (Strahlensätze).
function svgStrahlensatz(a: number, b: number, c: number, d: number, labels: { a: string; b: string; c: string; d: string }): string {
	const W = 300, H = 230, pad = 30;
	const total1 = a + b, total2 = c + d;
	const angle1 = -0.55, angle2 = 0.55; // radians from vertical-down direction
	const scale = (H - 2 * pad) / Math.max(total1, total2);
	const Z: Pt = [W / 2, pad];
	const dir1: Pt = [Math.sin(angle1), Math.cos(angle1)];
	const dir2: Pt = [Math.sin(angle2), Math.cos(angle2)];
	const P1: Pt = vAdd(Z, vScale(dir1, a * scale));
	const E1: Pt = vAdd(Z, vScale(dir1, total1 * scale));
	const P2: Pt = vAdd(Z, vScale(dir2, c * scale));
	const E2: Pt = vAdd(Z, vScale(dir2, total2 * scale));
	let s = svgOpen(W, H);
	s += svgLineSeg(Z, E1, { color: '#374151' });
	s += svgLineSeg(Z, E2, { color: '#374151' });
	s += svgLineSeg(P1, P2, { color: '#4f46e5', width: 2 });
	s += svgLineSeg(E1, E2, { color: '#4f46e5', width: 2 });
	s += `<circle cx="${Z[0].toFixed(1)}" cy="${Z[1].toFixed(1)}" r="2.5" fill="#374151"/>`;
	s += svgLabel([Z[0], Z[1] - 8], 'Z', { size: 12 });
	const mid = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
	s += svgLabel(vAdd(mid(Z, P1), [-16, 0]), labels.a, { size: 12 });
	s += svgLabel(vAdd(mid(P1, E1), [-16, 0]), labels.b, { size: 12 });
	s += svgLabel(vAdd(mid(Z, P2), [16, 0]), labels.c, { size: 12 });
	s += svgLabel(vAdd(mid(P2, E2), [16, 0]), labels.d, { size: 12 });
	s += '</svg>';
	return s;
}

// Central dilation (zentrische Streckung): small figure and its scaled image from center Z.
function svgDilation(k: number, labels: { orig: string; image: string }): string {
	const W = 300, H = 230, pad = 30;
	const Z: Pt = [0, 0];
	const base: Pt[] = [[70, -10], [105, -5], [85, 35]];
	const image = base.map(p => vScale(p, k));
	const all: Pt[] = [Z, ...base, ...image];
	const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
	const minX = Math.min(...xs), maxX = Math.max(...xs);
	const minY = Math.min(...ys), maxY = Math.max(...ys);
	const spanX = Math.max(maxX - minX, 0.01), spanY = Math.max(maxY - minY, 0.01);
	const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
	const ccx = (minX + maxX) / 2, ccy = (minY + maxY) / 2;
	const tx = (p: Pt): Pt => [W / 2 + (p[0] - ccx) * scale, H / 2 - (p[1] - ccy) * scale];
	const Zf = tx(Z), origF = base.map(tx), imageF = image.map(tx);
	let s = svgOpen(W, H);
	for (const p of origF) s += svgLineSeg(Zf, p, { color: '#c7d2fe', dash: true });
	for (const p of imageF) s += svgLineSeg(Zf, p, { color: '#e5e7eb', dash: true });
	s += svgPoly(imageF, { fill: '#f9fafb', stroke: '#9ca3af' });
	s += svgPoly(origF, { fill: '#eef2ff', stroke: '#4f46e5' });
	s += `<circle cx="${Zf[0].toFixed(1)}" cy="${Zf[1].toFixed(1)}" r="2.5" fill="#374151"/>`;
	s += svgLabel([Zf[0] - 10, Zf[1] + 4], 'Z', { size: 12 });
	const cO: Pt = [(origF[0][0] + origF[1][0] + origF[2][0]) / 3, (origF[0][1] + origF[1][1] + origF[2][1]) / 3];
	const cI: Pt = [(imageF[0][0] + imageF[1][0] + imageF[2][0]) / 3, (imageF[0][1] + imageF[1][1] + imageF[2][1]) / 3];
	s += svgLabel(cO, labels.orig, { size: 12, color: '#4f46e5' });
	s += svgLabel(cI, labels.image, { size: 12, color: '#6b7280' });
	s += '</svg>';
	return s;
}

// Simple labeled dimension bar (mm/cm/m/km) for length-unit conversions.
function svgLengthBar(text: string): string {
	const W = 280, H = 74;
	let s = svgOpen(W, H);
	s += svgLineSeg([28, 40], [252, 40]);
	s += svgLineSeg([28, 30], [28, 50], { width: 1.5 });
	s += svgLineSeg([252, 30], [252, 50], { width: 1.5 });
	s += svgLabel([140, 24], text, { size: 14 });
	s += '</svg>';
	return s;
}

// A single free-standing angle at vertex Z=(50,H-30): ray0 along 0°, ray1 along `deg`°
// (deg may exceed 180° for a reflex angle — the arc always sweeps the same direction as `deg`).
function svgSimpleAngle(deg: number): string {
	const W = 260, H = 170;
	const Z: Pt = [50, H - 30];
	const rayLen = 190;
	const toXY = (angleDeg: number, len: number): Pt => [Z[0] + len * Math.cos(angleDeg * Math.PI / 180), Z[1] - len * Math.sin(angleDeg * Math.PI / 180)];
	let s = svgOpen(W, H);
	s += svgLineSeg(Z, toXY(0, rayLen));
	s += svgLineSeg(Z, toXY(deg, rayLen));
	if (deg === 90) {
		s += rightAngleMarker(Z, toXY(0, 1), toXY(90, 1));
	} else {
		s += angleArc(Z, toXY(0, 30), toXY(deg, 30), '', 22);
	}
	s += `<circle cx="${Z[0]}" cy="${Z[1]}" r="2" fill="#374151"/>`;
	s += '</svg>';
	return s;
}

// Two full lines crossing at the center, forming 4 angle regions (0..3, counter-clockwise from
// the positive x-axis). `labels[i]` is drawn in region i using a fixed screen-quadrant offset,
// which is geometrically consistent as long as thetaDeg ∈ (0°, 90°) — true for all callers here.
function svgVerticalAngles(thetaDeg: number, labels: [string, string, string, string]): string {
	const W = 260, H = 220, pad = 30;
	const Z: Pt = [W / 2, H / 2];
	const rayLen = Math.min(W, H) / 2 - pad;
	const bounds = [0, thetaDeg, 180, 180 + thetaDeg, 360];
	const toXY = (deg: number, len: number): Pt => [Z[0] + len * Math.cos(deg * Math.PI / 180), Z[1] - len * Math.sin(deg * Math.PI / 180)];
	let s = svgOpen(W, H);
	s += svgLineSeg(toXY(0, rayLen), toXY(180, rayLen));
	s += svgLineSeg(toXY(thetaDeg, rayLen), toXY(thetaDeg + 180, rayLen));
	for (let i = 0; i < 4; i++) {
		if (!labels[i]) continue;
		const midDeg = (bounds[i] + bounds[i + 1]) / 2;
		s += svgLabel(toXY(midDeg, 34), labels[i], { size: 13, color: '#4f46e5' });
		const a1 = bounds[i] * Math.PI / 180, a2 = bounds[i + 1] * Math.PI / 180, r = 18;
		const sx = Z[0] + r * Math.cos(a1), sy = Z[1] - r * Math.sin(a1);
		const ex = Z[0] + r * Math.cos(a2), ey = Z[1] - r * Math.sin(a2);
		s += `<path d="M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${r} ${r} 0 0 0 ${ex.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="#9ca3af" stroke-width="1.2"/>`;
	}
	s += `<circle cx="${Z[0]}" cy="${Z[1]}" r="2" fill="#374151"/>`;
	s += '</svg>';
	return s;
}

// Two horizontal parallels cut by a transversal at thetaDeg, with 4 angle labels around each
// intersection point placed at fixed screen offsets — consistent at both points since the local
// ray geometry (rails horizontal, transversal at thetaDeg) is identical at Z1 and Z2.
function svgParallelsTransversal(thetaDeg: number, z1Labels: [string, string, string, string], z2Labels: [string, string, string, string]): string {
	const W = 300, H = 240;
	const y1 = 175, y2 = 65;
	const railLeft = 20, railRight = 280;
	const theta = thetaDeg * Math.PI / 180;
	const dy = y1 - y2;
	const dx = dy / Math.tan(theta);
	const midX = W / 2;
	const x1: Pt = [midX - dx / 2, y1], x2: Pt = [midX + dx / 2, y2];
	let s = svgOpen(W, H);
	s += svgLineSeg([railLeft, y1], [railRight, y1]);
	s += svgLineSeg([railLeft, y2], [railRight, y2]);
	const ext = 30;
	const dirX = x2[0] - x1[0], dirY = x2[1] - x1[1];
	const len = Math.hypot(dirX, dirY);
	const ux = dirX / len, uy = dirY / len;
	s += svgLineSeg([x1[0] - ux * ext, x1[1] - uy * ext], [x2[0] + ux * ext, x2[1] + uy * ext], { color: '#4f46e5' });
	s += `<circle cx="${x1[0].toFixed(1)}" cy="${x1[1].toFixed(1)}" r="2" fill="#374151"/>`;
	s += `<circle cx="${x2[0].toFixed(1)}" cy="${x2[1].toFixed(1)}" r="2" fill="#374151"/>`;
	const offsets: Pt[] = [[18, -14], [-18, -14], [-18, 14], [18, 14]];
	const place = (Z: Pt, labels: [string, string, string, string]) => {
		let out = '';
		labels.forEach((txt, i) => { if (txt) out += svgLabel(vAdd(Z, offsets[i]), txt, { size: 12, color: '#4f46e5' }); });
		return out;
	};
	s += place(x1, z1Labels);
	s += place(x2, z2Labels);
	s += '</svg>';
	return s;
}

// Coordinate grid with plotted, labeled points (extension of svgCoordSystem for point-reading tasks).
function svgCoordPoints(points: { x: number; y: number; label: string }[], range: number): string {
	const W = 260, H = 260, pad = 28;
	const plotW = W - 2 * pad, plotH = H - 2 * pad;
	const sx = plotW / (range * 2), sy = plotH / (range * 2);
	const ox = pad + plotW / 2, oy = pad + plotH / 2;
	const tx = (x: number) => +(ox + x * sx).toFixed(1);
	const ty = (y: number) => +(oy - y * sy).toFixed(1);
	const gc = '#e5e7eb', ac = '#6b7280';
	let s = svgOpen(W, H);
	for (let i = -range; i <= range; i++) {
		s += svgLineSeg([tx(i), pad], [tx(i), H - pad], { color: gc, width: 1 });
		s += svgLineSeg([pad, ty(i)], [W - pad, ty(i)], { color: gc, width: 1 });
	}
	s += svgLineSeg([pad, oy], [W - pad, oy], { color: ac, width: 2 });
	s += svgLineSeg([ox, pad], [ox, H - pad], { color: ac, width: 2 });
	for (let i = -range; i <= range; i++) {
		if (i === 0) continue;
		if (i % 2 === 0 || range <= 5) {
			s += svgLabel([tx(i), oy + 14], String(i), { size: 9, color: ac, bold: false });
			s += svgLabel([ox - 14, ty(i) + 3], String(i), { size: 9, color: ac, bold: false });
		}
	}
	for (const p of points) {
		s += `<circle cx="${tx(p.x)}" cy="${ty(p.y)}" r="3.5" fill="#4f46e5"/>`;
		s += svgLabel([tx(p.x) + 12, ty(p.y) - 8], p.label, { size: 13, color: '#4f46e5' });
	}
	s += '</svg>';
	return s;
}

// Points inscribed on a circle (Kreissätze): pointDegs placed on the circumference, `connections`
// draws chords between them by index, optional center marker with dashed radii for central-angle tasks.
function svgCircleInscribed(
	pointDegs: { deg: number; label: string }[],
	connections: [number, number][],
	opts: { showCenter?: boolean; centerConnections?: number[] } = {}
): string {
	const W = 260, H = 260, pad = 34;
	const r = Math.min(W, H) / 2 - pad;
	const cx = W / 2, cy = H / 2;
	const pts: Pt[] = pointDegs.map(p => [cx + r * Math.cos(p.deg * Math.PI / 180), cy - r * Math.sin(p.deg * Math.PI / 180)]);
	let s = svgOpen(W, H);
	s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#9ca3af" stroke-width="1.5"/>`;
	if (opts.showCenter) {
		s += `<circle cx="${cx}" cy="${cy}" r="2" fill="#374151"/>`;
		s += svgLabel([cx - 12, cy + 14], 'M', { size: 11, color: '#6b7280' });
		for (const idx of opts.centerConnections ?? []) {
			s += svgLineSeg([cx, cy], pts[idx], { color: '#9ca3af', dash: true });
		}
	}
	for (const [i, j] of connections) s += svgLineSeg(pts[i], pts[j], { color: '#4f46e5' });
	pointDegs.forEach((p, i) => {
		s += `<circle cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="2.5" fill="#374151"/>`;
		const lp: Pt = [cx + (r + 16) * Math.cos(p.deg * Math.PI / 180), cy - (r + 16) * Math.sin(p.deg * Math.PI / 180)];
		s += svgLabel(lp, p.label, { size: 12 });
	});
	s += '</svg>';
	return s;
}

// "Haus der Vierecke" hierarchy diagram, highlighting the two shapes named in the current question.
function svgViereckHaus(highlight: string[]): string {
	const positions: Record<string, Pt> = {
		Viereck: [150, 20], Trapez: [150, 62], Drachen: [235, 105], Parallelogramm: [105, 105],
		Rechteck: [65, 150], Raute: [150, 150], Quadrat: [107, 195]
	};
	const edges: [string, string][] = [
		['Trapez', 'Viereck'], ['Drachen', 'Viereck'], ['Parallelogramm', 'Trapez'], ['Raute', 'Drachen'],
		['Raute', 'Parallelogramm'], ['Rechteck', 'Parallelogramm'], ['Quadrat', 'Rechteck'], ['Quadrat', 'Raute']
	];
	const W = 300, H = 220;
	let s = svgOpen(W, H);
	for (const [a, b] of edges) s += svgLineSeg(positions[a], positions[b], { color: '#9ca3af', width: 1.2 });
	for (const [name, p] of Object.entries(positions)) {
		const hl = highlight.includes(name);
		s += `<rect x="${p[0] - 34}" y="${p[1] - 11}" width="68" height="22" rx="5" fill="${hl ? '#eef2ff' : '#f9fafb'}" stroke="${hl ? '#4f46e5' : '#d1d5db'}" stroke-width="${hl ? 2 : 1}"/>`;
		s += svgLabel([p[0], p[1] + 4], name, { size: 10, color: hl ? '#4f46e5' : '#374151' });
	}
	s += '</svg>';
	return s;
}

// Triangle with all three medians drawn, meeting at the centroid S (besondere Linien im Dreieck).
function svgTriangleCevians(): string {
	const A: Pt = [20, 190], B: Pt = [280, 190], C: Pt = [110, 20];
	const S: Pt = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3];
	const midAB: Pt = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
	const midBC: Pt = [(B[0] + C[0]) / 2, (B[1] + C[1]) / 2];
	const midCA: Pt = [(C[0] + A[0]) / 2, (C[1] + A[1]) / 2];
	let s = svgOpen(300, 210);
	s += svgPoly([A, B, C]);
	s += svgLineSeg(A, midBC, { color: '#9ca3af', dash: true });
	s += svgLineSeg(B, midCA, { color: '#9ca3af', dash: true });
	s += svgLineSeg(C, midAB, { color: '#9ca3af', dash: true });
	s += `<circle cx="${S[0].toFixed(1)}" cy="${S[1].toFixed(1)}" r="3" fill="#4f46e5"/>`;
	s += svgLabel([S[0] + 14, S[1]], 'S', { size: 12, color: '#4f46e5' });
	s += '</svg>';
	return s;
}

// Two separate line segments (own centers, same style) for comparing slope — parallel/senkrecht checks.
function svgTwoSegments(deg1: number, deg2: number): string {
	const W = 220, H = 160;
	const c1: Pt = [110, 50], c2: Pt = [110, 110];
	const toXY = (c: Pt, deg: number, len: number): Pt => [c[0] + len * Math.cos(deg * Math.PI / 180), c[1] - len * Math.sin(deg * Math.PI / 180)];
	let s = svgOpen(W, H);
	s += svgLineSeg(toXY(c1, deg1, 70), toXY(c1, deg1 + 180, 70), { color: '#4f46e5', width: 3 });
	s += svgLineSeg(toXY(c2, deg2, 70), toXY(c2, deg2 + 180, 70), { color: '#dc2626', width: 3 });
	s += '</svg>';
	return s;
}

// Basic Grundschule shape gallery: circle, triangle/pentagon/hexagon (regular), rectangle, square,
// and one deliberately irregular quadrilateral (for corner-count / symmetry questions).
function svgShape(kind: 'kreis' | 'dreieck' | 'viereck' | 'rechteck' | 'quadrat' | 'fuenfeck' | 'sechseck'): string {
	const W = 200, H = 160, cx = 100, cy = 85, r = 55;
	let s = svgOpen(W, H);
	if (kind === 'kreis') {
		s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#eef2ff" stroke="#4f46e5" stroke-width="2.5"/>`;
	} else if (kind === 'rechteck') {
		s += svgPoly([[cx - 70, cy - 40], [cx + 70, cy - 40], [cx + 70, cy + 40], [cx - 70, cy + 40]]);
	} else if (kind === 'quadrat') {
		s += svgPoly([[cx - 50, cy - 50], [cx + 50, cy - 50], [cx + 50, cy + 50], [cx - 50, cy + 50]]);
	} else if (kind === 'viereck') {
		s += svgPoly([[cx - 60, cy - 20], [cx + 40, cy - 45], [cx + 65, cy + 35], [cx - 45, cy + 50]]);
	} else {
		const n = kind === 'dreieck' ? 3 : kind === 'fuenfeck' ? 5 : 6;
		const pts: Pt[] = Array.from({ length: n }, (_, i) => {
			const a = -Math.PI / 2 + i * 2 * Math.PI / n;
			return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
		});
		s += svgPoly(pts);
	}
	s += '</svg>';
	return s;
}

// ── Generator registry ────────────────────────────────────────────────────────

const registry = new Map<string, Gen>();

function reg(atomId: string, gen: Gen): void {
	registry.set(atomId, gen);
}

// ── 1. Zahlverständnis / Zählen ───────────────────────────────────────────────

reg('arithmetik__zaehlen_zahlwortreihe', () => {
	const step = pick([1, 2, 5, 10]);
	const dir = rand(0, 1) === 0 ? 1 : -1;
	const start = dir === 1 ? rand(1, 10) * step : rand(5, 25) * step;
	const terms = [0, 1, 2, 3].map(i => start + dir * i * step);
	const missing = rand(0, 3);
	const display = terms.map((v, i) => (i === missing ? '___' : String(v))).join(', ');
	return {
		atomId: 'arithmetik__zaehlen_zahlwortreihe',
		prompt: `Welche Zahl fehlt? ${display}`,
		answerType: 'integer',
		correctAnswer: String(terms[missing]),
		hint: `Die Folge ${dir === 1 ? 'zählt vorwärts' : 'zählt rückwärts'} in ${step}er-Schritten.`,
		why: `Von Zahl zu Zahl geht es immer um ${step} ${dir === 1 ? 'weiter' : 'zurück'}. An der Lücke steht deshalb ${terms[missing]}.`, difficulty: step === 1 ? 0.1 : step === 2 ? 0.2 : 0.3
	};
});

reg('arithmetik__zahlverstaendnis_bis_20', (stage = 0) => {
	// Expanding sequence: Nachfolger (0.1) → Zahlenvergleich (0.15) → Zerlegung (0.2).
	const type = Math.min(stage, 2);
	if (type === 0) {
		const n = rand(2, 19);
		return { atomId: 'arithmetik__zahlverstaendnis_bis_20', prompt: `Welche Zahl kommt nach ${n}?`, answerType: 'integer', correctAnswer: String(n + 1), why: `Beim Zählen kommt nach ${n} die ${n + 1}: ${n} + 1 = ${n + 1}.`, difficulty: 0.1 };
	} else if (type === 1) {
		const a = rand(1, 20);
		let b = rand(1, 20);
		while (b === a) b = rand(1, 20);
		const bigger = Math.max(a, b);
		return { atomId: 'arithmetik__zahlverstaendnis_bis_20', prompt: `Welche Zahl ist größer: ${a} oder ${b}?`, answerType: 'integer', correctAnswer: String(bigger), choices: [String(a), String(b)], why: `${bigger} kommt beim Zählen später als ${Math.min(a, b)} – sie ist die größere Zahl.`, difficulty: 0.15 };
	} else {
		const n = rand(2, 10);
		const a = rand(1, n - 1);
		return { atomId: 'arithmetik__zahlverstaendnis_bis_20', prompt: `${n} = ${a} + ___`, answerType: 'integer', correctAnswer: String(n - a), why: `${a} und ${n - a} ergeben zusammen ${n}: ${a} + ${n - a} = ${n}.`, difficulty: 0.2 };
	}
});

reg('arithmetik__zahlzerlegung_bis_10', () => {
	const total = rand(4, 10);
	const part = rand(1, total - 1);
	return {
		atomId: 'arithmetik__zahlzerlegung_bis_10',
		prompt: `${total} = ${part} + ___`,
		answerType: 'integer',
		correctAnswer: String(total - part),
		why: `${part} und ${total - part} ergeben zusammen ${total}: ${part} + ${total - part} = ${total}.`, difficulty: 0.15
	};
});

reg('arithmetik__stellenwert_bis_100', () => {
	const n = rand(11, 99);
	const tens = Math.floor(n / 10);
	const ones = n % 10;
	const q = rand(0, 1);
	if (q === 0) return { atomId: 'arithmetik__stellenwert_bis_100', prompt: `Wie viele Zehner hat die Zahl ${n}?`, answerType: 'integer', correctAnswer: String(tens), why: `${n} = ${tens} Zehner + ${ones} Einer. Die Zehner stehen links.`, difficulty: 0.2 };
	return { atomId: 'arithmetik__stellenwert_bis_100', prompt: `Wie viele Einer hat die Zahl ${n}?`, answerType: 'integer', correctAnswer: String(ones), why: `${n} = ${tens} Zehner + ${ones} Einer. Die Einer stehen ganz rechts.`, difficulty: 0.2 };
});

reg('arithmetik__stellenwert_bis_1000', () => {
	const n = rand(101, 999);
	const hundreds = Math.floor(n / 100);
	const tens = Math.floor((n % 100) / 10);
	const ones = n % 10;
	const q = pick(['H', 'Z', 'E']);
	const map: Record<string, [string, number]> = { H: ['Hunderter', hundreds], Z: ['Zehner', tens], E: ['Einer', ones] };
	const [label, val] = map[q];
	return { atomId: 'arithmetik__stellenwert_bis_1000', prompt: `Wie viele ${label} hat die Zahl ${n}?`, answerType: 'integer', correctAnswer: String(val), why: `${n} = ${hundreds} Hunderter + ${tens} Zehner + ${ones} Einer. Gefragt sind die ${label}: ${val}.`, difficulty: 0.25 };
});

reg('arithmetik__stellenwert_bis_1000000', () => {
	const n = rand(100000, 999999);
	const digits = String(n);
	const places = ['Hunderttausender', 'Zehntausender', 'Tausender', 'Hunderter', 'Zehner', 'Einer'];
	const idx = rand(0, 5);
	const digit = parseInt(digits[idx]);
	return { atomId: 'arithmetik__stellenwert_bis_1000000', prompt: `Welche Ziffer steht an der ${places[idx]}-Stelle der Zahl ${digits.slice(0, 3)} ${digits.slice(3)}?`, answerType: 'integer', correctAnswer: String(digit), why: `Von rechts nach links: Einer, Zehner, Hunderter, Tausender, Zehntausender, Hunderttausender. An der ${places[idx]}-Stelle steht die ${digit}.`, difficulty: 0.3 };
});

reg('arithmetik__natuerliche_zahlen_darstellen_ordnen', () => {
	const set = new Set<number>();
	while (set.size < 4) set.add(rand(10, 9999));
	const nums = [...set];
	const smallest = rand(0, 1) === 0;
	const answer = smallest ? Math.min(...nums) : Math.max(...nums);
	return { atomId: 'arithmetik__natuerliche_zahlen_darstellen_ordnen', prompt: `Welche ist die ${smallest ? 'kleinste' : 'größte'} Zahl?`, answerType: 'integer', correctAnswer: String(answer), choices: nums.map(String), hint: 'Vergleiche zuerst die Anzahl der Stellen, dann von links nach rechts.', why: `Mehr Stellen bedeutet größere Zahl; bei gleich vielen Stellen entscheidet die erste verschiedene Ziffer von links. Geordnet: ${[...nums].sort((x, y) => x - y).join(' < ')}.`, difficulty: 0.3 };
});

reg('arithmetik__runden_natuerliche_zahlen', (stage = 0) => {
	// Expanding sequence: round to tens, then hundreds, then thousands.
	const steps = [10, 100, 1000];
	const to = steps[Math.min(stage, steps.length - 1)];
	const n = rand(1, 9) * to + rand(1, to - 1);
	const rounded = Math.round(n / to) * to;
	return { atomId: 'arithmetik__runden_natuerliche_zahlen', prompt: `Runde ${n} auf ${to}er: ___`, answerType: 'integer', correctAnswer: String(rounded), hint: `Ab der Mitte (${to / 2}) wird aufgerundet.`, why: `${n} liegt zwischen ${Math.floor(n / to) * to} und ${Math.floor(n / to) * to + to}. Die Mitte ist ${Math.floor(n / to) * to + to / 2}: ${n} liegt ${n >= Math.floor(n / to) * to + to / 2 ? 'nicht darunter → aufrunden' : 'darunter → abrunden'}, also ${rounded}.`, difficulty: 0.3 };
});

reg('arithmetik__roemische_zahlen', (stage = 0) => {
	const map: [number, string][] = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
	const n = rand(1, 399);
	let num = n, roman = '';
	for (const [val, sym] of map) { while (num >= val) { roman += sym; num -= val; } }
	const hint = 'M=1000, D=500, C=100, L=50, X=10, V=5, I=1. Subtraktionsregel: IV=4, IX=9, XL=40, XC=90, CD=400.';
	// Expanding sequence: römisch → arabisch (lesen) zuerst, arabisch → römisch (schreiben) danach.
	const q = Math.min(stage, 1);
	if (q === 0) return { atomId: 'arithmetik__roemische_zahlen', prompt: `${roman} als arabische Zahl?`, answerType: 'integer', correctAnswer: String(n), hint, why: romanWhy(roman, n), difficulty: 0.35 };
	return { atomId: 'arithmetik__roemische_zahlen', prompt: `${n} als römische Zahl?`, answerType: 'text', correctAnswer: roman, hint, why: romanWhy(roman, n), difficulty: 0.4 };
});

reg('arithmetik__ueberschlagsrechnung', (stage = 0) => {
	const atomId = 'arithmetik__ueberschlagsrechnung';
	// Expanding sequence: Addition → Subtraktion → Multiplikation schätzen.
	const op = ['+', '−', '·'][Math.min(stage, 2)];
	if (op === '+') {
		const a = rand(2, 9) * 10 + rand(3, 7), b = rand(2, 9) * 10 + rand(3, 7);
		const ra = Math.round(a / 10) * 10, rb = Math.round(b / 10) * 10;
		return { atomId, prompt: `Schätze: ${a} + ${b} ≈ ___  (runde auf Zehner)`, answerType: 'integer', correctAnswer: String(ra + rb), hint: `${a} ≈ ${ra}, ${b} ≈ ${rb}`, why: `Erst runden: ${a} ≈ ${ra} und ${b} ≈ ${rb}. Dann rechnen: ${ra} + ${rb} = ${ra + rb}.`, difficulty: 0.3 };
	}
	if (op === '−') {
		const a = rand(3, 9) * 10 + rand(3, 7), b = rand(1, 5) * 10 + rand(3, 7);
		const ra = Math.round(a / 10) * 10, rb = Math.round(b / 10) * 10;
		return { atomId, prompt: `Schätze: ${a} − ${b} ≈ ___  (runde auf Zehner)`, answerType: 'integer', correctAnswer: String(ra - rb), hint: `${a} ≈ ${ra}, ${b} ≈ ${rb}`, why: `Erst runden: ${a} ≈ ${ra} und ${b} ≈ ${rb}. Dann rechnen: ${ra} − ${rb} = ${ra - rb}.`, difficulty: 0.35 };
	}
	const x = rand(2, 6), y = rand(2, 7) * 10 + rand(3, 7);
	const ry = Math.round(y / 10) * 10;
	return { atomId, prompt: `Schätze: ${x} · ${y} ≈ ___  (runde auf Zehner)`, answerType: 'integer', correctAnswer: String(x * ry), hint: `${y} ≈ ${ry}, dann ${x} · ${ry}`, why: `Erst runden: ${y} ≈ ${ry}. Dann rechnen: ${x} · ${ry} = ${x * ry}.`, difficulty: 0.4 };
});

// ── 2. Grundrechenarten (kleine Zahlen) ───────────────────────────────────────

reg('arithmetik__addition_subtraktion_bis_10', () => {
	const op = rand(0, 1);
	if (op === 0) {
		const a = rand(1, 9), b = rand(1, 10 - a);
		return { atomId: 'arithmetik__addition_subtraktion_bis_10', prompt: `${a} + ${b} = ?`, answerType: 'integer', correctAnswer: String(a + b), why: `Zähle von ${a} aus ${b} weiter: ${a} + ${b} = ${a + b}.`, difficulty: 0.1 };
	} else {
		const res = rand(1, 9), b = rand(1, res);
		return { atomId: 'arithmetik__addition_subtraktion_bis_10', prompt: `${res} − ${b} = ?`, answerType: 'integer', correctAnswer: String(res - b), why: `Von ${res} nimmst du ${b} weg, es bleiben ${res - b}. Probe: ${res - b} + ${b} = ${res}.`, difficulty: 0.1 };
	}
});

reg('arithmetik__add_sub_bis_20_ohne_uebergang', () => {
	const atomId = 'arithmetik__add_sub_bis_20_ohne_uebergang';
	if (rand(0, 1) === 0) {
		// Addition stays below 20: ones digits must not reach ten
		const a = rand(11, 18), b = rand(1, 9 - (a % 10));
		return { atomId, prompt: `${a} + ${b} = ?`, answerType: 'integer', correctAnswer: String(a + b), why: `Die 10 bleibt stehen, du rechnest nur mit den Einern: ${a % 10} + ${b} = ${a % 10 + b}, also ${a + b}.`, difficulty: 0.15 };
	}
	// Subtraction stays in the second ten: subtrahend ≤ ones digit of the minuend
	const a = rand(12, 19), b = rand(1, a % 10);
	return { atomId, prompt: `${a} − ${b} = ?`, answerType: 'integer', correctAnswer: String(a - b), why: `Die 10 bleibt stehen, du rechnest nur mit den Einern: ${a % 10} − ${b} = ${a % 10 - b}, also ${a - b}.`, difficulty: 0.15 };
});

reg('arithmetik__zehnerueberschreitung_bis_20', (stage = 0) => {
	const atomId = 'arithmetik__zehnerueberschreitung_bis_20';
	// Expanding sequence: Addition über den Zehner → Subtraktion über den Zehner.
	const op = Math.min(stage, 1);
	if (op === 0) {
		const a = rand(7, 9), b = rand(10 - a + 1, 9);
		return { atomId, prompt: `${a} + ${b} = ?`, answerType: 'integer', correctAnswer: String(a + b), hint: `Nutze den Zehner: ${a} + ${10 - a} = 10, dann noch ${b - (10 - a)}.`, why: `Erst bis zur 10: ${a} + ${10 - a} = 10. Von der ${b} bleiben noch ${b - (10 - a)}: 10 + ${b - (10 - a)} = ${a + b}.`, difficulty: 0.25 };
	}
	// Subtraction crossing ten: minuend ∈ [11,18], single-digit subtrahend, result ∈ [2,9]
	const minuend = rand(11, 18);
	const sub = rand(minuend - 9, 9);
	const result = minuend - sub;
	return { atomId, prompt: `${minuend} − ${sub} = ?`, answerType: 'integer', correctAnswer: String(result), hint: `Zerlege ${sub}: ${minuend} − ${minuend - 10} = 10, dann − ${sub - (minuend - 10)}.`, why: `Erst zurück zur 10: ${minuend} − ${minuend - 10} = 10. Dann noch ${sub - (minuend - 10)} weg: 10 − ${sub - (minuend - 10)} = ${result}.`, difficulty: 0.3 };
});

reg('arithmetik__verdoppeln_halbieren', () => {
	const q = rand(0, 1);
	if (q === 0) { const n = rand(1, 25); return { atomId: 'arithmetik__verdoppeln_halbieren', prompt: `Das Doppelte von ${n} = ?`, answerType: 'integer', correctAnswer: String(2 * n), why: `Das Doppelte heißt: zweimal die Zahl. ${n} + ${n} = ${2 * n}.`, difficulty: 0.2 }; }
	const n = rand(1, 25) * 2;
	return { atomId: 'arithmetik__verdoppeln_halbieren', prompt: `Die Hälfte von ${n} = ?`, answerType: 'integer', correctAnswer: String(n / 2), why: `Die Hälfte: in zwei gleiche Teile teilen. ${n / 2} + ${n / 2} = ${n}.`, difficulty: 0.2 };
});

reg('arithmetik__add_sub_zehnerzahlen', () => {
	const atomId = 'arithmetik__add_sub_zehnerzahlen';
	if (rand(0, 1) === 0) {
		// Sum stays within the number range up to 100
		const a = rand(1, 8), b = rand(1, 10 - a);
		return { atomId, prompt: `${a * 10} + ${b * 10} = ?`, answerType: 'integer', correctAnswer: String((a + b) * 10), why: `Rechne mit Zehnern wie mit Einern: ${a} Zehner + ${b} Zehner = ${a + b} Zehner = ${(a + b) * 10}.`, difficulty: 0.2 };
	}
	const big = rand(2, 10), small = rand(1, big - 1);
	return { atomId, prompt: `${big * 10} − ${small * 10} = ?`, answerType: 'integer', correctAnswer: String((big - small) * 10), why: `Rechne mit Zehnern wie mit Einern: ${big} Zehner − ${small} Zehner = ${big - small} Zehner = ${(big - small) * 10}.`, difficulty: 0.2 };
});

reg('arithmetik__add_sub_bis_100_ohne_uebergang', () => {
	const atomId = 'arithmetik__add_sub_bis_100_ohne_uebergang';
	const op = rand(0, 1);
	if (op === 0) {
		// Addition without carry: ones digits must not cross ten
		const aTens = rand(1, 8), aOnes = rand(0, 9);
		const a = aTens * 10 + aOnes;
		const bOnes = rand(0, 9 - aOnes); // guaranteed no carry in ones
		const maxBTens = Math.floor((99 - a) / 10);
		const bTens = rand(0, Math.max(0, maxBTens));
		const b = bTens * 10 + bOnes;
		if (b === 0) return registry.get(atomId)!();
		return { atomId, prompt: `${a} + ${b} = ?`, answerType: 'integer', correctAnswer: String(a + b), why: chainWhy(a, b, 1), difficulty: 0.25 };
	}
	// Subtraction without borrowing: ones of minuend >= ones of subtrahend
	const bigTens = rand(2, 9), bigOnes = rand(0, 9);
	const big = bigTens * 10 + bigOnes;
	const smallOnes = rand(0, bigOnes); // no borrowing needed
	const smallTens = rand(0, bigTens - 1);
	const small = smallTens * 10 + smallOnes;
	if (small === 0) return registry.get(atomId)!();
	return { atomId, prompt: `${big} − ${small} = ?`, answerType: 'integer', correctAnswer: String(big - small), why: chainWhy(big, small, -1), difficulty: 0.25 };
});

reg('arithmetik__add_sub_bis_100_mit_uebergang', () => {
	const atomId = 'arithmetik__add_sub_bis_100_mit_uebergang';
	const op = rand(0, 1);
	if (op === 0) {
		// ZE + ZE: ones digits must cross ten, sum stays below 100
		const aOnes = rand(2, 9), aTens = rand(1, 7);
		const a = aTens * 10 + aOnes;
		const b = rand(1, 8 - aTens) * 10 + rand(10 - aOnes, 9);
		return { atomId, prompt: `${a} + ${b} = ?`, answerType: 'integer', correctAnswer: String(a + b), why: `${chainWhy(a, b, 1)} Die Einer ergeben mehr als 10 – ein neuer Zehner wird voll.`, difficulty: 0.35 };
	}
	// Subtraction with borrowing: ones of minuend < ones of subtrahend
	const bigTens = rand(2, 9), bigOnes = rand(0, 8);
	const big = bigTens * 10 + bigOnes;
	const smallOnes = rand(bigOnes + 1, 9); // forces borrowing
	const smallTens = rand(1, bigTens - 1);  // result stays >= 10
	const small = smallTens * 10 + smallOnes;
	return { atomId, prompt: `${big} − ${small} = ?`, answerType: 'integer', correctAnswer: String(big - small), why: `${chainWhy(big, small, -1)} Bei den Einern gehst du über einen Zehner zurück.`, difficulty: 0.35 };
});

// ── 3. Schriftliche Verfahren ─────────────────────────────────────────────────

reg('arithmetik__schriftliche_addition', () => {
	// Kl. 3: Zahlenraum bis 1 000
	const a = rand(101, 599), b = rand(101, 999 - a);
	return { atomId: 'arithmetik__schriftliche_addition', prompt: `${a} + ${b} = ?`, answerType: 'integer', correctAnswer: String(a + b), hint: 'Schreibe untereinander und addiere stellenweise von rechts.', why: addWhy(a, b), difficulty: 0.4 };
});

reg('arithmetik__schriftliche_subtraktion', () => {
	// Kl. 3: Zahlenraum bis 1 000
	const b = rand(101, 799), a = b + rand(101, 999 - b);
	return { atomId: 'arithmetik__schriftliche_subtraktion', prompt: `${a} − ${b} = ?`, answerType: 'integer', correctAnswer: String(a - b), hint: 'Schreibe untereinander. Entbündele wenn nötig.', why: `Subtrahiere stellenweise von rechts. Ist die obere Ziffer zu klein, wird ein Zehner (oder Hunderter) der nächsten Stelle entbündelt. Probe: ${a - b} + ${b} = ${a}.`, difficulty: 0.4 };
});

reg('arithmetik__schriftliche_multiplikation', (stage = 0) => {
	const atomId = 'arithmetik__schriftliche_multiplikation';
	// Expanding sequence: single-digit multiplier → two-digit multiplier → three-digit multiplicand.
	const step = Math.min(stage, 2);
	let a: number, b: number;
	if (step === 0) {
		a = rand(13, 99); b = rand(2, 9);
	} else if (step === 1) {
		a = rand(13, 99); do { b = rand(11, 39); } while (b % 10 === 0);
	} else {
		// 2-digit × 3-digit
		a = rand(12, 99); b = rand(101, 299);
	}
	return { atomId, prompt: `${a} · ${b} = ?`, answerType: 'integer', correctAnswer: String(a * b), hint: 'Berechne die Teilprodukte und addiere.', why: `${b < 10 ? partialWhy(b, a) : partialWhy(a, b)} Addiert: ${a * b}.`, difficulty: b > 99 ? 0.6 : 0.5 };
});

reg('arithmetik__schriftliche_division', () => {
	const divisor = rand(2, 9), quotient = rand(10, 999);
	const dividend = divisor * quotient;
	return { atomId: 'arithmetik__schriftliche_division', prompt: `${dividend} : ${divisor} = ?`, answerType: 'integer', correctAnswer: String(quotient), why: `Teile Stelle für Stelle von links. Probe mit der Umkehraufgabe: ${quotient} · ${divisor} = ${dividend}.`, difficulty: 0.5 };
});

// ── 4. Halbschriftlich / Kopfrechnen ─────────────────────────────────────────

reg('arithmetik__halbschriftliches_rechnen', () => {
	const strategy = rand(0, 2);
	if (strategy === 0) {
		const a = rand(1, 9) * 100 + rand(1, 9) * 10, b = rand(1, 9) * 10 + rand(1, 9);
		return { atomId: 'arithmetik__halbschriftliches_rechnen', prompt: `${a} + ${b} = ?`, answerType: 'integer', correctAnswer: String(a + b), why: chainWhy(a, b, 1), difficulty: 0.45 };
	} else if (strategy === 1) {
		const a = rand(2, 9) * 100, b = rand(10, 99);
		return { atomId: 'arithmetik__halbschriftliches_rechnen', prompt: `${a} − ${b} = ?`, answerType: 'integer', correctAnswer: String(a - b), why: chainWhy(a, b, -1), difficulty: 0.45 };
	} else {
		const a = rand(3, 9) * 100 + rand(1, 9) * 10 + rand(1, 9), b = rand(1, 2) * 100 + rand(1, 9) * 10;
		return { atomId: 'arithmetik__halbschriftliches_rechnen', prompt: `${a} − ${b} = ?`, answerType: 'integer', correctAnswer: String(a - b), hint: 'Ziehe erst die Hunderter, dann die Zehner ab.', why: chainWhy(a, b, -1), difficulty: 0.45 };
	}
});

reg('arithmetik__rechengesetze_rechenvorteile', (stage = 0) => {
	const atomId = 'arithmetik__rechengesetze_rechenvorteile';
	// Expanding sequence: Kommutativgesetz → Assoziativgesetz → Rechenvorteil → Distributivgesetz.
	const type = Math.min(stage, 3);
	if (type === 0) {
		const a = rand(1, 9), b = rand(1, 9);
		return { atomId, prompt: `${a} + ${b} = ${b} + ___  (Kommutativgesetz)`, answerType: 'integer', correctAnswer: String(a), why: `Beim Addieren darfst du die Zahlen vertauschen: ${a} + ${b} = ${b} + ${a} = ${a + b}.`, difficulty: 0.2 };
	} else if (type === 1) {
		const a = rand(2, 9), b = rand(2, 9), c = rand(2, 9);
		return { atomId, prompt: `(${a} · ${b}) · ${c} = ${a} · (${b} · ___)`, answerType: 'integer', correctAnswer: String(c), hint: 'Assoziativgesetz: Reihenfolge der Klammern ist egal.', why: `Beim Multiplizieren ist egal, wo die Klammer steht – die Faktoren ${a}, ${b}, ${c} bleiben dieselben. Beide Seiten ergeben ${a * b * c}.`, difficulty: 0.25 };
	} else if (type === 2) {
		const a = rand(10, 50), b = rand(1, 9) * 10;
		return { atomId, prompt: `${a} + ${b} + ${100 - b} = ?  (suche den Rechenweg)`, answerType: 'integer', correctAnswer: String(a + 100), why: `${b} + ${100 - b} = 100 – das zuerst rechnen. Dann ${a} + 100 = ${a + 100}.`, difficulty: 0.35 };
	} else {
		const a = rand(2, 6), b = rand(2, 8), c = rand(2, 8);
		return { atomId, prompt: `${a} · (${b} + ${c}) = ${a} · ${b} + ${a} · ___`, answerType: 'integer', correctAnswer: String(c), hint: `Distributivgesetz: a·(b+c) = a·b + a·c`, why: `${a} wird mit beiden Zahlen in der Klammer multipliziert. Probe: ${a} · ${b + c} = ${a * (b + c)} und ${a * b} + ${a * c} = ${a * (b + c)}.`, difficulty: 0.4 };
	}
});

// ── 5. Multiplikation & Division ─────────────────────────────────────────────

reg('arithmetik__multiplikationsverstaendnis', () => {
	const a = rand(2, 5), b = rand(2, 6);
	const type = rand(0, 1);
	if (type === 0) return { atomId: 'arithmetik__multiplikationsverstaendnis', prompt: `${a} · ${b} = ?  (${a}-mal die ${b}: ${Array(a).fill(b).join(' + ')})`, answerType: 'integer', correctAnswer: String(a * b), why: `${a} · ${b} heißt: ${a}-mal die ${b}. ${Array(a).fill(b).join(' + ')} = ${a * b}.`, difficulty: 0.2 };
	return { atomId: 'arithmetik__multiplikationsverstaendnis', prompt: `${a} Reihen mit je ${b} Feldern — wie viele Felder insgesamt?`, answerType: 'integer', correctAnswer: String(a * b), why: `${a} Reihen mit je ${b} Feldern: ${Array(a).fill(b).join(' + ')} = ${a} · ${b} = ${a * b}.`, difficulty: 0.2 };
});

reg('arithmetik__einmaleins_kernaufgaben', (stage = 0) => {
	const atomId = 'arithmetik__einmaleins_kernaufgaben';
	// Expanding sequence: 1er/2er/5er/10er-Reihe → Quadratzahlen.
	if (Math.min(stage, 1) === 0) {
		const rows = [1, 2, 5, 10];
		const a = pick(rows), b = rand(1, 10);
		return { atomId, prompt: `${a} · ${b} = ?`, answerType: 'integer', correctAnswer: String(a * b), why: einmaleinsWhy(a, b), difficulty: 0.2 };
	}
	const n = rand(3, 10);
	return { atomId, prompt: `${n} · ${n} = ?`, answerType: 'integer', correctAnswer: String(n * n), hint: `${n}² = ${n} · ${n}`, why: `${n - 1} · ${n} = ${(n - 1) * n}, dazu noch einmal ${n}: ${n * n}. Im Bild: ein Quadrat aus ${n} Reihen mit je ${n} Feldern.`, difficulty: 0.3 };
});

reg('arithmetik__einmaleins_ableiten', (stage = 0) => {
	const atomId = 'arithmetik__einmaleins_ableiten';
	type Strategy = { base: number; derived: number; hintFn: (b: number) => string };
	// Expanding sequence: same strategy type grouped and introduced together
	// (add one group → doubling → add two groups → subtract one group, the
	// most abstract since it requires subtraction instead of addition).
	const strategies: Strategy[] = [
		{ base: 2, derived: 3, hintFn: b => `addiere einmal ${b}` },
		{ base: 5, derived: 6, hintFn: b => `addiere einmal ${b}` },
		{ base: 2, derived: 4, hintFn: b => `verdopple ${2 * b}` },
		{ base: 4, derived: 8, hintFn: b => `verdopple ${4 * b}` },
		{ base: 5, derived: 7, hintFn: b => `addiere ${2 * b}` },
		{ base: 10, derived: 9, hintFn: b => `ziehe einmal ${b} ab` },
	];
	const { base, derived, hintFn } = strategies[Math.min(stage, strategies.length - 1)];
	const b = rand(3, 9);
	return { atomId, prompt: `Wenn ${base} · ${b} = ${base * b}, was ist dann ${derived} · ${b}?`, answerType: 'integer', correctAnswer: String(derived * b), hint: `${base} · ${b} = ${base * b} → ${hintFn(b)}.`, why: `${base} · ${b} = ${base * b} kennst du schon. Für ${derived} · ${b}: ${hintFn(b)} → ${derived * b}.`, difficulty: 0.3 };
});

reg('arithmetik__einmaleins_automatisierung', () => {
	const a = rand(2, 9), b = rand(2, 9);
	return { atomId: 'arithmetik__einmaleins_automatisierung', prompt: `${a} · ${b} = ?`, answerType: 'integer', correctAnswer: String(a * b), why: einmaleinsWhy(a, b), difficulty: 0.35 };
});

reg('arithmetik__division_grundverstaendnis', (stage = 0) => {
	const atomId = 'arithmetik__division_grundverstaendnis';
	const b = rand(2, 9), q = rand(2, 10);
	const a = b * q;
	// Expanding sequence: reine Division → Verteilen (gerecht auf b Gruppen) → Aufteilen (Gruppen zu je b bilden).
	const type = Math.min(stage, 2);
	if (type === 0) return { atomId, prompt: `${a} : ${b} = ?`, answerType: 'integer', correctAnswer: String(q), why: `Umkehraufgabe: ${q} · ${b} = ${a}, also ${a} : ${b} = ${q}.`, difficulty: 0.3 };
	if (type === 1) return { atomId, prompt: `${a} Äpfel gleichmäßig auf ${b} Körbe — wie viele Äpfel pro Korb? (Verteilen)`, answerType: 'integer', correctAnswer: String(q), why: `Verteilen heißt teilen: ${a} : ${b} = ${q}. Probe: ${b} Körbe · ${q} Äpfel = ${a} Äpfel.`, difficulty: 0.3 };
	// Aufteilen (Messen): how many groups of b fit in a?
	return { atomId, prompt: `${a} Äpfel. In jeden Korb passen genau ${b} Äpfel. Wie viele Körbe braucht man? (Aufteilen)`, answerType: 'integer', correctAnswer: String(q), hint: `${a} : ${b} = ?`, why: `Wie oft passt ${b} in ${a}? ${q}-mal, denn ${q} · ${b} = ${a}.`, difficulty: 0.35 };
});

reg('arithmetik__division_mit_rest', (stage = 0) => {
	// Expanding sequence: kleine Divisoren/Quotienten → kleines Einmaleins → Divisoren bis 12.
	const lvl = Math.min(stage, 2);
	const b = [rand(2, 5), rand(2, 9), rand(6, 12)][lvl];
	const q = [rand(2, 5), rand(2, 10), rand(4, 12)][lvl];
	const r = rand(1, b - 1);
	const a = b * q + r;
	const which = rand(0, 1);
	if (which === 0) return { atomId: 'arithmetik__division_mit_rest', prompt: `${a} : ${b} = ? Rest ${r}`, answerType: 'integer', correctAnswer: String(q), hint: `${a} = ${b} · ${q} + ${r}`, why: `${b} passt ${q}-mal in ${a}: ${q} · ${b} = ${b * q}. Übrig bleiben ${a} − ${b * q} = ${r}.`, difficulty: 0.4, inputData: { sublabel: 'Gesucht: Quotient' } };
	return { atomId: 'arithmetik__division_mit_rest', prompt: `${a} : ${b} = ${q} Rest ?`, answerType: 'integer', correctAnswer: String(r), hint: `${a} − ${b} · ${q} = ?`, why: `${b} passt ${q}-mal in ${a}: ${q} · ${b} = ${b * q}. Übrig bleiben ${a} − ${b * q} = ${r}.`, difficulty: 0.4, inputData: { sublabel: 'Gesucht: Rest' } };
});

// ── 6. Vorrangregeln / Rechengesetze ─────────────────────────────────────────

reg('arithmetik__vorrangregeln', (stage = 0) => {
	// Expanding sequence: core rule (Punkt vor Strich) → override rule (Klammer) → subtraction variant.
	const type = Math.min(stage, 2);
	if (type === 0) {
		const a = rand(2, 8), b = rand(2, 5), c = rand(2, 5);
		return { atomId: 'arithmetik__vorrangregeln', prompt: `${a} + ${b} · ${c} = ?  (Punkt vor Strich)`, answerType: 'integer', correctAnswer: String(a + b * c), hint: 'Zuerst multiplizieren, dann addieren.', why: `Punkt vor Strich: zuerst ${b} · ${c} = ${b * c}, dann ${a} + ${b * c} = ${a + b * c}.`, difficulty: 0.4 };
	} else if (type === 1) {
		const a = rand(2, 8), b = rand(2, 5), c = rand(2, 5);
		return { atomId: 'arithmetik__vorrangregeln', prompt: `(${a} + ${b}) · ${c} = ?`, answerType: 'integer', correctAnswer: String((a + b) * c), hint: 'Zuerst die Klammer ausrechnen.', why: `Die Klammer geht vor: ${a} + ${b} = ${a + b}, dann ${a + b} · ${c} = ${(a + b) * c}.`, difficulty: 0.35 };
	} else {
		const b = rand(2, 5), c = rand(2, 5);
		const a = b * c + rand(1, 20); // result stays positive (Grundschule)
		return { atomId: 'arithmetik__vorrangregeln', prompt: `${a} − ${b} · ${c} = ?`, answerType: 'integer', correctAnswer: String(a - b * c), why: `Punkt vor Strich: zuerst ${b} · ${c} = ${b * c}, dann ${a} − ${b * c} = ${a - b * c}.`, difficulty: 0.4 };
	}
});

// ── 7. Muster & Zahlenfolgen ─────────────────────────────────────────────────

reg('arithmetik__muster_zahlenfolgen_grundschule', (stage = 0) => {
	const atomId = 'arithmetik__muster_zahlenfolgen_grundschule';
	// Expanding sequence: wachsende Folge (Lücke) → fallende Folge → Verdopplungsfolge → Zahlenmauer.
	const type = Math.min(stage, 3);
	if (type === 0) {
		const start = rand(1, 10), step = rand(2, 5);
		const seq = [0, 1, 2, 3, 4].map(i => start + i * step);
		const missing = rand(1, 3);
		const display = seq.slice(0, 5).map((v, i) => i === missing ? '___' : String(v)).join(', ');
		return { atomId, prompt: `Welche Zahl fehlt? ${display}`, answerType: 'integer', correctAnswer: String(seq[missing]), hint: `Die Folge wächst in ${step}er-Schritten.`, why: `Von Zahl zu Zahl kommen immer ${step} dazu: ${seq[missing - 1]} + ${step} = ${seq[missing]}.`, difficulty: 0.3 };
	} else if (type === 1) {
		const step = rand(2, 4), start = 4 * step + rand(1, 10); // all terms stay positive
		const seq = [0, 1, 2, 3, 4].map(i => start - i * step);
		return { atomId, prompt: `Wie geht die Folge weiter? ${seq.slice(0, 4).join(', ')}, ___`, answerType: 'integer', correctAnswer: String(seq[4]), hint: `Die Folge nimmt um ${step} ab.`, why: `Jedes Mal ${step} weniger: ${seq[3]} − ${step} = ${seq[4]}.`, difficulty: 0.3 };
	} else if (type === 2) {
		const base = rand(1, 6), q = pick([2, 3]);
		const seq = [base, base * q, base * q * q, base * q * q * q];
		return { atomId, prompt: `Wie geht die Folge weiter? ${seq[0]}, ${seq[1]}, ${seq[2]}, ___`, answerType: 'integer', correctAnswer: String(seq[3]), hint: q === 2 ? 'Jede Zahl wird verdoppelt.' : 'Jede Zahl wird verdreifacht.', why: `Jede Zahl ist das ${q === 2 ? 'Doppelte' : 'Dreifache'} der vorigen: ${seq[2]} · ${q} = ${seq[3]}.`, difficulty: 0.35 };
	} else {
		// Zahlenmauer: jede Zahl = Summe der zwei darunter
		// Untere Reihe: a, b, c  →  Mitte: a+b, b+c  →  Oben: a+b+b+c
		const a = rand(1, 8), b = rand(1, 8), c = rand(1, 8);
		const ab = a + b, bc = b + c, top = ab + bc;
		const which = pick(['a', 'b', 'c'] as const);
		const missing = which === 'a' ? a : which === 'b' ? b : c;
		return { atomId, prompt: 'Welche Zahl fehlt in der Zahlenmauer?', answerType: 'integer', correctAnswer: String(missing), inputData: { type: 'zahlenmauer', top, ab, bc, a, b, c, missing: which }, hint: 'Jede Zahl ist die Summe der zwei Zahlen darunter.', why: `Jeder Stein ist die Summe der beiden Steine darunter: ${a} + ${b} = ${ab}, ${b} + ${c} = ${bc}, ${ab} + ${bc} = ${top}.`, difficulty: 0.4 };
	}
});

// ── 8. Sachaufgaben ───────────────────────────────────────────────────────────

reg('arithmetik__sachaufgaben_grundschule', () => {
	const templates = [
		() => { const n = rand(2, 8), p = rand(1, 5); const total = n * p; return { q: `Ein Buch kostet ${p} €. ${n} Kinder kaufen je ein Buch. Wie viel kostet das insgesamt?`, a: total, w: `${n} Bücher zu je ${p} €: ${n} · ${p} = ${total} €.` }; },
		() => { const total = rand(10, 50), per = rand(2, 8); const left = total % per; return { q: `${total} Bonbons werden auf ${per} Kinder verteilt. Wie viele Bonbons bleiben übrig?`, a: left, w: left === 0 ? `${total} : ${per} = ${total / per} – es geht genau auf, nichts bleibt übrig.` : `${total} : ${per} = ${Math.floor(total / per)} Rest ${left}. Der Rest bleibt übrig.` }; },
		() => { const start = rand(20, 100), spend = rand(5, start - 5); return { q: `Anna hat ${start} €. Sie gibt ${spend} € aus. Wie viel hat sie noch?`, a: start - spend, w: `Ausgeben heißt abziehen: ${start} − ${spend} = ${start - spend} €.` }; },
		() => { const l = rand(2, 9), w = rand(2, 6); return { q: `Ein Rechteck ist ${l} cm lang und ${w} cm breit. Wie groß ist der Umfang?`, a: 2 * (l + w), w: `Der Umfang ist einmal außen herum: ${l} + ${w} + ${l} + ${w} = ${2 * (l + w)} cm.` }; },
		() => { const have = rand(12, 60), get = rand(5, 30); return { q: `Tim hat ${have} Sticker. Zum Geburtstag bekommt er ${get} dazu. Wie viele Sticker hat er jetzt?`, a: have + get, w: `Dazubekommen heißt addieren: ${have} + ${get} = ${have + get}.` }; },
		() => { const per = pick([6, 10]), boxes = rand(2, 9), extra = rand(1, per - 1); return { q: `${boxes * per + extra} Eier werden in Kartons zu je ${per} Stück verpackt. Wie viele Kartons werden ganz voll?`, a: boxes, w: `${boxes} · ${per} = ${boxes * per} Eier füllen ${boxes} Kartons. Die restlichen ${extra} reichen nicht für einen weiteren.` }; },
		() => { const rows = rand(3, 9), seats = rand(4, 9), free = rand(1, 10); return { q: `In einem Saal stehen ${rows} Reihen mit je ${seats} Stühlen. ${free} Stühle bleiben frei. Wie viele Stühle sind besetzt?`, a: rows * seats - free, w: `${rows} · ${seats} = ${rows * seats} Stühle insgesamt, minus ${free} freie: ${rows * seats - free}.` }; },
		() => { const price = rand(2, 9), n = rand(2, 5), paid = pick([20, 50]); return { q: `${n} Eintrittskarten kosten je ${price} €. Bezahlt wird mit einem ${paid}-€-Schein. Wie viel Euro gibt es zurück?`, a: paid - n * price, w: `Die Karten kosten ${n} · ${price} = ${n * price} €. Rückgeld: ${paid} − ${n * price} = ${paid - n * price} €.` }; },
		() => { const days = rand(2, 6), pages = rand(8, 25); return { q: `Mia liest jeden Tag ${pages} Seiten. Wie viele Seiten hat sie nach ${days} Tagen gelesen?`, a: days * pages, w: `Jeden Tag gleich viele Seiten: ${days} · ${pages} = ${days * pages}.` }; }
	];
	const t = pick(templates)();
	return { atomId: 'arithmetik__sachaufgaben_grundschule', prompt: t.q, answerType: 'integer', correctAnswer: String(t.a), why: t.w, difficulty: 0.4 };
});

// ── 9. Teilbarkeit ────────────────────────────────────────────────────────────

reg('arithmetik__teiler_vielfache', (stage = 0) => {
	const atomId = 'arithmetik__teiler_vielfache';
	const n = pick([6, 8, 10, 12, 14, 15, 16, 18, 20, 21, 24, 27, 28, 30, 32, 36, 40, 42, 45, 48]);
	const divisors = Array.from({ length: n }, (_, i) => i + 1).filter(d => n % d === 0);
	// Expanding sequence: Teiler erkennen (ja/nein gemischt) → Vielfaches erkennen → Vielfaches nennen → alle Teiler zählen.
	// Yes and no are mixed within a stage — a constant answer per stage could be learned by rote.
	const type = Math.min(stage, 3);
	if (type === 0) {
		const yes = rand(0, 1) === 0;
		const d = yes
			? pick(divisors.slice(1, -1))
			: pick(Array.from({ length: n - 2 }, (_, i) => i + 2).filter(x => n % x !== 0));
		return { atomId, prompt: `Ist ${d} ein Teiler von ${n}?`, answerType: 'boolean', correctAnswer: yes ? 'ja' : 'nein', hint: `Lässt sich ${n} ohne Rest durch ${d} teilen?`, why: yes ? `${n} : ${d} = ${n / d} – es bleibt kein Rest, also ist ${d} ein Teiler von ${n}.` : `${n} : ${d} = ${Math.floor(n / d)} Rest ${n % d} – es bleibt ein Rest, also ist ${d} kein Teiler.`, difficulty: 0.3 };
	} else if (type === 1) {
		const yes = rand(0, 1) === 0;
		const base = pick([3, 4, 6, 7, 8, 9]);
		const m = yes ? base * rand(2, 10) : base * rand(2, 9) + rand(1, base - 1);
		return { atomId, prompt: `Ist ${m} ein Vielfaches von ${base}?`, answerType: 'boolean', correctAnswer: yes ? 'ja' : 'nein', hint: `Gehört ${m} zur ${base}er-Reihe?`, why: yes ? `${m} = ${m / base} · ${base} – die Zahl steht in der ${base}er-Reihe.` : `${Math.floor(m / base)} · ${base} = ${Math.floor(m / base) * base} und ${Math.floor(m / base) + 1} · ${base} = ${(Math.floor(m / base) + 1) * base}. ${m} liegt dazwischen, gehört also nicht zur ${base}er-Reihe.`, difficulty: 0.3 };
	} else if (type === 2) {
		// Name a multiple of n
		const k = rand(2, 10);
		return { atomId, prompt: `Nenne das ${k}. Vielfache von ${n}.`, answerType: 'integer', correctAnswer: String(n * k), hint: `${k} · ${n} = ?`, why: `Das ${k}. Vielfache ist ${k} · ${n} = ${n * k}.`, difficulty: 0.35 };
	} else {
		// How many divisors does n have?
		return { atomId, prompt: `Wie viele Teiler hat ${n}?`, answerType: 'integer', correctAnswer: String(divisors.length), hint: `Schreibe alle Teiler auf: ${divisors.join(', ')}`, why: `Suche alle Zahlen, durch die ${n} ohne Rest teilbar ist: ${divisors.join(', ')}. Das sind ${divisors.length} Teiler.`, difficulty: 0.4 };
	}
});

reg('arithmetik__teilbarkeitsregeln', () => {
	const rules: Array<{ rule: number; check: (n: number) => boolean; hint: string }> = [
		{ rule: 2, check: n => n % 2 === 0, hint: 'Letzte Ziffer ist 0, 2, 4, 6 oder 8.' },
		{ rule: 5, check: n => n % 5 === 0, hint: 'Letzte Ziffer ist 0 oder 5.' },
		{ rule: 10, check: n => n % 10 === 0, hint: 'Letzte Ziffer ist 0.' },
		{ rule: 3, check: n => n % 3 === 0, hint: 'Quersumme ist durch 3 teilbar.' },
		{ rule: 9, check: n => n % 9 === 0, hint: 'Quersumme ist durch 9 teilbar.' }
	];
	const r = pick(rules);
	// Balance yes/no: random numbers are divisible by 9 or 10 only about one time in ten.
	const n = rand(0, 1) === 0 ? r.rule * rand(Math.ceil(10 / r.rule), Math.floor(999 / r.rule)) : rand(10, 999);
	const answer = r.check(n) ? 'ja' : 'nein';
	return { atomId: 'arithmetik__teilbarkeitsregeln', prompt: `Ist ${n} durch ${r.rule} teilbar?`, answerType: 'boolean', correctAnswer: answer, hint: r.hint, why: teilbarWhy(n, r.rule), difficulty: 0.35 };
});

reg('arithmetik__primzahlen_primfaktorzerlegung', (stage = 0) => {
	const atomId = 'arithmetik__primzahlen_primfaktorzerlegung';
	const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
	const composites = [4, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21, 22, 24, 25, 26, 27, 28];
	// Expanding sequence: Primzahl erkennen → kleinsten Primfaktor finden →
	// Exponent einer einzelnen Primzahlpotenz → Exponent in gemischter Zerlegung.
	const q = Math.min(stage, 3);
	if (q === 0) {
		const n = pick([...primes, ...composites.slice(0, 6)]);
		return { atomId, prompt: `Ist ${n} eine Primzahl?`, answerType: 'boolean', correctAnswer: primes.includes(n) ? 'ja' : 'nein', why: primes.includes(n) ? `${n} ist nur durch 1 und durch sich selbst teilbar – genau zwei Teiler.` : `${n} = ${[2, 3, 5].find(p => n % p === 0)} · ${n / [2, 3, 5].find(p => n % p === 0)!} hat mehr als zwei Teiler.`, difficulty: 0.4 };
	} else if (q === 1) {
		const p1 = pick([2, 3, 5, 7, 11, 13]), p2 = pick([2, 3, 5, 7, 11, 13]);
		return { atomId, prompt: `Was ist der kleinste Primfaktor von ${p1 * p2}?`, answerType: 'integer', correctAnswer: String(Math.min(p1, p2)), why: `${p1 * p2} = ${Math.min(p1, p2)} · ${Math.max(p1, p2)}. Die kleinste Primzahl, durch die ${p1 * p2} teilbar ist, ist ${Math.min(p1, p2)}.`, difficulty: 0.45 };
	} else if (q === 2) {
		// Count prime factors (with multiplicity)
		const [p, e] = pick<[number, number]>([[2, 2], [2, 3], [2, 4], [2, 5], [2, 6], [3, 2], [3, 3], [3, 4], [5, 2], [5, 3], [7, 2], [11, 2]]);
		const n = p ** e;
		return { atomId, prompt: `${n} = ${pow(p, '?')} — welcher Exponent?`, answerType: 'integer', correctAnswer: String(e), hint: `Wie oft ist ${p} als Primfaktor enthalten?`, why: `${n} = ${Array(e).fill(p).join(' · ')} – die ${p} kommt ${e}-mal als Faktor vor.`, difficulty: 0.45 };
	} else {
		// Full prime factorisation: ask for exponent of a specific prime
		const p1 = pick([2, 3]), p2 = pick([2, 3, 5, 7].filter(x => x !== p1));
		const e1 = rand(1, 3), e2 = rand(1, 2);
		const n = p1 ** e1 * p2 ** e2;
		return { atomId, prompt: `${n} = ${pow(p1, '?')} · ${pow(p2, e2)} — welcher Exponent gehört zu ${p1}?`, answerType: 'integer', correctAnswer: String(e1), hint: `Zerlege ${n} in Primfaktoren: durch ${p1} teilen.`, why: `Teile so oft wie möglich durch ${p1}: ${n} = ${Array(e1).fill(p1).join(' · ')} · ${p2 ** e2}. Die ${p1} kommt ${e1}-mal vor.`, difficulty: 0.5 };
	}
});

reg('arithmetik__ggt_kgv', (stage = 0) => {
	const atomId = 'arithmetik__ggt_kgv';
	// a = g·p, b = g·q with p < q coprime → ggT = g, kgV = g·p·q
	const g = rand(2, 6);
	let p = rand(1, 4), q = rand(2, 5);
	while (p >= q || gcd(p, q) !== 1 || g * p * q > 120) { p = rand(1, 4); q = rand(2, 5); }
	const [a, b] = shuffled([g * p, g * q]);
	// Expanding sequence: ggT → kgV → gemischt.
	const type = Math.min(stage, 2);
	const askGgt = type === 0 || (type === 2 && rand(0, 1) === 0);
	if (askGgt) return { atomId, prompt: `ggT(${a}, ${b}) = ?`, answerType: 'integer', correctAnswer: String(g), hint: 'Größter gemeinsamer Teiler: die größte Zahl, durch die beide teilbar sind.', why: `${a} = ${g} · ${a / g} und ${b} = ${g} · ${b / g}. ${a / g} und ${b / g} haben keinen gemeinsamen Teiler mehr – ${g} ist der größte.`, difficulty: 0.5 };
	return { atomId, prompt: `kgV(${a}, ${b}) = ?`, answerType: 'integer', correctAnswer: String(g * p * q), hint: 'Kleinstes gemeinsames Vielfaches: die kleinste Zahl, die in beiden Reihen vorkommt.', why: p === 1 ? `${g * q} ist selbst schon ein Vielfaches von ${g}: ${g * q} = ${q} · ${g}. Kleiner geht es nicht.` : `Gehe die Vielfachen von ${g * q} durch: ${Array.from({ length: p }, (_, i) => (i + 1) * g * q).join(', ')}. ${g * p * q} ist das erste, das auch durch ${g * p} teilbar ist.`, difficulty: 0.5 };
});

// ── 10. Bruchrechnung ─────────────────────────────────────────────────────────

reg('arithmetik__bruchteile_im_alltag', () => {
	const fracs: Array<[number, number]> = [[1,2],[1,4],[3,4],[1,3],[2,3]];
	const [n, d] = pick(fracs);
	const total = d * rand(1, 5);
	const result = (n * total) / d;
	const labels = pick(['Kinder', 'Äpfel', 'Schüler', 'Bonbons']);
	return { atomId: 'arithmetik__bruchteile_im_alltag', prompt: `${fmtFrac(n, d)} von ${total} ${labels} = ?`, answerType: 'integer', correctAnswer: String(result), hint: `Teile durch ${d}, dann mal ${n}.`, why: anteilWhy(n, d, total), difficulty: 0.3 };
});

reg('arithmetik__bruch_anteil_eines_ganzen', () => {
	const d = pick([2, 3, 4, 5, 6, 8, 10]);
	const n = rand(1, d - 1);
	const wholeTotal = d * rand(1, 4);
	const result = (n * wholeTotal) / d;
	return { atomId: 'arithmetik__bruch_anteil_eines_ganzen', prompt: `Ein Ganzes hat ${wholeTotal} gleiche Teile. Wie viele Teile sind ${fmtFrac(n, d)} davon?`, answerType: 'integer', correctAnswer: String(result), why: anteilWhy(n, d, wholeTotal), difficulty: 0.35 };
});

reg('arithmetik__bruch_anteil_einer_menge', () => {
	const d = pick([2, 3, 4, 5, 6, 8, 10]);
	const n = rand(1, d - 1);
	const total = d * rand(2, 8);
	return { atomId: 'arithmetik__bruch_anteil_einer_menge', prompt: `${fmtFrac(n, d)} von ${total} = ?`, answerType: 'integer', correctAnswer: String((n * total) / d), hint: `Erst durch ${d}, dann mal ${n}.`, why: anteilWhy(n, d, total), difficulty: 0.4 };
});

reg('arithmetik__brueche_am_zahlenstrahl', () => {
	const d = pick([2, 3, 4, 5, 8, 10]);
	let n = rand(1, 2 * d - 1);
	while (n === d) n = rand(1, 2 * d - 1); // avoid the trivial 1/1
	const g = gcd(n, d);
	const rn = n / g, rd = d / g;
	const q = rand(0, 1);

	if (q === 0) {
		// Draggable marker: fraction given, student positions marker on line
		return {
			atomId: 'arithmetik__brueche_am_zahlenstrahl',
			prompt: `Markiere ${fmtFrac(rn, rd)} auf dem Zahlenstrahl.`,
			answerType: 'integer', correctAnswer: String(n),
			inputData: { totalSections: d * 2 },
			hint: `Erweitere auf ${d}stel und zähle ${n} Abschnitte vom Nullpunkt.`, why: `Zwischen 0 und 1 liegen ${d} gleich lange Abschnitte. ${fmtFrac(rn, rd)}${rd !== d ? ` = ${fmtFrac(n, d)}` : ''} liegt ${n} Abschnitte rechts von der 0.`, difficulty: 0.45
		};
	}
	// Arrow shows position → student names the fraction's numerator (denominator = d)
	return {
		atomId: 'arithmetik__brueche_am_zahlenstrahl',
		prompt: `Der Pfeil zeigt auf einen Punkt. Welcher Bruch mit Nenner ${d} liegt dort?`,
		answerType: 'integer', correctAnswer: String(n),
		svg: svgFractionLine(d, n),
		inputData: { type: 'fraction_part', missing: 'numerator', knownDen: d },
		hint: `Zähle die Abschnitte vom Nullpunkt bis zum Pfeil.`, why: `Zwischen 0 und 1 liegen ${d} gleich lange Abschnitte. Der Pfeil steht ${n} Abschnitte rechts von der 0 → ${fmtFrac(n, d)}.`, difficulty: 0.45
	};
});

reg('arithmetik__brueche_vergleichen_ordnen', (stage = 0) => {
	const atomId = 'arithmetik__brueche_vergleichen_ordnen';
	// Expanding sequence: one comparison strategy per stage, easiest first.
	// Stage 3+ (beyond the last authored stage) stays on the hardest strategy.
	const strategies = ['gleicher_nenner', 'gleicher_zaehler', 'vergleich_halb', 'verschiedene_nenner'];
	const strategy = strategies[Math.min(stage, strategies.length - 1)];

	if (strategy === 'gleicher_nenner') {
		const d = pick([3, 4, 5, 6, 8, 10, 12]);
		const n1 = rand(1, d - 1), n2 = rand(1, d - 1);
		if (n1 === n2) return registry.get(atomId)!(stage);
		return { atomId, prompt: `${fmtFrac(n1, d)} ☐ ${fmtFrac(n2, d)}`, answerType: 'comparison', correctAnswer: n1 > n2 ? '>' : '<', hint: `Gleicher Nenner: größerer Zähler = größerer Bruch.`, why: `Gleicher Nenner bedeutet gleich große Stücke. ${Math.max(n1, n2)} Stücke sind mehr als ${Math.min(n1, n2)}.`, difficulty: 0.3 };
	}

	if (strategy === 'gleicher_zaehler') {
		const n = rand(1, 5);
		const d1 = rand(n + 1, 12), d2 = rand(n + 1, 12);
		if (d1 === d2) return registry.get(atomId)!(stage);
		return { atomId, prompt: `${fmtFrac(n, d1)} ☐ ${fmtFrac(n, d2)}`, answerType: 'comparison', correctAnswer: d1 < d2 ? '>' : '<', hint: `Gleicher Zähler: kleinerer Nenner = größerer Bruch.`, why: `Beide Brüche haben gleich viele Stücke (${n}). Bei Nenner ${Math.min(d1, d2)} wird das Ganze in weniger Teile geteilt – die Stücke sind größer.`, difficulty: 0.45 };
	}

	if (strategy === 'vergleich_halb') {
		const d1 = pick([4, 5, 6, 8, 10]);
		const d2 = pick([3, 4, 6, 8, 10]);
		const n1 = rand(Math.ceil(d1 / 2) + 1, d1 - 1); // > 1/2
		const n2 = rand(1, Math.floor((d2 - 1) / 2));   // < 1/2
		if (n2 < 1 || n1 >= d1) return registry.get(atomId)!(stage);
		// Random order so the answer is not always ">"
		if (rand(0, 1) === 0) return { atomId, prompt: `${fmtFrac(n2, d2)} ☐ ${fmtFrac(n1, d1)}`, answerType: 'comparison', correctAnswer: '<', hint: `Tipp: Vergleiche mit ½. Ein Bruch ist größer als ½, der andere kleiner.`, why: `${fmtFrac(n1, d1)} ist mehr als die Hälfte (${n1} > ${dec(d1 / 2)}), ${fmtFrac(n2, d2)} ist weniger als die Hälfte (${n2} < ${dec(d2 / 2)}).`, difficulty: 0.5 };
		return { atomId, prompt: `${fmtFrac(n1, d1)} ☐ ${fmtFrac(n2, d2)}`, answerType: 'comparison', correctAnswer: '>', hint: `Tipp: Vergleiche mit ½. Ein Bruch ist größer als ½, der andere kleiner.`, why: `${fmtFrac(n1, d1)} ist mehr als die Hälfte (${n1} > ${dec(d1 / 2)}), ${fmtFrac(n2, d2)} ist weniger als die Hälfte (${n2} < ${dec(d2 / 2)}).`, difficulty: 0.5 };
	}

	// verschiedene_nenner: gleichnamig machen
	const pairs: [number, number][] = [[2,3],[2,5],[3,4],[3,5],[4,5],[2,7],[3,8],[4,6]];
	const [d1, d2] = pick(pairs);
	const n1 = rand(1, d1 - 1), n2 = rand(1, d2 - 1);
	const cmp = n1 * d2 - n2 * d1;
	if (cmp === 0) return registry.get(atomId)!(stage);
	return { atomId, prompt: `${fmtFrac(n1, d1)} ☐ ${fmtFrac(n2, d2)}`, answerType: 'comparison', correctAnswer: cmp > 0 ? '>' : '<', hint: `Tipp: Mache die Brüche gleichnamig (Hauptnenner: ${lcm(d1, d2)}).`, why: `Auf den Hauptnenner ${lcm(d1, d2)} erweitern: ${fmtFrac(n1, d1)} = ${fmtFrac(n1 * lcm(d1, d2) / d1, lcm(d1, d2))} und ${fmtFrac(n2, d2)} = ${fmtFrac(n2 * lcm(d1, d2) / d2, lcm(d1, d2))}. Jetzt entscheiden die Zähler.`, difficulty: 0.6 };
});

reg('arithmetik__erweitern', (stage = 0) => {
	const atomId = 'arithmetik__erweitern';
	// Expanding sequence: kleine Brüche mit Faktor 2–3 → Faktor bis 5 → Nenner und Faktor bis 9.
	const lvl = Math.min(stage, 2);
	const d = [rand(2, 4), rand(2, 6), rand(3, 9)][lvl];
	const n = rand(1, [d - 1, 5, d - 1][lvl]);
	const factor = [rand(2, 3), rand(2, 5), rand(3, 9)][lvl];
	const hint = `Zähler und Nenner mit ${factor} multiplizieren.`; const why = `Erweitern ändert nur die Einteilung, nicht den Wert: \\(\\frac{${n} \\cdot ${factor}}{${d} \\cdot ${factor}} = \\frac{${n * factor}}{${d * factor}}\\).`;
	if (rand(0, 1) === 0) {
		return { atomId, prompt: `Erweitere ${fmtFrac(n, d)} mit ${factor}:`, answerType: 'integer' as const, correctAnswer: String(n * factor), hint, why: why, difficulty: 0.35,
			inputData: { type: 'fraction_part', missing: 'numerator', knownDen: d * factor } };
	}
	return { atomId, prompt: `Erweitere ${fmtFrac(n, d)} mit ${factor}:`, answerType: 'integer' as const, correctAnswer: String(d * factor), hint, why: why, difficulty: 0.35,
		inputData: { type: 'fraction_part', missing: 'denominator', knownNum: n * factor } };
});

reg('arithmetik__kuerzen', (stage = 0) => {
	const atomId = 'arithmetik__kuerzen';
	// Expanding sequence: Kürzen durch 2 → durch 2–4 → große Kürzungszahlen (6, 8, 9, 10, 12),
	// bei denen "vollständig" mehrere Schritte oder das Erkennen des ggT verlangt.
	const lvl = Math.min(stage, 2);
	const maxD = [6, 8, 9][lvl];
	// Ensure n/d is already fully reduced (coprime), so the result fraction is unambiguous
	let n = rand(1, 5), d = rand(n + 1, maxD);
	while (gcd(n, d) !== 1) { n = rand(1, 5); d = rand(n + 1, maxD); }
	const factor = [2, rand(2, 4), pick([6, 8, 9, 10, 12])][lvl];
	const g = gcd(n * factor, d * factor);
	const hint = `Teile Zähler und Nenner durch ${g}.`; const why = `Zähler und Nenner durch dieselbe Zahl teilen: \\(\\frac{${n * factor} : ${g}}{${d * factor} : ${g}} = \\frac{${n}}{${d}}\\). Weiter kürzen geht nicht.`;
	if (rand(0, 1) === 0) {
		return { atomId, prompt: `Kürze ${fmtFrac(n * factor, d * factor)} vollständig:`, answerType: 'integer' as const, correctAnswer: String(n), hint, why: why, difficulty: 0.4,
			inputData: { type: 'fraction_part', missing: 'numerator', knownDen: d } };
	}
	return { atomId, prompt: `Kürze ${fmtFrac(n * factor, d * factor)} vollständig:`, answerType: 'integer' as const, correctAnswer: String(d), hint, why: why, difficulty: 0.4,
		inputData: { type: 'fraction_part', missing: 'denominator', knownNum: n } };
});

reg('arithmetik__gemischte_zahlen_unechte_brueche', (stage = 0) => {
	const atomId = 'arithmetik__gemischte_zahlen_unechte_brueche';
	// Ensure n/d is coprime so the fraction part is unambiguous in the visual
	const whole = rand(1, 5);
	let n = rand(1, 5), d = rand(n + 1, 6);
	while (gcd(n, d) !== 1) { n = rand(1, 5); d = rand(n + 1, 6); }
	const num = whole * d + n;
	// Expanding sequence: unechter Bruch → Vollzahl bestimmen → Bruchteil bestimmen.
	const order = [1, 0, 2];
	const type = order[Math.min(stage, order.length - 1)];
	if (type === 0) {
		// Mixed → improper: denominator stays d, only numerator is unknown
		return { atomId, prompt: `${fmtMixed(whole, n, d)} als unechter Bruch:`, answerType: 'fraction' as const, correctAnswer: frac(num, d), hint: `${whole} · ${d} + ${n} = ${num}`, why: `${whole} ${whole === 1 ? 'Ganzes sind' : 'Ganze sind'} ${whole} · ${d} = ${whole * d} Teile, dazu ${n}: zusammen ${num} Teile → ${fmtFrac(num, d)}.`, difficulty: 0.45,
			inputData: { type: 'fraction_part', missing: 'numerator', knownDen: d } };
	} else if (type === 1) {
		// Improper → whole part: show [?] n/d
		return { atomId, prompt: `${fmtFrac(num, d)} als gemischte Zahl:`, answerType: 'integer' as const, correctAnswer: String(whole), why: `Je ${d} Teile ergeben ein Ganzes: ${num} : ${d} = ${whole} Rest ${n} → ${whole} ${whole === 1 ? 'Ganzes' : 'Ganze'} und ${fmtFrac(n, d)}.`, difficulty: 0.4,
			inputData: { type: 'mixed_part', missing: 'whole', numerator: n, denominator: d } };
	} else {
		// Improper → fraction part: show whole [?]/d
		return { atomId, prompt: `${fmtFrac(num, d)} als gemischte Zahl:`, answerType: 'fraction' as const, correctAnswer: frac(n, d), hint: `${num} : ${d} = ${whole} Rest ${n}`, why: `Je ${d} Teile ergeben ein Ganzes: ${num} : ${d} = ${whole} Rest ${n} → ${whole} ${whole === 1 ? 'Ganzes' : 'Ganze'} und ${fmtFrac(n, d)}.`, difficulty: 0.5,
			inputData: { type: 'mixed_part', missing: 'numerator', whole, denominator: d } };
	}
});

reg('arithmetik__brueche_add_sub_gleichnamig', (stage = 0) => {
	// Expanding sequence: Addition mit kleinen Nennern → auch Subtraktion → Nenner bis 12 (Ergebnis oft kürzbar).
	const lvl = Math.min(stage, 2);
	const d = rand(3, [6, 10, 12][lvl]);
	const n1 = rand(1, d - 1), n2 = rand(1, d - n1);
	const op = lvl === 0 || n1 === n2 ? 0 : rand(0, 1); // no subtraction with result 0
	if (op === 0) {
		const [rn, rd] = [n1 + n2, d];
		return { atomId: 'arithmetik__brueche_add_sub_gleichnamig', prompt: `${fmtFrac(n1, d)} + ${fmtFrac(n2, d)} = ?`, answerType: 'fraction', correctAnswer: frac(rn, rd), why: `Gleiche Nenner bedeuten gleich große Stücke – du zählst nur die Zähler zusammen: ${n1} + ${n2} = ${rn}. Der Nenner ${d} bleibt${gcd(rn, rd) > 1 ? `; gekürzt ${fr(rn, rd)}` : ''}.`, difficulty: 0.4 };
	} else {
		const [big, small] = n1 >= n2 ? [n1, n2] : [n2, n1];
		return { atomId: 'arithmetik__brueche_add_sub_gleichnamig', prompt: `${fmtFrac(big, d)} − ${fmtFrac(small, d)} = ?`, answerType: 'fraction', correctAnswer: frac(big - small, d), why: `Gleiche Nenner bedeuten gleich große Stücke – du ziehst nur die Zähler ab: ${big} − ${small} = ${big - small}. Der Nenner ${d} bleibt${gcd(big - small, d) > 1 ? `; gekürzt ${fr(big - small, d)}` : ''}.`, difficulty: 0.4 };
	}
});

reg('arithmetik__brueche_add_sub_ungleichnamig', (stage = 0) => {
	const atomId = 'arithmetik__brueche_add_sub_ungleichnamig';
	// Expanding sequence: ein Nenner ist Vielfaches des anderen, nur Addition → auch Subtraktion →
	// teilerfremde bzw. gemischte Nenner (Hauptnenner muss gesucht werden).
	const lvl = Math.min(stage, 2);
	const denoms = [
		[[2, 4], [3, 6], [4, 8], [2, 6], [5, 10]],
		[[2, 4], [3, 6], [4, 8], [2, 6], [5, 10], [3, 9], [2, 8]],
		[[2, 3], [2, 5], [3, 4], [3, 5], [4, 5], [4, 6], [6, 8], [6, 9], [4, 10]]
	][lvl];
	const [d1, d2] = pick(denoms);
	const n1 = rand(1, d1 - 1), n2 = rand(1, d2 - 1);
	const op = lvl === 0 ? 0 : rand(0, 1);
	const l = lcm(d1, d2);
	const sumNum = n1 * (l / d1) + (op === 0 ? 1 : -1) * n2 * (l / d2);
	if (sumNum <= 0) return registry.get(atomId)!(stage);
	const sym = op === 0 ? '+' : '−';
	return { atomId, prompt: `${fmtFrac(n1, d1)} ${sym} ${fmtFrac(n2, d2)} = ?`, answerType: 'fraction', correctAnswer: frac(sumNum, l), hint: `Hauptnenner: ${l}`, why: `Erst gleichnamig machen (Hauptnenner ${l}): ${fmtFrac(n1 * l / d1, l)} ${sym} ${fmtFrac(n2 * l / d2, l)} = ${fmtFrac(sumNum, l)}${gcd(sumNum, l) > 1 ? ` = ${fr(sumNum, l)}` : ''}.`, difficulty: 0.55 };
});

reg('arithmetik__gemischte_zahlen_add_sub', (stage = 0) => {
	const atomId = 'arithmetik__gemischte_zahlen_add_sub';
	// Fraction parts are fully reduced (no 2/4 or 3/6 in the prompt)
	const d = pick([4, 6, 8]);
	const parts = d === 6 ? [1, 5] : d === 4 ? [1, 3] : [1, 3, 5, 7];
	const [w1, n1] = [rand(1, 4), pick(parts)];
	const [w2, n2] = [rand(1, 3), pick(parts)];
	if (w1 === w2 && n1 === n2 && stage >= 2) return registry.get(atomId)!(stage); // difference would be 0
	// Expanding sequence: Addition (ganzer Anteil) → Addition (Bruchanteil) → Subtraktion.
	const step = Math.min(stage, 2);
	if (step <= 1) {
		const totalN = n1 + n2, totalW = w1 + w2 + Math.floor(totalN / d);
		const remN = totalN % d;
		if (remN === 0) {
			return { atomId, prompt: `${fmtMixed(w1, n1, d)} + ${fmtMixed(w2, n2, d)} = ?`, answerType: 'integer', correctAnswer: String(totalW), why: `Ganze und Bruchteile getrennt: ${w1} + ${w2} = ${w1 + w2}; ${fmtFrac(n1, d)} + ${fmtFrac(n2, d)} = ${fmtFrac(totalN, d)} = ${totalN / d}. Zusammen ${totalW}.`, difficulty: 0.5 };
		}
		if (step === 0) {
			return { atomId, prompt: `${fmtMixed(w1, n1, d)} + ${fmtMixed(w2, n2, d)} — ganzer Anteil des Ergebnisses?`, answerType: 'integer', correctAnswer: String(totalW), hint: 'Addiere ganze Zahlen und Bruchteile getrennt.', why: `Ganze: ${w1} + ${w2} = ${w1 + w2}. Bruchteile: ${fmtFrac(n1, d)} + ${fmtFrac(n2, d)} = ${fmtFrac(totalN, d)}${totalN >= d ? ` – das ist mehr als 1, also kommt ein Ganzes dazu: ${totalW}` : ` – das ist weniger als 1, es bleibt bei ${totalW}`}.`, difficulty: 0.5 };
		}
		return { atomId, prompt: `${fmtMixed(w1, n1, d)} + ${fmtMixed(w2, n2, d)} — Bruchanteil des Ergebnisses?`, answerType: 'fraction', correctAnswer: frac(remN, d), hint: `${n1} + ${n2} = ${totalN} → Bruchanteil ${fmtFrac(remN, d)}`, why: `Bruchteile: ${fmtFrac(n1, d)} + ${fmtFrac(n2, d)} = ${fmtFrac(totalN, d)}${totalN > d ? ` = 1${fmtFrac(remN, d)} – das Ganze wandert zu den Ganzen` : ''}${gcd(remN, d) > 1 ? `; gekürzt ${fr(remN, d)}` : ''}.`, difficulty: 0.55 };
	}
	const [bw, bn, sw, sn] = w1 + n1 / d >= w2 + n2 / d ? [w1, n1, w2, n2] : [w2, n2, w1, n1];
	const totalN = bw * d + bn - sw * d - sn;
	if (totalN % d === 0) return { atomId, prompt: `${fmtMixed(bw, bn, d)} − ${fmtMixed(sw, sn, d)} = ?`, answerType: 'integer', correctAnswer: String(totalN / d), why: `Als unechte Brüche rechnen: ${fmtFrac(bw * d + bn, d)} − ${fmtFrac(sw * d + sn, d)} = ${fmtFrac(totalN, d)} = ${totalN / d}.`, difficulty: 0.5 };
	return { atomId, prompt: `${fmtMixed(bw, bn, d)} − ${fmtMixed(sw, sn, d)} = ?`, answerType: 'fraction', correctAnswer: frac(totalN, d), why: `Als unechte Brüche rechnen: ${fmtFrac(bw * d + bn, d)} − ${fmtFrac(sw * d + sn, d)} = ${fmtFrac(totalN, d)}${gcd(totalN, d) > 1 ? ` = ${fr(totalN, d)}` : ''}.`, difficulty: 0.55 };
});

reg('arithmetik__bruch_mal_natuerliche_zahl', (stage = 0) => {
	// Expanding sequence: kleine Nenner und Faktoren → Original-Zahlenraum → Nenner bis 12.
	const lvl = Math.min(stage, 2);
	const d = pick([[2, 3, 4, 5], [2, 3, 4, 5, 6, 8], [6, 7, 8, 9, 10, 12]][lvl]);
	const n = rand(1, d - 1);
	const z = [rand(2, 4), rand(2, d * 2), rand(3, d * 2)][lvl];
	const [rn, rd] = [n * z, d];
	return { atomId: 'arithmetik__bruch_mal_natuerliche_zahl', prompt: `${fmtFrac(n, d)} · ${z} = ?`, answerType: rd / gcd(rn, rd) === 1 ? 'integer' : 'fraction', correctAnswer: rd / gcd(rn, rd) === 1 ? String(rn / gcd(rn, rd)) : frac(rn, rd), why: `${z}-mal ${fmtFrac(n, d)}: Nur der Zähler wird vervielfacht, die Stückgröße bleibt. \\(\\frac{${n} \\cdot ${z}}{${d}} = \\frac{${rn}}{${rd}}\\)${gcd(rn, rd) > 1 ? ` = ${fr(rn, rd)}` : ''}.`, difficulty: 0.4 };
});

reg('arithmetik__bruch_mal_bruch', (stage = 0) => {
	// Expanding sequence: Zähler/Nenner bis 4 → bis 5 → bis 9 (Kürzen über Kreuz lohnt sich).
	const [maxN, maxD] = [[3, 4], [4, 5], [8, 9]][Math.min(stage, 2)];
	const [n1, d1, n2, d2] = [rand(1, maxN), rand(2, maxD), rand(1, maxN), rand(2, maxD)];
	return { atomId: 'arithmetik__bruch_mal_bruch', prompt: `${fmtFrac(n1, d1)} · ${fmtFrac(n2, d2)} = ?`, answerType: 'fraction', correctAnswer: frac(n1 * n2, d1 * d2), hint: 'Zähler · Zähler, Nenner · Nenner, dann kürzen.', why: `Zähler mal Zähler, Nenner mal Nenner: \\(\\frac{${n1} \\cdot ${n2}}{${d1} \\cdot ${d2}} = \\frac{${n1 * n2}}{${d1 * d2}}\\)${gcd(n1 * n2, d1 * d2) > 1 ? ` = ${fr(n1 * n2, d1 * d2)}` : ''}.`, difficulty: 0.5 };
});

reg('arithmetik__division_durch_bruch', (stage = 0) => {
	// Expanding sequence: Zähler/Nenner bis 4 → bis 5 → bis 9.
	const [maxN, maxD] = [[3, 4], [4, 5], [8, 9]][Math.min(stage, 2)];
	const [n1, d1, n2, d2] = [rand(1, maxN), rand(2, maxD), rand(1, maxN), rand(2, maxD)];
	return { atomId: 'arithmetik__division_durch_bruch', prompt: `${fmtFrac(n1, d1)} : ${fmtFrac(n2, d2)} = ?`, answerType: 'fraction', correctAnswer: frac(n1 * d2, d1 * n2), hint: 'Multipliziere mit dem Kehrwert.', why: `Durch einen Bruch teilen heißt mit dem Kehrwert malnehmen: ${fmtFrac(n1, d1)} · ${fmtFrac(d2, n2)} = ${fmtFrac(n1 * d2, d1 * n2)}${gcd(n1 * d2, d1 * n2) > 1 ? ` = ${fr(n1 * d2, d1 * n2)}` : ''}.`, difficulty: 0.55 };
});

// ── 11. Dezimalzahlen ─────────────────────────────────────────────────────────

reg('arithmetik__dezimalzahlen_stellenwert', () => {
	const whole = rand(1, 99), dec1 = rand(0, 9), dec2 = rand(0, 9);
	const n = parseFloat(`${whole}.${dec1}${dec2}`);
	const q = rand(0, 1);
	if (q === 0) return { atomId: 'arithmetik__dezimalzahlen_stellenwert', prompt: `Welche Ziffer steht an der Zehntelstelle von ${dec(n)}?`, answerType: 'integer', correctAnswer: String(dec1), why: `Direkt nach dem Komma stehen die Zehntel, danach die Hundertstel: ${dec(n)} hat ${dec1} Zehntel und ${dec2} Hundertstel.`, difficulty: 0.35 };
	return { atomId: 'arithmetik__dezimalzahlen_stellenwert', prompt: `Welche Ziffer steht an der Hundertstelstelle von ${dec(n)}?`, answerType: 'integer', correctAnswer: String(dec2), why: `Direkt nach dem Komma stehen die Zehntel, danach die Hundertstel: ${dec(n)} hat ${dec1} Zehntel und ${dec2} Hundertstel${dec2 === 0 ? ' (eine fehlende Stelle zählt als 0)' : ''}.`, difficulty: 0.35 };
});

reg('arithmetik__dezimalzahlen_vergleichen_ordnen_runden', (stage = 0) => {
	// Expanding sequence: vergleichen → auf ganze Zahlen runden → auf eine Nachkommastelle runden.
	const type = Math.min(stage, 2);
	if (type === 0) {
		// Same integer part and different number of decimals — targets "longer = bigger"
		const whole = rand(0, 9);
		const a = whole + rand(1, 9) / 10;
		let b = whole + rand(1, 99) / 100;
		while (Math.abs(a - b) < 1e-9 || Math.round(b * 100) % 10 === 0) b = whole + rand(1, 99) / 100;
		const bigger = Math.max(a, b);
		return { atomId: 'arithmetik__dezimalzahlen_vergleichen_ordnen_runden', prompt: `Welche Zahl ist größer: ${dec(a)} oder ${dec(b)}?`, answerType: 'text', correctAnswer: dec(bigger), choices: [dec(a), dec(b)], why: `Schreibe beide mit gleich vielen Nachkommastellen: ${a.toFixed(2).replace('.', ',')} und ${b.toFixed(2).replace('.', ',')}. Jetzt Stelle für Stelle vergleichen – die längere Zahl ist nicht automatisch die größere.`, difficulty: 0.35 };
	}
	if (type === 1) {
		// First decimal must be 1–9 so the task is non-trivial
		const n = rand(10, 99) + rand(1, 9) / 10;
		return { atomId: 'arithmetik__dezimalzahlen_vergleichen_ordnen_runden', prompt: `Runde ${dec(n)} auf ganze Zahlen: ___`, answerType: 'integer', correctAnswer: String(Math.round(n)), why: `Die Zehntelstelle entscheidet: ${Math.round(n * 10) % 10}. ${Math.round(n * 10) % 10 >= 5 ? 'Ab 5 wird aufgerundet' : 'Unter 5 wird abgerundet'} → ${Math.round(n)}.`, difficulty: 0.35 };
	}
	// Second decimal must be 1–9 so the task is non-trivial
	const n = rand(10, 99) + rand(0, 9) / 10 + rand(1, 9) / 100;
	return { atomId: 'arithmetik__dezimalzahlen_vergleichen_ordnen_runden', prompt: `Runde ${dec(n)} auf eine Nachkommastelle: ___`, answerType: 'number', correctAnswer: dec(Math.round(n * 10) / 10), why: `Die Hundertstelstelle entscheidet: ${Math.round(n * 100) % 10}. ${Math.round(n * 100) % 10 >= 5 ? 'Ab 5 wird aufgerundet' : 'Unter 5 wird abgerundet'} → ${dec(Math.round(n * 10) / 10)}.`, difficulty: 0.4 };
});

reg('arithmetik__dezimalzahlen_addieren_subtrahieren', () => {
	const a = parseFloat((rand(1, 20) + rand(0, 9) / 10).toFixed(1));
	const b = parseFloat((rand(1, 10) + rand(0, 9) / 10).toFixed(1));
	const op = rand(0, 1);
	if (op === 0) return { atomId: 'arithmetik__dezimalzahlen_addieren_subtrahieren', prompt: `${dec(a)} + ${dec(b)} = ?`, answerType: 'number', correctAnswer: dec(a + b), hint: 'Komma unter Komma schreiben.', why: `Rechne in Zehnteln: ${Math.round(a * 10)} Zehntel + ${Math.round(b * 10)} Zehntel = ${Math.round((a + b) * 10)} Zehntel = ${dec(a + b)}.`, difficulty: 0.4 };
	const [big, small] = a >= b ? [a, b] : [b, a];
	return { atomId: 'arithmetik__dezimalzahlen_addieren_subtrahieren', prompt: `${dec(big)} − ${dec(small)} = ?`, answerType: 'number', correctAnswer: dec(big - small), why: `Rechne in Zehnteln: ${Math.round(big * 10)} Zehntel − ${Math.round(small * 10)} Zehntel = ${Math.round((big - small) * 10)} Zehntel = ${dec(big - small)}.`, difficulty: 0.4 };
});

reg('arithmetik__kommaverschiebung', () => {
	const n = parseFloat((rand(1, 99) + rand(1, 9) / 10).toFixed(1));
	const factor = pick([10, 100, 1000]);
	const op = rand(0, 1);
	if (op === 0) return { atomId: 'arithmetik__kommaverschiebung', prompt: `${dec(n)} · ${factor} = ?`, answerType: 'number', correctAnswer: dec(n * factor), hint: `Komma um ${Math.log10(factor)} Stelle(n) nach rechts.`, why: `Mal ${factor} macht jede Ziffer ${factor}-mal so viel wert: Das Komma rückt ${Math.log10(factor)} ${factor === 10 ? 'Stelle' : 'Stellen'} nach rechts (leere Stellen mit 0 füllen).`, difficulty: 0.4 };
	return { atomId: 'arithmetik__kommaverschiebung', prompt: `${dec(n * factor)} : ${factor} = ?`, answerType: 'number', correctAnswer: dec(n), hint: `Komma um ${Math.log10(factor)} Stelle(n) nach links.`, why: `Geteilt durch ${factor} macht jede Ziffer ${factor}-mal weniger wert: Das Komma rückt ${Math.log10(factor)} ${factor === 10 ? 'Stelle' : 'Stellen'} nach links.`, difficulty: 0.4 };
});

reg('arithmetik__dezimal_division_natuerliche_zahl', () => {
	// Build dividend from d × answer so the result is always a clean 1-decimal number.
	// Skip combinations where d·r is divisible by 10 (dividend would have no decimal part).
	let d: number, q: number, r: number;
	do { d = rand(2, 8); q = rand(1, 9); r = rand(1, 9); } while ((d * r) % 10 === 0);
	const dividend = d * q + (d * r) / 10;
	const answer = q + r / 10;
	return { atomId: 'arithmetik__dezimal_division_natuerliche_zahl', prompt: `${dec(dividend)} : ${d} = ?`, answerType: 'number', correctAnswer: dec(answer), hint: `Schriftlich: ${dec(dividend)} : ${d}`, why: `Teile wie bei ganzen Zahlen und setze das Komma, sobald du es überschreitest. Probe: ${dec(answer)} · ${d} = ${dec(dividend)}.`, difficulty: 0.5 };
});

reg('arithmetik__dezimal_mal_dezimal', (stage = 0) => {
	const atomId = 'arithmetik__dezimal_mal_dezimal';
	// Expanding sequence: eine Nachkommastelle je Faktor → zwei/eine Nachkommastelle gemischt.
	if (Math.min(stage, 1) === 0) {
		const a = rand(1, 9) / 10, b = rand(1, 9) / 10;
		const res = Math.round(a * b * 100) / 100;
		return { atomId, prompt: `${dec(a)} · ${dec(b)} = ?`, answerType: 'number', correctAnswer: dec(res), hint: `Rechne ${Math.round(a * 10)} · ${Math.round(b * 10)} = ${Math.round(a * 10) * Math.round(b * 10)}, dann : 100`, why: `Erst ohne Komma: ${Math.round(a * 10)} · ${Math.round(b * 10)} = ${Math.round(a * 10) * Math.round(b * 10)}. Die Faktoren haben zusammen 2 Nachkommastellen, das Ergebnis auch: ${dec(res)}.`, difficulty: 0.45 };
	}
	const a = rand(1, 99) / 100, b = rand(1, 9) / 10;
	const res = Math.round(a * b * 1000) / 1000;
	const aInt = Math.round(a * 100), bInt = Math.round(b * 10);
	return { atomId, prompt: `${dec(a)} · ${dec(b)} = ?`, answerType: 'number', correctAnswer: dec(res), hint: `Rechne ${aInt} · ${bInt} = ${aInt * bInt}, dann : 1000`, why: `Erst ohne Komma: ${aInt} · ${bInt} = ${aInt * bInt}. Die Faktoren haben zusammen 3 Nachkommastellen, das Ergebnis auch: ${dec(res)}.`, difficulty: 0.6 };
});

reg('arithmetik__dezimal_division_dezimalzahl', () => {
	const b = pick([0.1, 0.2, 0.5, 0.25, 0.4]);
	const q = rand(2, 10);
	const a = round(b * q, 2);
	return { atomId: 'arithmetik__dezimal_division_dezimalzahl', prompt: `${dec(a)} : ${dec(b)} = ?`, answerType: 'integer', correctAnswer: String(q), hint: `Verschiebe in beiden Zahlen das Komma, bis der Divisor ganzzahlig ist: ${dec(a * (b === 0.25 ? 100 : 10))} : ${dec(b * (b === 0.25 ? 100 : 10))}`, why: `Beide Zahlen mit ${b === 0.25 ? 100 : 10} malnehmen – der Quotient bleibt gleich: ${dec(a * (b === 0.25 ? 100 : 10))} : ${dec(b * (b === 0.25 ? 100 : 10))} = ${q}.`, difficulty: 0.6 };
});

reg('arithmetik__bruch_zu_dezimalzahl', (stage = 0) => {
	// Expanding sequence: Nenner 2, 4, 5, 10 → Nenner 20, 25, 50 (auf Hundertstel erweitern) → Achtel/Vierzigstel (dividieren).
	const dens = [[2, 4, 5, 10], [20, 25, 50], [8, 40]][Math.min(stage, 2)];
	const [n, d] = terminatingFraction(dens);
	const hint = d === 8 || d === 40 ? `Teile ${n} durch ${d}.` : `Erweitere auf den Nenner ${d <= 10 && d !== 4 ? 10 : 100}.`;
	return { atomId: 'arithmetik__bruch_zu_dezimalzahl', prompt: `${fmtFrac(n, d)} als Dezimalzahl = ?`, answerType: 'number', correctAnswer: dec(n / d), hint, why: d === 8 || d === 40 ? `Der Bruchstrich bedeutet „geteilt": ${n} : ${d} = ${dec(n / d)}.` : `Auf Zehntel oder Hundertstel erweitern: ${fmtFrac(n, d)} = ${fmtFrac(n * (d <= 10 && d !== 4 ? 10 : 100) / d, d <= 10 && d !== 4 ? 10 : 100)} = ${dec(n / d)}.`, difficulty: d === 8 || d === 40 ? 0.55 : 0.45 };
});

reg('arithmetik__dezimalzahl_zu_bruch', (stage = 0) => {
	const atomId = 'arithmetik__dezimalzahl_zu_bruch';
	const [n, d] = terminatingFraction([2, 4, 5, 8, 10, 20, 25, 50]);
	const val = n / d;
	// Expanding sequence: nur Nenner bestimmen (Zähler bekannt) → vollständigen Bruch angeben.
	if (Math.min(stage, 1) === 0) {
		return { atomId, prompt: `${dec(val)} als vollständig gekürzten Bruch:`, answerType: 'integer' as const, correctAnswer: String(d), hint: 'Schreibe als Bruch mit Nenner 10, 100 oder 1000, dann kürzen.', why: decToFracWhy(n, d), difficulty: 0.4,
			inputData: { type: 'fraction_part', missing: 'denominator', knownNum: n } };
	}
	return { atomId, prompt: `${dec(val)} als vollständig gekürzten Bruch?`, answerType: 'fraction', correctAnswer: frac(n, d), hint: 'Schreibe als Bruch mit Nenner 10, 100 oder 1000, dann kürzen.', why: decToFracWhy(n, d), difficulty: 0.5 };
});

reg('arithmetik__periodische_dezimalzahlen', (stage = 0) => {
	const atomId = 'arithmetik__periodische_dezimalzahlen';
	// [Zähler, Nenner, Dezimaldarstellung, Periodenziffer] — nur einstellige Perioden
	const singleDigit: Array<[number, number, string, string]> = [
		[1,3,'0,333…','3'],[2,3,'0,666…','6'],[1,6,'0,1666…','6'],[5,6,'0,8333…','3'],
		[1,9,'0,111…','1'],[2,9,'0,222…','2'],[4,9,'0,444…','4'],[5,9,'0,555…','5'],[7,9,'0,777…','7'],[8,9,'0,888…','8'],
		[1,12,'0,08333…','3'],[5,12,'0,41666…','6'],[7,12,'0,58333…','3'],[11,12,'0,91666…','6'],
		[1,15,'0,0666…','6'],[2,15,'0,1333…','3'],[4,15,'0,2666…','6']
	];
	// Expanding sequence: endlich/periodisch unterscheiden (gemischt) → Periodenziffer bestimmen.
	// Both answers occur within the stage — a constant answer per stage could be learned by rote.
	const type = Math.min(stage, 1);
	if (type === 0) {
		const finite = rand(0, 1) === 0;
		let n: number, d: number;
		if (finite) {
			[n, d] = terminatingFraction([2, 4, 5, 8, 10, 16, 20, 25, 40, 50]);
		} else {
			// reduced fraction whose denominator has a prime factor other than 2 and 5
			d = pick([3, 6, 7, 9, 11, 12, 15]);
			n = rand(1, d - 1);
			while (gcd(n, d) !== 1) n = rand(1, d - 1);
		}
		return { atomId, prompt: `Ist ${fmtFrac(n, d)} eine endliche oder periodische Dezimalzahl?`, answerType: 'text', choices: ['endlich', 'periodisch'], correctAnswer: finite ? 'endlich' : 'periodisch', hint: 'Endlich: Der Nenner (vollständig gekürzt) hat nur die Primfaktoren 2 und 5.', why: finite ? `Der Nenner ${d} hat nur die Primfaktoren 2 und 5 – der Bruch lässt sich auf 10, 100, 1000 … erweitern: ${dec(n / d)}.` : `Im Nenner ${d} steckt der Primfaktor ${[3, 7, 11].find(p => d % p === 0)}. Der kommt in 10, 100, 1000 … nicht vor – die Division geht nie auf.`, difficulty: 0.5 };
	}
	const [n, d, decimal, period] = pick(singleDigit);
	return { atomId, prompt: `${fmtFrac(n, d)} = ${decimal} — welche Ziffer wiederholt sich?`, answerType: 'integer', correctAnswer: period, hint: `Führe die Division ${n} : ${d} durch.`, why: `Bei ${n} : ${d} kehrt immer wieder derselbe Rest zurück – deshalb wiederholt sich die Ziffer ${period} endlos.`, difficulty: 0.55 };
});

// ── 12. Rationale Zahlen ──────────────────────────────────────────────────────

reg('arithmetik__negative_zahlen_zahlengerade', (stage = 0) => {
	const atomId = 'arithmetik__negative_zahlen_zahlengerade';
	// Expanding sequence: positiv vs. negativ (intuitiv) → Alltagskontext (Temperatur) → beide negativ.
	const type = Math.min(stage, 2);
	if (type === 0) {
		// Positive vs negative
		const pos = rand(1, 8), neg = -rand(1, 8);
		return { atomId, prompt: `Welche Zahl liegt weiter rechts auf dem Zahlenstrahl: ${neg} oder ${pos}?`, answerType: 'integer', correctAnswer: String(pos), choices: [String(neg), String(pos)], svg: svgIntegerLine(neg - 1, pos + 1, [neg, pos]), hint: 'Positive Zahlen liegen rechts von Null, negative links.', why: `Auf dem Zahlenstrahl werden die Zahlen nach rechts größer. ${pos} liegt rechts von der 0, ${neg} links davon.`, difficulty: 0.3 };
	} else if (type === 1) {
		// Everyday context: temperature
		const t1 = rand(-15, 20), t2 = rand(-15, 20);
		if (t1 === t2) return registry.get(atomId)!(stage);
		const warmer = Math.max(t1, t2);
		return { atomId, prompt: `Welche Temperatur ist wärmer: ${t1} °C oder ${t2} °C?`, answerType: 'integer', correctAnswer: String(warmer), choices: [`${t1} °C`, `${t2} °C`], hint: 'Höhere Temperatur = größere Zahl auf dem Thermometer.', why: `${warmer} °C steht auf dem Thermometer höher als ${Math.min(t1, t2)} °C.${t1 < 0 && t2 < 0 ? ' Bei Minusgraden ist die Zahl näher an 0 die wärmere.' : ''}`, difficulty: 0.35 };
	} else {
		// Both negative
		const a = -rand(1, 10), b = -rand(1, 10);
		if (a === b) return registry.get(atomId)!(stage);
		const bigger = Math.max(a, b);
		return { atomId, prompt: `Welche Zahl liegt weiter rechts auf dem Zahlenstrahl: ${a} oder ${b}?`, answerType: 'integer', correctAnswer: String(bigger), choices: [String(a), String(b)], svg: svgIntegerLine(Math.min(a, b) - 1, 1, [a, b]), hint: 'Weiter rechts = größer.', why: `Beide liegen links von der 0. ${bigger} ist näher an der 0 und liegt deshalb weiter rechts: ${Math.min(a, b)} < ${bigger}.`, difficulty: 0.4 };
	}
});

reg('arithmetik__betrag_gegenzahl', () => {
	const n = pick([-8, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8]);
	const q = rand(0, 1);
	if (q === 0) return { atomId: 'arithmetik__betrag_gegenzahl', prompt: `|${n}| = ?`, answerType: 'integer', correctAnswer: String(Math.abs(n)), why: `Der Betrag ist der Abstand zur 0: ${n} liegt ${Math.abs(n)} Schritte von der 0 entfernt. Ein Abstand ist nie negativ.`, difficulty: 0.3 };
	return { atomId: 'arithmetik__betrag_gegenzahl', prompt: `Die Gegenzahl von ${n} = ?`, answerType: 'integer', correctAnswer: String(-n), why: `Die Gegenzahl liegt gleich weit von der 0 entfernt, aber auf der anderen Seite: aus ${n} wird ${-n}.`, difficulty: 0.3 };
});

reg('arithmetik__rationale_addition_gleiche_vorzeichen', (stage = 0) => {
	// Expanding sequence on the number range: Beträge bis 5 → bis 10 → bis 25.
	const max = [5, 10, 25][Math.min(stage, 2)];
	const sign = rand(0, 1) === 0 ? 1 : -1;
	const a = sign * rand(1, max), b = sign * rand(1, max);
	return { atomId: 'arithmetik__rationale_addition_gleiche_vorzeichen', prompt: `(${a}) + (${b}) = ?`, answerType: 'integer', correctAnswer: String(a + b), hint: 'Gleiche Vorzeichen: Beträge addieren, Vorzeichen beibehalten.', why: `Beide Zahlen zeigen in dieselbe Richtung: Beträge addieren (${Math.abs(a)} + ${Math.abs(b)} = ${Math.abs(a + b)}), das gemeinsame Vorzeichen bleibt → ${a + b}.`, difficulty: 0.4 };
});

reg('arithmetik__rationale_addition_ungleiche_vorzeichen', (stage = 0) => {
	// Expanding sequence on the number range: Beträge bis 6 → bis 12 → bis 30.
	const max = [6, 12, 30][Math.min(stage, 2)];
	const a = rand(1, max), b = rand(1, max);
	const neg = rand(0, 1) === 0;
	const [pos, negV] = neg ? [a, -b] : [-a, b];
	return { atomId: 'arithmetik__rationale_addition_ungleiche_vorzeichen', prompt: `(${pos}) + (${negV}) = ?`, answerType: 'integer', correctAnswer: String(pos + negV), hint: 'Verschiedene Vorzeichen: Beträge subtrahieren, Vorzeichen des Größeren.', why: `Die Zahlen zeigen in entgegengesetzte Richtungen: Beträge voneinander abziehen (${Math.max(a, b)} − ${Math.min(a, b)} = ${Math.abs(a - b)}). ${a === b ? 'Sie heben sich genau auf → 0.' : `Das Vorzeichen kommt von der Zahl mit dem größeren Betrag (${Math.abs(pos) > Math.abs(negV) ? pos : negV}) → ${pos + negV}.`}`, difficulty: 0.45 };
});

reg('arithmetik__subtraktion_als_addition_gegenzahl', () => {
	const a = rand(-8, 8), b = rand(-8, 8);
	if (b >= 0) return { atomId: 'arithmetik__subtraktion_als_addition_gegenzahl', prompt: `${a} − (${b}) = ?`, answerType: 'integer', correctAnswer: String(a - b), hint: `Subtraktion = Addition der Gegenzahl: ${a} + (${-b})`, why: `Eine Zahl abziehen heißt ihre Gegenzahl addieren: ${a} − (${b}) = ${a} + ${paren(-b)} = ${a - b}.`, difficulty: 0.5 };
	return { atomId: 'arithmetik__subtraktion_als_addition_gegenzahl', prompt: `${a} − (${b}) = ?`, answerType: 'integer', correctAnswer: String(a - b), hint: `${a} − (${b}) = ${a} + ${-b}`, why: `Eine Zahl abziehen heißt ihre Gegenzahl addieren: ${a} − (${b}) = ${a} + ${-b} = ${a - b}.`, difficulty: 0.5 };
});

reg('arithmetik__vorzeichenregeln_mult_div', (stage = 0) => {
	// Expanding sequence: Multiplikation mit Beträgen bis 5 → auch Division, bis 9 → Beträge bis 12.
	const lvl = Math.min(stage, 2);
	const max = [5, 9, 12][lvl];
	const a = rand(1, max), b = rand(1, max);
	const sa = pick([-1, 1]), sb = pick([-1, 1]);
	const op = lvl === 0 ? 0 : rand(0, 1);
	if (op === 0) return { atomId: 'arithmetik__vorzeichenregeln_mult_div', prompt: `(${sa * a}) · (${sb * b}) = ?`, answerType: 'integer', correctAnswer: String(sa * sb * a * b), hint: '(−) · (−) = (+), (−) · (+) = (−)', why: `Erst ohne Vorzeichen: ${a} · ${b} = ${a * b}. ${sa === sb ? 'Gleiche Vorzeichen → das Ergebnis ist positiv.' : 'Verschiedene Vorzeichen → das Ergebnis ist negativ.'}`, difficulty: 0.45 };
	// Division: (sa*a*b) : (sb*a) = sa*sb*b — independent signs so result can be negative
	return { atomId: 'arithmetik__vorzeichenregeln_mult_div', prompt: `(${sa * a * b}) : (${sb * a}) = ?`, answerType: 'integer', correctAnswer: String(sa * sb * b), hint: 'Gleiches Vorzeichen → positiv, verschiedene → negativ.', why: `Erst ohne Vorzeichen: ${a * b} : ${a} = ${b}. ${sa === sb ? 'Gleiche Vorzeichen → das Ergebnis ist positiv.' : 'Verschiedene Vorzeichen → das Ergebnis ist negativ.'}`, difficulty: 0.45 };
});

reg('arithmetik__vorzeichen_klammerregeln', () => {
	const a = rand(1, 10), b = rand(1, 10);
	const type = rand(0, 1);
	if (type === 0) return { atomId: 'arithmetik__vorzeichen_klammerregeln', prompt: `−(${a} − ${b}) = ?`, answerType: 'integer', correctAnswer: String(-(a - b)), hint: 'Minus vor der Klammer dreht alle Vorzeichen um.', why: `Das Minus vor der Klammer dreht jedes Vorzeichen um: −(${a} − ${b}) = −${a} + ${b} = ${b - a}.`, difficulty: 0.5 };
	const c = rand(1, 5);
	return { atomId: 'arithmetik__vorzeichen_klammerregeln', prompt: `${c} − (${a} − ${b}) = ?`, answerType: 'integer', correctAnswer: String(c - a + b), why: `Das Minus vor der Klammer dreht die Vorzeichen in der Klammer um: ${c} − ${a} + ${b} = ${c - a + b}.`, difficulty: 0.5 };
});

reg('arithmetik__verbindung_rechenarten_rationale', (stage = 0) => {
	const atomId = 'arithmetik__verbindung_rechenarten_rationale';
	// Expanding sequence: Punkt-vor-Strich → Klammer → zwei Produkte verbinden.
	const type = Math.min(stage, 2);
	if (type === 0) {
		const a = rand(-5, 5), b = rand(1, 4), c = rand(-5, 5);
		return { atomId, prompt: `${a} + ${b} · ${paren(c)} = ?`, answerType: 'integer', correctAnswer: String(a + b * c), hint: 'Punkt vor Strich: zuerst multiplizieren.', why: `Punkt vor Strich: ${b} · ${paren(c)} = ${b * c}, dann ${a} + ${paren(b * c)} = ${a + b * c}.`, difficulty: 0.5 };
	} else if (type === 1) {
		const a = rand(-4, 4), b = rand(1, 6), c = rand(2, 4);
		return { atomId, prompt: `(${a} + ${b}) · ${c} = ?`, answerType: 'integer', correctAnswer: String((a + b) * c), hint: 'Zuerst die Klammer berechnen.', why: `Die Klammer geht vor: ${a} + ${b} = ${a + b}, dann ${paren(a + b)} · ${c} = ${(a + b) * c}.`, difficulty: 0.55 };
	} else {
		const a = rand(2, 6), b = rand(2, 5), c = rand(1, 4), d = rand(1, 4);
		return { atomId, prompt: `${a} · ${b} − ${c} · ${d} = ?`, answerType: 'integer', correctAnswer: String(a * b - c * d), hint: 'Beide Produkte zuerst berechnen, dann subtrahieren.', why: `Erst beide Produkte: ${a} · ${b} = ${a * b} und ${c} · ${d} = ${c * d}. Dann ${a * b} − ${c * d} = ${a * b - c * d}.`, difficulty: 0.6 };
	}
});

// ── 13. Prozentrechnung ───────────────────────────────────────────────────────

reg('arithmetik__prozentschreibweise', () => {
	// Denominators that divide 100 → whole-number percentages
	const [num, den] = rand(0, 3) === 0 ? [rand(1, 99), 100] : terminatingFraction([2, 4, 5, 10, 20, 25, 50]);
	const percent = num * 100 / den;
	const q = rand(0, 2);
	if (q === 0) return { atomId: 'arithmetik__prozentschreibweise', prompt: `${fmtFrac(num, den)} = ___ %`, answerType: 'integer', correctAnswer: String(percent), hint: 'Prozent bedeutet Hundertstel: erweitere auf den Nenner 100.', why: `Prozent heißt „von 100": ${den === 100 ? '' : `${fmtFrac(num, den)} = `}${fmtFrac(percent, 100)} = ${percent} %.`, difficulty: 0.35 };
	if (q === 1) return { atomId: 'arithmetik__prozentschreibweise', prompt: `${percent} % als Dezimalzahl = ?`, answerType: 'number', correctAnswer: dec(percent / 100), hint: 'Teile durch 100 (Komma um zwei Stellen nach links).', why: `${percent} % = ${fmtFrac(percent, 100)} = ${dec(percent / 100)} – das Komma rückt zwei Stellen nach links.`, difficulty: 0.35 };
	return { atomId: 'arithmetik__prozentschreibweise', prompt: `${dec(percent / 100)} = ___ %`, answerType: 'integer', correctAnswer: String(percent), hint: 'Multipliziere mit 100 (Komma um zwei Stellen nach rechts).', why: `${dec(percent / 100)} = ${fmtFrac(percent, 100)} = ${percent} % – das Komma rückt zwei Stellen nach rechts.`, difficulty: 0.35 };
});

reg('arithmetik__prozentwert_berechnen', (stage = 0) => {
	// Expanding sequence: Stammprozentsätze (50 %, 25 %, 10 % = Hälfte, Viertel, Zehntel) →
	// weitere glatte Prozentsätze → beliebige Prozentsätze, Ergebnis auch mit Komma.
	const lvl = Math.min(stage, 2);
	const p = pick([[10, 25, 50], [5, 10, 20, 25, 40, 50, 75], [15, 30, 35, 45, 60, 65, 70, 80, 90]][lvl]);
	const G = pick([[20, 40, 60, 80, 100, 200, 400], [20, 40, 60, 80, 100, 120, 200, 400, 500], [20, 40, 50, 60, 80, 120, 150, 250, 300]][lvl]);
	const W = round(p * G / 100, 1);
	return { atomId: 'arithmetik__prozentwert_berechnen', prompt: `${p}% von ${G} = ?`, answerType: 'number', correctAnswer: dec(W), hint: `Prozentwert = Grundwert · Prozentsatz : 100`, why: `1 % von ${G} ist ${dec(G / 100)}. ${p} % sind ${p}-mal so viel: ${p} · ${dec(G / 100)} = ${dec(W)}.`, difficulty: 0.45 };
});

reg('arithmetik__prozentsatz_berechnen', (stage = 0) => {
	// Expanding sequence: Hälfte/Viertel/Zehntel vom Hunderter → glatte Anteile → krumme Prozentsätze.
	const lvl = Math.min(stage, 2);
	const p = pick([[10, 25, 50], [5, 10, 20, 25, 40, 50], [5, 15, 30, 35, 45, 60, 75, 80]][lvl]);
	const G = pick([[20, 40, 100, 200], [20, 40, 50, 80, 100, 200], [20, 40, 60, 80, 120, 200, 300]][lvl]);
	const W = p * G / 100;
	return { atomId: 'arithmetik__prozentsatz_berechnen', prompt: `${dec(W)} von ${G} sind ___% ?`, answerType: 'integer', correctAnswer: String(p), hint: `Prozentsatz = Prozentwert : Grundwert · 100`, why: `Anteil = Teil : Ganzes = ${dec(W)} : ${G} = ${dec(W / G)} = ${p} %. Probe: ${p} % von ${G} sind ${dec(W)}.`, difficulty: 0.5 };
});

reg('arithmetik__grundwert_berechnen', (stage = 0) => {
	// Expanding sequence: Hälfte/Viertel/Zehntel → glatte Prozentsätze → krumme Prozentsätze.
	const lvl = Math.min(stage, 2);
	const p = pick([[10, 25, 50], [10, 20, 25, 40, 50], [5, 15, 30, 40, 60, 75, 80]][lvl]);
	const G = pick([[20, 40, 80, 100, 200], [20, 40, 50, 80, 100, 120, 200], [20, 40, 60, 80, 100, 120, 200, 300, 400]][lvl]);
	const W = p * G / 100;
	return { atomId: 'arithmetik__grundwert_berechnen', prompt: `${dec(W)} sind ${p}% von ___?`, answerType: 'integer', correctAnswer: String(G), hint: `Grundwert = Prozentwert · 100 : Prozentsatz`, why: `${p} % sind ${dec(W)}, also ist 1 % = ${dec(W)} : ${p} = ${dec(W / p)}. 100 % sind dann ${dec(W / p)} · 100 = ${G}.`, difficulty: 0.55 };
});

reg('arithmetik__vermehrter_verminderter_grundwert', (stage = 0) => {
	const atomId = 'arithmetik__vermehrter_verminderter_grundwert';
	const p = pick([5, 10, 15, 20, 25]);
	const G = pick([40, 50, 80, 100, 120, 200]);
	// Expanding sequence: Erhöhung berechnen → Senkung berechnen → Grundwert aus Erhöhung → Grundwert aus Senkung.
	const type = Math.min(stage, 3);
	if (type === 0) {
		const result = G + G * p / 100;
		return { atomId, prompt: `${G} € wird um ${p}% erhöht. Neuer Betrag = ?`, answerType: 'number', correctAnswer: dec(result), hint: `Neuer Betrag = ${G} · (1 + ${p}/100)`, why: `${p} % von ${G} € sind ${dec(G * p / 100)} €. Die kommen dazu: ${G} + ${dec(G * p / 100)} = ${dec(result)} € (kurz: ${G} · ${dec(1 + p / 100)}).`, difficulty: 0.5 };
	} else if (type === 1) {
		const result = G - G * p / 100;
		return { atomId, prompt: `${G} € wird um ${p}% reduziert. Neuer Betrag = ?`, answerType: 'number', correctAnswer: dec(result), hint: `Neuer Betrag = ${G} · (1 − ${p}/100)`, why: `${p} % von ${G} € sind ${dec(G * p / 100)} €. Die gehen weg: ${G} − ${dec(G * p / 100)} = ${dec(result)} € (kurz: ${G} · ${dec(1 - p / 100)}).`, difficulty: 0.5 };
	} else if (type === 2) {
		// Reverse increase: given new value, find original
		const newVal = G + G * p / 100;
		return { atomId, prompt: `Nach einer Erhöhung um ${p}% beträgt ein Wert ${dec(newVal)} €. Was war der ursprüngliche Wert?`, answerType: 'number', correctAnswer: dec(G), hint: `Grundwert = Neuer Wert ÷ (1 + ${p}/100) = ${dec(newVal)} ÷ ${dec(1 + p / 100)}`, why: `Der neue Wert entspricht ${100 + p} % des alten. 1 % = ${dec(newVal)} : ${100 + p} = ${dec(G / 100)}, also 100 % = ${G} €. Achtung: nicht ${p} % vom neuen Wert abziehen!`, difficulty: 0.65 };
	} else {
		// Reverse decrease: given new value, find original
		const newVal = G - G * p / 100;
		return { atomId, prompt: `Nach einer Senkung um ${p}% beträgt ein Wert ${dec(newVal)} €. Was war der ursprüngliche Wert?`, answerType: 'number', correctAnswer: dec(G), hint: `Grundwert = Neuer Wert ÷ (1 − ${p}/100) = ${dec(newVal)} ÷ ${dec(1 - p / 100)}`, why: `Der neue Wert entspricht ${100 - p} % des alten. 1 % = ${dec(newVal)} : ${100 - p} = ${dec(G / 100)}, also 100 % = ${G} €. Achtung: nicht ${p} % auf den neuen Wert aufschlagen!`, difficulty: 0.65 };
	}
});

reg('arithmetik__zinsrechnung', (stage = 0) => {
	const atomId = 'arithmetik__zinsrechnung';
	const K = pick([100, 200, 500, 1000]);
	const p = pick([1, 2, 3, 4, 5]);
	const t = pick([1, 2, 3]);
	// Expanding sequence: Zinsen berechnen → Endkapital (einfache Verzinsung) → Endkapital (Zinseszins).
	const type = Math.min(stage, 2);
	if (type === 0) {
		const Z = round(K * p * t / 100, 2);
		return { atomId, prompt: `Kapital ${K} €, Zinssatz ${p}%, Laufzeit ${t} Jahr(e) — Zinsen = ?`, answerType: 'number', correctAnswer: dec(Z), hint: `Z = K · p · t : 100`, why: `Zinsen für ein Jahr: ${p} % von ${K} € = ${dec(K * p / 100)} €.${t > 1 ? ` Für ${t} Jahre: ${t} · ${dec(K * p / 100)} = ${dec(Z)} €.` : ''}`, difficulty: 0.55 };
	} else if (type === 1) {
		const Z = round(K * p * t / 100, 2);
		return { atomId, prompt: `Kapital ${K} €, ${p}% p.a., ${t} Jahr(e) — Endkapital (einfache Verzinsung) = ?`, answerType: 'number', correctAnswer: dec(round(K + Z, 2)), hint: 'Endkapital = Kapital + Zinsen', why: `Zinsen: ${p} % von ${K} € = ${dec(K * p / 100)} € pro Jahr, in ${t} ${t === 1 ? 'Jahr' : 'Jahren'} ${dec(Z)} €. Endkapital: ${K} + ${dec(Z)} = ${dec(round(K + Z, 2))} €.`, difficulty: 0.6 };
	} else {
		// Compound interest: Kn = K · (1 + p/100)^t
		const Kn = round(K * (1 + p / 100) ** t, 2);
		return { atomId, prompt: `Kapital ${K} €, ${p}% Zinseszins p.a., ${t} Jahr(e) — Endkapital = ?`, answerType: 'number', correctAnswer: dec(Kn), tolerance: 0.01, hint: `K_n = K · (1 + p/100)^n = ${K} · ${dec(1 + p / 100)}^${t}`, why: `Jedes Jahr wächst das Kapital auf das ${dec(1 + p / 100)}-Fache – die Zinsen werden mitverzinst: ${K} ${Array(t).fill(`· ${dec(1 + p / 100)}`).join(' ')} ≈ ${dec(Kn)} €.`, difficulty: 0.7 };
	}
});

// ── 14. Potenzen ──────────────────────────────────────────────────────────────

reg('arithmetik__potenzieren_natuerliche_zahlen', (stage = 0) => {
	const atomId = 'arithmetik__potenzieren_natuerliche_zahlen';
	// Expanding sequence: Zehnerpotenzen (konzeptuell) → Quadratzahlen → Kubikzahlen/4. Potenzen.
	const type = Math.min(stage, 2);
	if (type === 0) {
		// Powers of 10 (conceptual)
		const exp = rand(2, 6);
		return { atomId, prompt: `${pow(10, exp)} = ?`, answerType: 'integer', correctAnswer: String(10 ** exp), hint: `${pow(10, 'n')} = 1 gefolgt von n Nullen`, why: `Der Exponent sagt, wie oft die 10 als Faktor steht: ${Array(exp).fill(10).join(' · ')} = ${10 ** exp} – eine 1 mit ${exp} Nullen.`, difficulty: 0.3 };
	} else if (type === 1) {
		// Squares 2² to 20²
		const base = rand(2, 20);
		return { atomId, prompt: `${pow(base, 2)} = ?`, answerType: 'integer', correctAnswer: String(base * base), hint: `${base} · ${base}`, why: `${pow(base, 2)} heißt ${base} · ${base} (nicht ${base} · 2) = ${base * base}.`, difficulty: base <= 9 ? 0.35 : 0.5 };
	} else {
		// Cubes and 4th powers (small bases only, result ≤ 100)
		let base: number, exp: number;
		do { base = rand(2, 5); exp = rand(3, 4); } while (base ** exp > 125);
		return { atomId, prompt: `${pow(base, exp)} = ?`, answerType: 'integer', correctAnswer: String(base ** exp), hint: `${base} · ${base} · ${base}${exp > 3 ? ` · ${base}` : ''} = ?`, why: `Der Exponent sagt, wie oft die Basis als Faktor steht: ${Array(exp).fill(base).join(' · ')} = ${base ** exp}.`, difficulty: 0.5 };
	}
});

reg('arithmetik__zehnerpotenzen_normdarstellung', (stage = 0) => {
	const atomId = 'arithmetik__zehnerpotenzen_normdarstellung';
	// Expanding sequence: Normdarstellung auswerten → Mantisse extrahieren → (weiter unten) Exponent bestimmen.
	const type = Math.min(stage, 2);
	if (type === 0) {
		// Large number: mantissa · 10^exp
		const exp = rand(2, 6);
		const n = rand(1, 9) + rand(1, 9) / 10;
		const value = Math.round(n * 10 ** exp);
		return { atomId, prompt: `${dec(n)} · ${pow(10, exp)} = ?`, answerType: 'integer', correctAnswer: String(value), hint: 'Komma um den Exponenten nach rechts verschieben.', why: `Mal ${pow(10, exp)} verschiebt das Komma um ${exp} Stellen nach rechts: aus ${dec(n)} wird ${value}.`, difficulty: 0.5 };
	} else if (type === 1) {
		// Extract mantissa from large number
		const exp = rand(2, 5);
		const value = rand(1, 9) * 10 ** exp;
		const mant = value / 10 ** exp;
		return { atomId, prompt: `${value} in Normdarstellung: ___ · ${pow(10, exp)} — was ist die Mantisse?`, answerType: 'number', correctAnswer: dec(mant), hint: `Mantisse ist die Zahl vor · ${pow(10, 'n')}.`, why: `${value} = ${dec(mant)} · ${10 ** exp}, und ${10 ** exp} = ${pow(10, exp)}. Die Mantisse ist die Zahl davor: ${dec(mant)}.`, difficulty: 0.55 };
	} else {
		// Small number: mantissa · 10^(-exp) — ask for the decimal result
		const negExp = rand(1, 3);
		const mantissa = rand(1, 9);
		const value = round(mantissa * 10 ** (-negExp), negExp);
		return { atomId, prompt: `${mantissa} · ${pow(10, -negExp)} = ?`, answerType: 'number', correctAnswer: dec(value), hint: `Komma um ${negExp} Stelle(n) nach links verschieben.`, why: `Ein negativer Exponent verschiebt das Komma nach links: ${mantissa} · ${pow(10, -negExp)} = ${mantissa} : ${10 ** negExp} = ${dec(value)}.`, difficulty: 0.6 };
	}
});

// ── 15. Größen ────────────────────────────────────────────────────────────────

// arithmetik__groessen_geld_laenge_zeit ist seit Graph v4 ein Cluster; die Teilfertigkeiten
// (…_geld, …_laengen, …_zeit) stehen in Abschnitt 33.

reg('arithmetik__groessen_masse_volumen', () => {
	const tasks = [
		() => { const kg = rand(1, 9), g = rand(100, 900); return { q: `${kg} kg ${g} g = ___ g insgesamt?`, a: String(kg * 1000 + g), w: `1 kg = 1000 g: ${kg} kg = ${kg * 1000} g, dazu ${g} g → ${kg * 1000 + g} g.` }; },
		() => { const l = rand(1, 5), ml = rand(100, 900); return { q: `${l} l ${ml} ml = ___ ml?`, a: String(l * 1000 + ml), w: `1 l = 1000 ml: ${l} l = ${l * 1000} ml, dazu ${ml} ml → ${l * 1000 + ml} ml.` }; },
		() => { const g = rand(1, 9) * 1000; return { q: `${g} g = ___ kg?`, a: String(g / 1000), w: `1000 g = 1 kg, also ${g} g = ${g / 1000} kg.` }; },
		() => { const t = rand(1, 3); return { q: `${t} t = ___ kg?`, a: String(t * 1000), w: `1 t = 1000 kg, also ${t} t = ${t * 1000} kg.` }; }
	];
	const t = pick(tasks)();
	return { atomId: 'arithmetik__groessen_masse_volumen', prompt: t.q, answerType: t.a.includes('.') ? 'number' : 'integer', correctAnswer: t.a, why: t.w, difficulty: 0.4 };
});

// ── 16. Verhältnisse ──────────────────────────────────────────────────────────

reg('arithmetik__verhaeltnisse', (stage = 0) => {
	const g = rand(2, 5), a = rand(1, 5), b = rand(1, 5);
	// a and b must be coprime, otherwise a·g : b·g could be reduced further than a : b
	if (a === b || gcd(a, b) !== 1) return registry.get('arithmetik__verhaeltnisse')!(stage);
	// Expanding sequence: Verhältnis kürzen → Ganzes im Verhältnis aufteilen.
	const type = Math.min(stage, 1);
	if (type === 0) return { atomId: 'arithmetik__verhaeltnisse', prompt: `Kürze das Verhältnis ${a * g} : ${b * g} — erster Teil?`, answerType: 'integer', correctAnswer: String(a), hint: `Teile durch ggT = ${g}`, why: `Beide Zahlen durch ihren größten gemeinsamen Teiler ${g} teilen: ${a * g} : ${b * g} = ${a} : ${b}.`, difficulty: 0.45 };
	const total = (a + b) * g * rand(1, 3);
	const share = (a * total) / (a + b);
	if (!Number.isInteger(share)) return registry.get('arithmetik__verhaeltnisse')!(stage);
	return { atomId: 'arithmetik__verhaeltnisse', prompt: `${total} wird im Verhältnis ${a}:${b} geteilt — größerer Teil?`, answerType: 'integer', correctAnswer: String(Math.max(a, b) * total / (a + b)), why: `${a} + ${b} = ${a + b} Teile insgesamt. Ein Teil: ${total} : ${a + b} = ${total / (a + b)}. Der größere Anteil hat ${Math.max(a, b)} Teile: ${Math.max(a, b)} · ${total / (a + b)} = ${Math.max(a, b) * total / (a + b)}.`, difficulty: 0.5 };
});

// ── 17. Daten / Mittelwert ────────────────────────────────────────────────────

reg('arithmetik__arithmetisches_mittel', (stage = 0) => {
	const atomId = 'arithmetik__arithmetisches_mittel';
	// Expanding sequence: 3 Werte bis 10 → 3–4 Werte bis 20 → 4–6 Werte bis 50.
	const lvl = Math.min(stage, 2);
	const count = [3, rand(3, 4), rand(4, 6)][lvl];
	const max = [10, 20, 50][lvl];
	const nums = Array.from({ length: count }, () => rand(1, max));
	const sum = nums.reduce((a, b) => a + b, 0);
	const mean = sum / count;
	if (!Number.isInteger(mean)) return registry.get(atomId)!(stage);
	return { atomId, prompt: `Arithmetisches Mittel von {${nums.join(', ')}} = ?`, answerType: 'integer', correctAnswer: String(mean), hint: `Summe = ${sum}, Anzahl = ${count}`, why: `Alle Werte addieren und durch die Anzahl teilen: ${nums.join(' + ')} = ${sum}; ${sum} : ${count} = ${mean}.`, difficulty: 0.45 };
});

// ── 18. Algebra: Terme ────────────────────────────────────────────────────────

reg('algebra__variablenbegriff', () => {
	const type = rand(0, 4);
	let q: string, a: string, w: string[]; let expl: string;
	if (type === 0) {
		// n Stück zum Preis v
		const n = rand(2, 9);
		const v = pick(['a', 'b', 'h', 'k', 'p']);
		const items: [string, string][] = [['Ein Heft', 'Hefte'], ['Ein Apfel', 'Äpfel'], ['Ein Buch', 'Bücher'], ['Ein Stift', 'Stifte'], ['Ein Keks', 'Kekse'], ['Eine Orange', 'Orangen']];
		const [one, item] = pick(items);
		q = `${one} kostet \\(${v}\\) Euro. Wie viel kosten ${n} ${item}?`;
		a = `\\(${n}${v}\\)`; w = [`\\(${v}+${n}\\)`, `\\(${n}+${v}\\)`, `\\(${v}−${n}\\)`]; expl = `${n} ${item} kosten ${n}-mal so viel wie ein Stück: ${n} · \\(${v}\\) = \\(${n}${v}\\).`;
	} else if (type === 1) {
		// Anzahl × pro Person
		const n = rand(2, 8);
		const v = pick(['n', 'k', 's', 'm', 'a']);
		const people = pick(['Schüler', 'Kinder', 'Spieler', 'Gäste']);
		const things = pick(['Stifte', 'Punkte', 'Karten', 'Bonbons', 'Aufgaben']);
		q = `${n} ${people} erhalten je \\(${v}\\) ${things}. Wie viele ${things} insgesamt?`;
		a = `\\(${n}${v}\\)`; w = [`\\(${v}+${n}\\)`, `\\(${v} \\cdot ${v}\\)`, `\\(${n}−${v}\\)`]; expl = `Jede der ${n} Personen bekommt \\(${v}\\): ${n} · \\(${v}\\) = \\(${n}${v}\\).`;
	} else if (type === 2) {
		// Differenz (jünger / kürzer)
		const d = rand(1, 6);
		const v = pick(['x', 'a', 'n', 'j']);
		const [[p1, rel], obj] = [pick([['Lena', 'ihr'], ['Max', 'sein'], ['Tim', 'sein']]), pick(['Bruder', 'Freund', 'Cousin'])];
		q = `${p1} ist \\(${v}\\) Jahre alt. ${rel.charAt(0).toUpperCase() + rel.slice(1)} ${obj} ist ${d} ${d === 1 ? 'Jahr' : 'Jahre'} jünger. Wie alt ist er?`;
		a = `\\(${v}−${d}\\)`; w = [`\\(${v}+${d}\\)`, `\\(${d}−${v}\\)`, `\\(${d}${v}\\)`]; expl = `„${d} ${d === 1 ? 'Jahr' : 'Jahre'} jünger" heißt ${d} weniger: \\(${v} − ${d}\\).`;
	} else if (type === 3) {
		// Geschwindigkeit × Zeit
		const t = rand(2, 6);
		const v = pick(['v', 'g', 'w']);
		const vehicle = pick(['Zug', 'Auto', 'Fahrrad', 'Bus']);
		q = `Ein ${vehicle} fährt \\(${v}\\) km/h. Wie weit kommt es in ${t} Stunden?`;
		a = `\\(${t}${v}\\)`; w = [`\\(${v}+${t}\\)`, `\\(${v}:${t}\\)`, `\\(${t}+${v}\\)`]; expl = `Weg = Geschwindigkeit · Zeit: in jeder der ${t} Stunden \\(${v}\\) km, also \\(${t}${v}\\).`;
	} else {
		// Geometrisch: Umfang
		const n = rand(3, 8);
		const v = pick(['s', 'a', 'l', 'b']);
		const shapes = [
			{ name: 'gleichseitigen Dreieck', sides: 3 },
			{ name: 'Quadrat', sides: 4 },
			{ name: 'regelmäßigen Fünfeck', sides: 5 },
			{ name: `regelmäßigen ${n}-Eck`, sides: n },
		];
		const shape = pick(shapes);
		q = `In einem ${shape.name} ist jede Seite \\(${v}\\) lang. Wie lautet der Umfang?`;
		a = `\\(${shape.sides}${v}\\)`; w = [`\\(${v}+${shape.sides}\\)`, `\\(${v}^2\\)`, `\\(${shape.sides}+${v}\\)`]; expl = `Der Umfang ist die Summe aller ${shape.sides} gleich langen Seiten: ${shape.sides} · \\(${v}\\) = \\(${shape.sides}${v}\\).`;
	}
	const choices = [a, ...w].sort(() => Math.random() - 0.5);
	return { atomId: 'algebra__variablenbegriff', prompt: q, answerType: 'text', correctAnswer: a, choices, why: expl, difficulty: 0.3 };
});

reg('algebra__termwert_berechnen', (stage = 0) => {
	const x = rand(-4, 6);
	// Expanding sequence: ax−b → ax+b → ax² → ax²+bx.
	const type = Math.min(stage, 3);
	if (type === 0) {
		const a = rand(2, 6), b = rand(1, 5);
		const val = a * x - b;
		return { atomId: 'algebra__termwert_berechnen', prompt: `Berechne \\(${a}x − ${b}\\) für \\(x = ${x}\\).`, answerType: 'integer', correctAnswer: String(val), hint: `Einsetzen: ${a}·(${x}) − ${b} = ${val}`, why: `Setze für x die Zahl ${x} ein: ${a} · ${paren(x)} − ${b} = ${a * x} − ${b} = ${val}.`, difficulty: 0.35 };
	} else if (type === 1) {
		const a = rand(2, 5), b = rand(1, 5);
		const val = a * x + b;
		return { atomId: 'algebra__termwert_berechnen', prompt: `Berechne \\(${a}x + ${b}\\) für \\(x = ${x}\\).`, answerType: 'integer', correctAnswer: String(val), hint: `Einsetzen: ${a}·(${x}) + ${b} = ${val}`, why: `Setze für x die Zahl ${x} ein: ${a} · ${paren(x)} + ${b} = ${a * x} + ${b} = ${val}.`, difficulty: 0.4 };
	} else if (type === 2) {
		const a = rand(1, 3);
		const val = a * x * x;
		return { atomId: 'algebra__termwert_berechnen', prompt: `Berechne \\(${a > 1 ? a : ''}x^2\\) für \\(x = ${x}\\).`, answerType: 'integer', correctAnswer: String(val), hint: `Einsetzen: ${a}·(${x})² = ${a}·${x * x} = ${val}`, why: `Zuerst das Quadrat: ${paren(x)}² = ${x * x}${x < 0 ? ' (Minus mal Minus ergibt Plus)' : ''}${a > 1 ? `, dann ${a} · ${x * x} = ${val}` : ''}.`, difficulty: 0.45 };
	} else {
		const a = rand(1, 3), b = rand(1, 4);
		const val = a * x * x + b * x;
		return { atomId: 'algebra__termwert_berechnen', prompt: `Berechne \\(${fmtPoly([[a, 'x^2'], [b, 'x']])}\\) für \\(x = ${x}\\).`, answerType: 'integer', correctAnswer: String(val), hint: `Einsetzen: ${a}·${x * x} + ${b}·(${x}) = ${val}`, why: `Einsetzen: ${a} · ${paren(x)}² + ${b} · ${paren(x)} = ${a * x * x} + ${paren(b * x)} = ${val}.`, difficulty: 0.5 };
	}
});

reg('algebra__terme_zusammenfassen', (stage = 0) => {
	// Expanding sequence: add same-variable terms → subtract same-variable terms → mixed two-variable term.
	const type = Math.min(stage, 2);
	if (type === 0) {
		const a = rand(2, 8), b = rand(2, 8);
		return { atomId: 'algebra__terme_zusammenfassen', prompt: `Vereinfache: \\(${a}x + ${b}x = \\_ \\_ x\\)`, answerType: 'integer', correctAnswer: String(a + b), hint: `Gleichartige Terme: \\((${a}+${b})x = ${a + b}x\\)`, why: `Gleichartige Terme zählst du wie Äpfel: ${a} x und ${b} x sind zusammen ${a + b} x.`, difficulty: 0.35 };
	} else if (type === 1) {
		const a = rand(4, 9), b = rand(2, a - 2);
		return { atomId: 'algebra__terme_zusammenfassen', prompt: `Vereinfache: \\(${a}a − ${b}a = \\_ \\_ a\\)`, answerType: 'integer', correctAnswer: String(a - b), hint: `Gleichartige Terme: \\((${a}−${b})a = ${a - b}a\\)`, why: `${a} a minus ${b} a sind ${a - b} a – nur die Zahlen vor der Variable werden verrechnet.`, difficulty: 0.35 };
	} else {
		// resA ≥ 2 (no "1a"); distractors: b changed, a-terms not combined, a-terms added instead of subtracted
		const ca = rand(3, 6), cb = rand(2, 5), da = rand(1, ca - 2);
		const resA = ca - da;
		const choices = [`\\(${resA}a + ${cb + 1}b\\)`, `\\(${resA}a + ${cb}b\\)`, `\\(${ca}a + ${cb}b\\)`, `\\(${ca + da}a + ${cb}b\\)`];
		const correct = `\\(${resA}a + ${cb}b\\)`;
		return { atomId: 'algebra__terme_zusammenfassen', prompt: `Vereinfache: \\(${ca}a + ${cb}b − ${da}a\\)`, answerType: 'text', correctAnswer: correct, choices: choices.sort(() => Math.random() - 0.5), hint: `Nur gleichartige Terme zusammenfassen: \\((${ca}−${da})a + ${cb}b\\)`, why: `Nur gleichartige Terme lassen sich zusammenfassen: \\(${ca}a − ${da}a = ${resA}a\\). \\(${cb}b\\) bleibt allein stehen.`, difficulty: 0.45 };
	}
});

reg('algebra__ausmultiplizieren_distributiv', (stage = 0) => {
	// Expanding sequence: a(x+b) → a(x−b) → (x+p)(x+q).
	const type = Math.min(stage, 2);
	if (type === 0) {
		const a = rand(2, 6), b = rand(1, 8);
		return { atomId: 'algebra__ausmultiplizieren_distributiv', prompt: `Multipliziere aus: \\(${a}(x + ${b}) = ${a}x + \\_\\_\\)`, answerType: 'integer', correctAnswer: String(a * b), hint: `\\(${a} \\cdot x + ${a} \\cdot ${b} = ${a}x + ${a * b}\\)`, why: `Der Faktor ${a} wird mit jedem Summanden multipliziert: \\(${a} \\cdot x = ${a}x\\) und \\(${a} \\cdot ${b} = ${a * b}\\).`, difficulty: 0.4 };
	} else if (type === 1) {
		const a = rand(2, 5), b = rand(1, 6);
		return { atomId: 'algebra__ausmultiplizieren_distributiv', prompt: `Multipliziere aus: \\(${a}(x − ${b}) = ${a}x − \\_\\_\\)`, answerType: 'integer', correctAnswer: String(a * b), hint: `\\(${a} \\cdot x − ${a} \\cdot ${b} = ${a}x − ${a * b}\\)`, why: `Der Faktor ${a} wird mit beiden Gliedern multipliziert: \\(${a} \\cdot x = ${a}x\\) und \\(${a} \\cdot ${b} = ${a * b}\\).`, difficulty: 0.4 };
	} else {
		const p = rand(1, 5), q = rand(1, 5);
		const mid = p + q, last = p * q;
		const choices = [`\\(x^2 + ${mid}x + ${last}\\)`, `\\(x^2 + ${p}x + ${q}\\)`, `\\(x^2 + ${mid}x + ${p * q + 1}\\)`, `\\(x^2 − ${mid}x + ${last}\\)`];
		return { atomId: 'algebra__ausmultiplizieren_distributiv', prompt: `Multipliziere aus: \\((x + ${p})(x + ${q})\\)`, answerType: 'text', correctAnswer: choices[0], choices: choices.sort(() => Math.random() - 0.5), hint: `\\(x^2+(${p}+${q})x+${p} \\cdot ${q} = x^2+${mid}x+${last}\\)`, why: `Jedes Glied der ersten Klammer mal jedes der zweiten: \\(x^2 + ${q}x + ${p}x + ${last} = x^2 + ${mid}x + ${last}\\).`, difficulty: 0.55 };
	}
});

reg('algebra__ausklammern_faktorisieren', (stage = 0) => {
	// Expanding sequence: gemeinsamen Faktor erkennen → vollständig ausklammern.
	const type = Math.min(stage, 1);
	if (type === 0) {
		// a and b coprime, so that gcd(k·a, k·b) = k exactly
		const k = rand(2, 9);
		let a = rand(2, 7), b = rand(2, 7);
		while (gcd(a, b) !== 1) { a = rand(2, 7); b = rand(2, 7); }
		const coeff1 = k * a, coeff2 = k * b;
		const wrongChoices = Array.from(new Set([a, b, k + 1, coeff1, coeff2].map(String).filter(c => c !== String(k)))).slice(0, 3);
		return { atomId: 'algebra__ausklammern_faktorisieren', prompt: `Welcher größte gemeinsame Faktor kann ausgeklammert werden? \\(${coeff1}x − ${coeff2}\\)`, answerType: 'integer', correctAnswer: String(k), choices: [String(k), ...wrongChoices].sort(() => Math.random() - 0.5), hint: `ggT(${coeff1}, ${coeff2}) = ${k}`, why: `\\(${coeff1} = ${k} \\cdot ${a}\\) und \\(${coeff2} = ${k} \\cdot ${b}\\). ${k} ist die größte Zahl, die in beiden steckt.`, difficulty: 0.45 };
	} else {
		const k = rand(2, 6), a = rand(2, 5), b = rand(1, 5);
		return { atomId: 'algebra__ausklammern_faktorisieren', prompt: `Klammere aus: \\(${k * a}x + ${k * b} = ${k}\\cdot(\\_\\_)\\)`, answerType: 'text', correctAnswer: `\\(${a}x + ${b}\\)`, choices: [`\\(${a}x + ${b}\\)`, `\\(${a}x + ${k * b}\\)`, `\\(${k * a}x + ${b}\\)`, `\\(${a}x − ${b}\\)`].sort(() => Math.random() - 0.5), hint: `Teile jeden Term durch \\(${k}\\): \\(${k}(${a}x + ${b})\\)`, why: `Beide Summanden durch ${k} teilen: \\(${k * a}x : ${k} = ${a}x\\) und \\(${k * b} : ${k} = ${b}\\). Probe: \\(${k}(${a}x + ${b}) = ${k * a}x + ${k * b}\\).`, difficulty: 0.5 };
	}
});

reg('algebra__binomische_formeln_vorwaerts', (stage = 0) => {
	// Expanding sequence: 3. Formel (x+a)(x-a) → 1. Formel (x+a)² → 2. Formel (x-a)².
	const type = Math.min(stage, 2);
	if (type === 0) {
		const a = rand(2, 12);
		return { atomId: 'algebra__binomische_formeln_vorwaerts', prompt: `\\((x + ${a})(x − ${a}) = x^2 − \\_\\_\\)`, answerType: 'integer', correctAnswer: String(a * a), hint: `3. Formel: \\((x+a)(x−a) = x^2−a^2\\) → \\(a^2 = ${a * a}\\)`, why: `Die mittleren Glieder heben sich auf: \\(x^2 − ${a}x + ${a}x − ${a * a} = x^2 − ${a * a}\\).`, difficulty: 0.45 };
	} else if (type === 1) {
		const a = rand(2, 12);
		return { atomId: 'algebra__binomische_formeln_vorwaerts', prompt: `\\((x + ${a})^2 = x^2 + \\_\\_x + ${a * a}\\)`, answerType: 'integer', correctAnswer: String(2 * a), hint: `1. Formel: \\((x+a)^2 = x^2+2ax+a^2\\) → \\(2 \\cdot ${a} \\cdot x\\)`, why: `\\((x + ${a})(x + ${a}) = x^2 + ${a}x + ${a}x + ${a * a}\\). Das mittlere Glied kommt zweimal vor: \\(${2 * a}x\\).`, difficulty: 0.5 };
	} else {
		const a = rand(2, 12);
		return { atomId: 'algebra__binomische_formeln_vorwaerts', prompt: `\\((x − ${a})^2 = x^2 − \\_\\_x + ${a * a}\\)`, answerType: 'integer', correctAnswer: String(2 * a), hint: `2. Formel: \\((x−a)^2 = x^2−2ax+a^2\\) → \\(2 \\cdot ${a} \\cdot x\\)`, why: `\\((x − ${a})(x − ${a}) = x^2 − ${a}x − ${a}x + ${a * a}\\). Das mittlere Glied kommt zweimal vor: \\(−${2 * a}x\\).`, difficulty: 0.5 };
	}
});

reg('algebra__binomische_formeln_rueckwaerts', () => {
	const type = rand(0, 1);
	if (type === 0) {
		const a = rand(2, 12);
		const choices = [String(a), String(a + 1), String(a - 1), String(a * 2)].sort(() => Math.random() - 0.5);
		return { atomId: 'algebra__binomische_formeln_rueckwaerts', prompt: `\\(x^2 − ${a * a}\\) lässt sich schreiben als \\((x + \\_\\_)(x − \\_\\_ )\\). Welche Zahl fehlt?`, answerType: 'integer', correctAnswer: String(a), choices, hint: `3. binomische Formel rückwärts: \\(x^2−${a * a} = (x+${a})(x−${a})\\)`, why: `\\(${a * a} = ${a}^2\\), also \\(x^2 − ${a}^2 = (x + ${a})(x − ${a})\\).`, difficulty: 0.55 };
	} else {
		const a = rand(2, 12);
		const choices = [String(a), String(a + 1), String(a - 1), String(a * 2)].sort(() => Math.random() - 0.5);
		return { atomId: 'algebra__binomische_formeln_rueckwaerts', prompt: `\\(x^2 + ${2 * a}x + ${a * a} = (x + \\_\\_)^2\\). Welche Zahl fehlt?`, answerType: 'integer', correctAnswer: String(a), choices, hint: `1. binomische Formel rückwärts: \\(x^2+${2 * a}x+${a * a} = (x+${a})^2\\)`, why: `\\(${a * a} = ${a}^2\\) und \\(${2 * a}x = 2 \\cdot ${a} \\cdot x\\) – das passt genau zu \\((x + ${a})^2\\).`, difficulty: 0.55 };
	}
});

reg('algebra__gleichungen_inhaltlich_loesen', () => {
	const type = rand(0, 2);
	if (type === 0) {
		const x = rand(2, 15), b = rand(3, 12);
		return { atomId: 'algebra__gleichungen_inhaltlich_loesen', prompt: `\\(x + ${b} = ${x + b}\\)  →  \\(x = ?\\)`, answerType: 'integer', correctAnswer: String(x), hint: `Umkehroperation: ${x + b} − ${b} = ${x}`, why: `Welche Zahl plus ${b} ergibt ${x + b}? Rückwärts rechnen: ${x + b} − ${b} = ${x}. Probe: ${x} + ${b} = ${x + b}.`, difficulty: 0.25 };
	} else if (type === 1) {
		const x = rand(2, 12), a = rand(2, 8);
		return { atomId: 'algebra__gleichungen_inhaltlich_loesen', prompt: `\\(${a} \\cdot x = ${a * x}\\)  →  \\(x = ?\\)`, answerType: 'integer', correctAnswer: String(x), hint: `Umkehroperation: ${a * x} ÷ ${a} = ${x}`, why: `Welche Zahl mal ${a} ergibt ${a * x}? Rückwärts rechnen: ${a * x} : ${a} = ${x}. Probe: ${a} · ${x} = ${a * x}.`, difficulty: 0.25 };
	} else {
		const x = rand(2, 10), b = rand(2, 8);
		return { atomId: 'algebra__gleichungen_inhaltlich_loesen', prompt: `\\(x − ${b} = ${x - b}\\)  →  \\(x = ?\\)`, answerType: 'integer', correctAnswer: String(x), hint: `Umkehroperation: ${x - b} + ${b} = ${x}`, why: `Von welcher Zahl bleibt nach − ${b} noch ${x - b}? Rückwärts rechnen: ${x - b} + ${b} = ${x}. Probe: ${x} − ${b} = ${x - b}.`, difficulty: 0.25 };
	}
});

// ── 19. Algebra: Gleichungen ──────────────────────────────────────────────────

reg('algebra__aequivalenzumformung_prinzip', () => {
	const type = rand(0, 1);
	if (type === 0) {
		const b = rand(2, 9), rhs = rand(b + 1, 15);
		const choices = [`−${b}`, `+${b}`, `·${b}`, `:${b}`];
		return { atomId: 'algebra__aequivalenzumformung_prinzip', prompt: `Von \\(x + ${b} = ${rhs}\\) zu \\(x = ${rhs - b}\\): Welche Umformung wurde auf beiden Seiten durchgeführt?`, answerType: 'text', correctAnswer: `−${b}`, choices: choices.sort(() => Math.random() - 0.5), why: `Um das + ${b} bei x loszuwerden, rechnet man auf beiden Seiten − ${b}: links bleibt x, rechts ${rhs} − ${b} = ${rhs - b}.`, difficulty: 0.35 };
	} else {
		const a = rand(2, 7), rhs = rand(1, 6) * a;
		const choices = [`:${a}`, `·${a}`, `+${a}`, `−${a}`];
		return { atomId: 'algebra__aequivalenzumformung_prinzip', prompt: `Von \\(${a}x = ${rhs}\\) zu \\(x = ${rhs / a}\\): Welche Umformung?`, answerType: 'text', correctAnswer: `:${a}`, choices: choices.sort(() => Math.random() - 0.5), why: `${a}x bedeutet ${a} · x. Die Umkehrung von „mal ${a}" ist „geteilt durch ${a}": ${rhs} : ${a} = ${rhs / a}.`, difficulty: 0.35 };
	}
});

reg('algebra__lineare_gleichung_zweischritt', (stage = 0) => {
	// Expanding sequence: isolate one new discrimination per stage instead of
	// randomizing over the whole sign space at once.
	// 0: b, x both positive (no sign handling at all)
	// 1: b negative, x positive (introduces "+ (−b)" subtraction step)
	// 2: b positive again (already safe), x negative (introduces negative solutions)
	// 3+: full generalization — any sign for b and x (original random range)
	const step = Math.min(stage, 3);
	const a = rand(2, 5);
	let b: number, x: number;
	if (step === 0) {
		b = rand(1, 6); x = rand(1, 8);
	} else if (step === 1) {
		b = rand(-6, -1); x = rand(1, 8);
	} else if (step === 2) {
		b = rand(1, 6); x = rand(-4, -1);
	} else {
		b = rand(-6, 6); x = rand(-4, 8);
		while (b === 0) b = rand(-6, 6);
	}
	const c = a * x + b;
	const sign = (n: number) => n >= 0 ? `+${n}` : `${n}`;
	return {
		atomId: 'algebra__lineare_gleichung_zweischritt',
		prompt: `Löse: \\(${a}x ${sign(b)} = ${c}\\)`,
		answerType: 'integer',
		correctAnswer: String(x),
		inputData: {
			steps: [
				`Gleichung: \\(${a}x ${sign(b)} = ${c}\\)`,
				`Schritt 1 – \\(${b > 0 ? '−' : '+'}${Math.abs(b)}\\) auf beiden Seiten: \\(${a}x = ${c - b}\\)`,
				`Schritt 2 – \\(:${a}\\) auf beiden Seiten: \\(x = ${x}\\)`,
				`Probe: \\(${a}·${x} ${sign(b)} = ${c}\\) ✓`
			]
		},
		difficulty: 0.45
	};
});

reg('algebra__lineare_gleichung_variablen_beidseitig', () => {
	// Generate x first → uniform distribution instead of bias toward 1/2
	const x = rand(1, 9);
	const diff = rand(1, 4);  // a - c
	const a = rand(diff + 2, Math.min(diff + 5, 9));
	const c = a - diff;
	const b = rand(1, 8);
	const d = x * diff + b;
	const sign = (n: number) => n >= 0 ? `+${n}` : `${n}`;
	return {
		atomId: 'algebra__lineare_gleichung_variablen_beidseitig',
		prompt: `Löse: \\(${a}x ${sign(b)} = ${c}x ${sign(d)}\\)`,
		answerType: 'integer',
		correctAnswer: String(x),
		inputData: {
			steps: [
				`\\(${a}x ${sign(b)} = ${c}x ${sign(d)}\\)`,
				`\\(−${c}x\\) auf beiden Seiten: \\(${diff}x ${sign(b)} = ${d}\\)`,
				`\\(−${b}\\) auf beiden Seiten: \\(${diff}x = ${d - b}\\)`,
				diff === 1 ? `\\(x = ${x}\\)` : `\\(:${diff}\\): \\(x = ${x}\\)`
			]
		},
		difficulty: 0.55
	};
});

reg('algebra__lineare_gleichung_klammern_brueche', (stage = 0) => {
	const atomId = 'algebra__lineare_gleichung_klammern_brueche';
	// Expanding sequence: Klammer auflösen → Bruch beseitigen (mit dem Nenner multiplizieren).
	if (Math.min(stage, 1) === 0) {
		const a = rand(2, 4), b = rand(1, 6), x = rand(1, 8);
		const rhs = a * (x + b);
		return {
			atomId,
			prompt: `Löse: \\(${a}(x + ${b}) = ${rhs}\\)`,
			answerType: 'integer',
			correctAnswer: String(x),
			inputData: {
				steps: [
					`\\(${a}(x + ${b}) = ${rhs}\\)`,
					`Ausmultiplizieren: \\(${a}x + ${a * b} = ${rhs}\\)`,
					`\\(−${a * b}\\): \\(${a}x = ${rhs - a * b}\\)`,
					`\\(:${a}\\): \\(x = ${x}\\)`
				]
			},
			difficulty: 0.55
		};
	}
	const a = rand(2, 5), q = rand(1, 6), b = rand(1, 8);
	const x = a * q, rhs = q + b;
	return {
		atomId,
		prompt: `Löse: \\(\\frac{x}{${a}} + ${b} = ${rhs}\\)`,
		answerType: 'integer',
		correctAnswer: String(x),
		inputData: {
			steps: [
				`\\(\\frac{x}{${a}} + ${b} = ${rhs}\\)`,
				`\\(−${b}\\): \\(\\frac{x}{${a}} = ${q}\\)`,
				`\\(\\cdot ${a}\\): \\(x = ${x}\\)`
			]
		},
		difficulty: 0.6
	};
});

reg('algebra__lineare_gleichung_sonderfaelle', () => {
	// type=2 added so "genau eine Lösung" is sometimes correct (previously never, reducing effective choices to 2)
	const type = rand(0, 2);
	const a = rand(2, 5), b = rand(1, 6);
	const choices = ['keine Lösung', 'genau eine Lösung', 'unendlich viele Lösungen'];
	if (type === 0) {
		return { atomId: 'algebra__lineare_gleichung_sonderfaelle', prompt: `Wie viele Lösungen hat \\(${a}x + ${b} = ${a}x + ${b + 1}\\)?`, answerType: 'text', correctAnswer: 'keine Lösung', choices, hint: `Nach Umformen: ${b} = ${b + 1} — unmöglich!`, why: `Auf beiden Seiten \\(${a}x\\) abziehen: Es bleibt ${b} = ${b + 1}. Das stimmt nie → keine Lösung.`, difficulty: 0.5 };
	} else if (type === 1) {
		return { atomId: 'algebra__lineare_gleichung_sonderfaelle', prompt: `Wie viele Lösungen hat \\(${a}(x + ${b}) = ${a}x + ${a * b}\\)?`, answerType: 'text', correctAnswer: 'unendlich viele Lösungen', choices, hint: `Nach Ausmultiplizieren: \\(${a}x+${a * b} = ${a}x+${a * b}\\) — immer wahr!`, why: `Ausmultipliziert steht links und rechts dasselbe: \\(${a}x + ${a * b}\\). Das stimmt für jedes x → unendlich viele Lösungen.`, difficulty: 0.5 };
	} else {
		const c = rand(2, 5), x = rand(1, 7);
		return { atomId: 'algebra__lineare_gleichung_sonderfaelle', prompt: `Wie viele Lösungen hat \\(${c}x + ${b} = ${c * x + b}\\)?`, answerType: 'text', correctAnswer: 'genau eine Lösung', choices, hint: `Umformen: \\(${c}x = ${c * x}\\) → \\(x = ${x}\\).`, why: `\\(−${b}\\): \\(${c}x = ${c * x}\\). \\(:${c}\\): \\(x = ${x}\\). Genau eine Zahl passt.`, difficulty: 0.5 };
	}
});

reg('algebra__lineare_ungleichungen', (stage = 0) => {
	const atomId = 'algebra__lineare_ungleichungen';
	const a = rand(2, 5), b = rand(1, 8), x = rand(2, 8);
	const op = pick(['>', '<', '≥', '≤']);
	const revOp = op === '>' ? '<' : op === '<' ? '>' : op === '≥' ? '≤' : '≥';
	// Expanding sequence: positiver Koeffizient (wie Gleichung) → negativer Koeffizient (Zeichen dreht sich um).
	if (Math.min(stage, 1) === 0) {
		const choices = [`\\(x ${op} ${x}\\)`, `\\(x ${revOp} ${x}\\)`, `\\(x ${op} ${x + 1}\\)`, `\\(x ${revOp} ${x - 1}\\)`];
		return { atomId, prompt: `Löse: \\(${a}x + ${b} ${op} ${a * x + b}\\)`, answerType: 'text', correctAnswer: choices[0], choices: shuffled(choices), hint: `Wie eine Gleichung lösen: \\(−${b}\\), dann \\(:${a}\\). Das Ungleichheitszeichen bleibt.`, why: `Wie bei einer Gleichung: \\(−${b}\\) ergibt \\(${a}x ${op} ${a * x}\\), dann \\(:${a}\\). Teilen durch eine positive Zahl lässt das Zeichen stehen: \\(x ${op} ${x}\\).`, difficulty: 0.5 };
	}
	const choices = [`\\(x ${revOp} ${x}\\)`, `\\(x ${op} ${x}\\)`, `\\(x ${revOp} ${x + 1}\\)`, `\\(x ${op} ${x - 1}\\)`];
	return { atomId, prompt: `Löse: \\(-${a}x + ${b} ${op} ${-a * x + b}\\)`, answerType: 'text', correctAnswer: choices[0], choices: shuffled(choices), hint: `Beim Dividieren durch die negative Zahl \\(-${a}\\) dreht sich das Ungleichheitszeichen um.`, why: `\\(−${b}\\) ergibt \\(-${a}x ${op} ${-a * x}\\). Beim Teilen durch die negative Zahl \\(-${a}\\) dreht sich das Zeichen um: \\(x ${revOp} ${x}\\).`, difficulty: 0.6 };
});

reg('algebra__wurzelgleichungen', (stage = 0) => {
	// Expanding sequence: einfache Wurzelgleichung → Wurzelgleichung mit zusätzlichem Term.
	const type = Math.min(stage, 1);
	if (type === 0) {
		const a = rand(2, 15);
		return {
			atomId: 'algebra__wurzelgleichungen',
			prompt: `Löse: \\(\\sqrt{x} = ${a}\\)`,
			answerType: 'integer',
			correctAnswer: String(a * a),
			inputData: {
				steps: [
					`\\(\\sqrt{x} = ${a}\\)`,
					`Beide Seiten quadrieren: \\(x = ${a}^2 = ${a * a}\\)`,
					`Probe: \\(\\sqrt{${a * a}} = ${a}\\) ✓`
				]
			},
			difficulty: 0.55
		};
	} else {
		const a = rand(2, 6), c = rand(1, 6);
		return {
			atomId: 'algebra__wurzelgleichungen',
			prompt: `Löse: \\(\\sqrt{x + ${c}} = ${a}\\)`,
			answerType: 'integer',
			correctAnswer: String(a * a - c),
			inputData: {
				steps: [
					`\\(\\sqrt{x + ${c}} = ${a}\\)`,
					`Quadrieren: \\(x + ${c} = ${a * a}\\)`,
					`\\(−${c}\\): \\(x = ${a * a - c}\\)`,
					`Probe: \\(\\sqrt{${a * a - c} + ${c}} = \\sqrt{${a * a}} = ${a}\\) ✓`
				]
			},
			difficulty: 0.6
		};
	}
});

// ── 20. Algebra: LGS ─────────────────────────────────────────────────────────

reg('algebra__lgs_einsetzungsverfahren', () => {
	const x = rand(1, 5), y = rand(1, 5);
	const m = rand(1, 3);
	const b = y - m * x;
	if (b === 0) return registry.get('algebra__lgs_einsetzungsverfahren')!();
	const a2 = rand(2, 4), c2 = a2 * x + y;
	const bSign = (n: number) => n >= 0 ? `+ ${n}` : `- ${-n}`;
	return {
		atomId: 'algebra__lgs_einsetzungsverfahren',
		prompt: `Löse mit dem Einsetzungsverfahren:\n\\(y = ${fmtLin(m, b)}\\)\n\\(${a2}x + y = ${c2}\\)\nGesucht: \\(x = ?\\)`,
		answerType: 'integer',
		correctAnswer: String(x),
		inputData: {
			steps: [
				`Gleichung I einsetzen in II: \\(${a2}x + (${m}x ${bSign(b)}) = ${c2}\\)`,
				`\\(${a2 + m}x ${bSign(b)} = ${c2}\\)`,
				`\\(${a2 + m}x = ${c2 - b}\\)  →  \\(x = ${x}\\)`,
				`Einsetzen: \\(y = ${m}·${x} ${bSign(b)} = ${y}\\)`,
				`Lösung: \\(x = ${x},\\; y = ${y}\\)`
			]
		},
		difficulty: 0.65
	};
});

reg('algebra__lgs_additionsverfahren', () => {
	const x = rand(1, 5), y = rand(1, 5);
	const a1 = rand(1, 3), b1 = rand(1, 3);
	const a2 = rand(1, 3), b2 = b1; // same y-coefficient so subtraction eliminates y
	const c1 = a1 * x + b1 * y, c2 = a2 * x + b2 * y;
	if (a1 === a2) return registry.get('algebra__lgs_additionsverfahren')!();
	return {
		atomId: 'algebra__lgs_additionsverfahren',
		prompt: `Löse mit dem Additionsverfahren:\n\\(${fmtPoly([[a1, 'x'], [b1, 'y']])} = ${c1}\\)\n\\(${fmtPoly([[a2, 'x'], [b2, 'y']])} = ${c2}\\)\nGesucht: \\(x = ?\\)`,
		answerType: 'integer',
		correctAnswer: String(x),
		inputData: {
			steps: [
				`Gleichung I − II (y-Terme heben sich auf):`,
				`\\((${a1}−${a2})x = ${c1}−${c2}\\)  →  \\(${a1 - a2}x = ${c1 - c2}\\)`,
				`\\(x = ${x}\\)`,
				`Einsetzen in I: \\(${a1}·${x} + ${b1}y = ${c1}\\)  →  \\(y = ${y}\\)`,
				`Lösung: \\(x = ${x},\\; y = ${y}\\)`
			]
		},
		difficulty: 0.65
	};
});

reg('algebra__lgs_gleichsetzungsverfahren', () => {
	const x = rand(1, 5), y = rand(1, 5);
	const m1 = rand(1, 3), b1 = y - m1 * x;
	const m2 = rand(1, 3);
	if (m2 === m1) return registry.get('algebra__lgs_gleichsetzungsverfahren')!();
	const b2 = y - m2 * x;
	const bStr = (n: number) => n >= 0 ? `+${n}` : `${n}`;
	return {
		atomId: 'algebra__lgs_gleichsetzungsverfahren',
		prompt: `Löse mit dem Gleichsetzungsverfahren:\n\\(y = ${fmtLin(m1, b1)}\\)\n\\(y = ${fmtLin(m2, b2)}\\)\nGesucht: \\(x = ?\\)`,
		answerType: 'integer',
		correctAnswer: String(x),
		inputData: {
			steps: [
				`Beide y-Terme gleichsetzen:`,
				`\\(${m1}x ${bStr(b1)} = ${m2}x ${bStr(b2)}\\)`,
				`\\(${m1 - m2}x = ${b2 - b1}\\)  →  \\(x = ${x}\\)`,
				`Einsetzen: \\(y = ${m1}·${x} ${bStr(b1)} = ${y}\\)`,
				`Lösung: \\(x = ${x},\\; y = ${y}\\)`
			]
		},
		difficulty: 0.65
	};
});

reg('algebra__lgs_grafisch', () => {
	const slopes = [-2, -1, 1, 2];
	const px = rand(-2, 2), py = rand(-2, 2);
	const m1 = pick(slopes);
	const m2 = pick(slopes.filter(s => s !== m1));
	const b1 = py - m1 * px, b2 = py - m2 * px;
	const wrongPts: string[] = [];
	const offsets = [[-1, 0], [1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];
	for (const [dx, dy] of offsets.sort(() => Math.random() - 0.5)) {
		const wx = px + dx, wy = py + dy;
		const key = `(${wx} | ${wy})`;
		if (!wrongPts.includes(key)) wrongPts.push(key);
		if (wrongPts.length === 3) break;
	}
	const correct = `(${px} | ${py})`;
	const choices = [correct, ...wrongPts].sort(() => Math.random() - 0.5);
	return {
		atomId: 'algebra__lgs_grafisch',
		prompt: `An welchem Punkt schneiden sich die Geraden\ng₁: \\(y = ${fmtLin(m1, b1)}\\) und g₂: \\(y = ${fmtLin(m2, b2)}\\)?`,
		answerType: 'text',
		correctAnswer: correct,
		choices,
		svg: svgCoordSystem(
			[{ m: m1, b: b1, color: '#4f46e5', label: 'g₁' }, { m: m2, b: b2, color: '#dc2626', label: 'g₂' }]
		),
		hint: `Am Schnittpunkt gilt: \\(${fmtLin(m1, b1)} = ${fmtLin(m2, b2)}\\)`,
		why: `Am Schnittpunkt liefern beide Gleichungen denselben y-Wert. Für \\(x = ${px}\\): g₁ ergibt \\(${m1} \\cdot ${paren(px)} ${b1 >= 0 ? '+' : '-'} ${Math.abs(b1)} = ${py}\\), g₂ ergibt \\(${m2} \\cdot ${paren(px)} ${b2 >= 0 ? '+' : '-'} ${Math.abs(b2)} = ${py}\\).`, difficulty: 0.55
	};
});

// ── 21. Algebra: Zuordnungen / Proportionalität ───────────────────────────────

reg('algebra__proportionale_zuordnung', () => {
	const rate = rand(2, 8);
	const n1 = rand(2, 6), n2 = rand(n1 + 1, 10);
	const c1 = rate * n1;
	const ctx = pick([
		{ q: `${n1} Hefte kosten ${c1} €. Wie viel Euro kosten ${n2} Hefte?`, per: 'Preis pro Heft', unit: '€' },
		{ q: `In ${n1} Stunden legt eine Wandergruppe ${c1} km zurück. Wie viele Kilometer schafft sie bei gleichem Tempo in ${n2} Stunden?`, per: 'Strecke pro Stunde', unit: 'km' },
		{ q: `${n1} gleiche Kisten wiegen zusammen ${c1} kg. Wie viel Kilogramm wiegen ${n2} Kisten?`, per: 'Masse pro Kiste', unit: 'kg' },
		{ q: `${n1} gleiche Kanister fassen zusammen ${c1} l. Wie viele Liter fassen ${n2} Kanister?`, per: 'Inhalt pro Kanister', unit: 'l' }
	]);
	return {
		atomId: 'algebra__proportionale_zuordnung',
		prompt: ctx.q,
		answerType: 'integer',
		correctAnswer: String(rate * n2),
		inputData: {
			steps: [
				`${ctx.per}: ${c1} ${ctx.unit} : ${n1} = ${rate} ${ctx.unit}`,
				`Für ${n2}: ${n2} · ${rate} ${ctx.unit} = ${rate * n2} ${ctx.unit}`
			]
		},
		difficulty: 0.4
	};
});

reg('algebra__antiproportionale_zuordnung', () => {
	const x = rand(2, 6), y = rand(2, 5);
	const k = x * y;
	const newX = pick([k / (y + 1), k / (y - 1)].filter(v => Number.isInteger(v) && v > 0));
	if (!newX) return registry.get('algebra__antiproportionale_zuordnung')!();
	const newY = k / newX;
	const context = pick([
		{ t: 'Arbeiter', u: 'Tage' },
		{ t: 'Maschinen', u: 'Stunden' },
		{ t: 'Pumpen', u: 'Stunden' },
		{ t: 'Lkw', u: 'Tage' },
		{ t: 'Erntehelfer', u: 'Tage' }
	]);
	return {
		atomId: 'algebra__antiproportionale_zuordnung',
		prompt: `${x} ${context.t} brauchen ${y} ${context.u}. Wie lange brauchen ${newX} ${context.t}?`,
		answerType: 'integer',
		correctAnswer: String(newY),
		inputData: {
			steps: [
				`Gesamtarbeit: ${x} · ${y} = ${k} (konstantes Produkt)`,
				`Für ${newX} ${context.t}: ${k} ÷ ${newX} = ${newY} ${context.u}`
			]
		},
		difficulty: 0.5
	};
});

reg('algebra__zuordnungen', () => {
	const type = rand(0, 1);
	if (type === 0) {
		const pairs = [[1, rand(2, 5)], [2, rand(2, 5)], [3, rand(2, 5)]];
		const dupX = rand(0, 1) === 1;
		if (dupX) {
			pairs[2][0] = pairs[0][0];
			// the repeated x needs a different y — an identical pair would still be a function
			while (pairs[2][1] === pairs[0][1]) pairs[2][1] = rand(2, 6);
		}
		const isFunc = !dupX;
		return { atomId: 'algebra__zuordnungen', prompt: `Ist die Zuordnung {(${pairs.map(p => p.join('→')).join(', ')})} eine Funktion?`, answerType: 'text', correctAnswer: isFunc ? 'ja' : 'nein', choices: ['ja', 'nein'], hint: 'Eine Funktion ordnet jedem \\(x\\)-Wert genau einen \\(y\\)-Wert zu.', why: isFunc ? 'Jeder x-Wert kommt nur einmal vor – zu jedem x gehört genau ein y.' : `Dem x-Wert ${pairs[0][0]} werden zwei verschiedene y-Werte zugeordnet (${pairs[0][1]} und ${pairs[2][1]}). Das ist nicht eindeutig.`, difficulty: 0.4 };
	} else {
		// kinds: all x different / one y repeated (still a function) / one x repeated with different y
		const kind = pick(['func', 'samey', 'dupx'] as const);
		const xs = shuffled([1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 4).sort((u, v) => u - v);
		const ys = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 4);
		if (kind === 'dupx') xs[rand(1, 3)] = xs[0];
		if (kind === 'samey') ys[rand(1, 3)] = ys[0];
		xs.sort((u, v) => u - v);
		const tbl = { t: `x | ${xs.join(' | ')}\ny | ${ys.join(' | ')}`, isF: kind !== 'dupx' };
		return { atomId: 'algebra__zuordnungen', prompt: `Ist diese Tabelle eine Funktion?\n${tbl.t}`, answerType: 'text', correctAnswer: tbl.isF ? 'ja' : 'nein', choices: ['ja', 'nein'], hint: 'Prüfe: Gibt es einen \\(x\\)-Wert, der zweimal mit verschiedenen \\(y\\)-Werten auftaucht? Gleiche \\(y\\)-Werte sind erlaubt.', why: kind === 'dupx' ? `Der x-Wert ${xs[0]} kommt zweimal vor – mit verschiedenen y-Werten. Das ist nicht eindeutig.` : kind === 'samey' ? 'Jeder x-Wert kommt nur einmal vor. Dass ein y-Wert doppelt auftritt, ist erlaubt.' : 'Jeder x-Wert kommt genau einmal vor – zu jedem x gehört genau ein y.', difficulty: 0.4 };
	}
});

reg('algebra__funktion_eindeutige_zuordnung', (stage = 0) => {
	const atomId = 'algebra__funktion_eindeutige_zuordnung';
	// Expanding sequence: eindeutig vs. mehrdeutig (x doppelt) → zusätzlich gleicher y-Wert für
	// verschiedene x (bleibt eine Funktion – häufige Fehlvorstellung).
	const kind = Math.min(stage, 1) === 0 ? pick(['func', 'dupx'] as const) : pick(['samey', 'dupx', 'func'] as const);
	const xs = shuffled([1, 2, 3, 4, 5, 6]).slice(0, 3).sort((p, q) => p - q);
	const ys = shuffled([1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 3);
	if (kind === 'dupx') xs[2] = xs[rand(0, 1)];
	if (kind === 'samey') ys[2] = ys[rand(0, 1)];
	const pairs = shuffled(xs.map((x, i) => `(${x} | ${ys[i]})`));
	return {
		atomId,
		prompt: `Die Zuordnung x → y besteht aus den Paaren ${pairs.join(', ')}. Ist sie eine Funktion?`,
		answerType: 'text',
		correctAnswer: kind === 'dupx' ? 'nein' : 'ja',
		choices: ['ja', 'nein'],
		hint: 'Funktion: Jedem \\(x\\) wird genau ein \\(y\\) zugeordnet. Verschiedene \\(x\\) dürfen denselben \\(y\\)-Wert haben.',
		why: kind === 'dupx' ? `Zu x = ${xs[2]} gehören zwei verschiedene y-Werte – das ist nicht eindeutig.` : kind === 'samey' ? 'Jedes x hat genau ein y. Dass zwei x denselben y-Wert haben, ist erlaubt.' : 'Jedes x kommt nur einmal vor und hat genau ein y.', difficulty: kind === 'samey' ? 0.45 : 0.35
	};
});

reg('algebra__funktion_darstellungsformen', () => {
	const a = rand(1, 4), b = rand(-4, 4);
	const x = rand(1, 5);
	const y = a * x + b;
	return { atomId: 'algebra__funktion_darstellungsformen', prompt: `\\(f(x) = ${fmtLin(a, b)}\\). Berechne \\(f(${x})\\).`, answerType: 'integer', correctAnswer: String(y), hint: `Setze ${x} für x ein: \\(${fmtLin(a, b).replace('x', ` \\cdot ${x}`)}\\)`, why: `Setze ${x} für x ein: ${a} · ${x} = ${a * x}${b !== 0 ? `, dann ${b > 0 ? '+' : '−'} ${Math.abs(b)} → ${y}` : ''}.`, difficulty: 0.35 };
});

reg('algebra__definitions_wertebereich', (stage = 0) => {
	const atomId = 'algebra__definitions_wertebereich';
	const a = rand(1, 9);
	const all = 'alle reellen Zahlen';
	// Expanding sequence: Definitionsbereich → Wertebereich.
	if (Math.min(stage, 1) === 0) {
		const t = pick([
			{ f: '\\sqrt{x}', D: 'x ≥ 0', w: ['x > 0', 'x ≠ 0', all] },
			{ f: `\\sqrt{x - ${a}}`, D: `x ≥ ${a}`, w: [`x > ${a}`, `x ≥ −${a}`, 'x ≥ 0'] },
			{ f: `\\sqrt{x + ${a}}`, D: `x ≥ −${a}`, w: [`x ≥ ${a}`, `x > −${a}`, 'x ≥ 0'] },
			{ f: '\\frac{1}{x}', D: 'x ≠ 0', w: ['x > 0', 'x ≥ 0', all] },
			{ f: `\\frac{1}{x - ${a}}`, D: `x ≠ ${a}`, w: [`x ≠ −${a}`, `x > ${a}`, all] },
			{ f: `\\frac{1}{x + ${a}}`, D: `x ≠ −${a}`, w: [`x ≠ ${a}`, `x > −${a}`, all] },
			{ f: `x^2 + ${a}`, D: all, w: ['x ≥ 0', `x ≥ ${a}`, 'x ≠ 0'] },
			{ f: `${a + 1}x - ${a}`, D: all, w: ['x ≥ 0', 'x ≠ 0', `x ≥ ${a}`] }
		]);
		return { atomId, prompt: `Was ist der Definitionsbereich von \\(f(x) = ${t.f}\\)?`, answerType: 'text', correctAnswer: t.D, choices: shuffled([t.D, ...t.w]), hint: 'Unter der Wurzel darf keine negative Zahl stehen, und durch 0 darf nicht geteilt werden.', why: t.f.includes('sqrt') ? `Unter der Wurzel darf nichts Negatives stehen: Der Term unter der Wurzel muss mindestens 0 sein → ${t.D}.` : t.f.includes('frac') ? `Durch 0 darf man nicht teilen: Der Nenner darf nicht 0 werden → ${t.D}.` : 'Hier gibt es weder eine Wurzel noch einen Bruch – du darfst jede Zahl einsetzen.', difficulty: 0.5 };
	}
	const t = pick([
		{ f: 'x^2', W: 'y ≥ 0', w: ['y > 0', all, 'y ≤ 0'] },
		{ f: `x^2 + ${a}`, W: `y ≥ ${a}`, w: [`y ≥ −${a}`, 'y ≥ 0', all] },
		{ f: `x^2 - ${a}`, W: `y ≥ −${a}`, w: [`y ≥ ${a}`, 'y ≥ 0', all] },
		{ f: `-x^2 + ${a}`, W: `y ≤ ${a}`, w: [`y ≥ ${a}`, 'y ≤ 0', all] },
		{ f: '\\sqrt{x}', W: 'y ≥ 0', w: ['y > 0', all, 'y ≠ 0'] },
		{ f: `\\sqrt{x} + ${a}`, W: `y ≥ ${a}`, w: ['y ≥ 0', `y > ${a}`, all] },
		{ f: `${a + 1}x + ${a}`, W: all, w: ['y ≥ 0', `y ≥ ${a}`, 'y ≠ 0'] }
	]);
	return { atomId, prompt: `Was ist der Wertebereich von \\(f(x) = ${t.f}\\)?`, answerType: 'text', correctAnswer: t.W, choices: shuffled([t.W, ...t.w]), hint: 'Welche \\(y\\)-Werte können herauskommen? Ein Quadrat und eine Wurzel sind nie negativ.', why: `${t.f.includes('sqrt') ? 'Eine Wurzel ist nie negativ, ihr kleinster Wert ist 0.' : t.f.startsWith('-x^2') ? '−x² ist höchstens 0 – größer als die Zahl dahinter wird es nie.' : t.f.includes('x^2') ? 'x² ist nie negativ, sein kleinster Wert ist 0.' : 'Eine schräge Gerade erreicht jede Höhe.'} Also: ${t.W}.`, difficulty: 0.6 };
});

reg('algebra__zahlenfolgen', (stage = 0) => {
	// Expanding sequence: arithmetische Folge → geometrische Folge → Bildungsvorschrift auswerten.
	const type = Math.min(stage, 2);
	if (type === 0) {
		const d = rand(2, 7), a1 = rand(1, 5);
		const terms = [a1, a1 + d, a1 + 2 * d, a1 + 3 * d];
		return { atomId: 'algebra__zahlenfolgen', prompt: `Welche Zahl kommt als nächstes? ${terms.join(', ')}, ___`, answerType: 'integer', correctAnswer: String(a1 + 4 * d), hint: `Arithmetische Folge mit Differenz \\(d = ${d}\\)`, why: `Von Glied zu Glied kommt immer ${d} dazu: ${terms[3]} + ${d} = ${a1 + 4 * d}.`, difficulty: 0.4 };
	} else if (type === 1) {
		const q = pick([2, 3, 4, 5, 10]), a1 = rand(1, 5);
		const terms = [a1, a1 * q, a1 * q * q, a1 * q * q * q];
		return { atomId: 'algebra__zahlenfolgen', prompt: `Welche Zahl kommt als nächstes? ${terms.join(', ')}, ___`, answerType: 'integer', correctAnswer: String(a1 * q ** 4), hint: `Geometrische Folge mit Faktor \\(q = ${q}\\)`, why: `Jedes Glied ist das ${q}-Fache des vorigen: ${terms[3]} · ${q} = ${a1 * q ** 4}.`, difficulty: 0.45 };
	} else {
		const a1 = rand(1, 3), d = rand(2, 5), n = rand(4, 7);
		const an = a1 + (n - 1) * d;
		return { atomId: 'algebra__zahlenfolgen', prompt: `Bildungsvorschrift: \\(a_n = ${a1} + (n-1)\\cdot${d}\\). Berechne \\(a_${n}\\).`, answerType: 'integer', correctAnswer: String(an), hint: `Einsetzen: ${a1} + (${n}−1)·${d} = ${a1} + ${(n - 1) * d} = ${an}`, why: `Für n die ${n} einsetzen: ${a1} + (${n} − 1) · ${d} = ${a1} + ${n - 1} · ${d} = ${an}.`, difficulty: 0.5 };
	}
});

// ── 22. Algebra: Potenzen und Wurzeln ────────────────────────────────────────

reg('algebra__potenzgesetz_gleiche_basis', () => {
	const type = rand(0, 1);
	const m = rand(2, 6), n = rand(2, 6);
	if (type === 0) {
		return { atomId: 'algebra__potenzgesetz_gleiche_basis', prompt: `\\(a^${m} \\cdot a^${n} = a^{?\\ }\\)`, answerType: 'integer', correctAnswer: String(m + n), hint: `Gleiche Basis: Exponenten addieren → ${m}+${n}=${m + n}`, why: `\\(a^${m}\\) sind ${m} Faktoren a, \\(a^${n}\\) sind ${n} Faktoren a – zusammen ${m} + ${n} = ${m + n} Faktoren.`, difficulty: 0.4 };
	} else {
		if (m <= n) return registry.get('algebra__potenzgesetz_gleiche_basis')!();
		return { atomId: 'algebra__potenzgesetz_gleiche_basis', prompt: `\\(a^${m} : a^${n} = a^{?\\ }\\)`, answerType: 'integer', correctAnswer: String(m - n), hint: `Gleiche Basis: Exponenten subtrahieren → ${m}−${n}=${m - n}`, why: `Von ${m} Faktoren a im Zähler kürzen sich ${n} weg. Übrig: ${m} − ${n} = ${m - n}.`, difficulty: 0.4 };
	}
});

reg('algebra__potenzgesetz_potenz_einer_potenz', () => {
	const m = rand(2, 4), n = rand(2, 4);
	// single variables only: (2x^m)^n would not equal 2x^(m·n)
	const base = pick(['a', 'x', 'b', 'y', 'z']);
	return { atomId: 'algebra__potenzgesetz_potenz_einer_potenz', prompt: `\\((${base}^${m})^${n} = ${base}^{?\\ }\\)`, answerType: 'integer', correctAnswer: String(m * n), hint: `Potenz einer Potenz: Exponenten multiplizieren → ${m}·${n}=${m * n}`, why: `\\(${base}^${m}\\) steht ${n}-mal als Faktor da. Das sind ${n} · ${m} = ${m * n} Faktoren ${base}.`, difficulty: 0.45 };
});

reg('algebra__potenzen_negative_exponenten', () => {
	const base = pick([2, 3, 5, 10]);
	const exp = rand(1, 3);
	const val = base ** exp;
	const type = rand(0, 1);
	if (type === 0) {
		return { atomId: 'algebra__potenzen_negative_exponenten', prompt: `\\(${base}^{-${exp}} = \\frac{1}{\\_\\_}\\)`, answerType: 'integer', correctAnswer: String(val), hint: `\\(a^{-n} = \\frac{1}{a^n}\\) → \\(\\frac{1}{${base}^{${exp}}} = \\frac{1}{${val}}\\)`, why: `Ein negativer Exponent bedeutet Kehrwert, nicht negative Zahl: \\(${base}^{-${exp}} = \\frac{1}{${base}^{${exp}}} = \\frac{1}{${val}}\\).`, difficulty: 0.45 };
	} else {
		const choices = [`\\(\\frac{1}{${val}}\\)`, `\\(-${val}\\)`, `\\(${val}\\)`, `\\(\\frac{1}{${val + 1}}\\)`];
		return { atomId: 'algebra__potenzen_negative_exponenten', prompt: `Was ist \\(${base}^{-${exp}}\\)?`, answerType: 'text', correctAnswer: `\\(\\frac{1}{${val}}\\)`, choices: choices.sort(() => Math.random() - 0.5), hint: `\\(a^{-n} = \\frac{1}{a^n}\\) → \\(\\frac{1}{${val}}\\)`, why: `Ein negativer Exponent bedeutet Kehrwert, nicht negative Zahl: \\(${base}^{-${exp}} = \\frac{1}{${base}^{${exp}}} = \\frac{1}{${val}}\\).`, difficulty: 0.45 };
	}
});

reg('algebra__potenzen_rationale_exponenten', (stage = 0) => {
	// base = r^k, exponent m/k → value r^m
	const [r, k] = pick<[number, number]>([[2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [2, 3], [3, 3], [4, 3], [5, 3], [10, 3], [2, 4], [3, 4]]);
	const base = r ** k;
	// Expanding sequence: Stammbruch als Exponent (Wurzel) → Zähler größer als 1.
	let m = 1;
	if (Math.min(stage, 1) === 1) {
		do { m = rand(2, k + 1); } while (gcd(m, k) !== 1 || r ** m > 1000);
	}
	const root = k === 2 ? `\\sqrt{${base}}` : `\\sqrt[${k}]{${base}}`;
	const hint = m === 1
		? `\\(${base}^{\\frac{1}{${k}}} = ${root}\\)`
		: `\\(${base}^{\\frac{${m}}{${k}}} = \\left(${root}\\right)^${m} = ${r}^${m}\\)`;
	return { atomId: 'algebra__potenzen_rationale_exponenten', prompt: `\\(${base}^{\\frac{${m}}{${k}}} = ?\\)`, answerType: 'integer', correctAnswer: String(r ** m), hint, why: m === 1 ? `Der Exponent \\(\\frac{1}{${k}}\\) bedeutet die ${k}. Wurzel: Welche Zahl ergibt ${k}-mal mit sich selbst multipliziert ${base}? \\(${r}^${k} = ${base}\\).` : `Nenner = Wurzel, Zähler = Potenz: erst \\(${root} = ${r}\\), dann \\(${r}^${m} = ${r ** m}\\).`, difficulty: m === 1 ? 0.5 : 0.6 };
});

reg('algebra__quadratwurzel_begriff', () => {
	const squares = [1, 4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144];
	const n = pick(squares);
	const root = Math.sqrt(n);
	const type = rand(0, 1);
	if (type === 0) {
		return { atomId: 'algebra__quadratwurzel_begriff', prompt: `\\(\\sqrt{${n}} = ?\\)`, answerType: 'integer', correctAnswer: String(root), hint: `\\(${root}^2 = ${n}\\)`, why: `Gesucht ist die positive Zahl, die mit sich selbst multipliziert ${n} ergibt: ${root} · ${root} = ${n}.`, difficulty: 0.35 };
	} else {
		return { atomId: 'algebra__quadratwurzel_begriff', prompt: `\\(x^2 = ${n}\\)  →  \\(x = ?\\) (positive Lösung)`, answerType: 'integer', correctAnswer: String(root), hint: `Die positive Lösung: \\(x = \\sqrt{${n}} = ${root}\\)`, why: `${root} · ${root} = ${n}, also x = ${root}. (−${root} wäre die zweite, negative Lösung.)`, difficulty: 0.35 };
	}
});

reg('algebra__irrationale_reelle_zahlen', (stage = 0) => {
	const atomId = 'algebra__irrationale_reelle_zahlen';
	const irrationals = [...[2, 3, 5, 6, 7, 8, 10, 11, 12, 13, 15, 20].map(n => `√${n}`), 'π'];
	const squareRoots = [4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144].map(n => `√${n}`);
	const otherRationals = ['0,5', '1,25', '0,333…', '−2', '3/7', '22/7', '0,125', '−1,5'];
	const hint = 'Irrationale Zahlen lassen sich nicht als Bruch schreiben; ihre Dezimaldarstellung bricht nicht ab und ist nicht periodisch.';
	// Expanding sequence: die irrationale Zahl finden → die rationale Zahl unter irrationalen finden.
	if (Math.min(stage, 1) === 0) {
		const irr = pick(irrationals);
		// always one root of a square number — the key discrimination
		const choices = shuffled([irr, pick(squareRoots), ...shuffled(otherRationals).slice(0, 2)]);
		return { atomId, prompt: 'Welche der folgenden Zahlen ist irrational?', answerType: 'text', correctAnswer: irr, choices, hint, why: `${irr} lässt sich nicht als Bruch schreiben: Die Nachkommastellen hören nie auf und wiederholen sich nicht. Die anderen Zahlen sind Brüche, endliche oder periodische Dezimalzahlen oder Wurzeln aus Quadratzahlen.`, difficulty: 0.45 };
	}
	const rat = rand(0, 1) === 0 ? pick(squareRoots) : pick(otherRationals);
	const choices = shuffled([rat, ...shuffled(irrationals).slice(0, 3)]);
	return { atomId, prompt: 'Welche der folgenden Zahlen ist rational?', answerType: 'text', correctAnswer: rat, choices, hint, why: rat.startsWith('√') ? `${rat} = ${Math.sqrt(Number(rat.slice(1)))} – die Wurzel einer Quadratzahl ist eine ganze Zahl, also rational.` : `${rat} lässt sich als Bruch schreiben. Die anderen Zahlen haben unendlich viele Nachkommastellen ohne Periode.`, difficulty: 0.5 };
});

reg('algebra__wurzelterme_umformen', () => {
	// √(f²·rest) with a square-free rest → f·√rest
	let f = rand(2, 7), rest = pick([2, 3, 5, 6, 7, 10]);
	while (f * f * rest > 300) { f = rand(2, 7); rest = pick([2, 3, 5, 6, 7, 10]); }
	const n = f * f * rest;
	return { atomId: 'algebra__wurzelterme_umformen', prompt: `\\(\\sqrt{${n}} = \\_\\_ \\cdot \\sqrt{${rest}}\\)`, answerType: 'integer', correctAnswer: String(f), hint: `Zerlege ${n} in eine Quadratzahl mal ${rest}: \\(${n} = \\_\\_ \\cdot ${rest}\\)`, why: `\\(${n} = ${f * f} \\cdot ${rest}\\), und \\(\\sqrt{${f * f}} = ${f}\\). Also \\(\\sqrt{${n}} = ${f} \\cdot \\sqrt{${rest}}\\).`, difficulty: 0.5 };
});

// ── 23. Algebra: Lineare Funktionen ──────────────────────────────────────────

reg('algebra__lineare_funktion_steigung_achsenabschnitt', () => {
	const m = rand(-4, 4), n = rand(-5, 5);
	while (m === 0) return registry.get('algebra__lineare_funktion_steigung_achsenabschnitt')!();
	const type = rand(0, 1);
	if (type === 0) {
		return { atomId: 'algebra__lineare_funktion_steigung_achsenabschnitt', prompt: `\\(f(x) = ${fmtLin(m, n)}\\). Wie groß ist die Steigung \\(m\\)?`, answerType: 'integer', correctAnswer: String(m), hint: `In \\(y=mx+n\\) ist \\(m\\) der Koeffizient vor \\(x\\).`, why: `In \\(f(x) = mx + n\\) steht die Steigung direkt vor dem x: hier ${m}.${Math.abs(m) === 1 ? ' (Steht nur x oder −x da, ist m = 1 bzw. −1.)' : ''}`, difficulty: 0.35 };
	} else {
		return { atomId: 'algebra__lineare_funktion_steigung_achsenabschnitt', prompt: `\\(f(x) = ${fmtLin(m, n)}\\). Wie groß ist der y-Achsenabschnitt \\(n\\)?`, answerType: 'integer', correctAnswer: String(n), hint: `In \\(y=mx+n\\) ist \\(n\\) der y-Achsenabschnitt (konstantes Glied).`, why: `Der y-Achsenabschnitt ist die Zahl ohne x: hier ${n}${n === 0 ? ' (es steht keine da)' : ''}. Dort schneidet die Gerade die y-Achse, denn f(0) = ${n}.`, difficulty: 0.35 };
	}
});

reg('algebra__lineare_funktion_nullstelle', () => {
	// Generate x0 first for uniform distribution (retry-loop on n%m===0 heavily biases toward x0=±1)
	const x0 = rand(-5, 5);
	if (x0 === 0) return registry.get('algebra__lineare_funktion_nullstelle')!();
	const m = rand(1, 5);
	const n = -x0 * m;
	const nSign = (v: number) => v >= 0 ? `+${v}` : `${v}`;
	return {
		atomId: 'algebra__lineare_funktion_nullstelle',
		prompt: `Bestimme die Nullstelle von \\(f(x) = ${fmtLin(m, n)}\\).`,
		answerType: 'integer',
		correctAnswer: String(x0),
		inputData: {
			steps: [
				`\\(${fmtLin(m, n)} = 0\\)`,
				`\\(${m}x = ${-n}\\)`,
				`\\(x_0 = ${x0}\\)`
			]
		},
		difficulty: 0.45
	};
});

reg('algebra__lineare_funktion_gleichung_aufstellen', (stage = 0) => {
	const m = rand(-3, 4), n = rand(-5, 5);
	while (m === 0) return registry.get('algebra__lineare_funktion_gleichung_aufstellen')!(stage);
	// Expanding sequence: aus m und n → aus zwei Punkten (Steigung erst berechnen).
	const type = Math.min(stage, 1);
	if (type === 0) {
		// distractors: n off by one, m and n swapped (or m off by one if that would coincide), sign of m flipped
		const swapped = m === n ? `\\(y = ${fmtLin(m + 1, n)}\\)` : `\\(y = ${fmtLin(n, m)}\\)`;
		const choices = shuffled([`\\(y = ${fmtLin(m, n)}\\)`, `\\(y = ${fmtLin(m, n + 1)}\\)`, swapped, `\\(y = ${fmtLin(-m, n)}\\)`]);
		if (new Set(choices).size < 4) return registry.get('algebra__lineare_funktion_gleichung_aufstellen')!(stage);
		return { atomId: 'algebra__lineare_funktion_gleichung_aufstellen', prompt: `Steigung \\(m = ${m}\\), y-Achsenabschnitt \\(n = ${n}\\). Wie lautet die Funktionsgleichung?`, answerType: 'text', correctAnswer: `\\(y = ${fmtLin(m, n)}\\)`, choices, why: `In \\(y = mx + n\\) steht m vor dem x und n allein dahinter: \\(y = ${fmtLin(m, n)}\\).`, difficulty: 0.4 };
	} else {
		const x1 = rand(-2, 2), y1 = m * x1 + n;
		const x2 = x1 + rand(1, 3), y2 = m * x2 + n;
		const choices = shuffled([`\\(y = ${fmtLin(m, n)}\\)`, `\\(y = ${fmtLin(m, n - 1)}\\)`, `\\(y = ${fmtLin(m + 1, n)}\\)`, `\\(y = ${fmtLin(-m, n)}\\)`]);
		return {
			atomId: 'algebra__lineare_funktion_gleichung_aufstellen',
			prompt: `Die Gerade geht durch \\((${x1}|${y1})\\) und \\((${x2}|${y2})\\). Wie lautet die Gleichung?`,
			answerType: 'text',
			correctAnswer: `\\(y = ${fmtLin(m, n)}\\)`,
			choices,
			hint: `Steigung: \\(m = \\frac{${y2}−${y1}}{${x2}−${x1}} = ${m}\\); dann \\(n\\) bestimmen.`,
			why: `Steigung: \\(m = \\frac{${y2} − ${paren(y1)}}{${x2} − ${paren(x1)}} = ${m}\\). Punkt einsetzen: \\(${y1} = ${m} \\cdot ${paren(x1)} + n\\), also \\(n = ${n}\\).`, difficulty: 0.55
		};
	}
});

reg('algebra__lineare_funktion_graph_zeichnen', () => {
	const m = rand(-3, 3), n = rand(-4, 4);
	while (m === 0) return registry.get('algebra__lineare_funktion_graph_zeichnen')!();
	const testX = rand(1, 3);
	const correctY = m * testX + n;
	const choices = [
		`(${testX} | ${correctY})`,
		`(${testX} | ${correctY + 1})`,
		`(${testX} | ${correctY - 1})`,
		`(${testX + 1} | ${correctY})`
	].sort(() => Math.random() - 0.5);
	return { atomId: 'algebra__lineare_funktion_graph_zeichnen', prompt: `Welcher Punkt liegt auf dem Graphen von \\(f(x) = ${fmtLin(m, n)}\\)?`, answerType: 'text', correctAnswer: `(${testX} | ${correctY})`, choices, hint: `Setze \\(x = ${testX}\\) ein und berechne \\(f(${testX})\\).`, why: `Einsetzen: \\(f(${testX}) = ${m} \\cdot ${testX} ${n >= 0 ? '+' : '-'} ${Math.abs(n)} = ${correctY}\\). Der Punkt (${testX} | ${correctY}) erfüllt die Gleichung.`, difficulty: 0.4 };
});

// ── 24. Algebra: Quadratische Funktionen und Gleichungen ─────────────────────

reg('algebra__normalparabel_streckung', (stage = 0) => {
	const atomId = 'algebra__normalparabel_streckung';
	// Expanding sequence: vertikale Verschiebung (±c) → Streckung/Stauchung (a) → horizontale Verschiebung (x ∓ c).
	// Both directions occur within a stage, so the answer cannot be learned by rote.
	const type = Math.min(stage, 2);
	if (type === 0) {
		const c = rand(1, 5), up = rand(0, 1) === 0;
		const choices = [`um ${c} nach oben`, `um ${c} nach unten`, `um ${c} nach rechts`, `um ${c} nach links`];
		return { atomId, prompt: `Wie ist der Graph von \\(f(x) = x^2 ${up ? '+' : '-'} ${c}\\) gegenüber der Normalparabel verschoben?`, answerType: 'text', correctAnswer: choices[up ? 0 : 1], choices: shuffled(choices), hint: `\\(x^2 + c\\) verschiebt nach oben, \\(x^2 - c\\) nach unten.`, why: `Zu jedem Wert von x² wird ${c} ${up ? 'addiert' : 'abgezogen'} – alle Punkte rutschen um ${c} nach ${up ? 'oben' : 'unten'}.`, difficulty: 0.4 };
	} else if (type === 1) {
		const a = pick([2, 3, 4, 5, 1.5, 0.75, 0.5, 0.25, 0.2, 0.1]);
		const desc = a > 1 ? 'schmaler als die Normalparabel' : 'breiter als die Normalparabel';
		const choices = ['schmaler als die Normalparabel', 'breiter als die Normalparabel', 'nach oben verschoben', 'nach links verschoben'];
		return { atomId, prompt: `Was beschreibt \\(f(x) = ${dec(a).replace(',', '{,}')}x^2\\) im Vergleich zur Normalparabel \\(y = x^2\\)?`, answerType: 'text', correctAnswer: desc, choices: shuffled(choices), hint: '\\(a > 1\\): schmaler (gestreckt), \\(0 < a < 1\\): breiter (gestaucht)', why: a > 1 ? `Jeder y-Wert wird ${dec(a)}-mal so groß – die Parabel steigt schneller und wird schmaler.` : `Jeder y-Wert wird mit ${dec(a)} verkleinert – die Parabel steigt langsamer und wird breiter.`, difficulty: 0.45 };
	}
	const c = rand(1, 4), right = rand(0, 1) === 0;
	const choices = [`um ${c} nach rechts`, `um ${c} nach links`, `um ${c} nach oben`, `um ${c} nach unten`];
	return { atomId, prompt: `Wie ist der Graph von \\(f(x) = (x ${right ? '-' : '+'} ${c})^2\\) gegenüber \\(y = x^2\\) verschoben?`, answerType: 'text', correctAnswer: choices[right ? 0 : 1], choices: shuffled(choices), hint: `\\((x-c)^2\\): um \\(c\\) nach rechts; \\((x+c)^2\\): um \\(c\\) nach links.`, why: `Der Scheitel liegt dort, wo die Klammer 0 wird: bei x = ${right ? c : -c}. Also um ${c} nach ${right ? 'rechts' : 'links'} – entgegen dem Vorzeichen in der Klammer.`, difficulty: 0.45 };
});

reg('algebra__scheitelpunktform', () => {
	const d = rand(-4, 4), e = rand(-4, 4), a = pick([1, -1, 2]);
	// d=0 or e=0 causes duplicate choices: (0|e)==(-0|e) and (d|0)==(d|-0)
	if (d === 0 || e === 0) return registry.get('algebra__scheitelpunktform')!();
	// written the way it appears in textbooks: (x + 3)² instead of (x − (−3))²
	const aStr = a === 1 ? '' : a === -1 ? '-' : String(a);
	const choices = [`(${d} | ${e})`, `(${-d} | ${e})`, `(${d} | ${-e})`, `(${-d} | ${-e})`];
	return { atomId: 'algebra__scheitelpunktform', prompt: `Lies den Scheitelpunkt ab: \\(f(x) = ${aStr}(x ${d > 0 ? '-' : '+'} ${Math.abs(d)})^2 ${e > 0 ? '+' : '-'} ${Math.abs(e)}\\)`, answerType: 'text', correctAnswer: `(${d} | ${e})`, choices: choices.sort(() => Math.random() - 0.5), hint: `Scheitelpunktform \\(y=a(x−d)^2+e\\) → Scheitel \\(S(d \\mid e)\\)`, why: `Die Klammer wird 0 für x = ${d} (Vorzeichen umdrehen!), dort ist f(x) = ${e}. Scheitel: (${d} | ${e}).`, difficulty: 0.5 };
});

reg('algebra__scheitelform_umwandeln', () => {
	const d = rand(-4, 4), e = rand(-4, 4);
	if (d === 0 || e === 0) return registry.get('algebra__scheitelform_umwandeln')!();
	// (x-d)² + e = x² - 2dx + d² + e
	const p = -2 * d, q = d * d + e;
	const correct = `\\(${fmtQuad(1, p, q)}\\)`;
	// distractors: sign of the linear term wrong, d² forgotten, both
	const choices = shuffled([correct, `\\(${fmtQuad(1, -p, q)}\\)`, `\\(${fmtQuad(1, p, e)}\\)`, `\\(${fmtQuad(1, -p, e)}\\)`]);
	const binom = `(x ${d > 0 ? '-' : '+'} ${Math.abs(d)})^2`;
	const eStr = `${e > 0 ? '+' : '-'} ${Math.abs(e)}`;
	return {
		atomId: 'algebra__scheitelform_umwandeln',
		prompt: `Schreibe in allgemeiner Form: \\(f(x) = ${binom} ${eStr}\\)`,
		answerType: 'text',
		correctAnswer: correct,
		choices,
		inputData: {
			steps: [
				`Binom ausmultiplizieren: \\(${binom} = ${fmtQuad(1, p, d * d)}\\)`,
				`\\(${eStr}\\) ergänzen: \\(${fmtQuad(1, p, d * d)} ${eStr}\\)`,
				`\\(= ${fmtQuad(1, p, q)}\\)`
			]
		},
		difficulty: 0.6
	};
});

reg('algebra__parabel_nullstellen', (stage = 0) => {
	const x1 = rand(-4, 4), x2 = rand(-4, 4);
	// x1+x2===0: distractor "x₁=-s; x₂=-l" would equal correct "x₁=s; x₂=l" (symmetric roots)
	while (x1 === x2 || x1 + x2 === 0) return registry.get('algebra__parabel_nullstellen')!(stage);
	const [s, l] = x1 < x2 ? [x1, x2] : [x2, x1];
	// Expanding sequence: faktorisierte Form (Nullprodukt) → allgemeine Form (p-q-Formel).
	const type = Math.min(stage, 1);
	if (type === 0) {
		const correct = `x₁=${s}; x₂=${l}`;
		const choices = [correct, `x₁=${-s}; x₂=${-l}`, `x₁=${s+1}; x₂=${l}`, `x₁=${s}; x₂=${l+1}`].sort(() => Math.random() - 0.5);
		return { atomId: 'algebra__parabel_nullstellen', prompt: `Bestimme die Nullstellen von \\(f(x) = ${[x1, x2].sort((u, v) => Math.abs(u) - Math.abs(v)).map(fmtFactor).join('')}\\)`, answerType: 'text', correctAnswer: correct, choices, hint: `Satz vom Nullprodukt: Jeder Faktor = 0 setzen.`, why: `Ein Produkt ist 0, wenn ein Faktor 0 ist: \\(${fmtFactor(s)}\\) wird 0 für x = ${s}, \\(${fmtFactor(l)}\\) für x = ${l}.`, difficulty: 0.5 };
	} else {
		const a2 = -(x1 + x2), a0 = x1 * x2;
		const correct = `x₁=${s}; x₂=${l}`;
		const choices = [correct, `x₁=${-s}; x₂=${-l}`, `x₁=${s}; x₂=${l-1}`, `x₁=${s+1}; x₂=${l}`].sort(() => Math.random() - 0.5);
		return {
			atomId: 'algebra__parabel_nullstellen',
			prompt: `Bestimme die Nullstellen: \\(f(x) = ${fmtQuad(1, a2, a0)}\\)`,
			answerType: 'text',
			correctAnswer: correct,
			choices,
			inputData: {
				steps: [
					`\\(${fmtQuad(1, a2, a0)} = 0\\)`,
					`\\(p = ${a2},\\; q = ${a0}\\)`,
					`\\(x = -\\frac{${a2}}{2} \\pm \\sqrt{\\left(\\frac{${a2}}{2}\\right)^2 - ${paren(a0)}}\\)`,
					`\\(x_1 = ${s},\\quad x_2 = ${l}\\)`
				]
			},
			difficulty: 0.6
		};
	}
});

reg('algebra__parametereinfluss_graphen', () => {
	const templates = [
		{ q: 'Was bewirkt \\(a > 1\\) in \\(f(x) = a \\cdot x^2\\)?', a: 'Graph wird schmaler', w: ['Graph wird breiter', 'Graph verschiebt sich nach oben', 'Graph spiegelt sich'], e: 'Jeder y-Wert wird mit a vervielfacht: Die Parabel steigt schneller, wirkt also schmaler.' },
		{ q: 'Was bewirkt \\(c > 0\\) in \\(f(x) = x^2 + c\\)?', a: 'Verschiebung nach oben um \\(c\\)', w: ['Verschiebung nach unten um \\(c\\)', 'Verschiebung nach rechts', 'Streckung um \\(c\\)'], e: 'Zu jedem y-Wert wird c addiert – der ganze Graph rutscht um c nach oben.' },
		{ q: 'Was bewirkt ein negatives \\(a\\) in \\(f(x) = a \\cdot x^2\\)?', a: 'Parabel öffnet nach unten', w: ['Parabel öffnet nach oben', 'Verschiebung nach links', 'Stauchung'], e: 'Aus jedem positiven y-Wert wird ein negativer: Die Parabel wird an der x-Achse gespiegelt und öffnet nach unten.' },
		{ q: 'Was bewirkt \\(c > 0\\) in \\(f(x) = (x - c)^2\\)?', a: 'Verschiebung um \\(c\\) nach rechts', w: ['Verschiebung um \\(c\\) nach links', 'Verschiebung um \\(c\\) nach oben', 'Verschiebung um \\(c\\) nach unten'], e: 'Die Klammer wird für x = c zu 0 – dort liegt der Scheitel, also c Einheiten rechts.' },
		{ q: 'Was bewirkt \\(0 < a < 1\\) in \\(f(x) = a \\cdot x^2\\)?', a: 'Graph wird breiter', w: ['Graph wird schmaler', 'Graph verschiebt sich nach unten', 'Graph spiegelt sich'], e: 'Jeder y-Wert wird verkleinert: Die Parabel steigt langsamer, wirkt also breiter.' },
		{ q: 'Was bewirkt \\(c > 0\\) in \\(f(x) = x^2 - c\\)?', a: 'Verschiebung nach unten um \\(c\\)', w: ['Verschiebung nach oben um \\(c\\)', 'Verschiebung nach links', 'Stauchung um \\(c\\)'], e: 'Von jedem y-Wert wird c abgezogen – der ganze Graph rutscht um c nach unten.' },
		{ q: 'Was bewirkt \\(c > 0\\) in \\(f(x) = (x + c)^2\\)?', a: 'Verschiebung um \\(c\\) nach links', w: ['Verschiebung um \\(c\\) nach rechts', 'Verschiebung um \\(c\\) nach oben', 'Verschiebung um \\(c\\) nach unten'], e: 'Die Klammer wird für x = −c zu 0 – dort liegt der Scheitel, also c Einheiten links.' },
		{ q: 'Was bewirkt \\(m > 0\\) in \\(f(x) = m \\cdot x + n\\)?', a: 'Gerade steigt', w: ['Gerade fällt', 'Gerade verläuft waagerecht', 'Gerade wird nach oben verschoben'], e: 'm gibt an, um wie viel y wächst, wenn x um 1 wächst. Ist m positiv, geht es bergauf.' },
		{ q: 'Was bewirkt ein größeres \\(n\\) in \\(f(x) = m \\cdot x + n\\)?', a: 'Gerade wird nach oben verschoben', w: ['Gerade wird steiler', 'Gerade wird flacher', 'Gerade wird nach rechts verschoben'], e: 'n ist der y-Achsenabschnitt. Ein größeres n hebt jeden Punkt der Geraden gleich weit an.' },
	];
	const t = pick(templates);
	const choices = [t.a, ...t.w].sort(() => Math.random() - 0.5);
	return { atomId: 'algebra__parametereinfluss_graphen', prompt: t.q, answerType: 'text', correctAnswer: t.a, choices, why: t.e, difficulty: 0.45 };
});

reg('algebra__quadratische_gleichung_reinquadratisch', (stage = 0) => {
	// Expanding sequence: x²=c → a·x²=a·c (Koeffizient wegdividieren) → keine Lösung erkennen (Diskrimination).
	const step = Math.min(stage, 2);

	if (step === 2) {
		const x = rand(2, 15);
		const c = x * x;
		const correct = 'keine Lösung';
		const choices = [correct, `\\(x = ${x}\\) oder \\(x = −${x}\\)`, `\\(x = ${x}\\)`, `\\(x = −${x}\\)`].sort(() => Math.random() - 0.5);
		return {
			atomId: 'algebra__quadratische_gleichung_reinquadratisch',
			prompt: `Löse: \\(x^2 = −${c}\\)`,
			answerType: 'text',
			correctAnswer: correct,
			choices,
			hint: `\\(x^2\\) ist immer ≥ 0 – die Gleichung hat keine reelle Lösung.`,
			why: `Ein Quadrat ist nie negativ: \\(${x}^2 = ${c}\\) und \\((−${x})^2 = ${c}\\). −${c} kann nicht herauskommen.`, difficulty: 0.45
		};
	}

	const x = rand(2, 15);
	const c = x * x;
	const correct = `\\(x = ${x}\\) oder \\(x = −${x}\\)`;

	// Two "oder"-form distractors with adjacent values so students can't just pick "the ± one"
	const d1 = x < 15 ? x + 1 : x - 2;
	const d2 = x > 2 ? x - 1 : x + 2;
	const pool = [
		`\\(x = ${d1}\\) oder \\(x = −${d1}\\)`,
		`\\(x = ${d2}\\) oder \\(x = −${d2}\\)`,
		`\\(x = ${x}\\)`,
		`\\(x = −${x}\\)`,
		'keine Lösung'
	];
	const distractors = pool.sort(() => Math.random() - 0.5).slice(0, 3);
	const choices = [correct, ...distractors].sort(() => Math.random() - 0.5);

	if (step === 0) {
		return {
			atomId: 'algebra__quadratische_gleichung_reinquadratisch',
			prompt: `Löse: \\(x^2 = ${c}\\)`,
			answerType: 'text',
			correctAnswer: correct,
			choices,
			hint: `\\(x^2 = ${c}\\) → \\(x = \\pm\\sqrt{${c}} = \\pm${x}\\)`,
			why: `Zwei Zahlen ergeben quadriert ${c}: \\(${x}^2 = ${c}\\) und \\((−${x})^2 = ${c}\\). Deshalb gibt es zwei Lösungen.`, difficulty: 0.4
		};
	} else {
		const a = rand(2, 4);
		return {
			atomId: 'algebra__quadratische_gleichung_reinquadratisch',
			prompt: `Löse: \\(${a}x^2 = ${a * c}\\)`,
			answerType: 'text',
			correctAnswer: correct,
			choices,
			inputData: {
				steps: [`\\(:${a}\\): \\(x^2 = ${c}\\)`, `\\(x = \\pm\\sqrt{${c}} = \\pm${x}\\)`]
			},
			difficulty: 0.45
		};
	}
});

reg('algebra__quadratische_gleichung_faktorisiert', () => {
	const x1 = rand(-5, 5), x2 = rand(-5, 5);
	// x1+x2===0 guard: distractor "-x1 oder -x2" would equal correct in reversed order
	while (x1 === x2 || x1 === 0 || x1 + x2 === 0) return registry.get('algebra__quadratische_gleichung_faktorisiert')!();
	const term = (r: number) => r === 0 ? 'x' : r > 0 ? `x − ${r}` : `x + ${-r}`;
	const t1 = term(x1), t2 = term(x2);
	const correct = `\\(x = ${x1}\\) oder \\(x = ${x2}\\)`;
	const choices = [correct, `\\(x = ${-x1}\\) oder \\(x = ${-x2}\\)`, `\\(x = ${x1}\\)`, `\\(x = ${x1 + 1}\\) oder \\(x = ${x2 + 1}\\)`].sort(() => Math.random() - 0.5);
	return { atomId: 'algebra__quadratische_gleichung_faktorisiert', prompt: `Löse: \\(${x2 === 0 ? `x(${t1})` : `(${t1})(${t2})`} = 0\\)`, answerType: 'text', correctAnswer: correct, choices, hint: `Satz vom Nullprodukt: \\(${t1} = 0\\) oder \\(${t2} = 0\\)`, why: `Ein Produkt ist 0, wenn ein Faktor 0 ist: \\(${t1} = 0\\) für \\(x = ${x1}\\)${x2 === 0 ? ', und x selbst ist 0 für \\(x = 0\\)' : `, \\(${t2} = 0\\) für \\(x = ${x2}\\)`}.`, difficulty: 0.45 };
});

reg('algebra__quadratische_gleichung_loesungsformel', () => {
	const x1 = rand(-4, 4), x2 = rand(-4, 4);
	const p = -(x1 + x2), q = x1 * x2;
	// p=0: step-1 choices degenerate; q=0: step-1 choices collapse to 2 options
	if (x1 === x2 || p % 2 !== 0 || x1 + x2 === 0 || q === 0) return registry.get('algebra__quadratische_gleichung_loesungsformel')!();
	const [s, l] = x1 < x2 ? [x1, x2] : [x2, x1];
	const half = -p / 2;
	const disc = half * half - q;
	const sqrtDisc = Math.sqrt(disc);
	if (!Number.isInteger(sqrtDisc) || sqrtDisc === 0) return registry.get('algebra__quadratische_gleichung_loesungsformel')!();

	const correct = `x₁=${s}; x₂=${l}`;
	const shuf = <T>(a: T[]) => a.sort(() => Math.random() - 0.5);

	// Step 1: identify p and q
	const s1Choices = shuf([`p=${p}, q=${q}`, `p=${-p}, q=${q}`, `p=${p}, q=${-q}`, `p=${-p}, q=${-q}`]);

	// Step 2: compute -p/2
	const s2Raw = [half, -half, half + 1, half - 1];
	const s2Choices = shuf([...new Set(s2Raw)].map(String));

	// Step 3: compute discriminant (p/2)²−q
	const s3Raw = [disc, half * half, disc + 1, disc - 1];
	const s3Choices = shuf([...new Set(s3Raw)].map(String));

	// Step 4: final solutions
	const s4Choices = shuf([correct, `x₁=${-s}; x₂=${-l}`, `x₁=${s}; x₂=${l + 1}`, `x₁=${s - 1}; x₂=${l}`]);

	return {
		atomId: 'algebra__quadratische_gleichung_loesungsformel',
		prompt: `Löse mit der pq-Formel: \\(${fmtQuad(1, p, q)} = 0\\)`,
		answerType: 'text',
		correctAnswer: correct,
		inputData: {
			type: 'pq_steps',
			subSteps: [
				{
					subPrompt: 'Welche Werte haben p und q?',
					choices: s1Choices,
					correctAnswer: `p=${p}, q=${q}`,
					hint: `In \\(x^2 + px + q = 0\\) ist der Koeffizient vor \\(x\\) der Wert p.`
				},
				{
					context: `\\(p = ${p},\\quad q = ${q}\\)`,
					subPrompt: `Berechne \\(-\\dfrac{p}{2} = -\\dfrac{${p}}{2}\\)`,
					choices: s2Choices,
					correctAnswer: String(half),
					hint: `\\(-\\dfrac{${p}}{2} = ${half}\\)`
				},
				{
					context: `\\(-\\dfrac{p}{2} = ${half}\\)`,
					subPrompt: `Berechne \\(\\left(\\dfrac{p}{2}\\right)^2 - q = ${half}^2 - (${q})\\)`,
					choices: s3Choices,
					correctAnswer: String(disc),
					hint: `\\(${half}^2 - (${q}) = ${half * half} - (${q}) = ${disc}\\)`
				},
				{
					context: `\\(x = ${half} \\pm \\sqrt{${disc}} = ${half} \\pm ${sqrtDisc}\\)`,
					subPrompt: `Berechne x₁ und x₂`,
					choices: s4Choices,
					correctAnswer: correct,
					hint: `\\(x_1 = ${half} - ${sqrtDisc} = ${s},\\quad x_2 = ${half} + ${sqrtDisc} = ${l}\\)`,
					isFinal: true
				}
			]
		},
		why: `\\(x = -\\frac{p}{2} \\pm \\sqrt{\\left(\\frac{p}{2}\\right)^2 - q} = ${half} \\pm \\sqrt{${disc}} = ${half} \\pm ${sqrtDisc}\\), also \\(x_1 = ${s}\\) und \\(x_2 = ${l}\\).`, difficulty: 0.65
	};
});

reg('algebra__quadratische_gleichung_diskriminante', (stage = 0) => {
	const atomId = 'algebra__quadratische_gleichung_diskriminante';
	const choices = ['keine Lösung', 'genau eine Lösung', 'zwei Lösungen'];
	// p is even so that (p/2)² − q is an integer.
	let p: number, q: number;
	const kind = rand(0, 2);
	if (kind === 0) {
		const r = rand(1, 4);
		p = 2 * r * pick([-1, 1]); q = r * r + rand(1, 4);
	} else if (kind === 1) {
		const r = rand(1, 5);
		p = 2 * r * pick([-1, 1]); q = r * r;
	} else {
		const r = rand(1, 4);
		p = 2 * r * pick([-1, 1]); q = r * r - pick([1, 4, 9]);
		if (q === 0) q = r * r - 16;
	}
	const D = (p / 2) ** 2 - q;
	const correct = D < 0 ? choices[0] : D === 0 ? choices[1] : choices[2];
	const hint = 'D < 0 → keine Lösung, D = 0 → genau eine Lösung, D > 0 → zwei Lösungen'; const dWhy = D < 0 ? 'Die Diskriminante steht unter der Wurzel – aus einer negativen Zahl lässt sich keine Wurzel ziehen.' : D === 0 ? 'Die Diskriminante steht unter der Wurzel: √0 = 0, und „± 0" ändert nichts – es bleibt eine Lösung.' : 'Die Diskriminante steht unter der Wurzel: „±" eine positive Wurzel liefert zwei verschiedene Werte.';
	// Expanding sequence: Diskriminante gegeben (nur deuten) → Diskriminante selbst berechnen.
	if (Math.min(stage, 1) === 0) {
		return { atomId, prompt: `\\(${fmtQuad(1, p, q)} = 0\\) hat die Diskriminante \\(D = ${D}\\). Wie viele Lösungen hat die Gleichung?`, answerType: 'text', correctAnswer: correct, choices, hint, why: dWhy, difficulty: 0.45 };
	}
	return { atomId, prompt: `Wie viele Lösungen hat \\(${fmtQuad(1, p, q)} = 0\\)?`, answerType: 'text', correctAnswer: correct, choices, hint: `Berechne \\(D = \\left(\\frac{p}{2}\\right)^2 - q\\) mit \\(p = ${p}\\), \\(q = ${q}\\). ${hint}`, why: `\\(D = \\left(\\frac{${p}}{2}\\right)^2 - ${paren(q)} = ${(p / 2) ** 2} - ${paren(q)} = ${D}\\). ${dWhy}`, difficulty: 0.55 };
});

// ── 25. Geometrie: Flächen, Umfang, Einheiten ─────────────────────────────────

reg('geometrie__flaecheninhalt_einheitsquadrate', (stage = 0) => {
	const cols = rand(3, 8), rows = rand(2, 6);
	const type = Math.min(stage, 1);
	const svg = svgUnitGrid(cols, rows, cols, rows);
	if (type === 0) {
		return { atomId: 'geometrie__flaecheninhalt_einheitsquadrate', prompt: `Wie viele Einheitsquadrate bedeckt das Rechteck? (Flächeninhalt in Kästchen)`, answerType: 'integer', correctAnswer: String(cols * rows), svg, hint: `Zähle die Kästchen aus oder rechne ${cols} · ${rows}.`, why: `${rows} Reihen mit je ${cols} Kästchen: ${cols} · ${rows} = ${cols * rows}.`, difficulty: 0.3 };
	}
	return { atomId: 'geometrie__flaecheninhalt_einheitsquadrate', prompt: `Wie lang ist der Umfang des Rechtecks? (in Kästchenlängen)`, answerType: 'integer', correctAnswer: String(2 * (cols + rows)), svg, hint: `Zähle die Randstrecke: 2 · (${cols} + ${rows}).`, why: `Einmal außen herum: ${cols} + ${rows} + ${cols} + ${rows} = ${2 * (cols + rows)} Kästchenlängen.`, difficulty: 0.3 };
});

reg('geometrie__rechteck_flaeche_umfang', (stage = 0) => {
	const type = Math.min(stage, 2);
	const w = rand(3, 15), h = rand(3, 15);
	const pts: [Pt, Pt, Pt, Pt] = [[0, 0], [w, 0], [w, h], [0, h]];
	if (type === 0) {
		const svg = svgQuad(pts, { baseLabel: `${w} cm`, rightLabel: `${h} cm`, rightAngleVertices: [0] });
		return { atomId: 'geometrie__rechteck_flaeche_umfang', prompt: `Berechne den Flächeninhalt des Rechtecks.`, answerType: 'number', correctAnswer: String(w * h), svg, hint: `A = a · b = ${w} cm · ${h} cm`, why: `Das Rechteck lässt sich mit ${h} Reihen zu je ${w} Zentimeterquadraten auslegen: ${w} · ${h} = ${w * h} cm².`, difficulty: 0.3 };
	}
	if (type === 1) {
		const svg = svgQuad(pts, { baseLabel: `${w} cm`, rightLabel: `${h} cm`, rightAngleVertices: [0] });
		return { atomId: 'geometrie__rechteck_flaeche_umfang', prompt: `Berechne den Umfang des Rechtecks.`, answerType: 'number', correctAnswer: String(2 * (w + h)), svg, hint: `U = 2 · (a + b)`, why: `Der Umfang ist die Summe aller vier Seiten: 2 · ${w} + 2 · ${h} = ${2 * (w + h)} cm.`, difficulty: 0.3 };
	}
	const svg = svgQuad(pts, { baseLabel: `${w} cm`, rightLabel: '?', rightAngleVertices: [0] });
	return { atomId: 'geometrie__rechteck_flaeche_umfang', prompt: `Das Rechteck hat den Flächeninhalt ${w * h} cm² und eine Seite von ${w} cm. Wie lang ist die fehlende Seite?`, answerType: 'number', correctAnswer: String(h), svg, hint: `Seite = A : ${w} cm`, why: `A = a · b, also b = A : a = ${w * h} : ${w} = ${h} cm.`, difficulty: 0.45 };
});

reg('geometrie__flaeche_parallelogramm', (stage = 0) => {
	const type = Math.min(stage, 1);
	const g = rand(4, 14), h = rand(3, 10);
	const slant = Math.round(g * 0.3) || 1;
	const pts: [Pt, Pt, Pt, Pt] = [[0, 0], [g, 0], [g + slant, h], [slant, h]];
	if (type === 0) {
		const svg = svgQuad(pts, { baseLabel: `${g} cm`, heightFrom: [slant, h], heightTo: [slant, 0], heightLabel: `${h} cm` });
		return { atomId: 'geometrie__flaeche_parallelogramm', prompt: `Berechne den Flächeninhalt des Parallelogramms.`, answerType: 'number', correctAnswer: String(g * h), svg, hint: `A = g · h = ${g} cm · ${h} cm`, why: `Schneidest du links ein Dreieck ab und setzt es rechts an, entsteht ein Rechteck: ${g} cm · ${h} cm = ${g * h} cm². Die schräge Seite spielt keine Rolle.`, difficulty: 0.4 };
	}
	const svg = svgQuad(pts, { baseLabel: `${g} cm`, heightFrom: [slant, h], heightTo: [slant, 0], heightLabel: '?' });
	return { atomId: 'geometrie__flaeche_parallelogramm', prompt: `Das Parallelogramm hat den Flächeninhalt ${g * h} cm² und die Grundseite ${g} cm. Wie groß ist die Höhe h?`, answerType: 'number', correctAnswer: String(h), svg, hint: `h = A : g`, why: `A = g · h umgestellt: h = A : g = ${g * h} : ${g} = ${h} cm.`, difficulty: 0.5 };
});

reg('geometrie__flaeche_dreieck', (stage = 0) => {
	const type = Math.min(stage, 1);
	const g = 2 * rand(2, 8), h = rand(3, 12);
	const footX = Math.round(g * 0.4) || 1;
	const A: Pt = [0, 0], B: Pt = [g, 0], C: Pt = [footX, h];
	const area = g * h / 2;
	const diagram = (hideH: boolean) => svgPolyDiagram([A, B, C], {
		edgeLabels: [{ from: 0, to: 1, text: `${g} cm` }],
		extraSegments: [{ from: C, to: [footX, 0], dash: true }],
		rightAngleFeet: [{ at: [footX, 0], ref1: C, ref2: B }],
		extraPoints: [{ at: [footX, h / 2], label: hideH ? '?' : `${h} cm`, pos: 'right' }]
	});
	if (type === 0) {
		return { atomId: 'geometrie__flaeche_dreieck', prompt: `Berechne den Flächeninhalt des Dreiecks.`, answerType: 'number', correctAnswer: dec(area), svg: diagram(false), hint: `A = (g · h) : 2 = (${g} · ${h}) : 2`, why: `Das Dreieck ist die Hälfte eines Parallelogramms mit gleicher Grundseite und Höhe: (${g} · ${h}) : 2 = ${dec(area)} cm².`, difficulty: 0.4 };
	}
	return { atomId: 'geometrie__flaeche_dreieck', prompt: `Das Dreieck hat den Flächeninhalt ${dec(area)} cm² und die Grundseite ${g} cm. Wie groß ist die Höhe?`, answerType: 'number', correctAnswer: dec(h), svg: diagram(true), hint: `h = (2 · A) : g`, why: `A = g · h : 2 umgestellt: h = 2 · A : g = ${dec(2 * area)} : ${g} = ${h} cm.`, difficulty: 0.5 };
});

reg('geometrie__flaeche_trapez_zusammengesetzt', (stage = 0) => {
	const type = Math.min(stage, 1);
	if (type === 0) {
		const aB = rand(8, 16), c = rand(4, aB - 3), h = rand(3, 9);
		const off = (aB - c) / 2;
		const A: Pt = [0, 0], B: Pt = [aB, 0], C: Pt = [aB - off, h], D: Pt = [off, h];
		const area = (aB + c) / 2 * h;
		const svg = svgPolyDiagram([A, B, C, D], {
			edgeLabels: [{ from: 0, to: 1, text: `${aB} cm` }, { from: 2, to: 3, text: `${c} cm` }],
			extraSegments: [{ from: D, to: [off, 0], dash: true }],
			rightAngleFeet: [{ at: [off, 0], ref1: D, ref2: B }],
			extraPoints: [{ at: [off, h / 2], label: `${h} cm`, pos: 'right' }]
		});
		return { atomId: 'geometrie__flaeche_trapez_zusammengesetzt', prompt: `Berechne den Flächeninhalt des Trapezes.`, answerType: 'number', correctAnswer: dec(area), svg, hint: `A = (a + c) : 2 · h = (${aB} + ${c}) : 2 · ${h}`, why: `Mittelwert der parallelen Seiten mal Höhe: (${aB} + ${c}) : 2 = ${dec((aB + c) / 2)}, mal ${h} = ${dec(area)} cm².`, difficulty: 0.5 };
	}
	const w1 = rand(4, 8), h1 = rand(6, 12), w2 = rand(2, 6), h2 = rand(2, h1 - 2);
	const P0: Pt = [0, 0], P1: Pt = [w1 + w2, 0], P2: Pt = [w1 + w2, h2], P3: Pt = [w1, h2], P4: Pt = [w1, h1], P5: Pt = [0, h1];
	const area = w1 * h1 + w2 * h2;
	const svg = svgPolyDiagram([P0, P1, P2, P3, P4, P5], {
		edgeLabels: [
			{ from: 4, to: 5, text: `${w1} cm` },
			{ from: 2, to: 3, text: `${w2} cm` },
			{ from: 5, to: 0, text: `${h1} cm` },
			{ from: 1, to: 2, text: `${h2} cm` }
		],
		extraSegments: [{ from: P3, to: [w1, 0], dash: true }]
	});
	return { atomId: 'geometrie__flaeche_trapez_zusammengesetzt', prompt: `Berechne den Flächeninhalt der zusammengesetzten Figur (zerlege sie in zwei Rechtecke).`, answerType: 'number', correctAnswer: dec(area), svg, hint: `A = ${w1}·${h1} + ${w2}·${h2}`, why: `Zwei Rechtecke: ${w1} · ${h1} = ${w1 * h1} und ${w2} · ${h2} = ${w2 * h2}. Zusammen ${area} cm².`, difficulty: 0.55 };
});

reg('geometrie__kreisumfang', (stage = 0) => {
	const type = Math.min(stage, 2);
	const r = rand(2, 25), d = 2 * r;
	if (type === 0) {
		const svg = svgCircleDiagram(r, { label: `r = ${r} cm` });
		return { atomId: 'geometrie__kreisumfang', prompt: `Berechne den Umfang des Kreises. (nutze π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(round(3.14 * d, 2)), tolerance: piTol(3.14 * d), svg, hint: `u = 2·π·r = 2 · 3,14 · ${r}`, why: `Der Umfang ist immer etwa 3,14-mal der Durchmesser. d = 2 · ${r} = ${d} cm, also u = 3,14 · ${d} = ${dec(round(3.14 * d, 2))} cm.`, difficulty: 0.45 };
	}
	if (type === 1) {
		const svg = svgCircleDiagram(r, { label: `d = ${d} cm`, showDiameter: true });
		return { atomId: 'geometrie__kreisumfang', prompt: `Berechne den Umfang des Kreises. (nutze π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(round(3.14 * d, 2)), tolerance: piTol(3.14 * d), svg, hint: `u = π · d = 3,14 · ${d}`, why: `Der Umfang ist immer etwa 3,14-mal der Durchmesser: u = 3,14 · ${d} = ${dec(round(3.14 * d, 2))} cm.`, difficulty: 0.4 };
	}
	const uGiven = round(3.14 * d, 1);
	const svg = svgCircleDiagram(r, { label: '?', showDiameter: true });
	return { atomId: 'geometrie__kreisumfang', prompt: `Ein Kreis hat den Umfang ${dec(uGiven)} cm. Wie groß ist der Durchmesser? (nutze π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(round(uGiven / 3.14, 1)), tolerance: 0.1, svg, hint: `d = u : π`, why: `u = π · d umgestellt: d = u : π = ${dec(uGiven)} : 3,14 ≈ ${dec(round(uGiven / 3.14, 1))} cm.`, difficulty: 0.55 };
});

reg('geometrie__kreisflaeche', (stage = 0) => {
	const type = Math.min(stage, 2);
	const r = rand(2, 20);
	const A = round(3.14 * r * r, 2);
	if (type === 0) {
		const svg = svgCircleDiagram(r, { label: `r = ${r} cm` });
		return { atomId: 'geometrie__kreisflaeche', prompt: `Berechne den Flächeninhalt des Kreises. (nutze π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(A), tolerance: piTol(A), svg, hint: `A = π · r² = 3,14 · ${r}²`, why: `A = π · r²: erst r² = ${r} · ${r} = ${r * r}, dann 3,14 · ${r * r} = ${dec(A)} cm².`, difficulty: 0.5 };
	}
	if (type === 1) {
		const d = 2 * r;
		const svg = svgCircleDiagram(r, { label: `d = ${d} cm`, showDiameter: true });
		return { atomId: 'geometrie__kreisflaeche', prompt: `Berechne den Flächeninhalt des Kreises. (nutze π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(A), tolerance: piTol(A), svg, hint: `r = d : 2 = ${r} cm, dann A = π · r²`, why: `Erst den Radius: r = ${d} : 2 = ${r} cm. Dann A = 3,14 · ${r}² = 3,14 · ${r * r} = ${dec(A)} cm².`, difficulty: 0.5 };
	}
	const svg = svgCircleDiagram(r, { label: '?' });
	return { atomId: 'geometrie__kreisflaeche', prompt: `Ein Kreis hat den Flächeninhalt ${dec(A)} cm². Wie groß ist der Radius? (nutze π ≈ 3,14)`, answerType: 'number', correctAnswer: String(r), tolerance: 0.1, svg, hint: `r = √(A : π)`, why: `A = π · r² umgestellt: r² = ${dec(A)} : 3,14 = ${r * r}, also r = √${r * r} = ${r} cm.`, difficulty: 0.6 };
});

reg('geometrie__laengeneinheiten_umrechnen', (stage = 0) => {
	const easy = [
		{ from: 'cm', to: 'mm', factor: 10 }, { from: 'mm', to: 'cm', factor: 0.1 },
		{ from: 'm', to: 'cm', factor: 100 }, { from: 'cm', to: 'm', factor: 0.01 }
	];
	const medium = [{ from: 'km', to: 'm', factor: 1000 }, { from: 'm', to: 'km', factor: 0.001 }];
	const hard = [{ from: 'm', to: 'mm', factor: 1000 }, { from: 'mm', to: 'm', factor: 0.001 }];
	const pool = Math.min(stage, 2) === 0 ? easy : Math.min(stage, 2) === 1 ? medium : hard;
	const { from, to, factor } = pick(pool);
	const value = rand(0, 1) === 0 ? rand(2, 90) : round(rand(20, 900) / 10, 1);
	const result = round(value * factor, 4);
	const svg = svgLengthBar(`${dec(value)} ${from}`);
	return { atomId: 'geometrie__laengeneinheiten_umrechnen', prompt: `${dec(value)} ${from} = ? ${to}`, answerType: 'number', correctAnswer: dec(result), svg, hint: `1 ${from} = ${factor >= 1 ? dec(factor) : `1/${Math.round(1 / factor)}`} ${to}`, why: `${factor >= 1 ? `1 ${from} = ${factor} ${to}, also mal ${factor}` : `${Math.round(1 / factor)} ${from} = 1 ${to}, also geteilt durch ${Math.round(1 / factor)}`}: ${dec(value)} ${from} = ${dec(result)} ${to}. ${factor >= 1 ? 'Kleinere Einheit → größere Maßzahl.' : 'Größere Einheit → kleinere Maßzahl.'}`, difficulty: 0.4 };
});

reg('geometrie__flaechen_volumeneinheiten_umrechnen', (stage = 0) => {
	const kind = Math.min(stage, 1);
	if (kind === 0) {
		const pairs = [
			{ from: 'cm²', to: 'dm²', factor: 0.01 }, { from: 'dm²', to: 'cm²', factor: 100 },
			{ from: 'dm²', to: 'm²', factor: 0.01 }, { from: 'm²', to: 'dm²', factor: 100 }
		];
		const { from, to, factor } = pick(pairs);
		const value = rand(0, 1) === 0 ? rand(2, 60) : round(rand(20, 600) / 10, 1);
		const result = round(value * factor, 4);
		const svg = svgUnitGrid(10, 10, 10, 10);
		return { atomId: 'geometrie__flaechen_volumeneinheiten_umrechnen', prompt: `${dec(value)} ${from} = ? ${to}`, answerType: 'number', correctAnswer: dec(result), svg, hint: `Flächeneinheiten: Faktor 100 pro Stufe (nicht 10 wie bei Längen!)`, why: `Bei Flächen ist die Umrechnungszahl 100 (10 · 10): ${factor >= 1 ? 'mal 100' : 'geteilt durch 100'} → ${dec(value)} ${from} = ${dec(result)} ${to}.`, difficulty: 0.5 };
	}
	const pairs = [
		{ from: 'cm³', to: 'dm³', factor: 0.001 }, { from: 'dm³', to: 'cm³', factor: 1000 },
		{ from: 'dm³', to: 'm³', factor: 0.001 }, { from: 'm³', to: 'dm³', factor: 1000 }
	];
	const { from, to, factor } = pick(pairs);
	const value = rand(0, 1) === 0 ? rand(2, 60) : round(rand(20, 600) / 10, 1);
	const result = round(value * factor, 4);
	const svg = svgCuboid(4, 3, 2, { w: '1 dm', h: '1 dm', d: '1 dm' });
	return { atomId: 'geometrie__flaechen_volumeneinheiten_umrechnen', prompt: `${dec(value)} ${from} = ? ${to}`, answerType: 'number', correctAnswer: dec(result), svg, hint: `Volumeneinheiten: Faktor 1000 pro Stufe.`, why: `Bei Volumen ist die Umrechnungszahl 1000 (10 · 10 · 10): ${factor >= 1 ? 'mal 1000' : 'geteilt durch 1000'} → ${dec(value)} ${from} = ${dec(result)} ${to}.`, difficulty: 0.55 };
});

// ── 26. Geometrie: Körperberechnung ───────────────────────────────────────────

reg('geometrie__quader_volumen_oberflaeche', (stage = 0) => {
	const type = Math.min(stage, 1);
	const l = rand(3, 10), w = rand(2, 8), h = rand(2, 8);
	const svg = svgCuboid(l, h, w, { w: `${l} cm`, h: `${h} cm`, d: `${w} cm` });
	if (type === 0) {
		return { atomId: 'geometrie__quader_volumen_oberflaeche', prompt: `Berechne das Volumen des Quaders.`, answerType: 'number', correctAnswer: String(l * w * h), svg, hint: `V = l · b · h = ${l} · ${w} · ${h}`, why: `Volumen = Grundfläche · Höhe: ${l} · ${w} = ${l * w}, mal ${h} = ${l * w * h} cm³.`, difficulty: 0.45 };
	}
	const O = 2 * (l * w + l * h + w * h);
	return { atomId: 'geometrie__quader_volumen_oberflaeche', prompt: `Berechne den Oberflächeninhalt des Quaders.`, answerType: 'number', correctAnswer: String(O), svg, hint: `O = 2·(l·b + l·h + b·h)`, why: `Sechs Flächen, je zwei gleich: 2 · ${l * w} + 2 · ${l * h} + 2 · ${w * h} = ${O} cm².`, difficulty: 0.55 };
});

reg('geometrie__prismen', (stage = 0) => {
	// Expanding sequence: Grundfläche bestimmen → Volumen berechnen.
	const type = Math.min(stage, 1);
	const g = 2 * rand(2, 6), triH = rand(3, 8), l = rand(4, 12);
	const G = g * triH / 2;
	const svg = svgPrism(g, triH, l, { g: `${g} cm`, h: `${triH} cm`, l: `${l} cm` });
	if (type === 0) {
		return { atomId: 'geometrie__prismen', prompt: `Wie groß ist die Grundfläche G (das Dreieck) des Prismas?`, answerType: 'number', correctAnswer: dec(G), svg, hint: `G = (g · h) : 2 = (${g} · ${triH}) : 2`, why: `Die Grundfläche ist ein Dreieck: (${g} · ${triH}) : 2 = ${dec(G)} cm².`, difficulty: 0.4 };
	}
	return { atomId: 'geometrie__prismen', prompt: `Berechne das Volumen des Prismas (Grundfläche = Dreieck).`, answerType: 'number', correctAnswer: dec(G * l), svg, hint: `V = G · h = (${g}·${triH}:2) · ${l}`, why: `Grundfläche mal Körperhöhe: G = (${g} · ${triH}) : 2 = ${dec(G)} cm², V = ${dec(G)} · ${l} = ${dec(G * l)} cm³.`, difficulty: 0.55 };
});

reg('geometrie__pyramiden', (stage = 0) => {
	// Expanding sequence: Grundfläche bestimmen → Volumen berechnen.
	const type = Math.min(stage, 1);
	// a or h divisible by 3 keeps the volume a whole number
	const a = rand(3, 10), h = a % 3 === 0 ? rand(3, 12) : 3 * rand(1, 4);
	const svg = svgPyramid(a, h, { a: `${a} cm`, h: `${h} cm` });
	const G = a * a;
	if (type === 0) {
		return { atomId: 'geometrie__pyramiden', prompt: `Wie groß ist die Grundfläche G der quadratischen Pyramide?`, answerType: 'number', correctAnswer: String(G), svg, hint: `G = a² = ${a}²`, why: `Die Grundfläche ist ein Quadrat: ${a} · ${a} = ${G} cm².`, difficulty: 0.35 };
	}
	return { atomId: 'geometrie__pyramiden', prompt: `Berechne das Volumen der quadratischen Pyramide.`, answerType: 'number', correctAnswer: String(G * h / 3), svg, hint: `V = (1/3) · G · h = (1/3) · ${a}² · ${h}`, why: `Eine Pyramide füllt ein Drittel des Quaders mit gleicher Grundfläche und Höhe: ${G} · ${h} : 3 = ${G * h / 3} cm³.`, difficulty: 0.55 };
});

reg('geometrie__zylinder_volumen_oberflaeche', (stage = 0) => {
	const type = Math.min(stage, 1);
	const r = rand(2, 8), h = rand(3, 12);
	const svg = svgCylinder(r, h, { r: `r = ${r} cm`, h: `h = ${h} cm` });
	if (type === 0) {
		const V = round(3.14 * r * r * h, 2);
		return { atomId: 'geometrie__zylinder_volumen_oberflaeche', prompt: `Berechne das Volumen des Zylinders. (π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(V), tolerance: piTol(V), svg, hint: `V = π · r² · h`, why: `Grundfläche (Kreis) mal Höhe: 3,14 · ${r}² = ${dec(round(3.14 * r * r, 2))} cm², mal ${h} = ${dec(V)} cm³.`, difficulty: 0.5 };
	}
	const O = round(2 * 3.14 * r * (r + h), 2);
	return { atomId: 'geometrie__zylinder_volumen_oberflaeche', prompt: `Berechne den Oberflächeninhalt des Zylinders. (π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(O), tolerance: piTol(O), svg, hint: `O = 2·π·r·(r + h)`, why: `Zwei Kreise plus Mantel (aufgerollt ein Rechteck mit der Breite 2πr): 2 · 3,14 · ${r}² + 2 · 3,14 · ${r} · ${h} = ${dec(O)} cm².`, difficulty: 0.6 };
});

reg('geometrie__kugel_volumen_oberflaeche', (stage = 0) => {
	const type = Math.min(stage, 1);
	const r = rand(2, 15);
	const svg = svgSphere(r, `r = ${r} cm`);
	if (type === 0) {
		const V = round(4 / 3 * 3.14 * r * r * r, 2);
		return { atomId: 'geometrie__kugel_volumen_oberflaeche', prompt: `Berechne das Volumen der Kugel. (π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(V), tolerance: piTol(V), svg, hint: `V = (4/3) · π · r³`, why: `V = 4/3 · π · r³: ${r}³ = ${r ** 3}, dann 4 · 3,14 · ${r ** 3} : 3 ≈ ${dec(V)} cm³.`, difficulty: 0.55 };
	}
	const O = round(4 * 3.14 * r * r, 2);
	return { atomId: 'geometrie__kugel_volumen_oberflaeche', prompt: `Berechne den Oberflächeninhalt der Kugel. (π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(O), tolerance: piTol(O), svg, hint: `O = 4 · π · r²`, why: `O = 4 · π · r² – viermal die Fläche des größten Kreises: 4 · 3,14 · ${r * r} = ${dec(O)} cm².`, difficulty: 0.5 };
});

reg('geometrie__berechnungen_pyramide_kegel', (stage = 0) => {
	const atomId = 'geometrie__berechnungen_pyramide_kegel';
	// Mehrschrittige Berechnungen: eine Hilfsgröße muss zuerst mit dem Satz des Pythagoras bestimmt
	// werden. Pythagoreische Tripel halten alle Zwischenergebnisse ganzzahlig, sodass Rundungen
	// unterwegs das Endergebnis nicht verfälschen.
	// Expanding sequence: Seitenflächenhöhe der Pyramide → Mantelfläche der Pyramide → Oberfläche des Kegels.
	const type = Math.min(stage, 2);
	const [u, h, s] = pythagLegs();
	if (type <= 1) {
		const a = 2 * u;
		const svg = svgPyramid(a, h, { a: `a = ${a} cm`, h: `h = ${h} cm` });
		if (type === 0) {
			return { atomId, prompt: `Eine quadratische Pyramide hat die Grundkante a = ${a} cm und die Höhe h = ${h} cm. Berechne die Höhe h_s einer Seitenfläche (in cm).`, answerType: 'number', correctAnswer: String(s), svg, hint: `Rechtwinkliges Dreieck mit den Katheten a/2 = ${u} cm und h = ${h} cm: h_s² = ${u}² + ${h}²`, why: `h_s, die halbe Grundkante (${u} cm) und die Höhe (${h} cm) bilden ein rechtwinkliges Dreieck: h_s = √(${u}² + ${h}²) = √${u * u + h * h} = ${s} cm.`, difficulty: 0.6 };
		}
		return { atomId, prompt: `Eine quadratische Pyramide hat die Grundkante a = ${a} cm und die Höhe h = ${h} cm. Berechne den Inhalt der Mantelfläche (alle vier Seitenflächen, in cm²).`, answerType: 'number', correctAnswer: String(2 * a * s), svg, hint: `Erst h_s mit dem Satz des Pythagoras (a/2 und h), dann M = 4 · (a · h_s : 2) = 2 · a · h_s`, why: `Erst h_s = √(${u}² + ${h}²) = ${s} cm. Jede der vier Seitenflächen ist ein Dreieck: ${a} · ${s} : 2 = ${a * s / 2} cm². Mal 4: ${2 * a * s} cm².`, difficulty: 0.7 };
	}
	const svg = svgCone(u, h, { r: `r = ${u} cm`, h: `h = ${h} cm` });
	const O = round(3.14 * u * (u + s), 2);
	return { atomId, prompt: `Berechne den Oberflächeninhalt des Kreiskegels mit r = ${u} cm und h = ${h} cm. (π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(O), tolerance: piTol(O), svg, hint: `Erst die Mantellinie: s² = r² + h²; dann O = π · r² + π · r · s`, why: `Mantellinie: s = √(${u}² + ${h}²) = ${s} cm. O = Grundkreis + Mantel = 3,14 · ${u}² + 3,14 · ${u} · ${s} = ${dec(O)} cm².`, difficulty: 0.7 };
});

// ── 27. Geometrie: Pythagoras, Höhensatz, Kathetensatz ────────────────────────

const PYTHAG_TRIPLES: [number, number, number][] = [
	[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [7, 24, 25], [9, 12, 15], [12, 16, 20], [20, 21, 29]
];

// Legs and hypotenuse of a Pythagorean triple, legs in random order.
function pythagLegs(maxLeg = 24): [number, number, number] {
	const [a, b, c] = pick(PYTHAG_TRIPLES.filter(t => t[1] <= maxLeg));
	return rand(0, 1) === 0 ? [a, b, c] : [b, a, c];
}

function randomTriangleSides(): [number, number, number] {
	for (let i = 0; i < 30; i++) {
		const x = rand(4, 15), y = rand(4, 15), z = rand(4, 15);
		const sorted = [x, y, z].sort((p, q) => p - q);
		if (sorted[0] + sorted[1] > sorted[2]) return [x, y, z];
	}
	return [4, 5, 6];
}

reg('geometrie__pythagoras_hypotenuse', (stage = 0) => {
	const easy = Math.min(stage, 1) === 0;
	let a: number, b: number;
	if (easy || rand(0, 1) === 0) {
		[a, b] = pick(PYTHAG_TRIPLES);
		if (rand(0, 1)) [a, b] = [b, a];
	} else {
		a = rand(4, 15); b = rand(4, 15);
	}
	const c = Math.sqrt(a * a + b * b);
	const svg = svgRightTriangle(a, b, { labelA: `${a} cm`, labelB: `${b} cm`, labelC: '?' });
	return { atomId: 'geometrie__pythagoras_hypotenuse', prompt: `Berechne die Länge der Hypotenuse c${easy ? '' : ' (runde auf zwei Nachkommastellen)'}.`, answerType: 'number', correctAnswer: dec(round(c, 2)), tolerance: easy ? 0 : 0.01, svg, hint: `c = √(a² + b²) = √(${a}² + ${b}²)`, why: `c² = a² + b² = ${a * a} + ${b * b} = ${a * a + b * b}, also c = √${a * a + b * b} ${Number.isInteger(c) ? '=' : '≈'} ${dec(round(c, 2))} cm.`, difficulty: easy ? 0.45 : 0.55 };
});

reg('geometrie__pythagoras_kathete', (stage = 0) => {
	// Expanding sequence on the size of the squares: 3-4-5 / 6-8-10 → up to c = 17 → all triples.
	const maxC = [10, 17, Infinity][Math.min(stage, 2)];
	const [a, b, c] = pick(PYTHAG_TRIPLES.filter(t => t[2] <= maxC));
	const hideA = rand(0, 1) === 0;
	const known = hideA ? b : a, unknown = hideA ? a : b;
	const svg = svgRightTriangle(a, b, {
		labelA: hideA ? '?' : `${a} cm`,
		labelB: hideA ? `${b} cm` : '?',
		labelC: `${c} cm`
	});
	return { atomId: 'geometrie__pythagoras_kathete', prompt: `Berechne die Länge der fehlenden Kathete.`, answerType: 'number', correctAnswer: String(unknown), svg, hint: `Kathete = √(c² − ${known}²) = √(${c}² − ${known}²)`, why: `Die Hypotenuse ist die längste Seite – für eine Kathete wird subtrahiert: ${c}² − ${known}² = ${c * c} − ${known * known} = ${unknown * unknown}, √${unknown * unknown} = ${unknown} cm.`, difficulty: 0.55 };
});

reg('geometrie__pythagoras_umkehrung', () => {
	const isRight = rand(0, 1) === 0;
	let a: number, b: number, c: number;
	if (isRight) {
		[a, b, c] = pick(PYTHAG_TRIPLES);
	} else {
		let sides = randomTriangleSides();
		let sorted = [...sides].sort((p, q) => p - q);
		while (sorted[0] ** 2 + sorted[1] ** 2 === sorted[2] ** 2) {
			sides = randomTriangleSides();
			sorted = [...sides].sort((p, q) => p - q);
		}
		[a, b, c] = sides;
	}
	const svg = svgTriangleSSS(a, b, c, { labelA: `${a} cm`, labelB: `${b} cm`, labelC: `${c} cm` });
	return { atomId: 'geometrie__pythagoras_umkehrung', prompt: `Ist das Dreieck mit den Seiten ${a} cm, ${b} cm und ${c} cm rechtwinklig?`, answerType: 'boolean', correctAnswer: isRight ? 'ja' : 'nein', svg, hint: `Prüfe: Summe der Quadrate der beiden kürzeren Seiten = Quadrat der längsten Seite?`, why: (([x, y, z]) => `Kürzere Seiten: ${x}² + ${y}² = ${x * x + y * y}. Längste Seite: ${z}² = ${z * z}. ${x * x + y * y === z * z ? 'Beides ist gleich → rechtwinklig.' : 'Die Werte sind verschieden → nicht rechtwinklig.'}`)([a, b, c].sort((s1, s2) => s1 - s2)), difficulty: 0.5 };
});

reg('geometrie__hoehensatz_kathetensatz', (stage = 0) => {
	const type = Math.min(stage, 1);
	const p = rand(2, 9), q = rand(2, 9);
	const c = p + q;
	const h = Math.sqrt(p * q);
	const a = Math.sqrt(q * c), b = Math.sqrt(p * c);
	const A: Pt = [0, 0], B: Pt = [c, 0], H: Pt = [p, 0], C: Pt = [p, h];
	const common = {
		rightAngleVertices: [2],
		rightAngleFeet: [{ at: H, ref1: C, ref2: B }],
		extraSegments: [{ from: C, to: H, dash: true, color: '#9ca3af' }]
	};
	if (type === 0) {
		const svg = svgPolyDiagram([A, B, C], {
			...common,
			extraPoints: [
				{ at: [p / 2, 0], label: `p = ${p} cm`, pos: 'below' },
				{ at: [p + q / 2, 0], label: `q = ${q} cm`, pos: 'below' },
				{ at: [p, h / 2], label: '?', pos: 'right' }
			]
		});
		return { atomId: 'geometrie__hoehensatz_kathetensatz', prompt: `Berechne die Höhe h mithilfe des Höhensatzes (runde auf zwei Nachkommastellen).`, answerType: 'number', correctAnswer: dec(round(h, 2)), tolerance: 0.01, svg, hint: `Höhensatz: h² = p · q = ${p} · ${q}`, why: `h² = p · q = ${p} · ${q} = ${p * q}, also h = √${p * q} ${Number.isInteger(h) ? '=' : '≈'} ${dec(round(h, 2))} cm.`, difficulty: 0.6 };
	}
	const hideA = rand(0, 1) === 0;
	const svg = svgPolyDiagram([A, B, C], {
		...common,
		edgeLabels: [
			{ from: 1, to: 2, text: hideA ? '?' : `a ≈ ${dec(round(a, 2))} cm` },
			{ from: 2, to: 0, text: hideA ? `b ≈ ${dec(round(b, 2))} cm` : '?' }
		],
		extraPoints: [
			{ at: [p / 2, 0], label: `p = ${p} cm`, pos: 'below' },
			{ at: [p + q / 2, 0], label: `q = ${q} cm`, pos: 'below' }
		]
	});
	return {
		atomId: 'geometrie__hoehensatz_kathetensatz',
		prompt: `Berechne die fehlende Kathete mithilfe des Kathetensatzes (runde auf zwei Nachkommastellen).`,
		answerType: 'number',
		correctAnswer: dec(round(hideA ? a : b, 2)),
		tolerance: 0.01,
		svg,
		hint: `Kathetensatz: ${hideA ? 'a² = q · c' : 'b² = p · c'} = ${hideA ? `${q} · ${c}` : `${p} · ${c}`}`,
		why: `c = p + q = ${c} cm. ${hideA ? `a² = q · c = ${q} · ${c} = ${q * c}` : `b² = p · c = ${p} · ${c} = ${p * c}`}; Wurzel ziehen: ≈ ${dec(round(hideA ? a : b, 2))} cm.`, difficulty: 0.65
	};
});

// ── 28. Geometrie: Trigonometrie ──────────────────────────────────────────────

reg('geometrie__sin_cos_tan_definition', (stage = 0) => {
	const type = Math.min(stage, 1);
	const [a, b, c] = pick(PYTHAG_TRIPLES);
	const atB = rand(0, 1) === 0;
	const svg = svgRightTriangle(a, b, {
		labelA: `${a} cm`, labelB: `${b} cm`, labelC: `${c} cm`,
		angleLabel: 'α', angleAt: atB ? 'B' : 'A'
	});
	const gegen = atB ? b : a, anka = atB ? a : b;
	if (type === 0) {
		const which = pick(['Gegenkathete', 'Ankathete', 'Hypotenuse'] as const);
		const correct = which === 'Gegenkathete' ? `${gegen} cm` : which === 'Ankathete' ? `${anka} cm` : `${c} cm`;
		return {
			atomId: 'geometrie__sin_cos_tan_definition',
			prompt: `Welche Seite ist die ${which} zum Winkel α?`,
			answerType: 'text',
			correctAnswer: correct,
			choices: [`${a} cm`, `${b} cm`, `${c} cm`],
			svg,
			hint: which === 'Hypotenuse' ? 'Die Hypotenuse liegt immer gegenüber dem rechten Winkel.' : 'Gegenkathete = gegenüber α, Ankathete = anliegend an α (nicht die Hypotenuse).',
			why: which === 'Hypotenuse' ? `Die Hypotenuse liegt dem rechten Winkel gegenüber und ist die längste Seite: ${c} cm.` : which === 'Gegenkathete' ? `Die Gegenkathete liegt α gegenüber – sie berührt den Winkel nicht: ${gegen} cm.` : `Die Ankathete liegt an α an und ist nicht die Hypotenuse: ${anka} cm.`, difficulty: 0.45
		};
	}
	const fn = pick(['sin', 'cos', 'tan'] as const);
	const [num, den] = fn === 'sin' ? [gegen, c] : fn === 'cos' ? [anka, c] : [gegen, anka];
	return {
		atomId: 'geometrie__sin_cos_tan_definition',
		prompt: `Wie lautet ${fn}(α) als gekürzter Bruch der Seitenlängen?`,
		answerType: 'fraction',
		correctAnswer: frac(num, den),
		svg,
		hint: fn === 'sin' ? 'sin = Gegenkathete/Hypotenuse' : fn === 'cos' ? 'cos = Ankathete/Hypotenuse' : 'tan = Gegenkathete/Ankathete',
		why: `${fn === 'sin' ? 'sin = Gegenkathete : Hypotenuse' : fn === 'cos' ? 'cos = Ankathete : Hypotenuse' : 'tan = Gegenkathete : Ankathete'} = ${num} : ${den}${gcd(num, den) > 1 ? `, gekürzt ${fr(num, den)}` : ''}.`, difficulty: 0.55
	};
});

reg('geometrie__trigonometrie_seiten_berechnen', () => {
	const alphaDeg = pick([25, 30, 35, 40, 50, 55, 60, 65]);
	const alpha = alphaDeg * Math.PI / 180;
	const kinds = ['ankathete', 'gegenkathete', 'hypotenuse'] as const;
	const given = pick([...kinds]);
	const ask = pick(kinds.filter(x => x !== given));
	const k = rand(5, 20);
	let legA: number, legB: number, hyp: number;
	if (given === 'ankathete') { legA = k; legB = k * Math.tan(alpha); hyp = k / Math.cos(alpha); }
	else if (given === 'gegenkathete') { legB = k; legA = k / Math.tan(alpha); hyp = k / Math.sin(alpha); }
	else { hyp = k; legA = k * Math.cos(alpha); legB = k * Math.sin(alpha); }
	const val = (kind: typeof given) => kind === 'ankathete' ? legA : kind === 'gegenkathete' ? legB : hyp;
	const labelFor = (kind: typeof given) => kind === given ? `${dec(round(val(kind), 1))} cm` : kind === ask ? '?' : '';
	const svg = svgRightTriangle(legA, legB, {
		labelA: labelFor('ankathete'), labelB: labelFor('gegenkathete'), labelC: labelFor('hypotenuse'),
		angleLabel: `α = ${alphaDeg}°`, angleAt: 'B'
	});
	const names = { ankathete: 'Ankathete', gegenkathete: 'Gegenkathete', hypotenuse: 'Hypotenuse' };
	return {
		atomId: 'geometrie__trigonometrie_seiten_berechnen',
		prompt: `Berechne die ${names[ask]} (α = ${alphaDeg}°; runde auf eine Nachkommastelle).`,
		answerType: 'number',
		correctAnswer: dec(round(val(ask), 1)),
		tolerance: 0.1,
		svg,
		hint: `Nutze sin/cos/tan mit α = ${alphaDeg}° und der gegebenen Seite.`,
		why: trigSideWhy(ask, given, alphaDeg, dec(round(val(given), 1)), dec(round(val(ask), 1))), difficulty: 0.6
	};
});

reg('geometrie__trigonometrie_winkel_berechnen', () => {
	const [a, b, c] = pick(PYTHAG_TRIPLES);
	const atB = rand(0, 1) === 0;
	const gegen = atB ? b : a, anka = atB ? a : b;
	const pair = pick(['ga', 'gh', 'ah'] as const);
	const rad2deg = (r: number) => r * 180 / Math.PI;
	let labelGegen: string, labelAnka: string, labelHyp: string, hintText: string, correct: number, fnName: string;
	if (pair === 'ga') {
		labelGegen = `${gegen} cm`; labelAnka = `${anka} cm`; labelHyp = '';
		correct = rad2deg(Math.atan(gegen / anka));
		hintText = `tan(α) = Gegenkathete / Ankathete = ${gegen}/${anka}`;
		fnName = 'tan';
	} else if (pair === 'gh') {
		labelGegen = `${gegen} cm`; labelAnka = ''; labelHyp = `${c} cm`;
		correct = rad2deg(Math.asin(gegen / c));
		hintText = `sin(α) = Gegenkathete / Hypotenuse = ${gegen}/${c}`;
		fnName = 'sin';
	} else {
		labelGegen = ''; labelAnka = `${anka} cm`; labelHyp = `${c} cm`;
		correct = rad2deg(Math.acos(anka / c));
		hintText = `cos(α) = Ankathete / Hypotenuse = ${anka}/${c}`;
		fnName = 'cos';
	}
	const labelA = atB ? labelAnka : labelGegen;
	const labelB = atB ? labelGegen : labelAnka;
	const svg = svgRightTriangle(a, b, { labelA, labelB, labelC: labelHyp, angleLabel: '?', angleAt: atB ? 'B' : 'A' });
	return {
		atomId: 'geometrie__trigonometrie_winkel_berechnen',
		prompt: `Berechne den Winkel α (runde auf eine Nachkommastelle).`,
		answerType: 'number',
		correctAnswer: dec(round(correct, 1)),
		tolerance: 0.1,
		svg,
		hint: `${hintText} → α = ${fnName}⁻¹(...)`,
		why: `${hintText}. Die Umkehrfunktion ${fnName}⁻¹ liefert den Winkel: α ≈ ${dec(round(correct, 1))}°.`, difficulty: 0.65
	};
});

reg('geometrie__sinussatz', () => {
	const Adeg = rand(35, 75);
	const remaining = 180 - Adeg;
	const Bdeg = rand(25, remaining - 25);
	const Cdeg = 180 - Adeg - Bdeg;
	const a = rand(6, 16);
	const k = a / Math.sin(Adeg * Math.PI / 180);
	const b = k * Math.sin(Bdeg * Math.PI / 180);
	const c = k * Math.sin(Cdeg * Math.PI / 180);
	const askC = rand(0, 1) === 0;
	const svg = svgTriangleSSS(a, b, c, {
		labelA: `a = ${a} cm`,
		labelB: askC ? `${dec(round(b, 1))} cm` : '?',
		labelC: askC ? '?' : `${dec(round(c, 1))} cm`,
		angleA: `${Adeg}°`, angleB: `${Bdeg}°`
	});
	const target = askC ? c : b;
	const targetName = askC ? 'c' : 'b';
	return {
		atomId: 'geometrie__sinussatz',
		prompt: `Berechne die Seite ${targetName} mit dem Sinussatz (α = ${Adeg}°, β = ${Bdeg}°, a = ${a} cm; runde auf eine Nachkommastelle).`,
		answerType: 'number',
		correctAnswer: dec(round(target, 1)),
		tolerance: 0.1,
		svg,
		hint: `Sinussatz: a/sin(α) = ${targetName}/sin(${askC ? 'γ' : 'β'}) mit γ = 180° − α − β = ${Cdeg}°`,
		why: `Erst γ = 180° − ${Adeg}° − ${Bdeg}° = ${Cdeg}°. Seite : sin(Gegenwinkel) ist im Dreieck überall gleich: ${targetName} = ${a} · sin(${askC ? Cdeg : Bdeg}°) : sin(${Adeg}°) ≈ ${dec(round(target, 1))} cm.`, difficulty: 0.65
	};
});

reg('geometrie__kosinussatz', (stage = 0) => {
	const type = Math.min(stage, 1);
	if (type === 0) {
		const b = rand(6, 14), c = rand(6, 14);
		const Adeg = rand(40, 110);
		const Arad = Adeg * Math.PI / 180;
		const a = Math.sqrt(b * b + c * c - 2 * b * c * Math.cos(Arad));
		const svg = svgTriangleSSS(a, b, c, { labelB: `b = ${b} cm`, labelC: `c = ${c} cm`, labelA: '?', angleA: `${Adeg}°` });
		return { atomId: 'geometrie__kosinussatz', prompt: `Berechne die Seite a mit dem Kosinussatz (b = ${b} cm, c = ${c} cm, α = ${Adeg}°; runde auf eine Nachkommastelle).`, answerType: 'number', correctAnswer: dec(round(a, 1)), tolerance: 0.1, svg, hint: `a² = b² + c² − 2bc·cos(α)`, why: `a² = ${b}² + ${c}² − 2 · ${b} · ${c} · cos(${Adeg}°) ≈ ${dec(round(a * a, 1))}, also a ≈ ${dec(round(a, 1))} cm. Der letzte Term korrigiert den Pythagoras für Winkel ≠ 90°.`, difficulty: 0.65 };
	}
	const b = rand(6, 12), c = rand(6, 12);
	const Adeg = rand(35, 110);
	const Arad = Adeg * Math.PI / 180;
	const a = Math.sqrt(b * b + c * c - 2 * b * c * Math.cos(Arad));
	// The student only sees a rounded to one decimal — compute α from exactly that value,
	// otherwise a correct calculation would be marked wrong.
	const aShown = round(a, 1);
	const alpha = Math.acos((b * b + c * c - aShown * aShown) / (2 * b * c)) * 180 / Math.PI;
	const svg = svgTriangleSSS(a, b, c, { labelA: `a = ${dec(aShown)} cm`, labelB: `b = ${b} cm`, labelC: `c = ${c} cm`, angleA: '?' });
	return { atomId: 'geometrie__kosinussatz', prompt: `Berechne den Winkel α mit dem Kosinussatz (a = ${dec(aShown)} cm, b = ${b} cm, c = ${c} cm; runde auf eine Nachkommastelle).`, answerType: 'number', correctAnswer: dec(round(alpha, 1)), tolerance: 0.1, svg, hint: `cos(α) = (b² + c² − a²) / (2bc)`, why: `Kosinussatz nach cos(α) umgestellt: cos(α) = (${b}² + ${c}² − ${dec(aShown)}²) : (2 · ${b} · ${c}) ≈ ${dec(round(Math.cos(alpha * Math.PI / 180), 3))}, also α ≈ ${dec(round(alpha, 1))}°.`, difficulty: 0.7 };
});

// ── 29. Geometrie: Ähnlichkeit ────────────────────────────────────────────────

reg('geometrie__strahlensaetze', () => {
	const a = rand(2, 6), k = rand(2, 4), b = rand(3, 10);
	const c = a * k, d = b * k;
	const hideIdx = rand(0, 3);
	const vals = { a, b, c, d };
	const labels = {
		a: hideIdx === 0 ? '?' : `${a} cm`,
		b: hideIdx === 1 ? '?' : `${b} cm`,
		c: hideIdx === 2 ? '?' : `${c} cm`,
		d: hideIdx === 3 ? '?' : `${d} cm`
	};
	const svg = svgStrahlensatz(a, b, c, d, labels);
	const targetKey = (['a', 'b', 'c', 'd'] as const)[hideIdx];
	const target = vals[targetKey];
	return {
		atomId: 'geometrie__strahlensaetze',
		prompt: `Zwei parallele Geraden schneiden die Strahlen von Z. Berechne die fehlende Streckenlänge (${targetKey}).`,
		answerType: 'number',
		correctAnswer: String(target),
		svg,
		hint: `1. Strahlensatz: a : b = c : d`,
		why: `Die Parallelen erzeugen ähnliche Dreiecke: c ist das ${k}-Fache von a, also ist auch d das ${k}-Fache von b. ${a} · ${k} = ${c} und ${b} · ${k} = ${d}.`, difficulty: 0.6
	};
});

reg('geometrie__zentrische_streckung_aehnlichkeit', (stage = 0) => {
	const type = Math.min(stage, 1);
	const s = rand(3, 12);
	const k = pick([0.5, 1.5, 2, 2.5]);
	const image = round(s * k, 2);
	if (type === 0) {
		const svg = svgDilation(k, { orig: `${s} cm`, image: '?' });
		return { atomId: 'geometrie__zentrische_streckung_aehnlichkeit', prompt: `Eine Strecke von ${s} cm wird mit dem Streckfaktor k = ${dec(k)} zentrisch gestreckt. Wie lang ist die Bildstrecke?`, answerType: 'number', correctAnswer: dec(image), svg, hint: `Bildlänge = Originallänge · k`, why: `Bei einer Streckung wird jede Länge mit k multipliziert: ${s} · ${dec(k)} = ${dec(image)} cm.${k < 1 ? ' (k < 1 verkleinert.)' : ''}`, difficulty: 0.45 };
	}
	const svg = svgDilation(k, { orig: `${s} cm`, image: `${dec(image)} cm` });
	return { atomId: 'geometrie__zentrische_streckung_aehnlichkeit', prompt: `Eine Strecke von ${s} cm wird zu einer Bildstrecke von ${dec(image)} cm zentrisch gestreckt. Wie groß ist der Streckfaktor k?`, answerType: 'number', correctAnswer: dec(k), svg, hint: `k = Bildlänge : Originallänge`, why: `k = Bildlänge : Originallänge = ${dec(image)} : ${s} = ${dec(k)}.`, difficulty: 0.5 };
});

// ── 30. Geometrie: Winkel, Koordinatensystem ──────────────────────────────────

reg('geometrie__neben_scheitelwinkel', (stage = 0) => {
	// Expanding sequence on the arithmetic load: Zehnerwinkel → Fünferwinkel → beliebige Gradzahlen.
	const theta = randStep(25, 80, stageStep(stage));
	const values = [theta, 180 - theta, theta, 180 - theta];
	const knownIdx = rand(0, 3);
	const askScheitel = rand(0, 1) === 0;
	const askIdx = askScheitel ? (knownIdx + 2) % 4 : (knownIdx + 1) % 4;
	const labels: [string, string, string, string] = ['', '', '', ''];
	labels[knownIdx] = `${values[knownIdx]}°`;
	labels[askIdx] = '?';
	const svg = svgVerticalAngles(theta, labels);
	return {
		atomId: 'geometrie__neben_scheitelwinkel',
		prompt: askScheitel ? `Wie groß ist der Scheitelwinkel zum markierten Winkel (${values[knownIdx]}°)?` : `Wie groß ist der Nebenwinkel zum markierten Winkel (${values[knownIdx]}°)?`,
		answerType: 'integer',
		correctAnswer: String(values[askIdx]),
		svg,
		hint: askScheitel ? 'Scheitelwinkel sind gleich groß.' : 'Nebenwinkel ergänzen sich zu 180°.',
		why: askScheitel ? `Scheitelwinkel liegen sich an der Kreuzung gegenüber und sind immer gleich groß: ${values[askIdx]}°.` : `Nebenwinkel bilden zusammen eine gerade Linie (180°): 180° − ${values[knownIdx]}° = ${values[askIdx]}°.`, difficulty: 0.35
	};
});

reg('geometrie__stufen_wechselwinkel', () => {
	const theta = rand(25, 80);
	const value = (i: number) => i % 2 === 0 ? theta : 180 - theta;
	const isStufen = rand(0, 1) === 0;
	const idx1 = rand(0, 3);
	const idx2 = isStufen ? idx1 : (idx1 + 2) % 4;
	const z1: [string, string, string, string] = ['', '', '', ''];
	const z2: [string, string, string, string] = ['', '', '', ''];
	z1[idx1] = `${value(idx1)}°`;
	z2[idx2] = '?';
	const svg = svgParallelsTransversal(theta, z1, z2);
	return {
		atomId: 'geometrie__stufen_wechselwinkel',
		prompt: `Die beiden Geraden sind parallel. Wie groß ist der markierte ${isStufen ? 'Stufenwinkel' : 'Wechselwinkel'} (?)?`,
		answerType: 'integer',
		correctAnswer: String(value(idx2)),
		svg,
		hint: isStufen ? 'Stufenwinkel an Parallelen sind gleich groß.' : 'Wechselwinkel an Parallelen sind gleich groß.',
		why: `${isStufen ? 'Stufenwinkel liegen an beiden Parallelen an derselben Stelle (wie verschoben)' : 'Wechselwinkel liegen zwischen den Parallelen auf verschiedenen Seiten der schneidenden Geraden (wie in einem Z)'} und sind gleich groß: ${value(idx2)}°.`, difficulty: 0.45
	};
});

reg('geometrie__innenwinkelsatz_dreieck', (stage = 0) => {
	const atomId = 'geometrie__innenwinkelsatz_dreieck';
	// Expanding sequence: the theorem stays the same, only the arithmetic load grows, so the
	// focus stays on "α + β + γ = 180°" instead of on subtracting awkward numbers.
	// 0: Zehnerwinkel, γ gesucht · 1: Fünferwinkel, beliebiger Winkel gesucht · 2+: beliebige Gradzahlen.
	const step = stageStep(stage);
	const Adeg = randStep(40, 90, step);
	const Bdeg = randStep(30, 150 - Adeg, step);
	const Cdeg = 180 - Adeg - Bdeg;
	const a = 10;
	const k = a / Math.sin(Adeg * Math.PI / 180);
	const b = k * Math.sin(Bdeg * Math.PI / 180);
	const c = k * Math.sin(Cdeg * Math.PI / 180);
	const angles = [Adeg, Bdeg, Cdeg];
	const names = ['α', 'β', 'γ'];
	const missing = stage === 0 ? 2 : rand(0, 2);
	const label = (i: number) => (i === missing ? '?' : `${angles[i]}°`);
	const svg = svgTriangleSSS(a, b, c, { angleA: label(0), angleB: label(1), angleC: label(2) });
	const known = [0, 1, 2].filter((i) => i !== missing);
	const [k1, k2] = known.map((i) => angles[i]);
	return {
		atomId,
		prompt: `Berechne den fehlenden Winkel ${names[missing]} im Dreieck.`,
		answerType: 'integer',
		correctAnswer: String(angles[missing]),
		svg,
		hint: `Innenwinkelsumme: α + β + γ = 180° → ${names[missing]} = 180° − ${k1}° − ${k2}°`,
		why: `Die drei Innenwinkel ergeben zusammen 180°: ${names[missing]} = 180° − ${k1}° − ${k2}° = ${angles[missing]}°.`,
		difficulty: [0.25, 0.35, 0.45][Math.min(stage, 2)]
	};
});

reg('geometrie__winkel_zeichnen_messen', (stage = 0) => {
	const atomId = 'geometrie__winkel_zeichnen_messen';
	const type = Math.min(stage, 1);
	const names = { spitz: 'spitzer Winkel', recht: 'rechter Winkel', stumpf: 'stumpfer Winkel', gestreckt: 'gestreckter Winkel', ueber: 'überstumpfer Winkel' };
	const degFor = (kind: keyof typeof names) =>
		kind === 'spitz' ? rand(2, 17) * 5 : kind === 'recht' ? 90 : kind === 'stumpf' ? rand(19, 35) * 5 : kind === 'gestreckt' ? 180 : rand(37, 71) * 5;
	// Expanding sequence: Winkelart am Bild erkennen → Winkelart aus der Gradzahl (auch überstumpf).
	if (type === 0) {
		const kind = pick(['spitz', 'spitz', 'recht', 'stumpf', 'stumpf', 'gestreckt'] as const);
		return {
			atomId,
			prompt: `Welche Winkelart ist das?`,
			answerType: 'text',
			correctAnswer: names[kind],
			choices: [names.spitz, names.recht, names.stumpf, names.gestreckt],
			svg: svgSimpleAngle(degFor(kind)),
			hint: 'spitz < 90° < stumpf < 180°; genau 90° = rechter Winkel, genau 180° = gestreckter Winkel',
			why: ({ spitz: 'Der Winkel ist kleiner als ein rechter Winkel (unter 90°) → spitz.', recht: 'Die Schenkel stehen senkrecht aufeinander – genau 90°.', stumpf: 'Der Winkel ist größer als ein rechter Winkel, aber noch keine gerade Linie (zwischen 90° und 180°) → stumpf.', gestreckt: 'Die Schenkel bilden eine gerade Linie – genau 180°.' })[kind], difficulty: 0.3
		};
	}
	const kind = pick(['spitz', 'recht', 'stumpf', 'stumpf', 'gestreckt', 'ueber', 'ueber'] as const);
	const deg = degFor(kind);
	return {
		atomId,
		prompt: `Ein Winkel hat ${deg}°. Welche Winkelart ist das?`,
		answerType: 'text',
		correctAnswer: names[kind],
		choices: [names.spitz, names.recht, names.stumpf, names.gestreckt, names.ueber],
		svg: deg <= 180 ? svgSimpleAngle(deg) : undefined,
		hint: 'überstumpf: zwischen 180° und 360°',
		why: `${deg}° ${kind === 'spitz' ? 'liegt unter 90° → spitz' : kind === 'recht' ? 'ist genau 90° → rechter Winkel' : kind === 'stumpf' ? 'liegt zwischen 90° und 180° → stumpf' : kind === 'gestreckt' ? 'ist genau 180° → gestreckter Winkel' : 'liegt zwischen 180° und 360° → überstumpf'}.`, difficulty: 0.35
	};
});

reg('geometrie__koordinatensystem', (stage = 0) => {
	const allowNeg = Math.min(stage, 1) === 1;
	const range = 6;
	const x = allowNeg ? rand(-6, 6) : rand(0, 6);
	const y = allowNeg ? rand(-6, 6) : rand(0, 6);
	const askX = rand(0, 1) === 0;
	const svg = svgCoordPoints([{ x, y, label: 'P' }], range);
	return {
		atomId: 'geometrie__koordinatensystem',
		prompt: `Welche ${askX ? 'x' : 'y'}-Koordinate hat der Punkt P?`,
		answerType: 'integer',
		correctAnswer: String(askX ? x : y),
		svg,
		hint: 'Erst die x-Koordinate (waagerecht), dann die y-Koordinate (senkrecht) ablesen.',
		why: askX ? `Die x-Koordinate liest du waagerecht ab: von P senkrecht zur x-Achse gehen → ${x}.${x < 0 ? ' Links von der y-Achse sind die x-Werte negativ.' : ''}` : `Die y-Koordinate liest du senkrecht ab: von P waagerecht zur y-Achse gehen → ${y}.${y < 0 ? ' Unterhalb der x-Achse sind die y-Werte negativ.' : ''}`, difficulty: allowNeg ? 0.4 : 0.3
	};
});

// ── 31. Geometrie: Begriffe, Sätze, Klassifikation ────────────────────────────

reg('geometrie__kongruenzsaetze', (stage = 0) => {
	const atomId = 'geometrie__kongruenzsaetze';
	// Fixed sketch with a > c > b: a = BC, b = CA, c = AB; α at A, β at B, γ at C.
	const tri: Pt[] = [[0, 0], [8, 0], [2.5, 6]];
	const NONE = 'kein Kongruenzsatz';
	const valid: [string[], string][] = [
		[['a', 'b', 'c'], 'SSS'],
		[['a', 'b', 'γ'], 'SWS'], [['b', 'c', 'α'], 'SWS'], [['a', 'c', 'β'], 'SWS'],
		[['c', 'α', 'β'], 'WSW'], [['a', 'β', 'γ'], 'WSW'], [['b', 'α', 'γ'], 'WSW'],
		// SsW: the angle lies opposite the longer of the two sides
		[['a', 'b', 'α'], 'SsW'], [['a', 'c', 'α'], 'SsW'], [['b', 'c', 'γ'], 'SsW']
	];
	// Not sufficient: three angles, or the angle opposite the shorter side
	const insufficient: [string[], string][] = [
		[['α', 'β', 'γ'], NONE], [['a', 'b', 'β'], NONE], [['a', 'c', 'γ'], NONE], [['b', 'c', 'β'], NONE]
	];
	// Expanding sequence: passenden Kongruenzsatz zuordnen → auch erkennen, wenn keiner passt.
	const withNone = Math.min(stage, 1) === 1;
	const [given, answer] = withNone && rand(0, 2) === 0 ? pick(insufficient) : pick(valid);
	const edgeOf: Record<string, { from: number; to: number }> = { a: { from: 1, to: 2 }, b: { from: 2, to: 0 }, c: { from: 0, to: 1 } };
	const angleOf: Record<string, number> = { α: 0, β: 1, γ: 2 };
	const edgeLabels = given.filter(g => g in edgeOf).map(g => ({ ...edgeOf[g], text: g }));
	const angleLabels = given.filter(g => g in angleOf).map(g => ({ at: angleOf[g], text: g, useArc: true }));
	const choices = ['SSS', 'SWS', 'WSW', 'SsW'];
	return {
		atomId,
		prompt: `Von einem Dreieck mit a > c > b sind gegeben: ${given.join(', ')}. Welcher Kongruenzsatz garantiert, dass es dadurch eindeutig festgelegt ist?`,
		answerType: 'text',
		correctAnswer: answer,
		choices: withNone ? [...choices, NONE] : choices,
		svg: svgPolyDiagram(tri, { edgeLabels, angleLabels }),
		hint: 'SSS = 3 Seiten, SWS = 2 Seiten + eingeschlossener Winkel, WSW = Seite + beide anliegenden Winkel, SsW = 2 Seiten + Gegenwinkel der längeren Seite. Drei Winkel allein legen nur die Form fest.',
		why: answer === 'SSS' ? 'Drei Seiten sind gegeben – damit liegt das Dreieck fest (SSS).' : answer === 'SWS' ? `Zwei Seiten und der Winkel, den sie einschließen: ${given[2]} liegt zwischen ${given[0]} und ${given[1]} → SWS.` : answer === 'WSW' ? `Eine Seite (${given[0]}) und die beiden Winkel, die an ihr anliegen → WSW.` : answer === 'SsW' ? `Zwei Seiten und der Winkel, der der längeren von beiden gegenüberliegt (${given[2]}) → SsW.` : given.every(g => g in angleOf) ? 'Drei Winkel legen nur die Form fest, nicht die Größe – es gibt beliebig viele ähnliche Dreiecke.' : `Der Winkel ${given[2]} liegt der kürzeren der beiden Seiten gegenüber – dann können zwei verschiedene Dreiecke entstehen.`, difficulty: withNone ? 0.6 : 0.5
	};
});

reg('geometrie__kreissaetze', (stage = 0) => {
	// Expanding sequence: one theorem per stage (Thales → Peripheriewinkel → Zentriwinkel →
	// Sehnenviereck), earlier theorems stay in the mix; afterwards all four mixed.
	// Angles are multiples of 10 at first, of 5 from stage 2, arbitrary from stage 4.
	const type = stageVariant(stage, 4);
	const step = stageStep(stage, [10, 10, 5, 5, 1]);
	if (type === 0) {
		const cDeg = pick([30, 50, 70, 110, 130, 150, 210, 230, 250, 290, 310, 330]);
		const svg = svgCircleInscribed([{ deg: 180, label: 'A' }, { deg: 0, label: 'B' }, { deg: cDeg, label: 'C' }], [[0, 1], [0, 2], [1, 2]]);
		return {
			atomId: 'geometrie__kreissaetze',
			prompt: `AB ist ein Durchmesser des Kreises. Wie groß ist der Winkel bei C (Satz des Thales)?`,
			answerType: 'integer',
			correctAnswer: '90',
			svg,
			hint: 'Satz des Thales: Der Winkel im Halbkreis ist immer 90°.',
			why: 'Jeder Winkel über einem Durchmesser, dessen Scheitel auf dem Kreis liegt, ist ein rechter Winkel – egal wo C liegt.', difficulty: 0.4
		};
	}
	if (type === 1) {
		const cDeg = pick([20, 50, 80]), dDeg = pick([110, 140, 160]);
		const svg = svgCircleInscribed(
			[{ deg: 200, label: 'A' }, { deg: 340, label: 'B' }, { deg: cDeg, label: 'C' }, { deg: dDeg, label: 'D' }],
			[[0, 1], [0, 2], [1, 2], [0, 3], [1, 3]]
		);
		const angle = randStep(30, 70, step);
		return {
			atomId: 'geometrie__kreissaetze',
			prompt: `C und D liegen auf demselben Kreisbogen über der Sehne AB. Der Winkel ACB beträgt ${angle}°. Wie groß ist der Winkel ADB (Peripheriewinkelsatz)?`,
			answerType: 'integer',
			correctAnswer: String(angle),
			svg,
			hint: 'Peripheriewinkel über derselben Sehne (auf derselben Seite) sind gleich groß.',
			why: `Alle Peripheriewinkel über derselben Sehne (auf derselben Seite) sind gleich groß – also ebenfalls ${angle}°.`, difficulty: 0.5
		};
	}
	if (type === 2) {
		const svg = svgCircleInscribed(
			[{ deg: 140, label: 'A' }, { deg: 40, label: 'B' }, { deg: 260, label: 'C' }],
			[[0, 2], [1, 2]],
			{ showCenter: true, centerConnections: [0, 1] }
		);
		const giveCentral = rand(0, 1) === 0;
		const peripheral = randStep(20, 70, step);
		const central = peripheral * 2;
		return {
			atomId: 'geometrie__kreissaetze',
			prompt: giveCentral
				? `Der Zentriwinkel AMB beträgt ${central}°. Wie groß ist der Peripheriewinkel ACB (Zentriwinkelsatz)?`
				: `Der Peripheriewinkel ACB beträgt ${peripheral}°. Wie groß ist der Zentriwinkel AMB (Zentriwinkelsatz)?`,
			answerType: 'integer',
			correctAnswer: giveCentral ? String(peripheral) : String(central),
			svg,
			hint: 'Zentriwinkelsatz: Der Mittelpunktswinkel ist doppelt so groß wie der Peripheriewinkel über demselben Bogen.',
			why: `Der Zentriwinkel ist doppelt so groß wie der Peripheriewinkel über demselben Bogen: ${giveCentral ? `${central}° : 2 = ${peripheral}°` : `2 · ${peripheral}° = ${central}°`}.`, difficulty: 0.55
		};
	}
	const svg = svgCircleInscribed(
		[{ deg: 100, label: 'A' }, { deg: 20, label: 'B' }, { deg: -60, label: 'C' }, { deg: 200, label: 'D' }],
		[[0, 1], [1, 2], [2, 3], [3, 0]]
	);
	const angleA = randStep(60, 120, step);
	return {
		atomId: 'geometrie__kreissaetze',
		prompt: `ABCD ist ein Sehnenviereck. Der Winkel bei A beträgt ${angleA}°. Wie groß ist der gegenüberliegende Winkel bei C?`,
		answerType: 'integer',
		correctAnswer: String(180 - angleA),
		svg,
		hint: 'Im Sehnenviereck ergänzen sich gegenüberliegende Winkel zu 180°.',
		why: `Im Sehnenviereck ergänzen sich gegenüberliegende Winkel zu 180°: 180° − ${angleA}° = ${180 - angleA}°.`, difficulty: 0.5
	};
});

reg('geometrie__vierecke_systematisieren', () => {
	const names = ['Quadrat', 'Rechteck', 'Raute', 'Parallelogramm', 'Drachen', 'Trapez', 'Viereck'];
	const parents: Record<string, string[]> = {
		Quadrat: ['Rechteck', 'Raute'], Rechteck: ['Parallelogramm'], Raute: ['Parallelogramm', 'Drachen'],
		Parallelogramm: ['Trapez'], Drachen: ['Viereck'], Trapez: ['Viereck']
	};
	const ancestorsOf = (name: string): Set<string> => {
		const result = new Set<string>();
		const stack = [...(parents[name] ?? [])];
		while (stack.length) {
			const n = stack.pop()!;
			if (!result.has(n)) { result.add(n); stack.push(...(parents[n] ?? [])); }
		}
		return result;
	};
	const x = pick(names.filter(n => n !== 'Viereck'));
	// yes and no roughly balanced
	const supers = [...ancestorsOf(x)];
	const others = names.filter(n => n !== x && !supers.includes(n));
	const y = others.length === 0 || rand(0, 1) === 0 ? pick(supers) : pick(others);
	const isTrue = ancestorsOf(x).has(y);
	const article = x === 'Raute' ? 'jede' : x === 'Drachen' ? 'jeder' : 'jedes';
	const svg = svgViereckHaus([x, y]);
	return {
		atomId: 'geometrie__vierecke_systematisieren',
		prompt: `Ist ${article} ${x} automatisch auch ein${y === 'Raute' ? 'e' : ''} ${y}?`,
		answerType: 'boolean',
		correctAnswer: isTrue ? 'ja' : 'nein',
		svg,
		hint: 'Haus der Vierecke: Quadrat ⊂ Rechteck/Raute ⊂ Parallelogramm ⊂ Trapez ⊂ Viereck; Raute ⊂ Drachen ⊂ Viereck.',
		why: `${y} bedeutet: ${({ Quadrat: 'vier rechte Winkel und vier gleich lange Seiten', Rechteck: 'vier rechte Winkel', Raute: 'vier gleich lange Seiten', Parallelogramm: 'zwei Paare paralleler Seiten', Drachen: 'zwei Paare gleich langer Nachbarseiten', Trapez: 'mindestens ein Paar paralleler Seiten', Viereck: 'vier Ecken' } as Record<string, string>)[y]}. ${isTrue ? `Das erfüllt ${article} ${x}.` : `Das erfüllt nicht ${article} ${x}.`}`, difficulty: 0.45
	};
});

reg('geometrie__besondere_linien_dreieck', (stage = 0) => {
	const type = Math.min(stage, 1);
	if (type === 0) {
		const pairs = [
			{ line: 'Mittelsenkrechten', point: 'Umkreismittelpunkt', e: 'Jeder Punkt einer Mittelsenkrechten ist von zwei Ecken gleich weit entfernt – der Schnittpunkt also von allen drei.' },
			{ line: 'Winkelhalbierenden', point: 'Inkreismittelpunkt', e: 'Jeder Punkt einer Winkelhalbierenden ist von zwei Seiten gleich weit entfernt – der Schnittpunkt also von allen drei.' },
			{ line: 'Höhen', point: 'Höhenschnittpunkt', e: 'Die drei Höhen (Lote von den Ecken auf die Gegenseiten) treffen sich in einem Punkt.' },
			{ line: 'Seitenhalbierenden', point: 'Schwerpunkt', e: 'Jede Seitenhalbierende teilt das Dreieck in zwei gleich große Flächen – im Schnittpunkt ist es im Gleichgewicht.' }
		];
		const p = pick(pairs);
		const wrongPoints = pairs.filter(x => x.point !== p.point).map(x => x.point);
		if (rand(0, 1) === 0) {
			return {
				atomId: 'geometrie__besondere_linien_dreieck',
				prompt: `Welche Linien eines Dreiecks schneiden sich im ${p.point}?`,
				answerType: 'text',
				correctAnswer: p.line,
				choices: shuffled(pairs.map(x => x.line)),
				hint: 'Mittelsenkrechte→Umkreis, Winkelhalbierende→Inkreis, Höhe→Höhenschnittpunkt, Seitenhalbierende→Schwerpunkt.',
				why: `${p.line} → ${p.point}. ${p.e}`, difficulty: 0.4
			};
		}
		return {
			atomId: 'geometrie__besondere_linien_dreieck',
			prompt: `Wie heißt der Schnittpunkt der ${p.line} eines Dreiecks?`,
			answerType: 'text',
			correctAnswer: p.point,
			choices: [p.point, ...wrongPoints].sort(() => Math.random() - 0.5),
			hint: 'Mittelsenkrechte→Umkreis, Winkelhalbierende→Inkreis, Höhe→Höhenschnittpunkt, Seitenhalbierende→Schwerpunkt.',
			why: `${p.line} → ${p.point}. ${p.e}`, difficulty: 0.4
		};
	}
	const sLen = 3 * rand(2, 8);
	const dist = sLen * 2 / 3;
	const svg = svgTriangleCevians();
	return {
		atomId: 'geometrie__besondere_linien_dreieck',
		prompt: `Der Schwerpunkt S teilt jede Seitenhalbierende im Verhältnis 2:1 (vom Eckpunkt aus gemessen). Eine Seitenhalbierende ist ${sLen} cm lang. Wie weit ist S vom Eckpunkt entfernt?`,
		answerType: 'number',
		correctAnswer: dec(dist),
		svg,
		hint: `Abstand = (2/3) · ${sLen} cm`,
		why: `Vom Eckpunkt aus sind es 2 von 3 Teilen: ${sLen} : 3 = ${sLen / 3}, mal 2 = ${dec(dist)} cm.`, difficulty: 0.5
	};
});

reg('geometrie__dreieck_konstruieren', () => {
	// No drawing on purpose: a sketch would give the answer away.
	const constructible = rand(0, 1) === 0;
	let sides: number[];
	if (constructible) {
		sides = randomTriangleSides();
	} else {
		// The longest side is at least as long as the other two together (including the
		// borderline case "exactly as long"); its position in the list is random.
		const x = rand(3, 9), y = rand(3, 9);
		sides = shuffled([x, y, x + y + rand(0, 5)]);
	}
	const [a, b, c] = sides;
	return {
		atomId: 'geometrie__dreieck_konstruieren',
		prompt: `Ist ein Dreieck mit den Seiten a = ${a} cm, b = ${b} cm, c = ${c} cm konstruierbar?`,
		answerType: 'boolean',
		correctAnswer: constructible ? 'ja' : 'nein',
		hint: 'Dreiecksungleichung: Die längste Seite muss kürzer sein als die beiden anderen zusammen.',
		why: (([x, y, z]) => `Die beiden kürzeren Seiten zusammen: ${x} + ${y} = ${x + y} cm. ${x + y > z ? `Das ist mehr als ${z} cm – die Seiten treffen sich zu einem Dreieck.` : `Das ist nicht mehr als ${z} cm – die kurzen Seiten erreichen einander nicht.`}`)([a, b, c].sort((s1, s2) => s1 - s2)), difficulty: 0.45
	};
});

// ── 32. Geometrie: Grundschule ─────────────────────────────────────────────────

reg('geometrie__lagebeziehungen_lineare_figuren', (stage = 0) => {
	const type = Math.min(stage, 1);
	const baseAngles = [0, 30, 45, 60, 90, 120, 135, 150];
	const deg1 = pick(baseAngles);
	const askParallel = type === 0;
	const yes = rand(0, 1) === 0;
	let deg2: number;
	if (askParallel) {
		deg2 = yes ? deg1 : (deg1 + pick([30, 45, 60, 90, 120])) % 180;
	} else {
		deg2 = yes ? (deg1 + 90) % 180 : (deg1 + pick([30, 45, 60, 120, 150])) % 180;
	}
	const svg = svgTwoSegments(deg1, deg2);
	return {
		atomId: 'geometrie__lagebeziehungen_lineare_figuren',
		prompt: `Sind die beiden Linien ${askParallel ? 'parallel zueinander' : 'senkrecht zueinander (bilden einen rechten Winkel)'}?`,
		answerType: 'boolean',
		correctAnswer: yes ? 'ja' : 'nein',
		svg,
		hint: askParallel ? 'Parallele Linien haben überall den gleichen Abstand und schneiden sich nie.' : 'Senkrechte Linien bilden einen rechten Winkel (90°).',
		why: askParallel ? (yes ? 'Die Linien haben überall denselben Abstand und würden sich nie schneiden → parallel.' : 'Die Linien laufen aufeinander zu – verlängert würden sie sich schneiden → nicht parallel.') : (yes ? 'Die Linien bilden einen rechten Winkel, wie die Ecke eines Blattes → senkrecht.' : 'Der Winkel zwischen den Linien ist kein rechter Winkel → nicht senkrecht.'), difficulty: 0.25
	};
});

reg('geometrie__ebene_figuren_grundschule', (stage = 0) => {
	const type = Math.min(stage, 1);
	const shapes = [
		{ kind: 'kreis' as const, name: 'Kreis', corners: 0, why: 'Rund und ohne Ecken → Kreis.' },
		{ kind: 'dreieck' as const, name: 'Dreieck', corners: 3, why: '3 Ecken und 3 Seiten → Dreieck.' },
		{ kind: 'viereck' as const, name: 'Viereck', corners: 4, why: '4 Ecken, aber weder rechte Winkel noch gleich lange Seiten → allgemeines Viereck.' },
		{ kind: 'rechteck' as const, name: 'Rechteck', corners: 4, why: '4 rechte Winkel, gegenüberliegende Seiten gleich lang → Rechteck.' },
		{ kind: 'quadrat' as const, name: 'Quadrat', corners: 4, why: '4 rechte Winkel und 4 gleich lange Seiten → Quadrat.' },
		{ kind: 'fuenfeck' as const, name: 'Fünfeck', corners: 5, why: '5 Ecken und 5 Seiten → Fünfeck.' }
	];
	const shape = pick(shapes);
	const svg = svgShape(shape.kind);
	if (type === 0) {
		// A square is also a rectangle and both are quadrilaterals — keep such "also correct"
		// names out of the wrong answers.
		const alsoTrue: Record<string, string[]> = { Quadrat: ['Rechteck', 'Viereck'], Rechteck: ['Viereck'] };
		const pool = [...shapes.map(s => s.name), 'Sechseck'].filter(n => n !== shape.name && !(alsoTrue[shape.name] ?? []).includes(n));
		const others = shuffled(pool).slice(0, 3);
		return {
			atomId: 'geometrie__ebene_figuren_grundschule',
			prompt: shape.kind === 'viereck' ? `Wie heißt diese Figur am genauesten?` : `Wie heißt diese Figur?`,
			answerType: 'text',
			correctAnswer: shape.name,
			choices: [shape.name, ...others].sort(() => Math.random() - 0.5),
			svg,
			why: shape.why, difficulty: 0.2
		};
	}
	return {
		atomId: 'geometrie__ebene_figuren_grundschule',
		prompt: `Wie viele Ecken hat diese Figur?`,
		answerType: 'integer',
		correctAnswer: String(shape.corners),
		svg,
		why: shape.corners === 0 ? 'Ein Kreis ist rund und hat keine Ecke.' : `Zähle die Ecken einmal reihum: ${shape.corners}.`, difficulty: 0.25
	};
});

reg('geometrie__koerper_und_netze_grundschule', (stage = 0) => {
	const type = Math.min(stage, 1);
	const bodies = [
		{ name: 'Würfel', svg: svgCuboid(5, 5, 5, {}), ecken: 8, flaechen: 6, kanten: 12, why: 'Sechs gleich große Quadrate als Flächen → Würfel.' },
		{ name: 'Quader', svg: svgCuboid(7, 4, 5, {}), ecken: 8, flaechen: 6, kanten: 12, why: 'Sechs Rechtecke als Flächen → Quader.' },
		{ name: 'Kugel', svg: svgSphere(5), ecken: 0, flaechen: 1, kanten: 0, why: 'Überall rund, ohne Ecken und Kanten → Kugel.' },
		{ name: 'Zylinder', svg: svgCylinder(4, 8, {}), ecken: 0, flaechen: 3, kanten: 2, why: 'Zwei Kreise als Boden und Deckel, dazwischen eine gewölbte Fläche → Zylinder.' },
		{ name: 'Kegel', svg: svgCone(4, 8, {}), ecken: 1, flaechen: 2, kanten: 1, why: 'Ein Kreis als Boden und eine Spitze → Kegel.' },
		{ name: 'Pyramide', svg: svgPyramid(6, 8, {}), ecken: 5, flaechen: 5, kanten: 8, why: 'Eckige Grundfläche und Dreiecke, die sich in einer Spitze treffen → Pyramide.' }
	];
	const body = pick(bodies);
	if (type === 0) {
		// a cube is also a cuboid — "Quader" must not be offered as a wrong answer for it
		const others = shuffled(bodies.filter(b => b.name !== body.name && !(body.name === 'Würfel' && b.name === 'Quader')).map(b => b.name)).slice(0, 3);
		return {
			atomId: 'geometrie__koerper_und_netze_grundschule',
			prompt: `Wie heißt dieser Körper?`,
			answerType: 'text',
			correctAnswer: body.name,
			choices: [body.name, ...others].sort(() => Math.random() - 0.5),
			svg: body.svg,
			why: body.why, difficulty: 0.2
		};
	}
	// Counting only for solids with flat faces — for cone, cylinder and sphere the counts of
	// "Ecken/Kanten/Flächen" depend on the convention used in class.
	const flat = pick(bodies.filter(b => ['Würfel', 'Quader', 'Pyramide'].includes(b.name)));
	const feature = pick(['ecken', 'flaechen', 'kanten'] as const);
	const featureName = feature === 'ecken' ? 'Ecken' : feature === 'flaechen' ? 'Flächen' : 'Kanten';
	const label = flat.name === 'Pyramide' ? 'eine quadratische Pyramide' : `ein ${flat.name}`;
	return {
		atomId: 'geometrie__koerper_und_netze_grundschule',
		prompt: `Wie viele ${featureName} hat ${label}?`,
		answerType: 'integer',
		correctAnswer: String(flat[feature]),
		svg: flat.svg,
		why: flat.name === 'Pyramide' ? ({ ecken: '4 Ecken unten und 1 Spitze: 5.', flaechen: '1 Quadrat unten und 4 Dreiecke: 5.', kanten: '4 Kanten unten und 4 zur Spitze: 8.' })[feature] : ({ ecken: '4 Ecken oben und 4 unten: 8.', flaechen: 'Oben, unten, vorn, hinten, links, rechts: 6.', kanten: '4 Kanten oben, 4 unten und 4 senkrechte: 12.' })[feature], difficulty: 0.3
	};
});

reg('geometrie__symmetrie_grundschule', (stage = 0) => {
	const type = Math.min(stage, 1);
	const shapes = [
		{ kind: 'quadrat' as const, axes: 4, why: '2 Achsen durch die Seitenmitten und 2 Diagonalen: 4.' },
		{ kind: 'rechteck' as const, axes: 2, why: 'Nur die 2 Achsen durch die Seitenmitten – die Diagonalen sind keine Spiegelachsen.' },
		{ kind: 'dreieck' as const, axes: 3, why: 'Gleichseitiges Dreieck: von jeder Ecke zur gegenüberliegenden Seitenmitte – 3 Achsen.' },
		{ kind: 'fuenfeck' as const, axes: 5, why: 'Regelmäßiges Fünfeck: von jeder Ecke zur gegenüberliegenden Seitenmitte – 5 Achsen.' },
		{ kind: 'sechseck' as const, axes: 6, why: '3 Achsen durch gegenüberliegende Ecken und 3 durch gegenüberliegende Seitenmitten: 6.' },
		{ kind: 'viereck' as const, axes: 0, why: 'Dieses Viereck ist unregelmäßig – keine Faltlinie lässt beide Hälften genau aufeinanderfallen: 0 Achsen.' }
	];
	const shape = pick(shapes);
	const svg = svgShape(shape.kind);
	if (type === 0) {
		return {
			atomId: 'geometrie__symmetrie_grundschule',
			prompt: `Wie viele Symmetrieachsen hat diese Figur?`,
			answerType: 'integer',
			correctAnswer: String(shape.axes),
			svg,
			hint: 'Eine Symmetrieachse teilt die Figur in zwei spiegelgleiche Hälften.',
			why: shape.why, difficulty: 0.35
		};
	}
	const hasAxis = shape.axes > 0;
	return {
		atomId: 'geometrie__symmetrie_grundschule',
		prompt: `Ist diese Figur achsensymmetrisch (hat sie mindestens eine Symmetrieachse)?`,
		answerType: 'boolean',
		correctAnswer: hasAxis ? 'ja' : 'nein',
		svg,
		hint: 'Achsensymmetrisch: Man kann die Figur an einer Linie spiegeln, sodass beide Hälften genau übereinanderpassen.',
		why: shape.why, difficulty: 0.3
	};
});

// ── 33. Graph-Review v4: ergänzte Teilfertigkeiten ────────────────────────────
// Jedes dieser Atome ist `required`-Voraussetzung bereits übbarer Atome; ohne
// Generator wären die nachfolgenden Lernpfade blockiert.

reg('arithmetik__zahlen_bis_10', (stage = 0) => {
	const atomId = 'arithmetik__zahlen_bis_10';
	// Expanding sequence: Nachfolger → Vorgänger → Zahlenvergleich.
	const type = Math.min(stage, 2);
	if (type === 0) {
		const n = rand(0, 9);
		return { atomId, prompt: `Welche Zahl kommt nach ${n}?`, answerType: 'integer', correctAnswer: String(n + 1), why: `Beim Zählen kommt nach ${n} die ${n + 1}.`, difficulty: 0.05 };
	}
	if (type === 1) {
		const n = rand(1, 10);
		return { atomId, prompt: `Welche Zahl kommt vor ${n}?`, answerType: 'integer', correctAnswer: String(n - 1), why: `Beim Rückwärtszählen kommt vor ${n} die ${n - 1}.`, difficulty: 0.08 };
	}
	const a = rand(0, 10);
	let b = rand(0, 10);
	while (b === a) b = rand(0, 10);
	return { atomId, prompt: `Welche Zahl ist größer: ${a} oder ${b}?`, answerType: 'integer', correctAnswer: String(Math.max(a, b)), choices: [String(a), String(b)], why: `${Math.max(a, b)} kommt beim Zählen später als ${Math.min(a, b)} – sie ist größer.`, difficulty: 0.1 };
});

reg('arithmetik__add_sub_bis_100_ze_e_mit_uebergang', (stage = 0) => {
	const atomId = 'arithmetik__add_sub_bis_100_ze_e_mit_uebergang';
	// Expanding sequence: ZE + E → ZE − E → gemischt.
	const type = Math.min(stage, 2);
	const addition = type === 0 || (type === 2 && rand(0, 1) === 0);
	if (addition) {
		const ones = rand(2, 9);
		const a = rand(1, 8) * 10 + ones;
		const b = rand(10 - ones + 1, 9); // forces crossing the next ten
		return { atomId, prompt: `${a} + ${b} = ?`, answerType: 'integer', correctAnswer: String(a + b), hint: `Erst bis zum nächsten Zehner: ${a} + ${10 - ones} = ${a + 10 - ones}, dann + ${b - (10 - ones)}.`, why: `Erst bis zum nächsten Zehner: ${a} + ${10 - ones} = ${a + 10 - ones}. Dann den Rest: + ${b - (10 - ones)} = ${a + b}.`, difficulty: 0.3 };
	}
	const ones = rand(0, 8);
	const a = rand(2, 9) * 10 + ones;
	const b = rand(ones + 1, 9); // forces crossing the ten below
	return { atomId, prompt: `${a} − ${b} = ?`, answerType: 'integer', correctAnswer: String(a - b), hint: ones === 0 ? `Vom vollen Zehner ${b} wegnehmen.` : `Erst bis zum Zehner: ${a} − ${ones} = ${a - ones}, dann − ${b - ones}.`, why: ones === 0 ? `Vom vollen Zehner weg: 10 − ${b} = ${10 - b}, also ${a} − ${b} = ${a - b}.` : `Erst bis zum Zehner: ${a} − ${ones} = ${a - ones}. Dann den Rest: − ${b - ones} = ${a - b}.`, difficulty: 0.3 };
});

reg('arithmetik__groessen_geld', (stage = 0) => {
	const atomId = 'arithmetik__groessen_geld';
	// Expanding sequence: Euro + Cent → Cent → Kommaschreibweise → Rückgeld.
	const type = Math.min(stage, 2);
	if (type === 0) {
		const e = rand(1, 9), c = rand(1, 99);
		return { atomId, prompt: `${e} € und ${c} Cent = ___ Cent insgesamt?`, answerType: 'integer', correctAnswer: String(e * 100 + c), hint: '1 € = 100 Cent', why: `1 € = 100 Cent: ${e} € = ${e * 100} Cent, dazu ${c} Cent → ${e * 100 + c} Cent.`, difficulty: 0.3 };
	}
	if (type === 1) {
		const cents = rand(1, 9) * 100 + rand(1, 9) * 10 + rand(0, 1) * 5;
		return { atomId, prompt: `${cents} Cent = ___ € (mit Komma)`, answerType: 'number', correctAnswer: dec(cents / 100), hint: '100 Cent = 1 €', why: `100 Cent = 1 €: ${cents} Cent = ${Math.floor(cents / 100)} € und ${cents % 100} Cent = ${(cents / 100).toFixed(2).replace('.', ',')} €.`, difficulty: 0.4 };
	}
	const price = rand(1, 8) * 100 + rand(1, 9) * 10;
	return { atomId, prompt: `Du bezahlst ${dec(price / 100)} € mit einem 10-€-Schein. Wie viel Cent bekommst du zurück?`, answerType: 'integer', correctAnswer: String(1000 - price), hint: '10 € = 1000 Cent', why: `10 € = 1000 Cent, der Preis sind ${price} Cent: 1000 − ${price} = ${1000 - price} Cent.`, difficulty: 0.45 };
});

reg('arithmetik__groessen_laengen', (stage = 0) => {
	const atomId = 'arithmetik__groessen_laengen';
	// Expanding sequence: m + cm → cm, km → m, cm + mm → mm.
	const type = Math.min(stage, 2);
	if (type === 0) {
		const m = rand(1, 9), cm = rand(1, 99);
		return { atomId, prompt: `${m} m ${cm} cm = ___ cm insgesamt?`, answerType: 'integer', correctAnswer: String(m * 100 + cm), hint: '1 m = 100 cm', why: `1 m = 100 cm: ${m} m = ${m * 100} cm, dazu ${cm} cm → ${m * 100 + cm} cm.`, difficulty: 0.35 };
	}
	if (type === 1) {
		const km = rand(1, 9);
		const m = rand(0, 1) === 0 ? 0 : rand(1, 9) * 100;
		return { atomId, prompt: m === 0 ? `${km} km = ___ m?` : `${km} km ${m} m = ___ m insgesamt?`, answerType: 'integer', correctAnswer: String(km * 1000 + m), hint: '1 km = 1000 m', why: `1 km = 1000 m: ${km} km = ${km * 1000} m${m ? `, dazu ${m} m → ${km * 1000 + m} m` : ''}.`, difficulty: 0.4 };
	}
	const cm = rand(1, 20), mm = rand(1, 9);
	return { atomId, prompt: `${cm} cm ${mm} mm = ___ mm insgesamt?`, answerType: 'integer', correctAnswer: String(cm * 10 + mm), hint: '1 cm = 10 mm', why: `1 cm = 10 mm: ${cm} cm = ${cm * 10} mm, dazu ${mm} mm → ${cm * 10 + mm} mm.`, difficulty: 0.4 };
});

reg('arithmetik__groessen_zeit', (stage = 0) => {
	const atomId = 'arithmetik__groessen_zeit';
	// Expanding sequence: h + min → min, Zeitspanne über die volle Stunde, min + s → s.
	const type = Math.min(stage, 2);
	if (type === 0) {
		const h = rand(1, 5), m = rand(1, 59);
		return { atomId, prompt: `${h} h ${m} min = ___ min insgesamt?`, answerType: 'integer', correctAnswer: String(h * 60 + m), hint: '1 h = 60 min', why: `1 h = 60 min: ${h} h = ${h * 60} min, dazu ${m} min → ${h * 60 + m} min.`, difficulty: 0.4 };
	}
	if (type === 1) {
		const h = rand(7, 18), startMin = rand(2, 11) * 5, span = rand(3, 16) * 5;
		const end = h * 60 + startMin + span;
		const fmt = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} Uhr`;
		return { atomId, prompt: `Wie viele Minuten vergehen von ${fmt(h * 60 + startMin)} bis ${fmt(end)}?`, answerType: 'integer', correctAnswer: String(span), hint: 'Rechne erst bis zur vollen Stunde, dann weiter.', why: startMin + span > 60 ? `Bis zur vollen Stunde: ${60 - startMin} min. Danach noch ${span - (60 - startMin)} min. Zusammen ${span} min.` : `Die Stunde wird nicht überschritten – es zählen nur die Minuten: ${startMin + span} − ${startMin} = ${span} min.`, difficulty: 0.5 };
	}
	const m = rand(1, 9), s = rand(1, 59);
	return { atomId, prompt: `${m} min ${s} s = ___ s insgesamt?`, answerType: 'integer', correctAnswer: String(m * 60 + s), hint: '1 min = 60 s', why: `1 min = 60 s: ${m} min = ${m * 60} s, dazu ${s} s → ${m * 60 + s} s.`, difficulty: 0.45 };
});

reg('arithmetik__zehnereinmaleins', (stage = 0) => {
	const atomId = 'arithmetik__zehnereinmaleins';
	// Expanding sequence: E · Z → Division mit Zehnerzahlen → Hunderterzahlen bzw. Z · Z.
	const type = Math.min(stage, 2);
	const a = rand(2, 9), b = rand(2, 9);
	if (type === 0) {
		return { atomId, prompt: `${a} · ${b * 10} = ?`, answerType: 'integer', correctAnswer: String(a * b * 10), hint: `${a} · ${b} = ${a * b}, also ${a} · ${b} Zehner = ${a * b} Zehner.`, why: `${b * 10} sind ${b} Zehner. ${a} · ${b} Zehner = ${a * b} Zehner = ${a * b * 10}.`, difficulty: 0.35 };
	}
	if (type === 1) {
		return { atomId, prompt: `${a * b * 10} : ${a} = ?`, answerType: 'integer', correctAnswer: String(b * 10), hint: `${a * b} : ${a} = ${b}`, why: `${a * b * 10} sind ${a * b} Zehner. ${a * b} Zehner : ${a} = ${b} Zehner = ${b * 10}.`, difficulty: 0.4 };
	}
	if (rand(0, 1) === 0) {
		return { atomId, prompt: `${a} · ${b * 100} = ?`, answerType: 'integer', correctAnswer: String(a * b * 100), hint: `${a} · ${b} Hunderter`, why: `${b * 100} sind ${b} Hunderter. ${a} · ${b} Hunderter = ${a * b} Hunderter = ${a * b * 100}.`, difficulty: 0.4 };
	}
	return { atomId, prompt: `${a * 10} · ${b * 10} = ?`, answerType: 'integer', correctAnswer: String(a * b * 100), hint: `${a} · ${b} = ${a * b}, dann zwei Nullen anhängen.`, why: `${a} · ${b} = ${a * b}, und Zehner mal Zehner ergibt Hunderter: ${a * b} Hunderter = ${a * b * 100}.`, difficulty: 0.45 };
});

reg('arithmetik__halbschriftliche_multiplikation', (stage = 0) => {
	const atomId = 'arithmetik__halbschriftliche_multiplikation';
	// Expanding sequence: Zerlegung ergänzen → E · ZE → E · HZE.
	const type = Math.min(stage, 2);
	const a = rand(3, 9), t = rand(2, 9), o = rand(2, 9);
	if (type === 0) {
		return { atomId, prompt: `${a} · ${t * 10 + o} = ${a} · ${t * 10} + ${a} · ___`, answerType: 'integer', correctAnswer: String(o), hint: `${t * 10 + o} = ${t * 10} + ${o}`, why: `${t * 10 + o} wird in ${t * 10} + ${o} zerlegt. ${a} wird mit beiden Teilen multipliziert.`, difficulty: 0.35 };
	}
	if (type === 1) {
		return { atomId, prompt: `Rechne schrittweise: ${a} · ${t * 10 + o} = ?`, answerType: 'integer', correctAnswer: String(a * (t * 10 + o)), hint: `${a} · ${t * 10} = ${a * t * 10} und ${a} · ${o} = ${a * o}`, why: `Zerlegen: ${a} · ${t * 10} = ${a * t * 10} und ${a} · ${o} = ${a * o}. Zusammen ${a * (t * 10 + o)}.`, difficulty: 0.45 };
	}
	const h = rand(1, 4);
	const n = h * 100 + t * 10 + o;
	return { atomId, prompt: `Rechne schrittweise: ${a} · ${n} = ?`, answerType: 'integer', correctAnswer: String(a * n), hint: `${a} · ${h * 100} + ${a} · ${t * 10} + ${a} · ${o}`, why: `Zerlegen: ${a} · ${h * 100} = ${a * h * 100}, ${a} · ${t * 10} = ${a * t * 10}, ${a} · ${o} = ${a * o}. Zusammen ${a * n}.`, difficulty: 0.55 };
});

reg('arithmetik__halbschriftliche_division', (stage = 0) => {
	const atomId = 'arithmetik__halbschriftliche_division';
	// Expanding sequence: Zerlegung in Zehner- und Einerteil → geschicktes Zerlegen → dreistelliger Dividend.
	const type = Math.min(stage, 2);
	const d = rand(2, 9);
	if (type === 0) {
		const t = rand(1, 3), o = rand(1, 9);
		const n = d * (t * 10 + o);
		return { atomId, prompt: `${n} : ${d} = ?  (Tipp: ${n} = ${d * t * 10} + ${d * o})`, answerType: 'integer', correctAnswer: String(t * 10 + o), hint: `${d * t * 10} : ${d} = ${t * 10} und ${d * o} : ${d} = ${o}`, why: `${d * t * 10} : ${d} = ${t * 10} und ${d * o} : ${d} = ${o}. Zusammen ${t * 10 + o}.`, difficulty: 0.4 };
	}
	if (type === 1) {
		const q = rand(11, 29);
		return { atomId, prompt: `Zerlege geschickt: ${d * q} : ${d} = ?`, answerType: 'integer', correctAnswer: String(q), hint: `Nimm zuerst ${d * Math.floor(q / 10) * 10} : ${d}.`, why: halbDivWhy(d, q), difficulty: 0.5 };
	}
	const q = rand(31, 99);
	return { atomId, prompt: `Zerlege geschickt: ${d * q} : ${d} = ?`, answerType: 'integer', correctAnswer: String(q), hint: `Nimm zuerst ${d * Math.floor(q / 10) * 10} : ${d}.`, why: halbDivWhy(d, q), difficulty: 0.55 };
});

reg('arithmetik__bruch_als_quotient', (stage = 0) => {
	const atomId = 'arithmetik__bruch_als_quotient';
	// Expanding sequence: Division als Bruch → Bruch als Division → Verteilsituation.
	const type = Math.min(stage, 2);
	let a = rand(1, 9), b = rand(2, 10);
	while (a % b === 0 || gcd(a, b) !== 1) { a = rand(1, 9); b = rand(2, 10); }
	if (type === 0) {
		return { atomId, prompt: `Schreibe als Bruch: ${a} : ${b}`, answerType: 'fraction', correctAnswer: frac(a, b), hint: 'Der Dividend wird zum Zähler, der Divisor zum Nenner.', why: `Der Bruchstrich bedeutet „geteilt durch": ${a} : ${b} = ${fmtFrac(a, b)}.`, difficulty: 0.35 };
	}
	if (type === 1) {
		return { atomId, prompt: `${fmtFrac(a, b)} = ${a} : ___`, answerType: 'integer', correctAnswer: String(b), hint: 'Der Bruchstrich bedeutet „geteilt durch".', why: `Der Bruchstrich bedeutet „geteilt durch": ${fmtFrac(a, b)} = ${a} : ${b}.`, difficulty: 0.35 };
	}
	return { atomId, prompt: `${a} ${a === 1 ? 'Pizza wird' : 'Pizzen werden'} gerecht an ${b} Kinder verteilt. Welchen Anteil einer Pizza bekommt jedes Kind?`, answerType: 'fraction', correctAnswer: frac(a, b), hint: `${a} : ${b}`, why: `${a} ${a === 1 ? 'Pizza' : 'Pizzen'} auf ${b} Kinder verteilen heißt ${a} : ${b} = ${fmtFrac(a, b)} Pizza pro Kind.`, difficulty: 0.45 };
});

reg('arithmetik__brueche_gleichnamig_machen', (stage = 0) => {
	const atomId = 'arithmetik__brueche_gleichnamig_machen';
	// Expanding sequence: ein Nenner ist Vielfaches des anderen → allgemeiner Hauptnenner → Zähler nach dem Erweitern.
	const type = Math.min(stage, 2);
	if (type === 0) {
		const d1 = rand(2, 6), d2 = d1 * rand(2, 4);
		const n1 = rand(1, d1 - 1), n2 = rand(1, d2 - 1);
		return { atomId, prompt: `Welcher Hauptnenner passt zu ${fmtFrac(n1, d1)} und ${fmtFrac(n2, d2)}?`, answerType: 'integer', correctAnswer: String(d2), hint: `${d2} ist ein Vielfaches von ${d1}.`, why: `${d2} = ${d2 / d1} · ${d1} – der größere Nenner ist schon ein Vielfaches des kleineren. Nur ${fmtFrac(n1, d1)} muss erweitert werden.`, difficulty: 0.4 };
	}
	let d1 = rand(2, 9), d2 = rand(2, 9);
	while (d1 === d2 || d1 % d2 === 0 || d2 % d1 === 0) { d1 = rand(2, 9); d2 = rand(2, 9); }
	const hn = lcm(d1, d2);
	const n1 = rand(1, d1 - 1), n2 = rand(1, d2 - 1);
	if (type === 1) {
		return { atomId, prompt: `Bestimme den kleinsten gemeinsamen Nenner (Hauptnenner) von ${fmtFrac(n1, d1)} und ${fmtFrac(n2, d2)}.`, answerType: 'integer', correctAnswer: String(hn), hint: `Gesucht ist das kgV von ${d1} und ${d2}.`, why: `Gehe die Vielfachen von ${Math.max(d1, d2)} durch: ${Array.from({ length: hn / Math.max(d1, d2) }, (_, i) => (i + 1) * Math.max(d1, d2)).join(', ')}. ${hn} ist das erste, das auch durch ${Math.min(d1, d2)} teilbar ist.`, difficulty: 0.5 };
	}
	return { atomId, prompt: `Erweitere auf den Hauptnenner ${hn}: \\(\\frac{${n1}}{${d1}} = \\frac{?}{${hn}}\\)`, answerType: 'integer', correctAnswer: String(n1 * hn / d1), hint: `Erweitere mit ${hn / d1}.`, why: `${hn} : ${d1} = ${hn / d1}, also mit ${hn / d1} erweitern: \\(\\frac{${n1} \\cdot ${hn / d1}}{${d1} \\cdot ${hn / d1}} = \\frac{${n1 * hn / d1}}{${hn}}\\).`, difficulty: 0.5 };
});

reg('arithmetik__bruch_durch_natuerliche_zahl', (stage = 0) => {
	const atomId = 'arithmetik__bruch_durch_natuerliche_zahl';
	// Expanding sequence: Zähler teilbar → Nenner vervielfachen.
	const type = Math.min(stage, 1);
	const n = rand(2, 5);
	if (type === 0) {
		let d = rand(3, 11), a = rand(1, 5);
		while (gcd(a * n, d) !== 1) { d = rand(3, 11); a = rand(1, 5); }
		return { atomId, prompt: `${fmtFrac(a * n, d)} : ${n} = ?`, answerType: 'fraction', correctAnswer: frac(a, d), hint: `Der Zähler lässt sich teilen: ${a * n} : ${n} = ${a}.`, why: `${a * n} gleich große Stücke auf ${n} verteilen: ${a * n} : ${n} = ${a} Stücke. Die Stückgröße (Nenner ${d}) bleibt.`, difficulty: 0.4 };
	}
	const d = rand(2, 7);
	let a = rand(1, 6);
	while (a % n === 0 || gcd(a, d) !== 1) a = rand(1, 9);
	return { atomId, prompt: `${fmtFrac(a, d)} : ${n} = ?`, answerType: 'fraction', correctAnswer: frac(a, d * n), hint: `Der Nenner wird mit ${n} multipliziert: ${d} · ${n} = ${d * n}.`, why: `Der Zähler ${a} lässt sich nicht durch ${n} teilen. Stattdessen wird jedes Stück in ${n} kleinere geteilt: Nenner ${d} · ${n} = ${d * n}.`, difficulty: 0.5 };
});

reg('arithmetik__dezimal_mal_natuerliche_zahl', (stage = 0) => {
	const atomId = 'arithmetik__dezimal_mal_natuerliche_zahl';
	// Expanding sequence: eine Nachkommastelle → zwei Nachkommastellen → zweistelliger Faktor.
	const type = Math.min(stage, 2);
	if (type === 0) {
		const x = rand(1, 9) * 10 + rand(1, 9), n = rand(2, 9);
		return { atomId, prompt: `${dec(x / 10)} · ${n} = ?`, answerType: 'number', correctAnswer: dec(x * n / 10), hint: `${x} · ${n} = ${x * n}; das Ergebnis hat eine Nachkommastelle.`, why: `Erst ohne Komma: ${x} · ${n} = ${x * n}. Ein Faktor hat eine Nachkommastelle, das Ergebnis auch: ${dec(x * n / 10)}.`, difficulty: 0.4 };
	}
	if (type === 1) {
		let x = rand(101, 999);
		while (x % 10 === 0) x = rand(101, 999);
		const n = rand(2, 9);
		return { atomId, prompt: `${dec(x / 100)} · ${n} = ?`, answerType: 'number', correctAnswer: dec(x * n / 100), hint: `${x} · ${n} = ${x * n}; das Ergebnis hat zwei Nachkommastellen.`, why: `Erst ohne Komma: ${x} · ${n} = ${x * n}. Ein Faktor hat zwei Nachkommastellen, das Ergebnis auch: ${dec(x * n / 100)}.`, difficulty: 0.5 };
	}
	const x = rand(1, 9) * 10 + rand(1, 9), n = rand(11, 25);
	return { atomId, prompt: `${dec(x / 10)} · ${n} = ?`, answerType: 'number', correctAnswer: dec(x * n / 10), hint: `Rechne ${x} · ${n} und setze dann das Komma.`, why: `Erst ohne Komma: ${x} · ${n} = ${x * n}. Ein Faktor hat eine Nachkommastelle, das Ergebnis auch: ${dec(x * n / 10)}.`, difficulty: 0.55 };
});

reg('arithmetik__prozent_grundbegriffe', (stage = 0) => {
	const atomId = 'arithmetik__prozent_grundbegriffe';
	const choices = ['Grundwert', 'Prozentwert', 'Prozentsatz'];
	const p = pick([10, 20, 25, 40, 50, 75]);
	const G = rand(2, 12) * 20;
	const W = G * p / 100;
	// Expanding sequence: gegebene Angabe benennen → gesuchte Größe erkennen.
	const type = Math.min(stage, 1);
	if (type === 0) {
		const which = rand(0, 2);
		const marked = [`${G} Schülerinnen und Schüler`, `${W} Schülerinnen und Schüler`, `${p} %`][which];
		return { atomId, prompt: `An einer Schule mit ${G} Schülerinnen und Schülern kommen ${W} mit dem Fahrrad, das sind ${p} %. Was ist die Angabe „${marked}"?`, answerType: 'text', correctAnswer: choices[which], choices, hint: 'Grundwert = das Ganze (100 %), Prozentwert = der Anteil als Größe, Prozentsatz = der Anteil in %.', why: `Grundwert = das Ganze (hier ${G}), Prozentwert = der Teil davon (hier ${W}), Prozentsatz = der Anteil in Prozent (hier ${p} %).`, difficulty: 0.35 };
	}
	const texts: [string, number][] = [
		[`Eine Jacke kostet ${G} €. Sie wird um ${p} % reduziert. Wie viel Euro spart man?`, 1],
		[`Von ${G} Losen sind ${W} Gewinne. Wie viel Prozent der Lose gewinnen?`, 2],
		[`${W} Kinder sind krank, das sind ${p} % der Klassenstufe. Wie viele Kinder hat die Klassenstufe?`, 0],
		[`In einem Verein sind ${p} % der ${G} Mitglieder Jugendliche. Wie viele Jugendliche sind das?`, 1]
	];
	const [text, idx] = pick(texts);
	return { atomId, prompt: `${text} — Welche Größe ist gesucht?`, answerType: 'text', correctAnswer: choices[idx], choices, hint: 'Überlege: Was ist das Ganze, was der Anteil, was die Prozentangabe?', why: ['Gesucht ist das Ganze (100 %) → Grundwert.', 'Gesucht ist ein Teil des Ganzen als Größe (Anzahl oder Euro) → Prozentwert.', 'Gesucht ist der Anteil in Prozent → Prozentsatz.'][idx], difficulty: 0.45 };
});

reg('arithmetik__massstab', (stage = 0) => {
	const atomId = 'arithmetik__massstab';
	// Expanding sequence: Karte → Wirklichkeit (m) → Wirklichkeit → Karte (cm) → große Maßstäbe (km).
	const type = Math.min(stage, 2);
	if (type === 0) {
		const n = pick([100, 200, 500, 1000]), k = rand(2, 9);
		return { atomId, prompt: `Maßstab 1 : ${n}. Eine Strecke ist auf dem Plan ${k} cm lang. Wie viele Meter sind das in Wirklichkeit?`, answerType: 'number', correctAnswer: dec(k * n / 100), hint: `1 cm auf dem Plan entspricht ${n} cm = ${dec(n / 100)} m in Wirklichkeit.`, why: `1 cm im Plan sind ${n} cm in Wirklichkeit. ${k} · ${n} = ${k * n} cm = ${dec(k * n / 100)} m.`, difficulty: 0.45 };
	}
	if (type === 1) {
		const n = pick([100, 200, 500]), k = rand(2, 9);
		return { atomId, prompt: `Maßstab 1 : ${n}. Eine Strecke ist in Wirklichkeit ${dec(k * n / 100)} m lang. Wie viele Zentimeter sind das auf dem Plan?`, answerType: 'number', correctAnswer: String(k), hint: `Rechne in cm um und teile durch ${n}.`, why: `${dec(k * n / 100)} m = ${k * n} cm. Im Plan ist alles ${n}-mal kleiner: ${k * n} : ${n} = ${k} cm.`, difficulty: 0.5 };
	}
	const [n, label] = pick<[number, string]>([[25000, '25 000'], [50000, '50 000'], [100000, '100 000']]);
	const k = rand(2, 8);
	return { atomId, prompt: `Maßstab 1 : ${label}. Zwei Orte sind auf der Karte ${k} cm voneinander entfernt. Wie viele Kilometer sind das in Wirklichkeit?`, answerType: 'number', correctAnswer: dec(k * n / 100000), hint: `1 cm auf der Karte entspricht ${dec(n / 100000)} km.`, why: `1 cm auf der Karte sind ${label} cm = ${dec(n / 100000)} km in Wirklichkeit. ${k} · ${dec(n / 100000)} = ${dec(k * n / 100000)} km.`, difficulty: 0.55 };
});

reg('algebra__produkte_von_termen', (stage = 0) => {
	const atomId = 'algebra__produkte_von_termen';
	// Expanding sequence: verschiedene Variablen → gleiche Variable (Koeffizient) → Exponent bestimmen.
	const type = Math.min(stage, 2);
	const m = rand(2, 7), n = rand(2, 7);
	if (type === 0) {
		return { atomId, prompt: `Vereinfache: \\(${m}a \\cdot ${n}b = \\_\\_\\,ab\\)`, answerType: 'integer', correctAnswer: String(m * n), hint: 'Zahlen miteinander multiplizieren, Variablen dahinter schreiben.', why: `Zahlen mit Zahlen, Variablen mit Variablen: ${m} · ${n} = ${m * n} und a · b = ab.`, difficulty: 0.35 };
	}
	if (type === 1) {
		const neg = rand(0, 1) === 0;
		return { atomId, prompt: `Vereinfache: \\(${neg ? `(-${m}x)` : `${m}x`} \\cdot ${n}x = \\_\\_\\,x^2\\)`, answerType: 'integer', correctAnswer: String((neg ? -1 : 1) * m * n), hint: '\\(x \\cdot x = x^2\\)', why: `Zahlen mit Zahlen, Variablen mit Variablen: ${neg ? `(−${m})` : m} · ${n} = ${(neg ? -1 : 1) * m * n} und x · x = x².`, difficulty: 0.45 };
	}
	const e = rand(2, 4);
	return { atomId, prompt: `Vereinfache: \\(${m}x^${e} \\cdot ${n}x = ${m * n}x^{?\\ }\\)`, answerType: 'integer', correctAnswer: String(e + 1), hint: `\\(x^${e} \\cdot x\\) hat ${e + 1} Faktoren x.`, why: `\\(x^${e} \\cdot x\\): ${e} Faktoren x und noch einer, also \\(x^${e + 1}\\).`, difficulty: 0.5 };
});

reg('algebra__summen_multiplizieren', (stage = 0) => {
	const atomId = 'algebra__summen_multiplizieren';
	// Expanding sequence: (x+p)(x+q) → (x+p)(x−q) → (ax+p)(x+q); gefragt ist jeweils der Koeffizient vor x.
	const type = Math.min(stage, 2);
	const p = rand(1, 7);
	let q = rand(1, 7);
	if (type === 0) {
		return { atomId, prompt: `Multipliziere aus: \\((x + ${p})(x + ${q}) = x^2 + \\_\\_\\,x + ${p * q}\\)`, answerType: 'integer', correctAnswer: String(p + q), hint: `Jedes mit jedem: \\(x \\cdot x + ${q}x + ${p}x + ${p * q}\\)`, why: `Jedes mit jedem: \\(x \\cdot x + ${q}x + ${p}x + ${p * q}\\). Die x-Glieder zusammen: ${q} + ${p} = ${p + q}.`, difficulty: 0.45 };
	}
	if (type === 1) {
		while (q === p) q = rand(1, 7);
		return { atomId, prompt: `Multipliziere aus: \\((x + ${p})(x - ${q}) = x^2 + \\_\\_\\,x - ${p * q}\\)  (Vorzeichen beachten)`, answerType: 'integer', correctAnswer: String(p - q), hint: `\\(-${q}x + ${p}x\\)`, why: `Jedes mit jedem: \\(x^2 − ${q}x + ${p}x − ${p * q}\\). Die x-Glieder zusammen: −${q} + ${p} = ${p - q}.`, difficulty: 0.55 };
	}
	const a = rand(2, 4);
	return { atomId, prompt: `Multipliziere aus: \\((${a}x + ${p})(x + ${q}) = ${a}x^2 + \\_\\_\\,x + ${p * q}\\)`, answerType: 'integer', correctAnswer: String(a * q + p), hint: `\\(${a}x \\cdot ${q} + ${p} \\cdot x\\)`, why: `Die x-Glieder: \\(${a}x \\cdot ${q} = ${a * q}x\\) und \\(${p} \\cdot x = ${p}x\\). Zusammen ${a * q + p}.`, difficulty: 0.6 };
});

reg('algebra__formeln_umstellen', (stage = 0) => {
	const atomId = 'algebra__formeln_umstellen';
	// Expanding sequence: ein Umformungsschritt → zwei Umformungsschritte.
	const type = Math.min(stage, 1);
	const oneStep = [
		// answers are compared case-insensitively, so no formula may use a letter in both cases
		{ f: 'A = l \\cdot b', v: 'b', ok: 'b = A : l', wrong: ['b = A · l', 'b = l : A', 'b = A − l'] },
		{ f: 'v = s : t', v: 's', ok: 's = v · t', wrong: ['s = v : t', 's = t : v', 's = v + t'] },
		{ f: 'u = 4 \\cdot a', v: 'a', ok: 'a = u : 4', wrong: ['a = 4 · u', 'a = u − 4', 'a = 4 : u'] },
		{ f: 'W = G \\cdot p', v: 'G', ok: 'G = W : p', wrong: ['G = W · p', 'G = p : W', 'G = W − p'] },
		{ f: 'F = m \\cdot a', v: 'm', ok: 'm = F : a', wrong: ['m = F · a', 'm = a : F', 'm = F − a'] },
		{ f: 'u = a + b + c', v: 'c', ok: 'c = u − a − b', wrong: ['c = u + a + b', 'c = u − a + b', 'c = a + b − u'] },
		{ f: 'v = s : t', v: 't', ok: 't = s : v', wrong: ['t = s · v', 't = v : s', 't = s − v'] },
		{ f: 'P = U \\cdot I', v: 'I', ok: 'I = P : U', wrong: ['I = P · U', 'I = U : P', 'I = P − U'] },
		{ f: 'V = G \\cdot h', v: 'h', ok: 'h = V : G', wrong: ['h = V · G', 'h = G : V', 'h = V − G'] },
		{ f: 'd = 2 \\cdot r', v: 'r', ok: 'r = d : 2', wrong: ['r = 2 · d', 'r = d − 2', 'r = 2 : d'] },
		{ f: 'x = y - z', v: 'y', ok: 'y = x + z', wrong: ['y = x − z', 'y = z − x', 'y = x · z'] }
	];
	const twoStep = [
		{ f: 'u = 2a + 2b', v: 'a', ok: 'a = (u − 2b) : 2', wrong: ['a = u − 2b', 'a = (u + 2b) : 2', 'a = u : 2 − 2b'] },
		{ f: 'A = (g \\cdot h) : 2', v: 'h', ok: 'h = 2 · A : g', wrong: ['h = A : (2 · g)', 'h = 2 · A · g', 'h = A · g : 2'] },
		{ f: 'y = m \\cdot x + n', v: 'x', ok: 'x = (y − n) : m', wrong: ['x = (y + n) : m', 'x = y : m − n', 'x = (y − n) · m'] },
		{ f: 'V = a \\cdot b \\cdot c', v: 'c', ok: 'c = V : (a · b)', wrong: ['c = V · a · b', 'c = V : a · b', 'c = V − a · b'] },
		{ f: 'v = a \\cdot t + w', v: 't', ok: 't = (v − w) : a', wrong: ['t = (v + w) : a', 't = v : a − w', 't = (v − w) · a'] },
		{ f: 'E = m \\cdot g \\cdot h', v: 'h', ok: 'h = E : (m · g)', wrong: ['h = E · m · g', 'h = E − m · g', 'h = (m · g) : E'] },
		{ f: 'y = m \\cdot x + n', v: 'm', ok: 'm = (y − n) : x', wrong: ['m = (y + n) : x', 'm = y : x − n', 'm = (y − n) · x'] },
		{ f: 'z = (x + y) : 2', v: 'x', ok: 'x = 2 · z − y', wrong: ['x = z : 2 − y', 'x = 2 · z + y', 'x = 2 · (z − y)'] },
		{ f: 'V = (G \\cdot h) : 3', v: 'h', ok: 'h = 3 · V : G', wrong: ['h = V : (3 · G)', 'h = 3 · V · G', 'h = V · G : 3'] }
	];
	const t = pick(type === 0 ? oneStep : twoStep);
	return { atomId, prompt: `Stelle die Formel \\(${t.f}\\) nach \\(${t.v}\\) um.`, answerType: 'text', correctAnswer: t.ok, choices: shuffled([t.ok, ...t.wrong]), hint: 'Wende auf beiden Seiten die Umkehroperation an.', why: `\\(${t.v}\\) soll allein stehen: Wende auf beiden Seiten die Umkehroperation an (aus · wird :, aus + wird −) → ${t.ok}.`, difficulty: type === 0 ? 0.45 : 0.6 };
});

reg('algebra__verhaeltnisgleichungen', (stage = 0) => {
	const atomId = 'algebra__verhaeltnisgleichungen';
	// Expanding sequence: x im Zähler → x im Nenner → Sachkontext.
	const type = Math.min(stage, 2);
	let p = rand(1, 6), q = rand(2, 7);
	while (p === q || gcd(p, q) !== 1) { p = rand(1, 6); q = rand(2, 7); }
	const m = rand(2, 5);
	let n = rand(2, 9);
	while (n === m) n = rand(2, 9);
	const a = p * m, b = q * m, c = p * n, d = q * n;
	if (type === 0) {
		return { atomId, prompt: `Löse: \\(\\frac{x}{${d}} = \\frac{${a}}{${b}}\\)`, answerType: 'integer', correctAnswer: String(c), hint: `Multipliziere beide Seiten mit ${d}.`, why: `Beide Seiten mit ${d} multiplizieren: \\(x = \\frac{${a}}{${b}} \\cdot ${d} = ${c}\\). Probe: \\(\\frac{${c}}{${d}}\\) und \\(\\frac{${a}}{${b}}\\) sind gekürzt beide \\(\\frac{${p}}{${q}}\\).`, difficulty: 0.45 };
	}
	if (type === 1) {
		return { atomId, prompt: `Löse: \\(\\frac{${a}}{${b}} = \\frac{${c}}{x}\\)`, answerType: 'integer', correctAnswer: String(d), hint: `Über Kreuz multiplizieren: \\(${a} \\cdot x = ${b} \\cdot ${c}\\)`, why: `Über Kreuz multiplizieren: \\(${a} \\cdot x = ${b} \\cdot ${c} = ${b * c}\\), also \\(x = ${b * c} : ${a} = ${d}\\).`, difficulty: 0.55 };
	}
	return { atomId, prompt: `Für ${a} Portionen braucht man ${b * 10} g Mehl. Wie viel Gramm Mehl braucht man für ${c} Portionen?`, answerType: 'integer', correctAnswer: String(d * 10), hint: `\\(\\frac{${b * 10}}{${a}} = \\frac{x}{${c}}\\)`, why: `Gleiches Verhältnis: \\(\\frac{${b * 10}}{${a}} = \\frac{x}{${c}}\\), also \\(x = ${b * 10} \\cdot ${c} : ${a} = ${d * 10}\\) g.`, difficulty: 0.55 };
});

reg('algebra__gleichungen_aus_sachtexten', (stage = 0) => {
	const atomId = 'algebra__gleichungen_aus_sachtexten';
	// Expanding sequence: Zahlenrätsel → Altersaufgabe → Geometrie (Umfang).
	const type = Math.min(stage, 2);
	if (type === 0) {
		const x = rand(2, 12), k = rand(2, 5), b = rand(1, 15);
		return { atomId, prompt: `Das ${k}-Fache einer Zahl, vermehrt um ${b}, ergibt ${k * x + b}. Wie heißt die Zahl?`, answerType: 'integer', correctAnswer: String(x), hint: `\\(${k}x + ${b} = ${k * x + b}\\)`, why: `Als Gleichung: \\(${k}x + ${b} = ${k * x + b}\\). \\(−${b}\\): \\(${k}x = ${k * x}\\). \\(:${k}\\): \\(x = ${x}\\).`, difficulty: 0.5 };
	}
	if (type === 1) {
		const x = rand(6, 16), d = rand(2, 9);
		return { atomId, prompt: `Anna ist ${d} Jahre älter als Ben. Zusammen sind sie ${2 * x + d} Jahre alt. Wie alt ist Ben?`, answerType: 'integer', correctAnswer: String(x), hint: `Ben: x, Anna: x + ${d}. Also \\(x + x + ${d} = ${2 * x + d}\\)`, why: `Ben: x, Anna: x + ${d}. \\(2x + ${d} = ${2 * x + d}\\), also \\(2x = ${2 * x}\\) und \\(x = ${x}\\).`, difficulty: 0.6 };
	}
	const w = rand(3, 12), k = rand(2, 8);
	return { atomId, prompt: `Ein Rechteck ist ${k} cm länger als breit. Sein Umfang beträgt ${4 * w + 2 * k} cm. Wie breit ist es (in cm)?`, answerType: 'integer', correctAnswer: String(w), hint: `Breite x, Länge x + ${k}: \\(2x + 2(x + ${k}) = ${4 * w + 2 * k}\\)`, why: `Breite x, Länge x + ${k}: \\(2x + 2(x + ${k}) = 4x + ${2 * k} = ${4 * w + 2 * k}\\), also \\(4x = ${4 * w}\\) und \\(x = ${w}\\).`, difficulty: 0.65 };
});

reg('algebra__quadratische_ergaenzung', (stage = 0) => {
	const atomId = 'algebra__quadratische_ergaenzung';
	// Expanding sequence: Ergänzung finden → Restglied (p > 0) → Restglied (p < 0).
	const type = Math.min(stage, 2);
	const half = rand(1, 12), p = 2 * half;
	if (type === 0) {
		return { atomId, prompt: `Ergänze zu einem Binomquadrat: \\(x^2 + ${p}x + \\_\\_ = (x + ${half})^2\\)`, answerType: 'integer', correctAnswer: String(half * half), hint: `Halbiere ${p} und quadriere: \\(${half}^2\\)`, why: `Die Ergänzung ist das Quadrat der halben Zahl vor x: \\((${p} : 2)^2 = ${half}^2 = ${half * half}\\). Probe: \\((x + ${half})^2 = x^2 + ${p}x + ${half * half}\\).`, difficulty: 0.5 };
	}
	let rest = rand(-9, 9);
	while (rest === 0 || half * half + rest === 0) rest = rand(-9, 9);
	const q = half * half + rest;
	const fmtQ = q < 0 ? `- ${-q}` : `+ ${q}`;
	if (type === 1) {
		return { atomId, prompt: `Quadratische Ergänzung: \\(x^2 + ${p}x ${fmtQ} = (x + ${half})^2 + \\_\\_\\)`, answerType: 'integer', correctAnswer: String(rest), hint: `\\((x + ${half})^2 = x^2 + ${p}x + ${half * half}\\); vergleiche mit ${q}.`, why: `\\((x + ${half})^2\\) liefert bereits \\(+${half * half}\\). Dastehen soll ${q}, also fehlt noch ${q} − ${half * half} = ${rest}.`, difficulty: 0.6 };
	}
	return { atomId, prompt: `Quadratische Ergänzung: \\(x^2 - ${p}x ${fmtQ} = (x - ${half})^2 + \\_\\_\\)`, answerType: 'integer', correctAnswer: String(rest), hint: `\\((x - ${half})^2 = x^2 - ${p}x + ${half * half}\\); vergleiche mit ${q}.`, why: `\\((x - ${half})^2\\) liefert bereits \\(+${half * half}\\). Dastehen soll ${q}, also fehlt noch ${q} − ${half * half} = ${rest}.`, difficulty: 0.65 };
});

reg('algebra__steigung_aus_zwei_punkten', (stage = 0) => {
	const atomId = 'algebra__steigung_aus_zwei_punkten';
	// Expanding sequence: positive ganzzahlige Steigung → negative Koordinaten/Steigung → Bruch als Steigung.
	const type = Math.min(stage, 2);
	if (type === 0) {
		const m = rand(1, 4), x1 = rand(0, 4), y1 = rand(0, 5), dx = rand(1, 4);
		return { atomId, prompt: `Die Gerade verläuft durch P(${x1}|${y1}) und Q(${x1 + dx}|${y1 + m * dx}). Berechne die Steigung m.`, answerType: 'integer', correctAnswer: String(m), hint: `\\(m = \\frac{${y1 + m * dx} - ${y1}}{${x1 + dx} - ${x1}}\\)`, why: `Steigung = Höhenunterschied : Seitenunterschied: \\(m = \\frac{${y1 + m * dx} - ${y1}}{${x1 + dx} - ${x1}} = \\frac{${m * dx}}{${dx}} = ${m}\\).`, difficulty: 0.45 };
	}
	if (type === 1) {
		const m = -rand(1, 4), x1 = rand(-4, 1), y1 = rand(-3, 5), dx = rand(1, 4);
		return { atomId, prompt: `Die Gerade verläuft durch P(${x1}|${y1}) und Q(${x1 + dx}|${y1 + m * dx}). Berechne die Steigung m.`, answerType: 'integer', correctAnswer: String(m), hint: 'm = (y₂ − y₁) : (x₂ − x₁); achte auf die Vorzeichen.', why: `\\(m = \\frac{${y1 + m * dx} - ${paren(y1)}}{${x1 + dx} - ${paren(x1)}} = \\frac{${m * dx}}{${dx}} = ${m}\\). Die Gerade fällt, deshalb ist m negativ.`, difficulty: 0.55 };
	}
	let dy = rand(1, 5), dx = rand(2, 6);
	while (dy % dx === 0) { dy = rand(1, 5); dx = rand(2, 6); }
	if (rand(0, 1) === 0) dy = -dy;
	const x1 = rand(-3, 3), y1 = rand(-3, 3);
	return { atomId, prompt: `Die Gerade verläuft durch P(${x1}|${y1}) und Q(${x1 + dx}|${y1 + dy}). Gib die Steigung m als Bruch an.`, answerType: 'fraction', correctAnswer: frac(dy, dx), hint: 'm = (y₂ − y₁) : (x₂ − x₁)', why: `\\(m = \\frac{${y1 + dy} - ${paren(y1)}}{${x1 + dx} - ${paren(x1)}} = \\frac{${dy}}{${dx}}\\)${gcd(dy, dx) > 1 ? ` = ${fr(dy, dx)}` : ''}.`, difficulty: 0.6 };
});

reg('geometrie__senkrecht_parallel', (stage = 0) => {
	const atomId = 'geometrie__senkrecht_parallel';
	// Expanding sequence: Lage erkennen → Schlussfolgern → Abstand.
	const type = Math.min(stage, 2);
	const choices = ['parallel', 'senkrecht', 'weder noch'];
	if (type === 0) {
		const deg1 = pick([0, 20, 45, 70, 110, 150]);
		const kind = rand(0, 2);
		const deg2 = kind === 0 ? deg1 : kind === 1 ? deg1 + 90 : deg1 + pick([30, 50, 130]);
		return { atomId, prompt: 'Wie liegen die beiden Strecken zueinander (wenn man sie verlängert)?', answerType: 'text', correctAnswer: choices[kind], choices, svg: svgTwoSegments(deg1, deg2), hint: 'Parallel: überall gleicher Abstand. Senkrecht: sie bilden einen rechten Winkel.', why: ['Die Strecken haben dieselbe Richtung – verlängert bleiben sie immer gleich weit auseinander → parallel.', 'Die Strecken bilden einen rechten Winkel → senkrecht.', 'Verlängert schneiden sie sich, aber nicht im rechten Winkel → weder noch.'][kind], difficulty: 0.25 };
	}
	if (type === 1) {
		const items: [string, number][] = [
			['Die Gerade a ist parallel zu b, und b ist parallel zu c. Wie liegen a und c zueinander?', 0],
			['Die Gerade a ist senkrecht zu b, und b ist senkrecht zu c. Wie liegen a und c zueinander?', 0],
			['Die Gerade a ist parallel zu b, und c ist senkrecht zu a. Wie liegen c und b zueinander?', 1],
			['Die Gerade a ist senkrecht zu b, und c ist parallel zu b. Wie liegen a und c zueinander?', 1],
			['Zwei Geraden schneiden sich und bilden dabei einen rechten Winkel. Wie liegen sie zueinander?', 1],
			['Zwei Geraden schneiden sich, bilden aber keinen rechten Winkel. Wie liegen sie zueinander?', 2],
			['Zwei verschiedene Geraden haben überall denselben Abstand voneinander. Wie liegen sie zueinander?', 0],
			['Die gegenüberliegenden Seiten eines Rechtecks – wie liegen sie zueinander?', 0],
			['Zwei benachbarte Seiten eines Rechtecks – wie liegen sie zueinander?', 1],
			['Die beiden Diagonalen eines (nicht quadratischen) Rechtecks – wie liegen sie zueinander?', 2],
			['Die Gerade a ist parallel zu b, und c schneidet a schräg (nicht im rechten Winkel). Wie liegen c und b zueinander?', 2]
		];
		const [text, idx] = pick(items);
		return { atomId, prompt: text, answerType: 'text', correctAnswer: choices[idx], choices, hint: 'Skizziere die drei Geraden.', why: ['Die beiden Geraden haben dieselbe Richtung → parallel.', 'Zwischen den beiden Geraden liegt ein rechter Winkel → senkrecht.', 'Die beiden Geraden schneiden sich schräg → weder parallel noch senkrecht.'][idx], difficulty: 0.4 };
	}
	const d = rand(2, 9) * 2;
	return { atomId, prompt: `Zwei parallele Geraden haben den Abstand ${d} cm. Ein Punkt liegt genau in der Mitte zwischen ihnen. Wie groß ist sein Abstand zu jeder der Geraden (in cm)?`, answerType: 'number', correctAnswer: String(d / 2), hint: 'Der Abstand wird senkrecht zur Geraden gemessen.', why: `Die Mitte halbiert den Abstand: ${d} : 2 = ${d / 2} cm – zu beiden Geraden gleich weit.`, difficulty: 0.35 };
});

reg('geometrie__kreis_grundbegriffe', (stage = 0) => {
	const atomId = 'geometrie__kreis_grundbegriffe';
	// Expanding sequence: r → d, d → r, Begriffe zuordnen.
	const type = Math.min(stage, 2);
	if (type === 0) {
		const r = rand(2, 12);
		return { atomId, prompt: `Ein Kreis hat den Radius ${r} cm. Wie groß ist sein Durchmesser (in cm)?`, answerType: 'number', correctAnswer: String(2 * r), svg: svgCircleDiagram(r, { label: `r = ${r} cm` }), hint: 'd = 2 · r', why: `Der Durchmesser geht quer durch den Mittelpunkt – das sind zwei Radien: 2 · ${r} = ${2 * r} cm.`, difficulty: 0.2 };
	}
	if (type === 1) {
		const d = rand(3, 24);
		return { atomId, prompt: `Ein Kreis hat den Durchmesser ${d} cm. Wie groß ist sein Radius (in cm)?`, answerType: 'number', correctAnswer: dec(d / 2), svg: svgCircleDiagram(d / 2, { label: `d = ${d} cm`, showDiameter: true }), hint: 'r = d : 2', why: `Der Radius ist der halbe Durchmesser: ${d} : 2 = ${dec(d / 2)} cm.`, difficulty: 0.25 };
	}
	const choices = ['Radius', 'Durchmesser', 'Sehne', 'Mittelpunkt'];
	const items: [string, number][] = [
		['Wie heißt die Strecke vom Mittelpunkt zu einem Punkt auf der Kreislinie?', 0],
		['Wie heißt die Strecke zwischen zwei Punkten der Kreislinie, die durch den Mittelpunkt verläuft?', 1],
		['Wie heißt eine Strecke, die zwei beliebige Punkte der Kreislinie verbindet?', 2],
		['Wie heißt der Punkt, von dem alle Punkte der Kreislinie gleich weit entfernt sind?', 3],
		['Wie heißt die längste Sehne eines Kreises?', 1],
		['Welche Strecke ist halb so lang wie der Durchmesser?', 0],
		['Was stellt man am Zirkel ein, um einen Kreis zu zeichnen?', 0],
		['Wo sticht man den Zirkel ein, um einen Kreis zu zeichnen?', 3],
		['Welche Strecke im Kreis geht nicht unbedingt durch den Mittelpunkt, verbindet aber zwei Punkte der Kreislinie?', 2]
	];
	const [text, idx] = pick(items);
	return { atomId, prompt: text, answerType: 'text', correctAnswer: choices[idx], choices, hint: 'Der Durchmesser ist die längste Sehne.', why: ['Radius: Strecke vom Mittelpunkt bis zur Kreislinie – halb so lang wie der Durchmesser.', 'Durchmesser: Sehne durch den Mittelpunkt – die längste Strecke im Kreis (2 · r).', 'Sehne: verbindet zwei Punkte der Kreislinie; sie muss nicht durch den Mittelpunkt gehen.', 'Mittelpunkt: Von ihm sind alle Punkte der Kreislinie gleich weit entfernt.'][idx], difficulty: 0.3 };
});

reg('geometrie__dreiecksarten', (stage = 0) => {
	const atomId = 'geometrie__dreiecksarten';
	// Expanding sequence: Einteilung nach Seiten → nach Winkeln → Basiswinkel.
	const type = Math.min(stage, 2);
	if (type === 0) {
		const choices = ['gleichseitig', 'gleichschenklig', 'unregelmäßig'];
		const kind = rand(0, 2);
		const a = rand(4, 9);
		const sides = kind === 0 ? [a, a, a] : kind === 1 ? shuffled([a, a, a - rand(1, 3)]) : [a, a + 1, a + 2];
		return { atomId, prompt: `Ein Dreieck hat die Seitenlängen ${sides[0]} cm, ${sides[1]} cm und ${sides[2]} cm. Welche Dreiecksart ist das?`, answerType: 'text', correctAnswer: choices[kind], choices, hint: 'Gleichschenklig: genau zwei gleich lange Seiten. Gleichseitig: alle drei gleich lang.', why: ['Alle drei Seiten sind gleich lang → gleichseitig.', 'Genau zwei Seiten sind gleich lang → gleichschenklig.', 'Alle drei Seiten sind verschieden lang → unregelmäßig.'][kind], difficulty: 0.3 };
	}
	if (type === 1) {
		const choices = ['spitzwinklig', 'rechtwinklig', 'stumpfwinklig'];
		const kind = rand(0, 2);
		// spitzwinklig: two angles in [50°, 80°] keep the third below 90° as well
		const big = kind === 0 ? rand(50, 80) : kind === 1 ? 90 : rand(95, 140);
		const second = kind === 0 ? rand(50, 80) : rand(20, 180 - big - 15);
		const angles = shuffled([big, second, 180 - big - second]);
		return { atomId, prompt: `Ein Dreieck hat die Winkel ${angles[0]}°, ${angles[1]}° und ${angles[2]}°. Welche Dreiecksart ist das?`, answerType: 'text', correctAnswer: choices[kind], choices, hint: 'Entscheidend ist der größte Winkel.', why: `Der größte Winkel ist ${Math.max(...angles)}°: ${['kleiner als 90° → spitzwinklig', 'genau 90° → rechtwinklig', 'größer als 90° → stumpfwinklig'][kind]}.`, difficulty: 0.35 };
	}
	const alpha = rand(25, 80);
	return { atomId, prompt: `In einem gleichschenkligen Dreieck ist ein Basiswinkel ${alpha}° groß. Wie groß ist der andere Basiswinkel (in Grad)?`, answerType: 'integer', correctAnswer: String(alpha), hint: 'Im gleichschenkligen Dreieck sind die Basiswinkel gleich groß.', why: `Die Basiswinkel liegen den beiden gleich langen Schenkeln gegenüber und sind deshalb gleich groß: ${alpha}°.`, difficulty: 0.3 };
});

reg('geometrie__hoehen_erkennen', (stage = 0) => {
	const atomId = 'geometrie__hoehen_erkennen';
	// Expanding sequence: Parallelogramm → Dreieck → Begriff.
	const type = Math.min(stage, 2);
	const [slant, h, s] = pick([[3, 4, 5], [6, 8, 10], [5, 12, 13]]);
	if (type === 0) {
		const g = slant + rand(4, 9);
		const pts: [Pt, Pt, Pt, Pt] = [[0, 0], [g, 0], [g + slant, h], [slant, h]];
		const svg = svgQuad(pts, { baseLabel: `${g} cm`, leftLabel: `${s} cm`, heightFrom: [slant, h], heightTo: [slant, 0], heightLabel: `${h} cm` });
		return { atomId, prompt: `Welche Länge (in cm) ist die Höhe des Parallelogramms zur Grundseite ${g} cm?`, answerType: 'number', correctAnswer: String(h), svg, hint: 'Die Höhe steht senkrecht auf der Grundseite – die schräge Seite ist keine Höhe.', why: `Die Höhe ist die gestrichelte Strecke, die senkrecht auf der Grundseite steht: ${h} cm. Die schräge Seite (${s} cm) ist länger und keine Höhe.`, difficulty: 0.4 };
	}
	if (type === 1) {
		const g = slant + rand(4, 9);
		const A: Pt = [0, 0], B: Pt = [g, 0], C: Pt = [slant, h];
		const svg = svgPolyDiagram([A, B, C], {
			edgeLabels: [{ from: 0, to: 1, text: `${g} cm` }, { from: 2, to: 0, text: `${s} cm` }],
			extraSegments: [{ from: C, to: [slant, 0], dash: true }],
			rightAngleFeet: [{ at: [slant, 0], ref1: C, ref2: B }],
			extraPoints: [{ at: [slant, h / 2], label: `${h} cm`, pos: 'right' }]
		});
		return { atomId, prompt: `Welche Länge (in cm) ist die Höhe des Dreiecks zur Grundseite ${g} cm?`, answerType: 'number', correctAnswer: String(h), svg, hint: 'Die Höhe verläuft von der gegenüberliegenden Ecke senkrecht zur Grundseite.', why: `Die Höhe ist die gestrichelte Strecke von der Ecke senkrecht zur Grundseite: ${h} cm. Die schräge Seite (${s} cm) ist länger und keine Höhe.`, difficulty: 0.45 };
	}
	const items: { q: string; ok: string; choices: string[]; e: string }[] = [
		{ q: 'Wie steht die Höhe eines Dreiecks zur zugehörigen Grundseite?', ok: 'senkrecht', choices: ['senkrecht', 'parallel', 'schräg'], e: 'Die Höhe misst den kürzesten Abstand – und der steht immer senkrecht auf der Grundseite.' },
		{ q: 'Wie viele Höhen hat ein Dreieck?', ok: '3', choices: ['1', '2', '3'], e: 'Zu jeder der drei Seiten gehört eine eigene Höhe.' },
		{ q: 'In welchem Dreieck liegen zwei Höhen außerhalb des Dreiecks?', ok: 'im stumpfwinkligen Dreieck', choices: ['im spitzwinkligen Dreieck', 'im rechtwinkligen Dreieck', 'im stumpfwinkligen Dreieck'], e: 'Beim stumpfen Winkel muss man zwei Seiten verlängern, um das Lot zu fällen – diese Höhen liegen außerhalb.' },
		{ q: 'In welchem Dreieck sind zwei Seiten zugleich Höhen?', ok: 'im rechtwinkligen Dreieck', choices: ['im spitzwinkligen Dreieck', 'im rechtwinkligen Dreieck', 'im stumpfwinkligen Dreieck'], e: 'Die beiden Katheten stehen senkrecht aufeinander – jede ist die Höhe zur anderen.' },
		{ q: 'Was misst die Höhe eines Parallelogramms?', ok: 'den Abstand der parallelen Seiten', choices: ['den Abstand der parallelen Seiten', 'die Länge der schrägen Seite', 'die Länge der Diagonale'], e: 'Die Höhe steht senkrecht auf der Grundseite und misst so den Abstand zur gegenüberliegenden parallelen Seite.' },
		{ q: 'Von wo aus verläuft die Höhe eines Dreiecks zur Grundseite?', ok: 'von der gegenüberliegenden Ecke', choices: ['von der gegenüberliegenden Ecke', 'vom Mittelpunkt einer Seite', 'von einer Ecke der Grundseite'], e: 'Die Höhe verbindet die Ecke gegenüber der Grundseite senkrecht mit der Grundseite.' }
	];
	const t = pick(items);
	return { atomId, prompt: t.q, answerType: 'text', correctAnswer: t.ok, choices: shuffled(t.choices), hint: 'Höhe = kürzester (senkrechter) Abstand der Ecke von der Grundseite bzw. ihrer Verlängerung.', why: t.e, difficulty: 0.35 };
});

reg('geometrie__kegel_volumen_oberflaeche', (stage = 0) => {
	const atomId = 'geometrie__kegel_volumen_oberflaeche';
	// Expanding sequence: Volumen → Mantellinie (Pythagoras) → Mantelfläche.
	const type = Math.min(stage, 2);
	const [r, h, s] = pythagLegs();
	if (type === 0) {
		const V = round(3.14 * r * r * h / 3, 2);
		return { atomId, prompt: `Berechne das Volumen des Kegels. (π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(V), tolerance: piTol(V), svg: svgCone(r, h, { r: `r = ${r} cm`, h: `h = ${h} cm` }), hint: 'V = (1/3) · π · r² · h', why: `Ein Kegel füllt ein Drittel des Zylinders mit gleichem Radius und gleicher Höhe: 3,14 · ${r}² · ${h} : 3 ≈ ${dec(V)} cm³.`, difficulty: 0.55 };
	}
	if (type === 1) {
		return { atomId, prompt: `Berechne die Länge der Mantellinie s des Kegels (in cm).`, answerType: 'number', correctAnswer: String(s), svg: svgCone(r, h, { r: `r = ${r} cm`, h: `h = ${h} cm`, s: 's = ?' }), hint: 's² = r² + h²', why: `Radius, Höhe und Mantellinie bilden ein rechtwinkliges Dreieck: s = √(${r}² + ${h}²) = √${r * r + h * h} = ${s} cm.`, difficulty: 0.55 };
	}
	const M = round(3.14 * r * s, 2);
	return { atomId, prompt: `Berechne die Mantelfläche des Kegels. (π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(M), tolerance: piTol(M), svg: svgCone(r, h, { r: `r = ${r} cm`, s: `s = ${s} cm` }), hint: 'M = π · r · s', why: `M = π · r · s = 3,14 · ${r} · ${s} = ${dec(M)} cm².`, difficulty: 0.6 };
});

reg('geometrie__kreisbogen_kreissektor', (stage = 0) => {
	const atomId = 'geometrie__kreisbogen_kreissektor';
	// Expanding sequence: Anteil am Vollkreis → Bogenlänge → Sektorfläche.
	const type = Math.min(stage, 2);
	const alpha = pick([30, 36, 40, 45, 60, 72, 90, 120, 135, 150, 180, 240, 270, 300]);
	if (type === 0) {
		return { atomId, prompt: `Ein Kreissektor hat den Mittelpunktswinkel ${alpha}°. Welcher Bruchteil des Vollkreises ist das?`, answerType: 'fraction', correctAnswer: frac(alpha, 360), hint: `${alpha}° von 360°`, why: `Der Vollkreis hat 360°: ${fmtFrac(alpha, 360)}, gekürzt ${fr(alpha, 360)}.`, difficulty: 0.4 };
	}
	const r = rand(2, 15);
	if (type === 1) {
		const b = round(alpha / 360 * 2 * 3.14 * r, 2);
		return { atomId, prompt: `Berechne die Länge des Kreisbogens zum Mittelpunktswinkel ${alpha}° bei Radius ${r} cm. (π ≈ 3,14; runde auf zwei Nachkommastellen)`, answerType: 'number', correctAnswer: dec(b), tolerance: piTol(b), hint: 'b = (α : 360°) · 2 · π · r', why: `Der Bogen ist der Anteil ${fr(alpha, 360)} des ganzen Umfangs. u = 2 · 3,14 · ${r} = ${dec(round(2 * 3.14 * r, 2))} cm, davon ${fr(alpha, 360)} → ${dec(b)} cm.`, difficulty: 0.55 };
	}
	const A = round(alpha / 360 * 3.14 * r * r, 2);
	return { atomId, prompt: `Berechne den Flächeninhalt des Kreissektors mit Mittelpunktswinkel ${alpha}° und Radius ${r} cm. (π ≈ 3,14; runde auf zwei Nachkommastellen)`, answerType: 'number', correctAnswer: dec(A), tolerance: piTol(A), hint: 'A = (α : 360°) · π · r²', why: `Der Sektor ist der Anteil ${fr(alpha, 360)} der ganzen Kreisfläche. 3,14 · ${r}² = ${dec(round(3.14 * r * r, 2))} cm², davon ${fr(alpha, 360)} → ${dec(A)} cm².`, difficulty: 0.6 };
});

reg('logik__mengen_zahlbereiche', (stage = 0) => {
	const atomId = 'logik__mengen_zahlbereiche';
	// Expanding sequence: kleinsten Zahlbereich angeben → Elementbeziehung → Teilmengenbeziehung.
	const type = Math.min(stage, 2);
	const names = ['natürliche Zahlen (ℕ)', 'ganze Zahlen (ℤ)', 'rationale Zahlen (ℚ)'];
	const sample = (kind: number): string => {
		if (kind === 0) return String(rand(1, 50));
		if (kind === 1) return `−${rand(1, 50)}`;
		return pick([`${rand(0, 9)},${rand(1, 9)}`, `−${rand(0, 9)},5`, fmtFrac(pick([1, 3, 5, 7]), pick([2, 4, 8]))]);
	};
	if (type === 0) {
		const kind = rand(0, 2);
		return { atomId, prompt: `Zu welchem kleinsten Zahlbereich gehört ${sample(kind)}?`, answerType: 'text', correctAnswer: names[kind], choices: names, hint: 'ℕ ⊂ ℤ ⊂ ℚ: natürliche Zahlen sind auch ganze und rationale Zahlen.', why: ['Eine positive Zahl ohne Komma, mit der man zählen kann → natürliche Zahl.', 'Eine negative Zahl ohne Komma: nicht in ℕ, aber in ℤ.', 'Ein Bruch oder eine Kommazahl ist keine ganze Zahl, lässt sich aber als Bruch schreiben → ℚ.'][kind], difficulty: 0.35 };
	}
	if (type === 1) {
		const kind = rand(0, 2), set = rand(0, 2);
		return { atomId, prompt: `Gehört ${sample(kind)} zur Menge der ${names[set].replace('natürliche', 'natürlichen').replace('ganze', 'ganzen').replace('rationale', 'rationalen')}?`, answerType: 'boolean', correctAnswer: kind <= set ? 'ja' : 'nein', hint: 'ℕ ⊂ ℤ ⊂ ℚ', why: kind <= set ? 'ℕ ⊂ ℤ ⊂ ℚ: Jede natürliche Zahl ist auch ganz, jede ganze auch rational.' : kind === 1 ? 'Negative Zahlen gehören nicht zu den natürlichen Zahlen.' : 'Brüche und Kommazahlen sind keine ganzen (und keine natürlichen) Zahlen.', difficulty: 0.4 };
	}
	const items: [string, boolean, string][] = [
		['Jede natürliche Zahl ist auch eine ganze Zahl.', true, 'ℕ steckt in ℤ: 1, 2, 3 … sind auch ganze Zahlen.'],
		['Jede ganze Zahl ist auch eine natürliche Zahl.', false, 'Gegenbeispiel: −3 ist ganz, aber nicht natürlich.'],
		['Jede ganze Zahl ist auch eine rationale Zahl.', true, 'Jede ganze Zahl lässt sich als Bruch schreiben, z. B. −3 = −3/1.'],
		['Jede rationale Zahl ist auch eine ganze Zahl.', false, 'Gegenbeispiel: 1/2 ist rational, aber nicht ganz.'],
		['Jeder Bruch aus zwei ganzen Zahlen (Nenner ≠ 0) ist eine rationale Zahl.', true, 'Genau so sind die rationalen Zahlen festgelegt.'],
		['Jede natürliche Zahl ist auch eine rationale Zahl.', true, 'Z. B. 5 = 5/1 – also auch ein Bruch.'],
		['Die Zahl 0 ist eine ganze Zahl.', true, '0 gehört zu ℤ = {…, −2, −1, 0, 1, 2, …}.'],
		['Es gibt eine kleinste ganze Zahl.', false, 'Zu jeder ganzen Zahl gibt es eine noch kleinere (immer 1 weniger).'],
		['Jede negative Zahl ist eine ganze Zahl.', false, 'Gegenbeispiel: −0,5 ist negativ, aber nicht ganz.'],
		['Jede endliche Dezimalzahl ist eine rationale Zahl.', true, 'Z. B. 0,25 = 25/100 – jede endliche Dezimalzahl ist ein Bruch mit Nenner 10, 100, 1000 …'],
		['Die Differenz zweier natürlicher Zahlen ist immer eine natürliche Zahl.', false, 'Gegenbeispiel: 3 − 5 = −2 ist keine natürliche Zahl.'],
		['Die Summe zweier ganzer Zahlen ist immer eine ganze Zahl.', true, 'Plus und Minus führen aus den ganzen Zahlen nie heraus.'],
		['Der Quotient zweier ganzer Zahlen (Divisor ≠ 0) ist immer eine ganze Zahl.', false, 'Gegenbeispiel: 1 : 2 = 0,5 ist keine ganze Zahl.']
	];
	const [text, ok, reason] = pick(items);
	return { atomId, prompt: `Stimmt die Aussage? ${text}`, answerType: 'boolean', correctAnswer: ok ? 'ja' : 'nein', hint: 'ℕ ⊂ ℤ ⊂ ℚ', why: reason, difficulty: 0.45 };
});

reg('logik__saetze_und_beweise', (stage = 0) => {
	const atomId = 'logik__saetze_und_beweise';
	// Expanding sequence: Definition vs. Satz → Gegenbeispiel → Umkehrung eines Satzes.
	const type = Math.min(stage, 2);
	if (type === 0) {
		const choices = ['Definition', 'Satz'];
		const items: [string, number][] = [
			['Ein Dreieck mit drei gleich langen Seiten heißt gleichseitig.', 0],
			['Die Summe der Innenwinkel in jedem Dreieck beträgt 180°.', 1],
			['Eine natürliche Zahl mit genau zwei Teilern heißt Primzahl.', 0],
			['Scheitelwinkel sind gleich groß.', 1],
			['Ein Viereck mit vier rechten Winkeln heißt Rechteck.', 0],
			['Nebenwinkel ergänzen sich zu 180°.', 1],
			['Zwei Geraden, die sich nicht schneiden, heißen parallel.', 0],
			['Stufenwinkel an parallelen Geraden sind gleich groß.', 1],
			['Ein Winkel von genau 90° heißt rechter Winkel.', 0],
			['Im gleichschenkligen Dreieck sind die Basiswinkel gleich groß.', 1],
			['Eine Zahl heißt gerade, wenn sie durch 2 teilbar ist.', 0],
			['Die Summe zweier gerader Zahlen ist gerade.', 1],
			['Ein Viereck mit zwei Paaren paralleler Seiten heißt Parallelogramm.', 0],
			['Eine Zahl ist genau dann durch 3 teilbar, wenn ihre Quersumme durch 3 teilbar ist.', 1]
		];
		const [text, idx] = pick(items);
		return { atomId, prompt: `Definition oder Satz? „${text}"`, answerType: 'text', correctAnswer: choices[idx], choices, hint: 'Eine Definition legt einen Begriff fest; ein Satz ist eine Aussage, die man beweisen muss.', why: ['Hier wird nur ein Name festgelegt („heißt") – das kann man nicht beweisen: Definition.', 'Das ist eine Behauptung über einen Zusammenhang – sie muss bewiesen werden: Satz.'][idx], difficulty: 0.4 };
	}
	if (type === 1) {
		const items: { claim: string; ok: string; wrong: string[]; e: string }[] = [
			{ claim: 'Alle Primzahlen sind ungerade.', ok: '2', wrong: ['3', '9', '15'], e: '2 ist eine Primzahl und gerade.' },
			{ claim: 'Alle Vielfachen von 3 sind ungerade.', ok: '6', wrong: ['3', '9', '7'], e: '6 = 2 · 3 ist ein Vielfaches von 3 und gerade.' },
			{ claim: 'Jede Quadratzahl ist gerade.', ok: '9', wrong: ['4', '16', '8'], e: '9 = 3 · 3 ist eine Quadratzahl und ungerade.' },
			{ claim: 'Jede durch 5 teilbare Zahl endet auf 5.', ok: '20', wrong: ['15', '25', '12'], e: '20 ist durch 5 teilbar, endet aber auf 0.' },
			{ claim: 'Die Summe zweier Primzahlen ist immer gerade.', ok: '2 + 3', wrong: ['3 + 5', '5 + 7', '3 + 11'], e: '2 + 3 = 5 ist ungerade.' },
			{ claim: 'Alle ungeraden Zahlen sind Primzahlen.', ok: '9', wrong: ['3', '7', '11'], e: '9 = 3 · 3 ist ungerade, aber keine Primzahl.' },
			{ claim: 'Jede durch 2 teilbare Zahl ist auch durch 4 teilbar.', ok: '6', wrong: ['4', '8', '12'], e: '6 ist durch 2 teilbar, aber 6 : 4 geht nicht auf.' },
			{ claim: 'Das Quadrat einer Zahl ist immer größer als die Zahl selbst.', ok: '1', wrong: ['2', '3', '5'], e: '1 · 1 = 1 ist nicht größer als 1.' },
			{ claim: 'Jede durch 3 teilbare Zahl ist auch durch 9 teilbar.', ok: '12', wrong: ['9', '18', '27'], e: '12 ist durch 3 teilbar, aber 12 : 9 geht nicht auf.' },
			{ claim: 'Das Produkt zweier Zahlen ist immer größer als ihre Summe.', ok: '1 und 5', wrong: ['3 und 4', '2 und 5', '4 und 6'], e: '1 · 5 = 5 ist kleiner als 1 + 5 = 6.' }
		];
		const t = pick(items);
		return { atomId, prompt: `Behauptung: „${t.claim}" Welches Beispiel widerlegt die Behauptung?`, answerType: 'text', correctAnswer: t.ok, choices: shuffled([t.ok, ...t.wrong]), hint: 'Ein einziges Gegenbeispiel genügt, um eine Allaussage zu widerlegen.', why: `${t.e} Ein einziges Gegenbeispiel genügt, um eine „alle/jede/immer"-Behauptung zu widerlegen.`, difficulty: 0.5 };
	}
	const items: [string, boolean, string][] = [
		['Wenn eine Zahl durch 4 teilbar ist, dann ist sie durch 2 teilbar.', false, 'Umkehrung: „durch 2 teilbar → durch 4 teilbar". Gegenbeispiel: 6.'],
		['Wenn ein Dreieck gleichseitig ist, dann sind alle seine Winkel 60° groß.', true, 'Umkehrung: „alle Winkel 60° → gleichseitig" – das stimmt.'],
		['Wenn ein Viereck ein Quadrat ist, dann ist es ein Rechteck.', false, 'Umkehrung: „Rechteck → Quadrat". Gegenbeispiel: ein Rechteck mit 2 cm und 5 cm.'],
		['Wenn eine Zahl auf 0 endet, dann ist sie durch 10 teilbar.', true, 'Umkehrung: „durch 10 teilbar → endet auf 0" – das stimmt.'],
		['Wenn eine Zahl durch 6 teilbar ist, dann ist sie gerade.', false, 'Umkehrung: „gerade → durch 6 teilbar". Gegenbeispiel: 4.'],
		['Wenn ein Dreieck gleichschenklig ist, dann hat es zwei gleich große Winkel.', true, 'Umkehrung: „zwei gleich große Winkel → gleichschenklig" – das stimmt.'],
		['Wenn ein Viereck ein Rechteck ist, dann sind seine Diagonalen gleich lang.', false, 'Umkehrung: „Diagonalen gleich lang → Rechteck". Gegenbeispiel: ein gleichschenkliges Trapez.'],
		['Wenn eine Zahl durch 9 teilbar ist, dann ist ihre Quersumme durch 9 teilbar.', true, 'Umkehrung: „Quersumme durch 9 teilbar → Zahl durch 9 teilbar" – das stimmt (Teilbarkeitsregel).'],
		['Wenn eine Zahl eine Primzahl größer als 2 ist, dann ist sie ungerade.', false, 'Umkehrung: „ungerade → Primzahl größer als 2". Gegenbeispiel: 9.'],
		['Wenn ein Viereck vier gleich lange Seiten hat, dann ist es eine Raute.', true, 'Umkehrung: „Raute → vier gleich lange Seiten" – das stimmt.']
	];
	const [text, ok, reason] = pick(items);
	return { atomId, prompt: `Satz: „${text}" Gilt auch die Umkehrung des Satzes?`, answerType: 'boolean', correctAnswer: ok ? 'ja' : 'nein', hint: 'Vertausche Voraussetzung und Behauptung und suche ein Gegenbeispiel.', why: reason, difficulty: 0.6 };
});

// ── Export ────────────────────────────────────────────────────────────────────

export function generateTask(atomId: string, stage?: number): GeneratedTask | null {
	const gen = registry.get(atomId);
	if (!gen) return null;
	return gen(stage);
}

export function hasGenerator(atomId: string): boolean {
	return registry.has(atomId);
}

export const registeredAtomIds: string[] = [...registry.keys()];
