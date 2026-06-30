/**
 * Procedural task generators for all 80 practicable arithmetic atoms.
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
	difficulty?: number; // 0–1
}

type Gen = (mastery?: number) => GeneratedTask;

// ── Math helpers ──────────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
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

// Weight strategy by proximity to target difficulty (Gaussian kernel, σ≈0.14)
function diffWeight(strategyDiff: number, targetDiff: number): number {
	return Math.exp(-Math.pow(strategyDiff - targetDiff, 2) / 0.02);
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
		difficulty: step === 1 ? 0.1 : step === 2 ? 0.2 : 0.3
	};
});

reg('arithmetik__zahlverstaendnis_bis_20', () => {
	const type = rand(0, 2);
	if (type === 0) {
		const a = rand(1, 20), b = rand(1, 20);
		const [bigger, smaller] = a > b ? [a, b] : [b, a];
		return { atomId: 'arithmetik__zahlverstaendnis_bis_20', prompt: `Welche Zahl ist größer: ${a} oder ${b}?`, answerType: 'integer', correctAnswer: String(bigger), choices: [String(a), String(b)], difficulty: 0.15 };
	} else if (type === 1) {
		const n = rand(2, 19);
		return { atomId: 'arithmetik__zahlverstaendnis_bis_20', prompt: `Welche Zahl kommt nach ${n}?`, answerType: 'integer', correctAnswer: String(n + 1), difficulty: 0.1 };
	} else {
		const n = rand(2, 10);
		const a = rand(1, n - 1);
		return { atomId: 'arithmetik__zahlverstaendnis_bis_20', prompt: `${n} = ${a} + ___`, answerType: 'integer', correctAnswer: String(n - a), difficulty: 0.2 };
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
		difficulty: 0.15
	};
});

reg('arithmetik__stellenwert_bis_100', () => {
	const n = rand(11, 99);
	const tens = Math.floor(n / 10);
	const ones = n % 10;
	const q = rand(0, 1);
	if (q === 0) return { atomId: 'arithmetik__stellenwert_bis_100', prompt: `Wie viele Zehner hat die Zahl ${n}?`, answerType: 'integer', correctAnswer: String(tens), difficulty: 0.2 };
	return { atomId: 'arithmetik__stellenwert_bis_100', prompt: `Wie viele Einer hat die Zahl ${n}?`, answerType: 'integer', correctAnswer: String(ones), difficulty: 0.2 };
});

reg('arithmetik__stellenwert_bis_1000', () => {
	const n = rand(101, 999);
	const hundreds = Math.floor(n / 100);
	const tens = Math.floor((n % 100) / 10);
	const ones = n % 10;
	const q = pick(['H', 'Z', 'E']);
	const map: Record<string, [string, number]> = { H: ['Hunderter', hundreds], Z: ['Zehner', tens], E: ['Einer', ones] };
	const [label, val] = map[q];
	return { atomId: 'arithmetik__stellenwert_bis_1000', prompt: `Wie viele ${label} hat die Zahl ${n}?`, answerType: 'integer', correctAnswer: String(val), difficulty: 0.25 };
});

reg('arithmetik__stellenwert_bis_1000000', () => {
	const n = rand(10000, 999999);
	const digits = String(n).padStart(6, '0');
	const places = ['Hunderttausender', 'Zehntausender', 'Tausender', 'Hunderter', 'Zehner', 'Einer'];
	const idx = rand(0, 5);
	const digit = parseInt(digits[idx]);
	return { atomId: 'arithmetik__stellenwert_bis_1000000', prompt: `Welche Ziffer steht an der ${places[idx]}-Stelle der Zahl ${n.toLocaleString('de')}?`, answerType: 'integer', correctAnswer: String(digit), difficulty: 0.3 };
});

reg('arithmetik__natuerliche_zahlen_darstellen_ordnen', () => {
	const nums = Array.from({ length: 4 }, () => rand(10, 9999));
	nums.sort(() => Math.random() - 0.5);
	const sorted = [...nums].sort((a, b) => a - b);
	return { atomId: 'arithmetik__natuerliche_zahlen_darstellen_ordnen', prompt: `Welche ist die kleinste Zahl?`, answerType: 'integer', correctAnswer: String(sorted[0]), choices: nums.map(String), difficulty: 0.3 };
});

reg('arithmetik__runden_natuerliche_zahlen', () => {
	const to = pick([10, 100, 1000]);
	const n = rand(1, 9) * to + rand(1, to - 1);
	const rounded = Math.round(n / to) * to;
	return { atomId: 'arithmetik__runden_natuerliche_zahlen', prompt: `Runde ${n} auf ${to}er: ___`, answerType: 'integer', correctAnswer: String(rounded), hint: `Ab der Mitte (${to / 2}) wird aufgerundet.`, difficulty: 0.3 };
});

reg('arithmetik__roemische_zahlen', () => {
	const map: [number, string][] = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
	const n = rand(1, 399);
	let num = n, roman = '';
	for (const [val, sym] of map) { while (num >= val) { roman += sym; num -= val; } }
	const hint = 'M=1000, D=500, C=100, L=50, X=10, V=5, I=1. Subtraktionsregel: IV=4, IX=9, XL=40, XC=90, CD=400.';
	const q = rand(0, 1);
	if (q === 0) return { atomId: 'arithmetik__roemische_zahlen', prompt: `${roman} als arabische Zahl?`, answerType: 'integer', correctAnswer: String(n), hint, difficulty: 0.35 };
	return { atomId: 'arithmetik__roemische_zahlen', prompt: `${n} als römische Zahl?`, answerType: 'text', correctAnswer: roman, hint, difficulty: 0.4 };
});

reg('arithmetik__ueberschlagsrechnung', () => {
	const atomId = 'arithmetik__ueberschlagsrechnung';
	const op = pick(['+', '−', '·']);
	if (op === '+') {
		const a = rand(2, 9) * 10 + rand(3, 7), b = rand(2, 9) * 10 + rand(3, 7);
		const ra = Math.round(a / 10) * 10, rb = Math.round(b / 10) * 10;
		return { atomId, prompt: `Schätze: ${a} + ${b} ≈ ___  (runde auf Zehner)`, answerType: 'integer', correctAnswer: String(ra + rb), hint: `${a} ≈ ${ra}, ${b} ≈ ${rb}`, difficulty: 0.3 };
	}
	if (op === '−') {
		const a = rand(3, 9) * 10 + rand(3, 7), b = rand(1, 5) * 10 + rand(3, 7);
		const ra = Math.round(a / 10) * 10, rb = Math.round(b / 10) * 10;
		return { atomId, prompt: `Schätze: ${a} − ${b} ≈ ___  (runde auf Zehner)`, answerType: 'integer', correctAnswer: String(ra - rb), hint: `${a} ≈ ${ra}, ${b} ≈ ${rb}`, difficulty: 0.35 };
	}
	const x = rand(2, 6), y = rand(2, 7) * 10 + rand(3, 7);
	const ry = Math.round(y / 10) * 10;
	return { atomId, prompt: `Schätze: ${x} · ${y} ≈ ___  (runde auf Zehner)`, answerType: 'integer', correctAnswer: String(x * ry), hint: `${y} ≈ ${ry}, dann ${x} · ${ry}`, difficulty: 0.4 };
});

// ── 2. Grundrechenarten (kleine Zahlen) ───────────────────────────────────────

reg('arithmetik__addition_subtraktion_bis_10', () => {
	const op = rand(0, 1);
	if (op === 0) {
		const a = rand(1, 9), b = rand(1, 10 - a);
		return { atomId: 'arithmetik__addition_subtraktion_bis_10', prompt: `${a} + ${b} = ?`, answerType: 'integer', correctAnswer: String(a + b), difficulty: 0.1 };
	} else {
		const res = rand(1, 9), b = rand(1, res);
		return { atomId: 'arithmetik__addition_subtraktion_bis_10', prompt: `${res} − ${b} = ?`, answerType: 'integer', correctAnswer: String(res - b), difficulty: 0.1 };
	}
});

reg('arithmetik__add_sub_bis_20_ohne_uebergang', () => {
	const op = rand(0, 1);
	const a = rand(11, 19), bOnes = rand(1, 9 - (a % 10));
	if (op === 0) return { atomId: 'arithmetik__add_sub_bis_20_ohne_uebergang', prompt: `${a} + ${bOnes} = ?`, answerType: 'integer', correctAnswer: String(a + bOnes), difficulty: 0.15 };
	return { atomId: 'arithmetik__add_sub_bis_20_ohne_uebergang', prompt: `${a} − ${bOnes} = ?`, answerType: 'integer', correctAnswer: String(a - bOnes), difficulty: 0.15 };
});

reg('arithmetik__zehnerueberschreitung_bis_20', () => {
	const atomId = 'arithmetik__zehnerueberschreitung_bis_20';
	const op = rand(0, 1);
	if (op === 0) {
		const a = rand(7, 9), b = rand(10 - a + 1, 9);
		return { atomId, prompt: `${a} + ${b} = ?`, answerType: 'integer', correctAnswer: String(a + b), hint: `Nutze den Zehner: ${a} + ${10 - a} = 10, dann noch ${b - (10 - a)}.`, difficulty: 0.25 };
	}
	// Subtraction crossing ten: minuend ∈ [11,18], result ∈ [1,9]
	const minuend = rand(11, 18);
	const result = rand(1, 9);
	if (result >= minuend) return registry.get(atomId)!();
	const sub = minuend - result;
	return { atomId, prompt: `${minuend} − ${sub} = ?`, answerType: 'integer', correctAnswer: String(result), hint: `Zerlege ${sub}: ${minuend} − ${minuend - 10} = 10, dann − ${sub - (minuend - 10)}.`, difficulty: 0.3 };
});

reg('arithmetik__verdoppeln_halbieren', () => {
	const q = rand(0, 1);
	if (q === 0) { const n = rand(1, 25); return { atomId: 'arithmetik__verdoppeln_halbieren', prompt: `Das Doppelte von ${n} = ?`, answerType: 'integer', correctAnswer: String(2 * n), difficulty: 0.2 }; }
	const n = rand(1, 25) * 2;
	return { atomId: 'arithmetik__verdoppeln_halbieren', prompt: `Die Hälfte von ${n} = ?`, answerType: 'integer', correctAnswer: String(n / 2), difficulty: 0.2 };
});

reg('arithmetik__add_sub_zehnerzahlen', () => {
	const a = rand(1, 9) * 10, b = rand(1, 9) * 10;
	const op = rand(0, 1);
	if (op === 0) return { atomId: 'arithmetik__add_sub_zehnerzahlen', prompt: `${a} + ${b} = ?`, answerType: 'integer', correctAnswer: String(a + b), difficulty: 0.2 };
	const [big, small] = a > b ? [a, b] : [b, a];
	return { atomId: 'arithmetik__add_sub_zehnerzahlen', prompt: `${big} − ${small} = ?`, answerType: 'integer', correctAnswer: String(big - small), difficulty: 0.2 };
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
		return { atomId, prompt: `${a} + ${b} = ?`, answerType: 'integer', correctAnswer: String(a + b), difficulty: 0.25 };
	}
	// Subtraction without borrowing: ones of minuend >= ones of subtrahend
	const bigTens = rand(2, 9), bigOnes = rand(0, 9);
	const big = bigTens * 10 + bigOnes;
	const smallOnes = rand(0, bigOnes); // no borrowing needed
	const smallTens = rand(0, bigTens - 1);
	const small = smallTens * 10 + smallOnes;
	if (small === 0) return registry.get(atomId)!();
	return { atomId, prompt: `${big} − ${small} = ?`, answerType: 'integer', correctAnswer: String(big - small), difficulty: 0.25 };
});

reg('arithmetik__add_sub_bis_100_mit_uebergang', () => {
	const atomId = 'arithmetik__add_sub_bis_100_mit_uebergang';
	const op = rand(0, 1);
	if (op === 0) {
		// Addition with carry: ones digits must cross ten
		const a = rand(15, 85);
		const b = rand(10 - (a % 10) + 1, Math.min(30, 99 - a));
		return { atomId, prompt: `${a} + ${b} = ?`, answerType: 'integer', correctAnswer: String(a + b), difficulty: 0.35 };
	}
	// Subtraction with borrowing: ones of minuend < ones of subtrahend
	const bigTens = rand(2, 9), bigOnes = rand(0, 8);
	const big = bigTens * 10 + bigOnes;
	const smallOnes = rand(bigOnes + 1, 9); // forces borrowing
	const smallTens = rand(1, bigTens - 1);  // result stays >= 10
	const small = smallTens * 10 + smallOnes;
	return { atomId, prompt: `${big} − ${small} = ?`, answerType: 'integer', correctAnswer: String(big - small), difficulty: 0.35 };
});

// ── 3. Schriftliche Verfahren ─────────────────────────────────────────────────

reg('arithmetik__schriftliche_addition', () => {
	const a = rand(100, 9999), b = rand(100, 9999);
	return { atomId: 'arithmetik__schriftliche_addition', prompt: `${a} + ${b} = ?`, answerType: 'integer', correctAnswer: String(a + b), hint: 'Schreibe untereinander und addiere stellenweise von rechts.', difficulty: 0.4 };
});

reg('arithmetik__schriftliche_subtraktion', () => {
	const b = rand(100, 4999), a = b + rand(100, 4999);
	return { atomId: 'arithmetik__schriftliche_subtraktion', prompt: `${a} − ${b} = ?`, answerType: 'integer', correctAnswer: String(a - b), hint: 'Schreibe untereinander. Entbündele wenn nötig.', difficulty: 0.4 };
});

reg('arithmetik__schriftliche_multiplikation', () => {
	const atomId = 'arithmetik__schriftliche_multiplikation';
	const r = Math.random();
	let a: number, b: number;
	if (r < 0.3) {
		a = rand(13, 99); b = rand(2, 9);
	} else if (r < 0.7) {
		a = rand(13, 99); do { b = rand(11, 39); } while (b % 10 === 0);
	} else {
		// 2-digit × 3-digit
		a = rand(12, 99); b = rand(101, 299);
	}
	return { atomId, prompt: `${a} · ${b} = ?`, answerType: 'integer', correctAnswer: String(a * b), hint: 'Berechne die Teilprodukte und addiere.', difficulty: b > 99 ? 0.6 : 0.5 };
});

reg('arithmetik__schriftliche_division', () => {
	const divisor = rand(2, 9), quotient = rand(10, 999);
	const dividend = divisor * quotient;
	return { atomId: 'arithmetik__schriftliche_division', prompt: `${dividend} : ${divisor} = ?`, answerType: 'integer', correctAnswer: String(quotient), difficulty: 0.5 };
});

// ── 4. Halbschriftlich / Kopfrechnen ─────────────────────────────────────────

reg('arithmetik__halbschriftliches_rechnen', () => {
	const strategy = rand(0, 2);
	if (strategy === 0) {
		const a = rand(1, 9) * 100 + rand(1, 9) * 10, b = rand(1, 9) * 10 + rand(1, 9);
		return { atomId: 'arithmetik__halbschriftliches_rechnen', prompt: `${a} + ${b} = ?`, answerType: 'integer', correctAnswer: String(a + b), difficulty: 0.45 };
	} else if (strategy === 1) {
		const a = rand(2, 9) * 100, b = rand(10, 99);
		return { atomId: 'arithmetik__halbschriftliches_rechnen', prompt: `${a} − ${b} = ?`, answerType: 'integer', correctAnswer: String(a - b), difficulty: 0.45 };
	} else {
		const a = rand(11, 99), b = rand(11, 99);
		return { atomId: 'arithmetik__halbschriftliches_rechnen', prompt: `${a} · 10 + ${b} = ?`, answerType: 'integer', correctAnswer: String(a * 10 + b), difficulty: 0.45 };
	}
});

reg('arithmetik__rechengesetze_rechenvorteile', () => {
	const atomId = 'arithmetik__rechengesetze_rechenvorteile';
	const type = rand(0, 3);
	if (type === 0) {
		const a = rand(1, 9), b = rand(1, 9);
		return { atomId, prompt: `${a} + ${b} = ${b} + ___  (Kommutativgesetz)`, answerType: 'integer', correctAnswer: String(a), difficulty: 0.2 };
	} else if (type === 1) {
		const a = rand(10, 50), b = rand(1, 9) * 10;
		return { atomId, prompt: `${a} + ${b} + ${100 - b} = ?  (suche den Rechenweg)`, answerType: 'integer', correctAnswer: String(a + 100), difficulty: 0.35 };
	} else if (type === 2) {
		const a = rand(2, 9), b = rand(2, 9), c = rand(2, 9);
		return { atomId, prompt: `(${a} · ${b}) · ${c} = ${a} · (${b} · ___)`, answerType: 'integer', correctAnswer: String(c), hint: 'Assoziativgesetz: Reihenfolge der Klammern ist egal.', difficulty: 0.25 };
	} else {
		const a = rand(2, 6), b = rand(2, 8), c = rand(2, 8);
		return { atomId, prompt: `${a} · (${b} + ${c}) = ${a} · ${b} + ${a} · ___`, answerType: 'integer', correctAnswer: String(c), hint: `Distributivgesetz: a·(b+c) = a·b + a·c`, difficulty: 0.4 };
	}
});

// ── 5. Multiplikation & Division ─────────────────────────────────────────────

reg('arithmetik__multiplikationsverstaendnis', () => {
	const a = rand(2, 5), b = rand(2, 6);
	const type = rand(0, 1);
	if (type === 0) return { atomId: 'arithmetik__multiplikationsverstaendnis', prompt: `${a} · ${b} = ?  (${b} mal ${a} zusammenzählen)`, answerType: 'integer', correctAnswer: String(a * b), difficulty: 0.2 };
	return { atomId: 'arithmetik__multiplikationsverstaendnis', prompt: `${a} Reihen mit je ${b} Feldern — wie viele Felder insgesamt?`, answerType: 'integer', correctAnswer: String(a * b), difficulty: 0.2 };
});

reg('arithmetik__einmaleins_kernaufgaben', () => {
	const atomId = 'arithmetik__einmaleins_kernaufgaben';
	if (rand(0, 1) === 0) {
		const rows = [1, 2, 5, 10];
		const a = pick(rows), b = rand(1, 10);
		return { atomId, prompt: `${a} · ${b} = ?`, answerType: 'integer', correctAnswer: String(a * b), difficulty: 0.2 };
	}
	const n = rand(3, 10);
	return { atomId, prompt: `${n} · ${n} = ?`, answerType: 'integer', correctAnswer: String(n * n), hint: `${n}² = ${n} · ${n}`, difficulty: 0.3 };
});

reg('arithmetik__einmaleins_ableiten', () => {
	const atomId = 'arithmetik__einmaleins_ableiten';
	type Strategy = { base: number; derived: number; hintFn: (b: number) => string };
	const strategies: Strategy[] = [
		{ base: 2, derived: 3, hintFn: b => `addiere einmal ${b}` },
		{ base: 5, derived: 6, hintFn: b => `addiere einmal ${b}` },
		{ base: 2, derived: 4, hintFn: b => `verdopple ${2 * b}` },
		{ base: 5, derived: 7, hintFn: b => `addiere ${2 * b}` },
		{ base: 4, derived: 8, hintFn: b => `verdopple ${4 * b}` },
		{ base: 10, derived: 9, hintFn: b => `ziehe einmal ${b} ab` },
	];
	const { base, derived, hintFn } = pick(strategies);
	const b = rand(3, 9);
	return { atomId, prompt: `Wenn ${base} · ${b} = ${base * b}, was ist dann ${derived} · ${b}?`, answerType: 'integer', correctAnswer: String(derived * b), hint: `${base} · ${b} = ${base * b} → ${hintFn(b)}.`, difficulty: 0.3 };
});

reg('arithmetik__einmaleins_automatisierung', () => {
	const a = rand(2, 9), b = rand(2, 9);
	return { atomId: 'arithmetik__einmaleins_automatisierung', prompt: `${a} · ${b} = ?`, answerType: 'integer', correctAnswer: String(a * b), difficulty: 0.35 };
});

reg('arithmetik__division_grundverstaendnis', () => {
	const atomId = 'arithmetik__division_grundverstaendnis';
	const b = rand(2, 9), q = rand(2, 10);
	const a = b * q;
	const type = rand(0, 2);
	if (type === 0) return { atomId, prompt: `${a} : ${b} = ?`, answerType: 'integer', correctAnswer: String(q), difficulty: 0.3 };
	if (type === 1) return { atomId, prompt: `${a} Äpfel gleichmäßig auf ${b} Körbe — wie viele Äpfel pro Korb? (Aufteilen)`, answerType: 'integer', correctAnswer: String(q), difficulty: 0.3 };
	// Quotitive: how many groups of b fit in a?
	return { atomId, prompt: `${a} Äpfel. In jeden Korb passen genau ${b} Äpfel. Wie viele Körbe braucht man? (Verteilen)`, answerType: 'integer', correctAnswer: String(q), hint: `${a} : ${b} = ?`, difficulty: 0.35 };
});

reg('arithmetik__division_mit_rest', () => {
	const b = rand(2, 9), q = rand(2, 10), r = rand(1, b - 1);
	const a = b * q + r;
	const which = rand(0, 1);
	if (which === 0) return { atomId: 'arithmetik__division_mit_rest', prompt: `${a} : ${b} = ? Rest ${r}`, answerType: 'integer', correctAnswer: String(q), hint: `${a} = ${b} · ${q} + ${r}`, difficulty: 0.4, inputData: { sublabel: 'Gesucht: Quotient' } };
	return { atomId: 'arithmetik__division_mit_rest', prompt: `${a} : ${b} = ${q} Rest ?`, answerType: 'integer', correctAnswer: String(r), hint: `${a} − ${b} · ${q} = ?`, difficulty: 0.4, inputData: { sublabel: 'Gesucht: Rest' } };
});

// ── 6. Vorrangregeln / Rechengesetze ─────────────────────────────────────────

reg('arithmetik__vorrangregeln', () => {
	const type = rand(0, 2);
	if (type === 0) {
		const a = rand(2, 8), b = rand(2, 5), c = rand(2, 5);
		return { atomId: 'arithmetik__vorrangregeln', prompt: `${a} + ${b} · ${c} = ?  (Punkt vor Strich)`, answerType: 'integer', correctAnswer: String(a + b * c), hint: 'Zuerst multiplizieren, dann addieren.', difficulty: 0.4 };
	} else if (type === 1) {
		const a = rand(2, 8), b = rand(2, 5), c = rand(2, 5);
		return { atomId: 'arithmetik__vorrangregeln', prompt: `(${a} + ${b}) · ${c} = ?`, answerType: 'integer', correctAnswer: String((a + b) * c), hint: 'Zuerst die Klammer ausrechnen.', difficulty: 0.35 };
	} else {
		const a = rand(10, 30), b = rand(2, 5), c = rand(2, 5);
		return { atomId: 'arithmetik__vorrangregeln', prompt: `${a} − ${b} · ${c} = ?`, answerType: 'integer', correctAnswer: String(a - b * c), difficulty: 0.4 };
	}
});

// ── 7. Muster & Zahlenfolgen ─────────────────────────────────────────────────

reg('arithmetik__muster_zahlenfolgen_grundschule', () => {
	const atomId = 'arithmetik__muster_zahlenfolgen_grundschule';
	const type = rand(0, 3);
	if (type === 0) {
		const start = rand(1, 10), step = rand(2, 5);
		const seq = [0, 1, 2, 3, 4].map(i => start + i * step);
		const missing = rand(1, 3);
		const display = seq.slice(0, 5).map((v, i) => i === missing ? '___' : String(v)).join(', ');
		return { atomId, prompt: `Welche Zahl fehlt? ${display}`, answerType: 'integer', correctAnswer: String(seq[missing]), hint: `Die Folge wächst in ${step}er-Schritten.`, difficulty: 0.3 };
	} else if (type === 1) {
		const start = rand(5, 20), step = rand(2, 4);
		const seq = [0, 1, 2, 3, 4].map(i => start - i * step);
		return { atomId, prompt: `Wie geht die Folge weiter? ${seq.slice(0, 4).join(', ')}, ___`, answerType: 'integer', correctAnswer: String(seq[4]), hint: `Die Folge nimmt um ${step} ab.`, difficulty: 0.3 };
	} else if (type === 2) {
		const base = rand(1, 5);
		const seq = [base, base * 2, base * 4, base * 8];
		return { atomId, prompt: `${seq[0]}, ${seq[1]}, ${seq[2]}, ___`, answerType: 'integer', correctAnswer: String(seq[3]), hint: 'Jede Zahl wird verdoppelt.', difficulty: 0.35 };
	} else {
		// Zahlenmauer: jede Zahl = Summe der zwei darunter
		// Untere Reihe: a, b, c  →  Mitte: a+b, b+c  →  Oben: a+b+b+c
		const a = rand(1, 8), b = rand(1, 8), c = rand(1, 8);
		const ab = a + b, bc = b + c, top = ab + bc;
		const which = pick(['a', 'b', 'c'] as const);
		const missing = which === 'a' ? a : which === 'b' ? b : c;
		return { atomId, prompt: 'Welche Zahl fehlt in der Zahlenmauer?', answerType: 'integer', correctAnswer: String(missing), inputData: { type: 'zahlenmauer', top, ab, bc, a, b, c, missing: which }, hint: 'Jede Zahl ist die Summe der zwei Zahlen darunter.', difficulty: 0.4 };
	}
});

// ── 8. Sachaufgaben ───────────────────────────────────────────────────────────

reg('arithmetik__sachaufgaben_grundschule', () => {
	const templates = [
		() => { const n = rand(2, 8), p = rand(1, 5); const total = n * p; return { q: `Ein Buch kostet ${p} €. ${n} Kinder kaufen je ein Buch. Wie viel kostet das insgesamt?`, a: total }; },
		() => { const total = rand(10, 50), per = rand(2, 8); const left = total % per; return { q: `${total} Bonbons werden auf ${per} Kinder verteilt. Wie viele Bonbons bleiben übrig?`, a: left }; },
		() => { const start = rand(20, 100), spend = rand(5, start - 5); return { q: `Anna hat ${start} €. Sie gibt ${spend} € aus. Wie viel hat sie noch?`, a: start - spend }; },
		() => { const l = rand(2, 9), w = rand(2, 6); return { q: `Ein Rechteck ist ${l} cm lang und ${w} cm breit. Wie groß ist der Umfang?`, a: 2 * (l + w) }; }
	];
	const t = pick(templates)();
	return { atomId: 'arithmetik__sachaufgaben_grundschule', prompt: t.q, answerType: 'integer', correctAnswer: String(t.a), difficulty: 0.4 };
});

// ── 9. Teilbarkeit ────────────────────────────────────────────────────────────

reg('arithmetik__teiler_vielfache', () => {
	const atomId = 'arithmetik__teiler_vielfache';
	const n = pick([6, 8, 10, 12, 15, 18, 20, 24, 30, 36]);
	const divisors = Array.from({ length: n }, (_, i) => i + 1).filter(d => n % d === 0);
	const type = rand(0, 3);
	if (type === 0) {
		const d = pick(divisors.slice(1, -1));
		return { atomId, prompt: `Ist ${d} ein Teiler von ${n}?`, answerType: 'boolean', correctAnswer: 'ja', difficulty: 0.3 };
	} else if (type === 1) {
		const notDiv = pick(Array.from({ length: n - 1 }, (_, i) => i + 2).filter(d => n % d !== 0));
		return { atomId, prompt: `Ist ${notDiv} ein Teiler von ${n}?`, answerType: 'boolean', correctAnswer: 'nein', difficulty: 0.3 };
	} else if (type === 2) {
		// How many divisors does n have?
		return { atomId, prompt: `Wie viele Teiler hat ${n}?`, answerType: 'integer', correctAnswer: String(divisors.length), hint: `Schreibe alle Teiler auf: ${divisors.join(', ')}`, difficulty: 0.4 };
	} else {
		// Name a multiple of n
		const k = rand(2, 10);
		return { atomId, prompt: `Nenne das ${k}. Vielfache von ${n}.`, answerType: 'integer', correctAnswer: String(n * k), hint: `${k} · ${n} = ?`, difficulty: 0.35 };
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
	const n = rand(10, 999);
	const answer = r.check(n) ? 'ja' : 'nein';
	return { atomId: 'arithmetik__teilbarkeitsregeln', prompt: `Ist ${n} durch ${r.rule} teilbar?`, answerType: 'boolean', correctAnswer: answer, hint: r.hint, difficulty: 0.35 };
});

reg('arithmetik__primzahlen_primfaktorzerlegung', () => {
	const atomId = 'arithmetik__primzahlen_primfaktorzerlegung';
	const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
	const composites = [4, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21, 22, 24, 25, 26, 27, 28];
	const q = rand(0, 3);
	if (q === 0) {
		const n = pick([...primes, ...composites.slice(0, 6)]);
		return { atomId, prompt: `Ist ${n} eine Primzahl?`, answerType: 'boolean', correctAnswer: primes.includes(n) ? 'ja' : 'nein', difficulty: 0.4 };
	} else if (q === 1) {
		const p1 = pick([2, 3, 5, 7]), p2 = pick([2, 3, 5, 7]);
		return { atomId, prompt: `Was ist der kleinste Primfaktor von ${p1 * p2}?`, answerType: 'integer', correctAnswer: String(Math.min(p1, p2)), difficulty: 0.45 };
	} else if (q === 2) {
		// Full prime factorisation: ask for exponent of a specific prime
		const p1 = pick([2, 3]), p2 = pick([2, 3, 5, 7].filter(x => x !== p1));
		const e1 = rand(1, 3), e2 = rand(1, 2);
		const n = p1 ** e1 * p2 ** e2;
		return { atomId, prompt: `${n} = ${pow(p1, '?')} · ${pow(p2, e2)} — welcher Exponent gehört zu ${p1}?`, answerType: 'integer', correctAnswer: String(e1), hint: `Zerlege ${n} in Primfaktoren: durch ${p1} teilen.`, difficulty: 0.5 };
	} else {
		// Count prime factors (with multiplicity)
		const p = pick([2, 3, 5]);
		const e = rand(2, 4);
		const n = p ** e;
		return { atomId, prompt: `${n} = ${pow(p, '?')} — welcher Exponent?`, answerType: 'integer', correctAnswer: String(e), hint: `Wie oft ist ${p} als Primfaktor enthalten?`, difficulty: 0.45 };
	}
});

reg('arithmetik__ggt_kgv', () => {
	const pairs = [[4,6],[6,9],[8,12],[6,10],[9,12],[4,8],[5,15],[6,8],[10,15],[12,18]];
	const [a, b] = pick(pairs);
	const q = rand(0, 1);
	if (q === 0) return { atomId: 'arithmetik__ggt_kgv', prompt: `ggT(${a}, ${b}) = ?`, answerType: 'integer', correctAnswer: String(gcd(a, b)), hint: 'Größter gemeinsamer Teiler.', difficulty: 0.5 };
	return { atomId: 'arithmetik__ggt_kgv', prompt: `kgV(${a}, ${b}) = ?`, answerType: 'integer', correctAnswer: String(lcm(a, b)), hint: 'Kleinstes gemeinsames Vielfaches.', difficulty: 0.5 };
});

// ── 10. Bruchrechnung ─────────────────────────────────────────────────────────

reg('arithmetik__bruchteile_im_alltag', () => {
	const fracs: Array<[number, number]> = [[1,2],[1,4],[3,4],[1,3],[2,3]];
	const [n, d] = pick(fracs);
	const total = d * rand(1, 5);
	const result = (n * total) / d;
	const labels = pick(['Kinder', 'Äpfel', 'Schüler', 'Bonbons']);
	return { atomId: 'arithmetik__bruchteile_im_alltag', prompt: `${fmtFrac(n, d)} von ${total} ${labels} = ?`, answerType: 'integer', correctAnswer: String(result), hint: `Teile durch ${d}, dann mal ${n}.`, difficulty: 0.3 };
});

reg('arithmetik__bruch_anteil_eines_ganzen', () => {
	const d = pick([2, 3, 4, 5, 6, 8, 10]);
	const n = rand(1, d - 1);
	const wholeTotal = d * rand(1, 4);
	const result = (n * wholeTotal) / d;
	return { atomId: 'arithmetik__bruch_anteil_eines_ganzen', prompt: `Ein Ganzes hat ${wholeTotal} gleiche Teile. Wie viele Teile sind ${fmtFrac(n, d)} davon?`, answerType: 'integer', correctAnswer: String(result), difficulty: 0.35 };
});

reg('arithmetik__bruch_anteil_einer_menge', () => {
	const d = pick([2, 3, 4, 5, 6, 8, 10]);
	const n = rand(1, d - 1);
	const total = d * rand(2, 8);
	return { atomId: 'arithmetik__bruch_anteil_einer_menge', prompt: `${fmtFrac(n, d)} von ${total} = ?`, answerType: 'integer', correctAnswer: String((n * total) / d), hint: `Erst durch ${d}, dann mal ${n}.`, difficulty: 0.4 };
});

reg('arithmetik__brueche_am_zahlenstrahl', () => {
	const d = pick([2, 3, 4, 5, 8, 10]);
	const n = rand(1, 2 * d - 1);
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
			hint: `Erweitere auf ${d}stel und zähle ${n} Abschnitte vom Nullpunkt.`, difficulty: 0.45
		};
	}
	// Arrow shows position → student names the fraction's numerator (denominator = d)
	return {
		atomId: 'arithmetik__brueche_am_zahlenstrahl',
		prompt: `Der Pfeil zeigt auf einen Punkt. Welcher Bruch mit Nenner ${d} liegt dort?`,
		answerType: 'integer', correctAnswer: String(n),
		svg: svgFractionLine(d, n),
		inputData: { type: 'fraction_part', missing: 'numerator', knownDen: d },
		hint: `Zähle die Abschnitte vom Nullpunkt bis zum Pfeil.`, difficulty: 0.45
	};
});

reg('arithmetik__brueche_vergleichen_ordnen', (mastery = 0) => {
	const atomId = 'arithmetik__brueche_vergleichen_ordnen';
	// Target difficulty scales with mastery: 0 → 0.3 (easy), 1 → 0.65 (hard)
	const target = 0.3 + mastery * 0.35;
	const strategy = pickWeighted<string>([
		['gleicher_nenner',     diffWeight(0.3,  target)],
		['gleicher_zaehler',    diffWeight(0.45, target)],
		['vergleich_halb',      diffWeight(0.5,  target)],
		['verschiedene_nenner', diffWeight(0.6,  target)],
	]);

	if (strategy === 'gleicher_nenner') {
		const d = pick([3, 4, 5, 6, 8, 10, 12]);
		const n1 = rand(1, d - 1), n2 = rand(1, d - 1);
		if (n1 === n2) return registry.get(atomId)!(mastery);
		return { atomId, prompt: `${fmtFrac(n1, d)} ☐ ${fmtFrac(n2, d)}`, answerType: 'comparison', correctAnswer: n1 > n2 ? '>' : '<', hint: `Gleicher Nenner: größerer Zähler = größerer Bruch.`, difficulty: 0.3 };
	}

	if (strategy === 'gleicher_zaehler') {
		const n = rand(1, 5);
		const d1 = rand(n + 1, 12), d2 = rand(n + 1, 12);
		if (d1 === d2) return registry.get(atomId)!(mastery);
		return { atomId, prompt: `${fmtFrac(n, d1)} ☐ ${fmtFrac(n, d2)}`, answerType: 'comparison', correctAnswer: d1 < d2 ? '>' : '<', hint: `Gleicher Zähler: kleinerer Nenner = größerer Bruch.`, difficulty: 0.45 };
	}

	if (strategy === 'vergleich_halb') {
		const d1 = pick([4, 5, 6, 8, 10]);
		const d2 = pick([3, 4, 6, 8, 10]);
		const n1 = rand(Math.ceil(d1 / 2) + 1, d1 - 1); // > 1/2
		const n2 = rand(1, Math.floor((d2 - 1) / 2));   // < 1/2
		if (n2 < 1 || n1 >= d1) return registry.get(atomId)!(mastery);
		return { atomId, prompt: `${fmtFrac(n1, d1)} ☐ ${fmtFrac(n2, d2)}`, answerType: 'comparison', correctAnswer: '>', hint: `Tipp: Vergleiche mit ½. Ein Bruch ist größer als ½, der andere kleiner.`, difficulty: 0.5 };
	}

	// verschiedene_nenner: gleichnamig machen
	const pairs: [number, number][] = [[2,3],[2,5],[3,4],[3,5],[4,5],[2,7],[3,8],[4,6]];
	const [d1, d2] = pick(pairs);
	const n1 = rand(1, d1 - 1), n2 = rand(1, d2 - 1);
	const cmp = n1 * d2 - n2 * d1;
	if (cmp === 0) return registry.get(atomId)!(mastery);
	return { atomId, prompt: `${fmtFrac(n1, d1)} ☐ ${fmtFrac(n2, d2)}`, answerType: 'comparison', correctAnswer: cmp > 0 ? '>' : '<', hint: `Tipp: Mache die Brüche gleichnamig (Hauptnenner: ${lcm(d1, d2)}).`, difficulty: 0.6 };
});

reg('arithmetik__erweitern', () => {
	const atomId = 'arithmetik__erweitern';
	const n = rand(1, 5), d = rand(2, 6), factor = rand(2, 5);
	const hint = `Zähler und Nenner mit ${factor} multiplizieren.`;
	if (rand(0, 1) === 0) {
		return { atomId, prompt: `Erweitere ${fmtFrac(n, d)} mit ${factor}:`, answerType: 'integer' as const, correctAnswer: String(n * factor), hint, difficulty: 0.35,
			inputData: { type: 'fraction_part', missing: 'numerator', knownDen: d * factor } };
	}
	return { atomId, prompt: `Erweitere ${fmtFrac(n, d)} mit ${factor}:`, answerType: 'integer' as const, correctAnswer: String(d * factor), hint, difficulty: 0.35,
		inputData: { type: 'fraction_part', missing: 'denominator', knownNum: n * factor } };
});

reg('arithmetik__kuerzen', () => {
	const atomId = 'arithmetik__kuerzen';
	// Ensure n/d is already fully reduced (coprime), so the result fraction is unambiguous
	let n = rand(1, 5), d = rand(n + 1, 8);
	while (gcd(n, d) !== 1) { n = rand(1, 5); d = rand(n + 1, 8); }
	const factor = rand(2, 4);
	const g = gcd(n * factor, d * factor);
	const hint = `Teile Zähler und Nenner durch ${g}.`;
	if (rand(0, 1) === 0) {
		return { atomId, prompt: `Kürze ${fmtFrac(n * factor, d * factor)} vollständig:`, answerType: 'integer' as const, correctAnswer: String(n), hint, difficulty: 0.4,
			inputData: { type: 'fraction_part', missing: 'numerator', knownDen: d } };
	}
	return { atomId, prompt: `Kürze ${fmtFrac(n * factor, d * factor)} vollständig:`, answerType: 'integer' as const, correctAnswer: String(d), hint, difficulty: 0.4,
		inputData: { type: 'fraction_part', missing: 'denominator', knownNum: n } };
});

reg('arithmetik__gemischte_zahlen_unechte_brueche', () => {
	const atomId = 'arithmetik__gemischte_zahlen_unechte_brueche';
	// Ensure n/d is coprime so the fraction part is unambiguous in the visual
	const whole = rand(1, 5);
	let n = rand(1, 5), d = rand(n + 1, 6);
	while (gcd(n, d) !== 1) { n = rand(1, 5); d = rand(n + 1, 6); }
	const num = whole * d + n;
	const type = rand(0, 2);
	if (type === 0) {
		// Mixed → improper: denominator stays d, only numerator is unknown
		return { atomId, prompt: `${fmtMixed(whole, n, d)} als unechter Bruch:`, answerType: 'fraction' as const, correctAnswer: frac(num, d), hint: `${whole} · ${d} + ${n} = ${num}`, difficulty: 0.45,
			inputData: { type: 'fraction_part', missing: 'numerator', knownDen: d } };
	} else if (type === 1) {
		// Improper → whole part: show [?] n/d
		return { atomId, prompt: `${fmtFrac(num, d)} als gemischte Zahl:`, answerType: 'integer' as const, correctAnswer: String(whole), difficulty: 0.4,
			inputData: { type: 'mixed_part', missing: 'whole', numerator: n, denominator: d } };
	} else {
		// Improper → fraction part: show whole [?]/d
		return { atomId, prompt: `${fmtFrac(num, d)} als gemischte Zahl:`, answerType: 'fraction' as const, correctAnswer: frac(n, d), hint: `${num} : ${d} = ${whole} Rest ${n}`, difficulty: 0.5,
			inputData: { type: 'mixed_part', missing: 'numerator', whole, denominator: d } };
	}
});

reg('arithmetik__brueche_add_sub_gleichnamig', () => {
	const d = rand(3, 10);
	const n1 = rand(1, d - 1), n2 = rand(1, d - n1);
	const op = rand(0, 1);
	if (op === 0) {
		const [rn, rd] = [n1 + n2, d];
		const g = gcd(rn, rd);
		return { atomId: 'arithmetik__brueche_add_sub_gleichnamig', prompt: `${fmtFrac(n1, d)} + ${fmtFrac(n2, d)} = ?`, answerType: 'fraction', correctAnswer: frac(rn, rd), difficulty: 0.4 };
	} else {
		const [big, small] = n1 >= n2 ? [n1, n2] : [n2, n1];
		return { atomId: 'arithmetik__brueche_add_sub_gleichnamig', prompt: `${fmtFrac(big, d)} − ${fmtFrac(small, d)} = ?`, answerType: 'fraction', correctAnswer: frac(big - small, d), difficulty: 0.4 };
	}
});

reg('arithmetik__brueche_add_sub_ungleichnamig', () => {
	const denoms = [[2,3],[2,4],[2,5],[3,4],[3,6],[4,6],[3,9],[4,8]];
	const [d1, d2] = pick(denoms);
	const n1 = rand(1, d1 - 1), n2 = rand(1, d2 - 1);
	const op = rand(0, 1);
	const l = lcm(d1, d2);
	const sumNum = n1 * (l / d1) + (op === 0 ? 1 : -1) * n2 * (l / d2);
	if (sumNum <= 0) return registry.get('arithmetik__brueche_add_sub_ungleichnamig')!();
	const sym = op === 0 ? '+' : '−';
	return { atomId: 'arithmetik__brueche_add_sub_ungleichnamig', prompt: `${fmtFrac(n1, d1)} ${sym} ${fmtFrac(n2, d2)} = ?`, answerType: 'fraction', correctAnswer: frac(sumNum, l), hint: `Hauptnenner: ${l}`, difficulty: 0.55 };
});

reg('arithmetik__gemischte_zahlen_add_sub', () => {
	const atomId = 'arithmetik__gemischte_zahlen_add_sub';
	const [w1, n1, d] = [rand(1, 4), rand(1, 3), pick([4, 6, 8])];
	const [w2, n2] = [rand(1, 3), rand(1, 3)];
	const op = rand(0, 1);
	if (op === 0) {
		const totalN = n1 + n2, totalW = w1 + w2 + Math.floor(totalN / d);
		const remN = totalN % d;
		if (remN === 0) {
			return { atomId, prompt: `${fmtMixed(w1, n1, d)} + ${fmtMixed(w2, n2, d)} = ?`, answerType: 'integer', correctAnswer: String(totalW), difficulty: 0.5 };
		}
		if (rand(0, 1) === 0) {
			return { atomId, prompt: `${fmtMixed(w1, n1, d)} + ${fmtMixed(w2, n2, d)} — ganzer Anteil des Ergebnisses?`, answerType: 'integer', correctAnswer: String(totalW), hint: 'Addiere ganze Zahlen und Bruchteile getrennt.', difficulty: 0.5 };
		}
		return { atomId, prompt: `${fmtMixed(w1, n1, d)} + ${fmtMixed(w2, n2, d)} — Bruchanteil des Ergebnisses?`, answerType: 'fraction', correctAnswer: frac(remN, d), hint: `${n1} + ${n2} = ${totalN} → Bruchanteil ${fmtFrac(remN, d)}`, difficulty: 0.55 };
	}
	const [bw, bn, sw, sn] = w1 + n1 / d >= w2 + n2 / d ? [w1, n1, w2, n2] : [w2, n2, w1, n1];
	const totalN = bw * d + bn - sw * d - sn;
	return { atomId, prompt: `${fmtMixed(bw, bn, d)} − ${fmtMixed(sw, sn, d)} = ?`, answerType: 'fraction', correctAnswer: frac(totalN, d), difficulty: 0.55 };
});

reg('arithmetik__bruch_mal_natuerliche_zahl', () => {
	const d = pick([2, 3, 4, 5, 6, 8]), n = rand(1, d - 1), z = rand(2, d * 2);
	const [rn, rd] = [n * z, d];
	return { atomId: 'arithmetik__bruch_mal_natuerliche_zahl', prompt: `${fmtFrac(n, d)} · ${z} = ?`, answerType: rd / gcd(rn, rd) === 1 ? 'integer' : 'fraction', correctAnswer: rd / gcd(rn, rd) === 1 ? String(rn / gcd(rn, rd)) : frac(rn, rd), difficulty: 0.4 };
});

reg('arithmetik__bruch_mal_bruch', () => {
	const [n1, d1, n2, d2] = [rand(1, 4), rand(2, 5), rand(1, 4), rand(2, 5)];
	return { atomId: 'arithmetik__bruch_mal_bruch', prompt: `${fmtFrac(n1, d1)} · ${fmtFrac(n2, d2)} = ?`, answerType: 'fraction', correctAnswer: frac(n1 * n2, d1 * d2), hint: 'Zähler · Zähler, Nenner · Nenner, dann kürzen.', difficulty: 0.5 };
});

reg('arithmetik__division_durch_bruch', () => {
	const [n1, d1, n2, d2] = [rand(1, 4), rand(2, 5), rand(1, 4), rand(2, 5)];
	return { atomId: 'arithmetik__division_durch_bruch', prompt: `${fmtFrac(n1, d1)} : ${fmtFrac(n2, d2)} = ?`, answerType: 'fraction', correctAnswer: frac(n1 * d2, d1 * n2), hint: 'Multipliziere mit dem Kehrwert.', difficulty: 0.55 };
});

// ── 11. Dezimalzahlen ─────────────────────────────────────────────────────────

reg('arithmetik__dezimalzahlen_stellenwert', () => {
	const whole = rand(1, 99), dec1 = rand(0, 9), dec2 = rand(0, 9);
	const n = parseFloat(`${whole}.${dec1}${dec2}`);
	const q = rand(0, 1);
	if (q === 0) return { atomId: 'arithmetik__dezimalzahlen_stellenwert', prompt: `Welche Ziffer steht an der Zehntelstelle von ${dec(n)}?`, answerType: 'integer', correctAnswer: String(dec1), difficulty: 0.35 };
	return { atomId: 'arithmetik__dezimalzahlen_stellenwert', prompt: `Welche Ziffer steht an der Hundertstelstelle von ${dec(n)}?`, answerType: 'integer', correctAnswer: String(dec2), difficulty: 0.35 };
});

reg('arithmetik__dezimalzahlen_vergleichen_ordnen_runden', () => {
	const type = rand(0, 1);
	if (type === 0) {
		const place = rand(0, 1);
		if (place === 0) {
			// Second decimal must be 1–9 so the task is non-trivial
			const n = rand(10, 99) + rand(0, 9) / 10 + rand(1, 9) / 100;
			return { atomId: 'arithmetik__dezimalzahlen_vergleichen_ordnen_runden', prompt: `Runde ${dec(n)} auf eine Nachkommastelle: ___`, answerType: 'number', correctAnswer: dec(Math.round(n * 10) / 10), difficulty: 0.4 };
		}
		// First decimal must be 1–9 so the task is non-trivial
		const n = rand(10, 99) + rand(1, 9) / 10;
		return { atomId: 'arithmetik__dezimalzahlen_vergleichen_ordnen_runden', prompt: `Runde ${dec(n)} auf ganze Zahlen: ___`, answerType: 'integer', correctAnswer: String(Math.round(n)), difficulty: 0.35 };
	}
	const a = parseFloat((Math.random() * 9 + 1).toFixed(2));
	const b = parseFloat((Math.random() * 9 + 1).toFixed(2));
	const bigger = Math.max(a, b);
	return { atomId: 'arithmetik__dezimalzahlen_vergleichen_ordnen_runden', prompt: `Welche Zahl ist größer: ${dec(a)} oder ${dec(b)}?`, answerType: 'text', correctAnswer: dec(bigger), choices: [dec(a), dec(b)], difficulty: 0.35 };
});

reg('arithmetik__dezimalzahlen_addieren_subtrahieren', () => {
	const a = parseFloat((rand(1, 20) + rand(0, 9) / 10).toFixed(1));
	const b = parseFloat((rand(1, 10) + rand(0, 9) / 10).toFixed(1));
	const op = rand(0, 1);
	if (op === 0) return { atomId: 'arithmetik__dezimalzahlen_addieren_subtrahieren', prompt: `${dec(a)} + ${dec(b)} = ?`, answerType: 'number', correctAnswer: dec(a + b), hint: 'Komma unter Komma schreiben.', difficulty: 0.4 };
	const [big, small] = a >= b ? [a, b] : [b, a];
	return { atomId: 'arithmetik__dezimalzahlen_addieren_subtrahieren', prompt: `${dec(big)} − ${dec(small)} = ?`, answerType: 'number', correctAnswer: dec(big - small), difficulty: 0.4 };
});

reg('arithmetik__kommaverschiebung', () => {
	const n = parseFloat((rand(1, 99) + rand(1, 9) / 10).toFixed(1));
	const factor = pick([10, 100, 1000]);
	const op = rand(0, 1);
	if (op === 0) return { atomId: 'arithmetik__kommaverschiebung', prompt: `${dec(n)} · ${factor} = ?`, answerType: 'number', correctAnswer: dec(n * factor), hint: `Komma um ${Math.log10(factor)} Stelle(n) nach rechts.`, difficulty: 0.4 };
	return { atomId: 'arithmetik__kommaverschiebung', prompt: `${dec(n * factor)} : ${factor} = ?`, answerType: 'number', correctAnswer: dec(n), hint: `Komma um ${Math.log10(factor)} Stelle(n) nach links.`, difficulty: 0.4 };
});

reg('arithmetik__dezimal_division_natuerliche_zahl', () => {
	// Build dividend from d × answer so the result is always a clean 1-decimal number.
	// Skip combinations where d·r is divisible by 10 (dividend would have no decimal part).
	let d: number, q: number, r: number;
	do { d = rand(2, 8); q = rand(1, 9); r = rand(1, 9); } while ((d * r) % 10 === 0);
	const dividend = d * q + (d * r) / 10;
	const answer = q + r / 10;
	return { atomId: 'arithmetik__dezimal_division_natuerliche_zahl', prompt: `${dec(dividend)} : ${d} = ?`, answerType: 'number', correctAnswer: dec(answer), hint: `Schriftlich: ${dec(dividend)} : ${d}`, difficulty: 0.5 };
});

reg('arithmetik__dezimal_mal_dezimal', () => {
	const atomId = 'arithmetik__dezimal_mal_dezimal';
	if (rand(0, 1) === 0) {
		const a = rand(1, 9) / 10, b = rand(1, 9) / 10;
		const res = Math.round(a * b * 100) / 100;
		return { atomId, prompt: `${dec(a)} · ${dec(b)} = ?`, answerType: 'number', correctAnswer: dec(res), hint: `Rechne ${a * 10} · ${b * 10} = ${a * 10 * (b * 10)}, dann : 100`, difficulty: 0.45 };
	}
	const a = rand(1, 99) / 100, b = rand(1, 9) / 10;
	const res = Math.round(a * b * 1000) / 1000;
	const aInt = Math.round(a * 100), bInt = Math.round(b * 10);
	return { atomId, prompt: `${dec(a)} · ${dec(b)} = ?`, answerType: 'number', correctAnswer: dec(res), hint: `Rechne ${aInt} · ${bInt} = ${aInt * bInt}, dann : 1000`, difficulty: 0.6 };
});

reg('arithmetik__dezimal_division_dezimalzahl', () => {
	const b = pick([0.1, 0.2, 0.5, 0.25, 0.4]);
	const q = rand(2, 10);
	const a = round(b * q, 2);
	return { atomId: 'arithmetik__dezimal_division_dezimalzahl', prompt: `${dec(a)} : ${dec(b)} = ?`, answerType: 'integer', correctAnswer: String(q), hint: `Multipliziere beide mit ${1 / b}: ${dec(a * (1/b))} : ${1} = ?`, difficulty: 0.6 };
});

reg('arithmetik__bruch_zu_dezimalzahl', () => {
	const easy: Array<[number, number, number]> = [[1,2,0.5],[1,4,0.25],[3,4,0.75],[1,5,0.2],[2,5,0.4],[3,5,0.6],[4,5,0.8],[1,8,0.125],[3,8,0.375],[1,10,0.1],[3,10,0.3]];
	const [n, d, val] = pick(easy);
	return { atomId: 'arithmetik__bruch_zu_dezimalzahl', prompt: `${fmtFrac(n, d)} als Dezimalzahl = ?`, answerType: 'number', correctAnswer: dec(val), hint: `Teile ${n} durch ${d}.`, difficulty: 0.45 };
});

reg('arithmetik__dezimalzahl_zu_bruch', () => {
	const atomId = 'arithmetik__dezimalzahl_zu_bruch';
	const easy: Array<[number, number, number]> = [[0.5,1,2],[0.25,1,4],[0.75,3,4],[0.2,1,5],[0.4,2,5],[0.1,1,10],[0.3,3,10],[0.125,1,8],[0.6,3,5],[0.8,4,5]];
	const [val, n, d] = pick(easy);
	if (rand(0, 1) === 0) {
		return { atomId, prompt: `${dec(val)} als vollständig gekürzten Bruch?`, answerType: 'fraction', correctAnswer: frac(n, d), hint: 'Schreibe als Bruch mit Nenner 10 oder 100, dann kürzen.', difficulty: 0.5 };
	}
	return { atomId, prompt: `${dec(val)} als vollständig gekürzten Bruch:`, answerType: 'integer' as const, correctAnswer: String(d), hint: `${dec(val)} = ${fmtFrac(n, d)}`, difficulty: 0.4,
		inputData: { type: 'fraction_part', missing: 'denominator', knownNum: n } };
});

reg('arithmetik__periodische_dezimalzahlen', () => {
	const atomId = 'arithmetik__periodische_dezimalzahlen';
	const finiteList: Array<[number,number]> = [[1,2],[1,4],[3,4],[1,5],[1,8],[3,8],[1,10],[3,10],[7,8]];
	const periodicList: Array<[number,number,string]> = [[1,3,'3'],[2,3,'6'],[1,6,'6'],[5,6,'3'],[1,9,'1'],[2,9,'2'],[4,9,'4']];
	const type = rand(0, 2);
	if (type === 0) {
		const [n, d] = pick(finiteList);
		return { atomId, prompt: `Ist ${fmtFrac(n, d)} eine endliche oder periodische Dezimalzahl?`, answerType: 'text', choices: ['endlich', 'periodisch'], correctAnswer: 'endlich', hint: 'Endlich: Nenner (vollständig gekürzt) hat nur die Primfaktoren 2 und 5.', difficulty: 0.5 };
	} else if (type === 1) {
		const [n, d] = pick(periodicList);
		return { atomId, prompt: `Ist ${fmtFrac(n, d)} eine endliche oder periodische Dezimalzahl?`, answerType: 'text', choices: ['endlich', 'periodisch'], correctAnswer: 'periodisch', hint: `${d} enthält Primfaktoren außer 2 und 5.`, difficulty: 0.5 };
	} else {
		const [n, d, period] = pick(periodicList);
		return { atomId, prompt: `${fmtFrac(n, d)} = 0,${period}${period}${period}… — welche Ziffer wiederholt sich?`, answerType: 'text', correctAnswer: period, hint: `Führe die Division ${n} : ${d} durch.`, difficulty: 0.55 };
	}
});

// ── 12. Rationale Zahlen ──────────────────────────────────────────────────────

reg('arithmetik__negative_zahlen_zahlengerade', () => {
	const atomId = 'arithmetik__negative_zahlen_zahlengerade';
	const type = rand(0, 2);
	if (type === 0) {
		// Both negative
		const a = -rand(1, 10), b = -rand(1, 10);
		if (a === b) return registry.get(atomId)!();
		const bigger = Math.max(a, b);
		return { atomId, prompt: `Welche Zahl liegt weiter rechts auf dem Zahlenstrahl: ${a} oder ${b}?`, answerType: 'integer', correctAnswer: String(bigger), choices: [String(a), String(b)], svg: svgIntegerLine(Math.min(a, b) - 1, 1, [a, b]), hint: 'Weiter rechts = größer.', difficulty: 0.4 };
	} else if (type === 1) {
		// Positive vs negative
		const pos = rand(1, 8), neg = -rand(1, 8);
		return { atomId, prompt: `Welche Zahl liegt weiter rechts auf dem Zahlenstrahl: ${neg} oder ${pos}?`, answerType: 'integer', correctAnswer: String(pos), choices: [String(neg), String(pos)], svg: svgIntegerLine(neg - 1, pos + 1, [neg, pos]), hint: 'Positive Zahlen liegen rechts von Null, negative links.', difficulty: 0.3 };
	} else {
		// Everyday context: temperature
		const t1 = rand(-15, 20), t2 = rand(-15, 20);
		if (t1 === t2) return registry.get(atomId)!();
		const warmer = Math.max(t1, t2);
		return { atomId, prompt: `Welche Temperatur ist wärmer: ${t1} °C oder ${t2} °C?`, answerType: 'integer', correctAnswer: String(warmer), choices: [`${t1} °C`, `${t2} °C`], hint: 'Höhere Temperatur = größere Zahl auf dem Thermometer.', difficulty: 0.35 };
	}
});

reg('arithmetik__betrag_gegenzahl', () => {
	const n = pick([-8, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8]);
	const q = rand(0, 1);
	if (q === 0) return { atomId: 'arithmetik__betrag_gegenzahl', prompt: `|${n}| = ?`, answerType: 'integer', correctAnswer: String(Math.abs(n)), difficulty: 0.3 };
	return { atomId: 'arithmetik__betrag_gegenzahl', prompt: `Die Gegenzahl von ${n} = ?`, answerType: 'integer', correctAnswer: String(-n), difficulty: 0.3 };
});

reg('arithmetik__rationale_addition_gleiche_vorzeichen', () => {
	const sign = rand(0, 1) === 0 ? 1 : -1;
	const a = sign * rand(1, 10), b = sign * rand(1, 10);
	return { atomId: 'arithmetik__rationale_addition_gleiche_vorzeichen', prompt: `(${a}) + (${b}) = ?`, answerType: 'integer', correctAnswer: String(a + b), hint: 'Gleiche Vorzeichen: Beträge addieren, Vorzeichen beibehalten.', difficulty: 0.4 };
});

reg('arithmetik__rationale_addition_ungleiche_vorzeichen', () => {
	const a = rand(1, 12), b = rand(1, 12);
	const neg = rand(0, 1) === 0;
	const [pos, negV] = neg ? [a, -b] : [-a, b];
	return { atomId: 'arithmetik__rationale_addition_ungleiche_vorzeichen', prompt: `(${pos}) + (${negV}) = ?`, answerType: 'integer', correctAnswer: String(pos + negV), hint: 'Verschiedene Vorzeichen: Beträge subtrahieren, Vorzeichen des Größeren.', difficulty: 0.45 };
});

reg('arithmetik__subtraktion_als_addition_gegenzahl', () => {
	const a = rand(-8, 8), b = rand(-8, 8);
	if (b >= 0) return { atomId: 'arithmetik__subtraktion_als_addition_gegenzahl', prompt: `${a} − (${b}) = ?`, answerType: 'integer', correctAnswer: String(a - b), hint: `Subtraktion = Addition der Gegenzahl: ${a} + (${-b})`, difficulty: 0.5 };
	return { atomId: 'arithmetik__subtraktion_als_addition_gegenzahl', prompt: `${a} − (${b}) = ?`, answerType: 'integer', correctAnswer: String(a - b), hint: `${a} − (${b}) = ${a} + ${-b}`, difficulty: 0.5 };
});

reg('arithmetik__vorzeichenregeln_mult_div', () => {
	const a = rand(1, 9), b = rand(1, 9);
	const sa = pick([-1, 1]), sb = pick([-1, 1]);
	const op = rand(0, 1);
	if (op === 0) return { atomId: 'arithmetik__vorzeichenregeln_mult_div', prompt: `(${sa * a}) · (${sb * b}) = ?`, answerType: 'integer', correctAnswer: String(sa * sb * a * b), hint: '(−) · (−) = (+), (−) · (+) = (−)', difficulty: 0.45 };
	// Division: (sa*a*b) : (sb*a) = sa*sb*b — independent signs so result can be negative
	return { atomId: 'arithmetik__vorzeichenregeln_mult_div', prompt: `(${sa * a * b}) : (${sb * a}) = ?`, answerType: 'integer', correctAnswer: String(sa * sb * b), hint: 'Gleiches Vorzeichen → positiv, verschiedene → negativ.', difficulty: 0.45 };
});

reg('arithmetik__vorzeichen_klammerregeln', () => {
	const a = rand(1, 10), b = rand(1, 10);
	const type = rand(0, 1);
	if (type === 0) return { atomId: 'arithmetik__vorzeichen_klammerregeln', prompt: `−(${a} − ${b}) = ?`, answerType: 'integer', correctAnswer: String(-(a - b)), hint: 'Minus vor der Klammer dreht alle Vorzeichen um.', difficulty: 0.5 };
	const c = rand(1, 5);
	return { atomId: 'arithmetik__vorzeichen_klammerregeln', prompt: `${c} − (${a} − ${b}) = ?`, answerType: 'integer', correctAnswer: String(c - a + b), difficulty: 0.5 };
});

reg('arithmetik__verbindung_rechenarten_rationale', () => {
	const atomId = 'arithmetik__verbindung_rechenarten_rationale';
	const type = rand(0, 2);
	if (type === 0) {
		const a = rand(-5, 5), b = rand(1, 4), c = rand(-5, 5);
		return { atomId, prompt: `${a} + ${b} · ${c} = ?`, answerType: 'integer', correctAnswer: String(a + b * c), hint: 'Punkt vor Strich: zuerst multiplizieren.', difficulty: 0.5 };
	} else if (type === 1) {
		const a = rand(-4, 4), b = rand(1, 6), c = rand(2, 4);
		return { atomId, prompt: `(${a} + ${b}) · ${c} = ?`, answerType: 'integer', correctAnswer: String((a + b) * c), hint: 'Zuerst die Klammer berechnen.', difficulty: 0.55 };
	} else {
		const a = rand(2, 6), b = rand(2, 5), c = rand(1, 4), d = rand(1, 4);
		return { atomId, prompt: `${a} · ${b} − ${c} · ${d} = ?`, answerType: 'integer', correctAnswer: String(a * b - c * d), hint: 'Beide Produkte zuerst berechnen, dann subtrahieren.', difficulty: 0.6 };
	}
});

// ── 13. Prozentrechnung ───────────────────────────────────────────────────────

reg('arithmetik__prozentschreibweise', () => {
	const entries: Array<[number, number, string, string]> = [
		[1, 2, '0,5', '50%'], [1, 4, '0,25', '25%'], [3, 4, '0,75', '75%'],
		[1, 5, '0,2', '20%'], [2, 5, '0,4', '40%'], [1, 10, '0,1', '10%'],
		[3, 10, '0,3', '30%'], [1, 100, '0,01', '1%']
	];
	const [num, den, decimal, percent] = pick(entries);
	const q = rand(0, 2);
	if (q === 0) return { atomId: 'arithmetik__prozentschreibweise', prompt: `${fmtFrac(num, den)} = ___% `, answerType: 'integer', correctAnswer: String(parseFloat(percent)), difficulty: 0.35 };
	if (q === 1) return { atomId: 'arithmetik__prozentschreibweise', prompt: `${percent} als Dezimalzahl = ?`, answerType: 'number', correctAnswer: decimal.replace(',', '.'), difficulty: 0.35 };
	return { atomId: 'arithmetik__prozentschreibweise', prompt: `${decimal} = ___% `, answerType: 'integer', correctAnswer: String(parseFloat(percent)), difficulty: 0.35 };
});

reg('arithmetik__prozentwert_berechnen', () => {
	const p = pick([5, 10, 15, 20, 25, 30, 40, 50, 75]);
	const G = pick([20, 40, 50, 60, 80, 100, 120, 200, 400, 500]);
	const W = round(p * G / 100, 1);
	return { atomId: 'arithmetik__prozentwert_berechnen', prompt: `${p}% von ${G} = ?`, answerType: 'number', correctAnswer: dec(W), hint: `Prozentwert = Grundwert · Prozentsatz : 100`, difficulty: 0.45 };
});

reg('arithmetik__prozentsatz_berechnen', () => {
	const p = pick([5, 10, 20, 25, 40, 50]);
	const G = pick([20, 40, 50, 80, 100, 200]);
	const W = p * G / 100;
	return { atomId: 'arithmetik__prozentsatz_berechnen', prompt: `${W} von ${G} sind ___% ?`, answerType: 'integer', correctAnswer: String(p), hint: `Prozentsatz = Prozentwert : Grundwert · 100`, difficulty: 0.5 };
});

reg('arithmetik__grundwert_berechnen', () => {
	const p = pick([10, 20, 25, 40, 50]);
	const G = pick([20, 40, 50, 80, 100, 120, 200]);
	const W = p * G / 100;
	return { atomId: 'arithmetik__grundwert_berechnen', prompt: `${W} sind ${p}% von ___?`, answerType: 'integer', correctAnswer: String(G), hint: `Grundwert = Prozentwert · 100 : Prozentsatz`, difficulty: 0.55 };
});

reg('arithmetik__vermehrter_verminderter_grundwert', () => {
	const atomId = 'arithmetik__vermehrter_verminderter_grundwert';
	const p = pick([5, 10, 15, 20, 25]);
	const G = pick([40, 50, 80, 100, 120, 200]);
	const type = rand(0, 3);
	if (type === 0) {
		const result = G + G * p / 100;
		return { atomId, prompt: `${G} € wird um ${p}% erhöht. Neuer Betrag = ?`, answerType: 'number', correctAnswer: dec(result), hint: `Neuer Betrag = ${G} · (1 + ${p}/100)`, difficulty: 0.5 };
	} else if (type === 1) {
		const result = G - G * p / 100;
		return { atomId, prompt: `${G} € wird um ${p}% reduziert. Neuer Betrag = ?`, answerType: 'number', correctAnswer: dec(result), hint: `Neuer Betrag = ${G} · (1 − ${p}/100)`, difficulty: 0.5 };
	} else if (type === 2) {
		// Reverse increase: given new value, find original
		const newVal = G + G * p / 100;
		return { atomId, prompt: `Nach einer Erhöhung um ${p}% beträgt ein Wert ${dec(newVal)} €. Was war der ursprüngliche Wert?`, answerType: 'number', correctAnswer: dec(G), hint: `Grundwert = Neuer Wert ÷ (1 + ${p}/100) = ${dec(newVal)} ÷ ${dec(1 + p / 100)}`, difficulty: 0.65 };
	} else {
		// Reverse decrease: given new value, find original
		const newVal = G - G * p / 100;
		return { atomId, prompt: `Nach einer Senkung um ${p}% beträgt ein Wert ${dec(newVal)} €. Was war der ursprüngliche Wert?`, answerType: 'number', correctAnswer: dec(G), hint: `Grundwert = Neuer Wert ÷ (1 − ${p}/100) = ${dec(newVal)} ÷ ${dec(1 - p / 100)}`, difficulty: 0.65 };
	}
});

reg('arithmetik__zinsrechnung', () => {
	const atomId = 'arithmetik__zinsrechnung';
	const K = pick([100, 200, 500, 1000]);
	const p = pick([1, 2, 3, 4, 5]);
	const t = pick([1, 2, 3]);
	const type = rand(0, 2);
	if (type === 0) {
		const Z = round(K * p * t / 100, 2);
		return { atomId, prompt: `Kapital ${K} €, Zinssatz ${p}%, Laufzeit ${t} Jahr(e) — Zinsen = ?`, answerType: 'number', correctAnswer: dec(Z), hint: `Z = K · p · t : 100`, difficulty: 0.55 };
	} else if (type === 1) {
		const Z = round(K * p * t / 100, 2);
		return { atomId, prompt: `Kapital ${K} €, ${p}% p.a., ${t} Jahr(e) — Endkapital (einfache Verzinsung) = ?`, answerType: 'number', correctAnswer: dec(round(K + Z, 2)), hint: 'Endkapital = Kapital + Zinsen', difficulty: 0.6 };
	} else {
		// Compound interest: Kn = K · (1 + p/100)^t
		const Kn = round(K * (1 + p / 100) ** t, 2);
		return { atomId, prompt: `Kapital ${K} €, ${p}% Zinseszins p.a., ${t} Jahr(e) — Endkapital = ?`, answerType: 'number', correctAnswer: dec(Kn), hint: `K_n = K · (1 + p/100)^n = ${K} · ${dec(1 + p / 100)}^${t}`, difficulty: 0.7 };
	}
});

// ── 14. Potenzen ──────────────────────────────────────────────────────────────

reg('arithmetik__potenzieren_natuerliche_zahlen', () => {
	const atomId = 'arithmetik__potenzieren_natuerliche_zahlen';
	const type = rand(0, 2);
	if (type === 0) {
		// Squares 2² to 20²
		const base = rand(2, 20);
		return { atomId, prompt: `${pow(base, 2)} = ?`, answerType: 'integer', correctAnswer: String(base * base), hint: `${base} · ${base}`, difficulty: base <= 9 ? 0.35 : 0.5 };
	} else if (type === 1) {
		// Cubes and 4th powers (small bases only, result ≤ 100)
		let base: number, exp: number;
		do { base = rand(2, 5); exp = rand(3, 4); } while (base ** exp > 125);
		return { atomId, prompt: `${pow(base, exp)} = ?`, answerType: 'integer', correctAnswer: String(base ** exp), hint: `${base} · ${base} · ${base}${exp > 3 ? ` · ${base}` : ''} = ?`, difficulty: 0.5 };
	} else {
		// Powers of 10 (conceptual)
		const exp = rand(2, 6);
		return { atomId, prompt: `${pow(10, exp)} = ?`, answerType: 'integer', correctAnswer: String(10 ** exp), hint: `${pow(10, 'n')} = 1 gefolgt von n Nullen`, difficulty: 0.3 };
	}
});

reg('arithmetik__zehnerpotenzen_normdarstellung', () => {
	const atomId = 'arithmetik__zehnerpotenzen_normdarstellung';
	const type = rand(0, 2);
	if (type === 0) {
		// Large number: mantissa · 10^exp
		const exp = rand(2, 6);
		const n = rand(1, 9) + rand(1, 9) / 10;
		const value = Math.round(n * 10 ** exp);
		return { atomId, prompt: `${dec(n)} · ${pow(10, exp)} = ?`, answerType: 'integer', correctAnswer: String(value), hint: 'Komma um den Exponenten nach rechts verschieben.', difficulty: 0.5 };
	} else if (type === 1) {
		// Extract mantissa from large number
		const exp = rand(2, 5);
		const value = rand(1, 9) * 10 ** exp;
		const mant = value / 10 ** exp;
		return { atomId, prompt: `${value} in Normdarstellung: ___ · ${pow(10, exp)} — was ist die Mantisse?`, answerType: 'number', correctAnswer: dec(mant), hint: `Mantisse ist die Zahl vor · ${pow(10, 'n')}.`, difficulty: 0.55 };
	} else {
		// Small number: mantissa · 10^(-exp) — ask for the decimal result
		const negExp = rand(1, 3);
		const mantissa = rand(1, 9);
		const value = round(mantissa * 10 ** (-negExp), negExp);
		return { atomId, prompt: `${mantissa} · ${pow(10, -negExp)} = ?`, answerType: 'number', correctAnswer: dec(value), hint: `Komma um ${negExp} Stelle(n) nach links verschieben.`, difficulty: 0.6 };
	}
});

// ── 15. Größen ────────────────────────────────────────────────────────────────

reg('arithmetik__groessen_geld_laenge_zeit', () => {
	const tasks = [
		() => { const e = rand(1, 9), c = rand(1, 99); return { q: `${e} € und ${c} Cent = ___ Cent insgesamt?`, a: String(e * 100 + c) }; },
		() => { const h = rand(1, 5), m = rand(1, 59); return { q: `${h} h ${m} min = ___ min insgesamt?`, a: String(h * 60 + m) }; },
		() => { const m = rand(1, 9), cm = rand(1, 99); return { q: `${m} m ${cm} cm = ___ cm insgesamt?`, a: String(m * 100 + cm) }; },
		() => { const km = rand(1, 5); return { q: `${km} km = ___ m?`, a: String(km * 1000) }; }
	];
	const t = pick(tasks)();
	return { atomId: 'arithmetik__groessen_geld_laenge_zeit', prompt: t.q, answerType: 'integer', correctAnswer: t.a, difficulty: 0.4 };
});

reg('arithmetik__groessen_masse_volumen', () => {
	const tasks = [
		() => { const kg = rand(1, 9), g = rand(100, 900); return { q: `${kg} kg ${g} g = ___ g insgesamt?`, a: String(kg * 1000 + g) }; },
		() => { const l = rand(1, 5), ml = rand(100, 900); return { q: `${l} l ${ml} ml = ___ ml?`, a: String(l * 1000 + ml) }; },
		() => { const g = rand(1, 9) * 1000; return { q: `${g} g = ___ kg?`, a: String(g / 1000) }; },
		() => { const t = rand(1, 3); return { q: `${t} t = ___ kg?`, a: String(t * 1000) }; }
	];
	const t = pick(tasks)();
	return { atomId: 'arithmetik__groessen_masse_volumen', prompt: t.q, answerType: t.a.includes('.') ? 'number' : 'integer', correctAnswer: t.a, difficulty: 0.4 };
});

// ── 16. Verhältnisse ──────────────────────────────────────────────────────────

reg('arithmetik__verhaeltnisse', () => {
	const g = rand(2, 5), a = rand(1, 5), b = rand(1, 5);
	if (a === b) return registry.get('arithmetik__verhaeltnisse')!();
	const type = rand(0, 1);
	if (type === 0) return { atomId: 'arithmetik__verhaeltnisse', prompt: `Kürze das Verhältnis ${a * g} : ${b * g} — erster Teil?`, answerType: 'integer', correctAnswer: String(a), hint: `Teile durch ggT = ${g}`, difficulty: 0.45 };
	const total = (a + b) * g * rand(1, 3);
	const share = (a * total) / (a + b);
	if (!Number.isInteger(share)) return registry.get('arithmetik__verhaeltnisse')!();
	return { atomId: 'arithmetik__verhaeltnisse', prompt: `${total} wird im Verhältnis ${a}:${b} geteilt — größerer Teil?`, answerType: 'integer', correctAnswer: String(Math.max(a, b) * total / (a + b)), difficulty: 0.5 };
});

// ── 17. Daten / Mittelwert ────────────────────────────────────────────────────

reg('arithmetik__arithmetisches_mittel', () => {
	const count = rand(3, 5);
	const nums = Array.from({ length: count }, () => rand(1, 20));
	const sum = nums.reduce((a, b) => a + b, 0);
	const mean = sum / count;
	if (!Number.isInteger(mean)) return registry.get('arithmetik__arithmetisches_mittel')!();
	return { atomId: 'arithmetik__arithmetisches_mittel', prompt: `Arithmetisches Mittel von {${nums.join(', ')}} = ?`, answerType: 'integer', correctAnswer: String(mean), hint: `Summe = ${sum}, Anzahl = ${count}`, difficulty: 0.45 };
});

// ── 18. Algebra: Terme ────────────────────────────────────────────────────────

reg('algebra__variablenbegriff', () => {
	const type = rand(0, 4);
	let q: string, a: string, w: string[];
	if (type === 0) {
		// n Stück zum Preis v
		const n = rand(2, 9);
		const v = pick(['a', 'b', 'h', 'k', 'p']);
		const items = ['Hefte', 'Äpfel', 'Bücher', 'Stifte', 'Kekse', 'Orangen'];
		const item = pick(items);
		q = `Ein ${item.slice(0, -1)} kostet \\(${v}\\) Euro. Wie viel kosten ${n} ${item}?`;
		a = `\\(${n}${v}\\)`; w = [`\\(${v}+${n}\\)`, `\\(${n}+${v}\\)`, `\\(${v}−${n}\\)`];
	} else if (type === 1) {
		// Anzahl × pro Person
		const n = rand(2, 8);
		const v = pick(['n', 'k', 's', 'm', 'a']);
		const people = pick(['Schüler', 'Kinder', 'Spieler', 'Gäste']);
		const things = pick(['Stifte', 'Punkte', 'Karten', 'Bonbons', 'Aufgaben']);
		q = `${n} ${people} erhalten je \\(${v}\\) ${things}. Wie viele ${things} insgesamt?`;
		a = `\\(${n}${v}\\)`; w = [`\\(${v}+${n}\\)`, `\\(${v} \\cdot ${v}\\)`, `\\(${n}−${v}\\)`];
	} else if (type === 2) {
		// Differenz (jünger / kürzer)
		const d = rand(1, 6);
		const v = pick(['x', 'a', 'n', 'j']);
		const [[p1, rel], obj] = [pick([['Lena', 'ihr'], ['Max', 'sein'], ['Tim', 'sein']]), pick(['Bruder', 'Freund', 'Cousin'])];
		q = `${p1} ist \\(${v}\\) Jahre alt. ${rel.charAt(0).toUpperCase() + rel.slice(1)} ${obj} ist ${d} Jahre jünger. Wie alt ist er?`;
		a = `\\(${v}−${d}\\)`; w = [`\\(${v}+${d}\\)`, `\\(${d}−${v}\\)`, `\\(${d}${v}\\)`];
	} else if (type === 3) {
		// Geschwindigkeit × Zeit
		const t = rand(2, 6);
		const v = pick(['v', 'g', 'w']);
		const vehicle = pick(['Zug', 'Auto', 'Fahrrad', 'Bus']);
		q = `Ein ${vehicle} fährt \\(${v}\\) km/h. Wie weit kommt es in ${t} Stunden?`;
		a = `\\(${t}${v}\\)`; w = [`\\(${v}+${t}\\)`, `\\(${v}:${t}\\)`, `\\(${t}+${v}\\)`];
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
		q = `Ein ${shape.name} hat die Seite \\(${v}\\). Wie lautet der Umfang?`;
		a = `\\(${shape.sides}${v}\\)`; w = [`\\(${v}+${shape.sides}\\)`, `\\(${v}^2\\)`, `\\(${shape.sides}+${v}\\)`];
	}
	const choices = [a, ...w].sort(() => Math.random() - 0.5);
	return { atomId: 'algebra__variablenbegriff', prompt: q, answerType: 'text', correctAnswer: a, choices, difficulty: 0.3 };
});

reg('algebra__termwert_berechnen', () => {
	const x = rand(-4, 6);
	const type = rand(0, 3);
	if (type === 0) {
		const a = rand(2, 5), b = rand(-5, 5);
		const val = a * x + b;
		return { atomId: 'algebra__termwert_berechnen', prompt: `Berechne \\(${a}x ${b >= 0 ? '+' : ''}${b}\\) für \\(x = ${x}\\).`, answerType: 'integer', correctAnswer: String(val), hint: `Einsetzen: ${a}·(${x}) + (${b}) = ${val}`, difficulty: 0.4 };
	} else if (type === 1) {
		const a = rand(1, 3);
		const val = a * x * x;
		return { atomId: 'algebra__termwert_berechnen', prompt: `Berechne \\(${a > 1 ? a : ''}x^2\\) für \\(x = ${x}\\).`, answerType: 'integer', correctAnswer: String(val), hint: `Einsetzen: ${a}·(${x})² = ${a}·${x * x} = ${val}`, difficulty: 0.45 };
	} else if (type === 2) {
		const a = rand(1, 3), b = rand(1, 4);
		const val = a * x * x + b * x;
		return { atomId: 'algebra__termwert_berechnen', prompt: `Berechne \\(${a > 1 ? a : ''}x^2 ${b >= 0 ? '+' : ''}${b}x\\) für \\(x = ${x}\\).`, answerType: 'integer', correctAnswer: String(val), hint: `Einsetzen: ${a}·${x * x} + ${b}·${x} = ${val}`, difficulty: 0.5 };
	} else {
		const a = rand(2, 6), b = rand(1, 5);
		const val = a * x - b;
		return { atomId: 'algebra__termwert_berechnen', prompt: `Berechne \\(${a}x − ${b}\\) für \\(x = ${x}\\).`, answerType: 'integer', correctAnswer: String(val), hint: `Einsetzen: ${a}·(${x}) − ${b} = ${val}`, difficulty: 0.35 };
	}
});

reg('algebra__terme_zusammenfassen', () => {
	const type = rand(0, 2);
	if (type === 0) {
		const a = rand(2, 8), b = rand(2, 8);
		return { atomId: 'algebra__terme_zusammenfassen', prompt: `Vereinfache: \\(${a}x + ${b}x = \\_ \\_ x\\)`, answerType: 'integer', correctAnswer: String(a + b), hint: `Gleichartige Terme: \\((${a}+${b})x = ${a + b}x\\)`, difficulty: 0.35 };
	} else if (type === 1) {
		const a = rand(3, 9), b = rand(1, a - 1);
		return { atomId: 'algebra__terme_zusammenfassen', prompt: `Vereinfache: \\(${a}a − ${b}a = \\_ \\_ a\\)`, answerType: 'integer', correctAnswer: String(a - b), hint: `Gleichartige Terme: \\((${a}−${b})a = ${a - b}a\\)`, difficulty: 0.35 };
	} else {
		const ca = rand(2, 5), cb = rand(2, 5), da = rand(1, ca - 1);
		const resA = ca - da;
		const choices = [`\\(${resA}a + ${cb + 1}b\\)`, `\\(${resA}a + ${cb}b\\)`, `\\(${ca}a + ${cb}b\\)`, `\\(${resA + 1}a + ${cb}b\\)`];
		const correct = `\\(${resA}a + ${cb}b\\)`;
		return { atomId: 'algebra__terme_zusammenfassen', prompt: `Vereinfache: \\(${ca}a + ${cb}b − ${da}a\\)`, answerType: 'text', correctAnswer: correct, choices: choices.sort(() => Math.random() - 0.5), hint: `Nur gleichartige Terme zusammenfassen: \\((${ca}−${da})a + ${cb}b\\)`, difficulty: 0.45 };
	}
});

reg('algebra__ausmultiplizieren_distributiv', () => {
	const type = rand(0, 2);
	if (type === 0) {
		const a = rand(2, 6), b = rand(1, 8);
		return { atomId: 'algebra__ausmultiplizieren_distributiv', prompt: `Multipliziere aus: \\(${a}(x + ${b}) = ${a}x + \\_\\_\\)`, answerType: 'integer', correctAnswer: String(a * b), hint: `\\(${a} \\cdot x + ${a} \\cdot ${b} = ${a}x + ${a * b}\\)`, difficulty: 0.4 };
	} else if (type === 1) {
		const a = rand(2, 5), b = rand(1, 6);
		return { atomId: 'algebra__ausmultiplizieren_distributiv', prompt: `Multipliziere aus: \\(${a}(x − ${b}) = ${a}x − \\_\\_\\)`, answerType: 'integer', correctAnswer: String(a * b), hint: `\\(${a} \\cdot x − ${a} \\cdot ${b} = ${a}x − ${a * b}\\)`, difficulty: 0.4 };
	} else {
		const p = rand(1, 5), q = rand(1, 5);
		const mid = p + q, last = p * q;
		const choices = [`\\(x^2 + ${mid}x + ${last}\\)`, `\\(x^2 + ${p}x + ${q}\\)`, `\\(x^2 + ${mid}x + ${p * q + 1}\\)`, `\\(x^2 − ${mid}x + ${last}\\)`];
		return { atomId: 'algebra__ausmultiplizieren_distributiv', prompt: `Multipliziere aus: \\((x + ${p})(x + ${q})\\)`, answerType: 'text', correctAnswer: choices[0], choices: choices.sort(() => Math.random() - 0.5), hint: `\\(x^2+(${p}+${q})x+${p} \\cdot ${q} = x^2+${mid}x+${last}\\)`, difficulty: 0.55 };
	}
});

reg('algebra__ausklammern_faktorisieren', () => {
	const type = rand(0, 1);
	if (type === 0) {
		const k = rand(2, 6), a = rand(2, 5), b = rand(1, 5);
		return { atomId: 'algebra__ausklammern_faktorisieren', prompt: `Klammere aus: \\(${k * a}x + ${k * b} = ${k}\\cdot(\\_\\_)\\)`, answerType: 'text', correctAnswer: `\\(${a}x + ${b}\\)`, choices: [`\\(${a}x + ${b}\\)`, `\\(${a}x + ${k * b}\\)`, `\\(${k * a}x + ${b}\\)`, `\\(${a}x − ${b}\\)`].sort(() => Math.random() - 0.5), hint: `Teile jeden Term durch \\(${k}\\): \\(${k}(${a}x + ${b})\\)`, difficulty: 0.5 };
	} else {
		// a must be odd so that gcd(k*a, k*2) = k (not a larger multiple of k)
		const k = rand(2, 5), a = rand(0, 1) * 2 + 3; // 3 or 5
		const coeff1 = k * a, coeff2 = k * 2;
		const wrongChoices = Array.from(new Set([coeff1, coeff2, k + 1].map(String).filter(c => c !== String(k)))).slice(0, 3);
		return { atomId: 'algebra__ausklammern_faktorisieren', prompt: `Welcher Faktor kann ausgeklammert werden? \\(${coeff1}x − ${coeff2}\\)`, answerType: 'integer', correctAnswer: String(k), choices: [String(k), ...wrongChoices].sort(() => Math.random() - 0.5), hint: `ggT(${coeff1}, ${coeff2}) = ${k}`, difficulty: 0.45 };
	}
});

reg('algebra__binomische_formeln_vorwaerts', () => {
	const type = rand(0, 2);
	if (type === 0) {
		const a = rand(2, 6);
		return { atomId: 'algebra__binomische_formeln_vorwaerts', prompt: `\\((x + ${a})^2 = x^2 + \\_\\_x + ${a * a}\\)`, answerType: 'integer', correctAnswer: String(2 * a), hint: `1. Formel: \\((x+a)^2 = x^2+2ax+a^2\\) → \\(2 \\cdot ${a} \\cdot x\\)`, difficulty: 0.5 };
	} else if (type === 1) {
		const a = rand(2, 5);
		return { atomId: 'algebra__binomische_formeln_vorwaerts', prompt: `\\((x − ${a})^2 = x^2 − \\_\\_x + ${a * a}\\)`, answerType: 'integer', correctAnswer: String(2 * a), hint: `2. Formel: \\((x−a)^2 = x^2−2ax+a^2\\) → \\(2 \\cdot ${a} \\cdot x\\)`, difficulty: 0.5 };
	} else {
		const a = rand(2, 7);
		return { atomId: 'algebra__binomische_formeln_vorwaerts', prompt: `\\((x + ${a})(x − ${a}) = x^2 − \\_\\_\\)`, answerType: 'integer', correctAnswer: String(a * a), hint: `3. Formel: \\((x+a)(x−a) = x^2−a^2\\) → \\(a^2 = ${a * a}\\)`, difficulty: 0.45 };
	}
});

reg('algebra__binomische_formeln_rueckwaerts', () => {
	const type = rand(0, 1);
	if (type === 0) {
		const a = rand(2, 7);
		const choices = [String(a), String(a + 1), String(a - 1), String(a * 2)].sort(() => Math.random() - 0.5);
		return { atomId: 'algebra__binomische_formeln_rueckwaerts', prompt: `\\(x^2 − ${a * a}\\) lässt sich schreiben als \\((x + \\_\\_)(x − \\_\\_ )\\). Welche Zahl fehlt?`, answerType: 'integer', correctAnswer: String(a), choices, hint: `3. binomische Formel rückwärts: \\(x^2−${a * a} = (x+${a})(x−${a})\\)`, difficulty: 0.55 };
	} else {
		const a = rand(2, 6);
		const choices = [String(a), String(a + 1), String(a - 1), String(a * 2)].sort(() => Math.random() - 0.5);
		return { atomId: 'algebra__binomische_formeln_rueckwaerts', prompt: `\\(x^2 + ${2 * a}x + ${a * a} = (x + \\_\\_)^2\\). Welche Zahl fehlt?`, answerType: 'integer', correctAnswer: String(a), choices, hint: `1. binomische Formel rückwärts: \\(x^2+${2 * a}x+${a * a} = (x+${a})^2\\)`, difficulty: 0.55 };
	}
});

reg('algebra__gleichungen_inhaltlich_loesen', () => {
	const type = rand(0, 2);
	if (type === 0) {
		const x = rand(2, 15), b = rand(3, 12);
		return { atomId: 'algebra__gleichungen_inhaltlich_loesen', prompt: `\\(x + ${b} = ${x + b}\\)  →  \\(x = ?\\)`, answerType: 'integer', correctAnswer: String(x), hint: `Umkehroperation: ${x + b} − ${b} = ${x}`, difficulty: 0.25 };
	} else if (type === 1) {
		const x = rand(2, 12), a = rand(2, 8);
		return { atomId: 'algebra__gleichungen_inhaltlich_loesen', prompt: `\\(${a} \\cdot x = ${a * x}\\)  →  \\(x = ?\\)`, answerType: 'integer', correctAnswer: String(x), hint: `Umkehroperation: ${a * x} ÷ ${a} = ${x}`, difficulty: 0.25 };
	} else {
		const x = rand(2, 10), b = rand(2, 8);
		return { atomId: 'algebra__gleichungen_inhaltlich_loesen', prompt: `\\(x − ${b} = ${x - b}\\)  →  \\(x = ?\\)`, answerType: 'integer', correctAnswer: String(x), hint: `Umkehroperation: ${x - b} + ${b} = ${x}`, difficulty: 0.25 };
	}
});

// ── 19. Algebra: Gleichungen ──────────────────────────────────────────────────

reg('algebra__aequivalenzumformung_prinzip', () => {
	const type = rand(0, 1);
	if (type === 0) {
		const b = rand(2, 9), rhs = rand(b + 1, 15);
		const choices = [`−${b}`, `+${b}`, `·${b}`, `:${b}`];
		return { atomId: 'algebra__aequivalenzumformung_prinzip', prompt: `Von \\(x + ${b} = ${rhs}\\) zu \\(x = ${rhs - b}\\): Welche Umformung wurde auf beiden Seiten durchgeführt?`, answerType: 'text', correctAnswer: `−${b}`, choices: choices.sort(() => Math.random() - 0.5), difficulty: 0.35 };
	} else {
		const a = rand(2, 7), rhs = rand(1, 6) * a;
		const choices = [`:${a}`, `·${a}`, `+${a}`, `−${a}`];
		return { atomId: 'algebra__aequivalenzumformung_prinzip', prompt: `Von \\(${a}x = ${rhs}\\) zu \\(x = ${rhs / a}\\): Welche Umformung?`, answerType: 'text', correctAnswer: `:${a}`, choices: choices.sort(() => Math.random() - 0.5), difficulty: 0.35 };
	}
});

reg('algebra__lineare_gleichung_zweischritt', () => {
	let a = rand(2, 5), b = rand(-6, 6), x = rand(-4, 8);
	while (b === 0) b = rand(-6, 6);
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

reg('algebra__lineare_gleichung_klammern_brueche', () => {
	const a = rand(2, 4), b = rand(1, 6), x = rand(1, 8);
	const rhs = a * (x + b);
	const sign = (n: number) => n >= 0 ? `+${n}` : `${n}`;
	return {
		atomId: 'algebra__lineare_gleichung_klammern_brueche',
		prompt: `Löse: \\(${a}(x ${sign(b)}) = ${rhs}\\)`,
		answerType: 'integer',
		correctAnswer: String(x),
		inputData: {
			steps: [
				`\\(${a}(x ${sign(b)}) = ${rhs}\\)`,
				`Ausmultiplizieren: \\(${a}x ${sign(a * b)} = ${rhs}\\)`,
				`\\(${a * b > 0 ? '−' : '+'}${Math.abs(a * b)}\\): \\(${a}x = ${rhs - a * b}\\)`,
				`\\(:${a}\\): \\(x = ${x}\\)`
			]
		},
		difficulty: 0.55
	};
});

reg('algebra__lineare_gleichung_sonderfaelle', () => {
	// type=2 added so "genau eine Lösung" is sometimes correct (previously never, reducing effective choices to 2)
	const type = rand(0, 2);
	const a = rand(2, 5), b = rand(1, 6);
	const choices = ['keine Lösung', 'genau eine Lösung', 'unendlich viele Lösungen'];
	if (type === 0) {
		return { atomId: 'algebra__lineare_gleichung_sonderfaelle', prompt: `Wie viele Lösungen hat \\(${a}x + ${b} = ${a}x + ${b + 1}\\)?`, answerType: 'text', correctAnswer: 'keine lösung', choices, hint: `Nach Umformen: ${b} = ${b + 1} — unmöglich!`, difficulty: 0.5 };
	} else if (type === 1) {
		return { atomId: 'algebra__lineare_gleichung_sonderfaelle', prompt: `Wie viele Lösungen hat \\(${a}(x + ${b}) = ${a}x + ${a * b}\\)?`, answerType: 'text', correctAnswer: 'unendlich viele lösungen', choices, hint: `Nach Ausmultiplizieren: \\(${a}x+${a * b} = ${a}x+${a * b}\\) — immer wahr!`, difficulty: 0.5 };
	} else {
		const c = rand(2, 5), x = rand(1, 7);
		return { atomId: 'algebra__lineare_gleichung_sonderfaelle', prompt: `Wie viele Lösungen hat \\(${c}x + ${b} = ${c * x + b}\\)?`, answerType: 'text', correctAnswer: 'genau eine lösung', choices, hint: `Umformen: \\(${c}x = ${c * x}\\) → \\(x = ${x}\\).`, difficulty: 0.5 };
	}
});

reg('algebra__lineare_ungleichungen', () => {
	const a = rand(2, 5), b = rand(1, 8), x = rand(2, 8);
	const rhs = a * x + b;
	const ops = ['>', '<', '≥', '≤'];
	const op = pick(ops);
	const revOp = op === '>' ? '<' : op === '<' ? '>' : op === '≥' ? '≤' : '≥';
	const isGreater = op === '>' || op === '≥';
	const choices = [`\\(x ${op} ${x}\\)`, `\\(x ${revOp} ${x}\\)`, `\\(x ${op} ${x + 1}\\)`, `\\(x ${revOp} ${x - 1}\\)`];
	return { atomId: 'algebra__lineare_ungleichungen', prompt: `Löse: \\(${a}x + ${b} ${op} ${rhs}\\)`, answerType: 'text', correctAnswer: `\\(x ${op} ${x}\\)`, choices: choices.sort(() => Math.random() - 0.5), hint: `Wie Gleichung lösen: \\(−${b}\\), dann \\(:${a}\\). Vorzeichen bleibt gleich.`, difficulty: 0.5 };
});

reg('algebra__wurzelgleichungen', () => {
	const type = rand(0, 1);
	if (type === 0) {
		const a = rand(2, 8);
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
	const a2 = rand(2, 4), c2 = a2 * x + y;
	const bSign = (n: number) => n >= 0 ? `+${n}` : `${n}`;
	return {
		atomId: 'algebra__lgs_einsetzungsverfahren',
		prompt: `Löse mit dem Einsetzungsverfahren:\n\\(y = ${m}x ${bSign(b)}\\)\n\\(${a2}x + y = ${c2}\\)\nGesucht: \\(x = ?\\)`,
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
		prompt: `Löse mit dem Additionsverfahren:\n\\(${a1}x + ${b1}y = ${c1}\\)\n\\(${a2}x + ${b2}y = ${c2}\\)\nGesucht: \\(x = ?\\)`,
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
		prompt: `Löse mit dem Gleichsetzungsverfahren:\n\\(y = ${m1}x ${bStr(b1)}\\)\n\\(y = ${m2}x ${bStr(b2)}\\)\nGesucht: \\(x = ?\\)`,
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
	const bStr = (n: number) => n >= 0 ? (n === 0 ? '' : `+${n}`) : `${n}`;
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
		prompt: `An welchem Punkt schneiden sich die Geraden\ng₁: \\(y = ${m1}x${bStr(b1)}\\) und g₂: \\(y = ${m2}x${bStr(b2)}\\)?`,
		answerType: 'text',
		correctAnswer: correct,
		choices,
		svg: svgCoordSystem(
			[{ m: m1, b: b1, color: '#4f46e5', label: 'g₁' }, { m: m2, b: b2, color: '#dc2626', label: 'g₂' }]
		),
		hint: `Am Schnittpunkt gilt: \\(${m1}x${bStr(b1)} = ${m2}x${bStr(b2)}\\)`,
		difficulty: 0.55
	};
});

// ── 21. Algebra: Zuordnungen / Proportionalität ───────────────────────────────

reg('algebra__proportionale_zuordnung', () => {
	const unit = pick(['€', 'km', 'kg', 'l']);
	const rate = rand(2, 8);
	const n1 = rand(2, 6), n2 = rand(n1 + 1, 10);
	const c1 = rate * n1;
	return {
		atomId: 'algebra__proportionale_zuordnung',
		prompt: `${n1} Stück kosten ${c1} ${unit}. Wie viel kosten ${n2} Stück?`,
		answerType: 'integer',
		correctAnswer: String(rate * n2),
		inputData: {
			steps: [
				`Preis pro Stück: ${c1} ${unit} ÷ ${n1} = ${rate} ${unit}`,
				`Für ${n2} Stück: ${n2} · ${rate} = ${rate * n2} ${unit}`
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
		{ t: 'Arbeiter', u: 'Tage', inv: true },
		{ t: 'Maschinen', u: 'Stunden', inv: true }
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
		if (dupX) pairs[2][0] = pairs[0][0];
		const isFunc = !dupX;
		return { atomId: 'algebra__zuordnungen', prompt: `Ist die Zuordnung {(${pairs.map(p => p.join('→')).join(', ')})} eine Funktion?`, answerType: 'text', correctAnswer: isFunc ? 'ja' : 'nein', choices: ['ja', 'nein'], hint: 'Eine Funktion ordnet jedem \\(x\\)-Wert genau einen \\(y\\)-Wert zu.', difficulty: 0.4 };
	} else {
		const tables = [
			{ t: 'x | 1 | 2 | 3\ny | 4 | 5 | 6', isF: true },
			{ t: 'x | 1 | 1 | 2\ny | 3 | 4 | 5', isF: false },
			{ t: 'x | 2 | 3 | 4\ny | 5 | 5 | 6', isF: true },
		];
		const tbl = pick(tables);
		return { atomId: 'algebra__zuordnungen', prompt: `Ist diese Tabelle eine Funktion?\n${tbl.t}`, answerType: 'text', correctAnswer: tbl.isF ? 'ja' : 'nein', choices: ['ja', 'nein'], hint: 'Prüfe: Gibt es einen \\(x\\)-Wert, der zweimal auftaucht?', difficulty: 0.4 };
	}
});

reg('algebra__funktion_eindeutige_zuordnung', () => {
	const type = rand(0, 1);
	const choices = ['ja', 'nein'];
	if (type === 0) {
		const a = rand(2, 4), b = rand(1, 5);
		const x = rand(2, 5);
		const isFunc = rand(0, 1) === 1;
		const secondY = isFunc ? a * x + b : a * (x + 1) + b;
		const q = isFunc
			? `f(${x}) = ${a * x + b}`
			: `{(${x}, ${a * x + b}), (${x}, ${secondY})} – ist das eine Funktion?`;
		return { atomId: 'algebra__funktion_eindeutige_zuordnung', prompt: `\\(f(x) = ${a}x + ${b}\\). Gibt es für \\(x = ${x}\\) genau einen \\(y\\)-Wert?`, answerType: 'text', correctAnswer: 'ja', choices, hint: 'Funktionen haben für jedes \\(x\\) genau einen \\(y\\)-Wert.', difficulty: 0.35 };
	} else {
		return { atomId: 'algebra__funktion_eindeutige_zuordnung', prompt: `Ist {(1,2), (2,3), (1,4)} eine Funktion? (\\(x=1\\) taucht zweimal auf)`, answerType: 'text', correctAnswer: 'nein', choices, hint: '\\(x=1\\) hat zwei verschiedene \\(y\\)-Werte → keine Funktion.', difficulty: 0.4 };
	}
});

reg('algebra__funktion_darstellungsformen', () => {
	const a = rand(1, 4), b = rand(-4, 4);
	const x = rand(1, 5);
	const y = a * x + b;
	const bSign = (n: number) => n > 0 ? `+${n}` : n < 0 ? `${n}` : '';
	return { atomId: 'algebra__funktion_darstellungsformen', prompt: `\\(f(x) = ${a}x${bSign(b)}\\). Berechne \\(f(${x})\\).`, answerType: 'integer', correctAnswer: String(y), hint: `Einsetzen: ${a}·${x}${bSign(b)} = ${y}`, difficulty: 0.35 };
});

reg('algebra__definitions_wertebereich', () => {
	const templates = [
		{ f: '\\sqrt{x}', D: 'x ≥ 0', w: ['x > 0', 'alle reellen Zahlen', 'x ≠ 0'] },
		{ f: '\\frac{1}{x}', D: 'x ≠ 0', w: ['x > 0', 'x ≥ 0', 'alle reellen Zahlen'] },
		{ f: 'x^2', D: 'alle reellen Zahlen', w: ['x ≥ 0', 'x > 0', 'x ≠ 0'] },
		{ f: '\\sqrt{x-2}', D: 'x ≥ 2', w: ['x > 2', 'x ≥ 0', 'alle reellen Zahlen'] },
	];
	const t = pick(templates);
	const choices = [t.D, ...t.w].sort(() => Math.random() - 0.5);
	return { atomId: 'algebra__definitions_wertebereich', prompt: `Was ist der Definitionsbereich von \\(f(x) = ${t.f}\\)?`, answerType: 'text', correctAnswer: t.D.toLowerCase(), choices, hint: `Beachte: Unter der Wurzel darf keine negative Zahl stehen, und durch 0 darf nicht geteilt werden.`, difficulty: 0.5 };
});

reg('algebra__zahlenfolgen', () => {
	const type = rand(0, 2);
	if (type === 0) {
		const d = rand(2, 7), a1 = rand(1, 5);
		const terms = [a1, a1 + d, a1 + 2 * d, a1 + 3 * d];
		return { atomId: 'algebra__zahlenfolgen', prompt: `Welche Zahl kommt als nächstes? ${terms.join(', ')}, ___`, answerType: 'integer', correctAnswer: String(a1 + 4 * d), hint: `Arithmetische Folge mit Differenz \\(d = ${d}\\)`, difficulty: 0.4 };
	} else if (type === 1) {
		const q = pick([2, 3]), a1 = rand(1, 3);
		const terms = [a1, a1 * q, a1 * q * q, a1 * q * q * q];
		return { atomId: 'algebra__zahlenfolgen', prompt: `Welche Zahl kommt als nächstes? ${terms.join(', ')}, ___`, answerType: 'integer', correctAnswer: String(a1 * q ** 4), hint: `Geometrische Folge mit Faktor \\(q = ${q}\\)`, difficulty: 0.45 };
	} else {
		const a1 = rand(1, 3), d = rand(2, 5), n = rand(4, 7);
		const an = a1 + (n - 1) * d;
		return { atomId: 'algebra__zahlenfolgen', prompt: `Bildungsvorschrift: \\(a_n = ${a1} + (n-1)\\cdot${d}\\). Berechne \\(a_${n}\\).`, answerType: 'integer', correctAnswer: String(an), hint: `Einsetzen: ${a1} + (${n}−1)·${d} = ${a1} + ${(n - 1) * d} = ${an}`, difficulty: 0.5 };
	}
});

// ── 22. Algebra: Potenzen und Wurzeln ────────────────────────────────────────

reg('algebra__potenzgesetz_gleiche_basis', () => {
	const type = rand(0, 1);
	const m = rand(2, 6), n = rand(2, 6);
	if (type === 0) {
		return { atomId: 'algebra__potenzgesetz_gleiche_basis', prompt: `\\(a^${m} \\cdot a^${n} = a^{?\\ }\\)`, answerType: 'integer', correctAnswer: String(m + n), hint: `Gleiche Basis: Exponenten addieren → ${m}+${n}=${m + n}`, difficulty: 0.4 };
	} else {
		if (m <= n) return registry.get('algebra__potenzgesetz_gleiche_basis')!();
		return { atomId: 'algebra__potenzgesetz_gleiche_basis', prompt: `\\(a^${m} : a^${n} = a^{?\\ }\\)`, answerType: 'integer', correctAnswer: String(m - n), hint: `Gleiche Basis: Exponenten subtrahieren → ${m}−${n}=${m - n}`, difficulty: 0.4 };
	}
});

reg('algebra__potenzgesetz_potenz_einer_potenz', () => {
	const m = rand(2, 4), n = rand(2, 4);
	const base = pick(['a', 'x', 'b', '2x', '3y', 'ab']);
	return { atomId: 'algebra__potenzgesetz_potenz_einer_potenz', prompt: `\\((${base}^${m})^${n} = ${base}^{?\\ }\\)`, answerType: 'integer', correctAnswer: String(m * n), hint: `Potenz einer Potenz: Exponenten multiplizieren → ${m}·${n}=${m * n}`, difficulty: 0.45 };
});

reg('algebra__potenzen_negative_exponenten', () => {
	const base = pick([2, 3, 5, 10]);
	const exp = rand(1, 3);
	const val = base ** exp;
	const type = rand(0, 1);
	if (type === 0) {
		return { atomId: 'algebra__potenzen_negative_exponenten', prompt: `\\(${base}^{-${exp}} = \\frac{1}{\\_\\_}\\)`, answerType: 'integer', correctAnswer: String(val), hint: `\\(a^{-n} = \\frac{1}{a^n}\\) → \\(\\frac{1}{${base}^{${exp}}} = \\frac{1}{${val}}\\)`, difficulty: 0.45 };
	} else {
		const choices = [`\\(\\frac{1}{${val}}\\)`, `\\(-${val}\\)`, `\\(${val}\\)`, `\\(\\frac{1}{${val + 1}}\\)`];
		return { atomId: 'algebra__potenzen_negative_exponenten', prompt: `Was ist \\(${base}^{-${exp}}\\)?`, answerType: 'text', correctAnswer: `\\(\\frac{1}{${val}}\\)`, choices: choices.sort(() => Math.random() - 0.5), hint: `\\(a^{-n} = \\frac{1}{a^n}\\) → \\(\\frac{1}{${val}}\\)`, difficulty: 0.45 };
	}
});

reg('algebra__potenzen_rationale_exponenten', () => {
	const cases: { base: number; exp: string; val: number; hint: string }[] = [
		{ base: 4, exp: '1/2', val: 2, hint: '\\(4^{1/2} = \\sqrt{4} = 2\\)' },
		{ base: 8, exp: '1/3', val: 2, hint: '\\(8^{1/3} = \\sqrt[3]{8} = 2\\)' },
		{ base: 27, exp: '1/3', val: 3, hint: '\\(27^{1/3} = \\sqrt[3]{27} = 3\\)' },
		{ base: 9, exp: '1/2', val: 3, hint: '\\(9^{1/2} = \\sqrt{9} = 3\\)' },
		{ base: 4, exp: '3/2', val: 8, hint: '\\(4^{3/2} = (\\sqrt{4})^3 = 2^3 = 8\\)' },
		{ base: 8, exp: '2/3', val: 4, hint: '\\(8^{2/3} = (\\sqrt[3]{8})^2 = 2^2 = 4\\)' },
		{ base: 27, exp: '2/3', val: 9, hint: '\\(27^{2/3} = (\\sqrt[3]{27})^2 = 3^2 = 9\\)' },
		{ base: 16, exp: '1/2', val: 4, hint: '\\(16^{1/2} = \\sqrt{16} = 4\\)' },
	];
	const c = pick(cases);
	return { atomId: 'algebra__potenzen_rationale_exponenten', prompt: `\\(${c.base}^{${c.exp}} = ?\\)`, answerType: 'integer', correctAnswer: String(c.val), hint: c.hint, difficulty: 0.55 };
});

reg('algebra__quadratwurzel_begriff', () => {
	const squares = [1, 4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144];
	const n = pick(squares);
	const root = Math.sqrt(n);
	const type = rand(0, 1);
	if (type === 0) {
		return { atomId: 'algebra__quadratwurzel_begriff', prompt: `\\(\\sqrt{${n}} = ?\\)`, answerType: 'integer', correctAnswer: String(root), hint: `\\(${root}^2 = ${n}\\)`, difficulty: 0.35 };
	} else {
		return { atomId: 'algebra__quadratwurzel_begriff', prompt: `\\(x^2 = ${n}\\)  →  \\(x = ?\\) (positive Lösung)`, answerType: 'integer', correctAnswer: String(root), hint: `Die positive Lösung: \\(x = \\sqrt{${n}} = ${root}\\)`, difficulty: 0.35 };
	}
});

reg('algebra__irrationale_reelle_zahlen', () => {
	const irrationals = ['√2', '√3', '√5', '√7', 'π'];
	const rationals = ['√4', '√9', '√16', '√25', '0,333…'];
	const irr = pick(irrationals);
	const rats = [pick(rationals), pick(rationals)].filter((v, i, a) => a.indexOf(v) === i);
	while (rats.length < 2) rats.push(pick(rationals));
	const choices = [irr, ...rats.slice(0, 2), pick(rationals.filter(r => !rats.includes(r)))].sort(() => Math.random() - 0.5);
	return { atomId: 'algebra__irrationale_reelle_zahlen', prompt: `Welche der folgenden Zahlen ist irrational?`, answerType: 'text', correctAnswer: irr.toLowerCase(), choices, hint: 'Irrationale Zahlen können nicht als Bruch dargestellt werden.', difficulty: 0.45 };
});

reg('algebra__wurzelterme_umformen', () => {
	const cases: { expr: string; factor: number; rest: number }[] = [
		{ expr: '\\sqrt{8}', factor: 2, rest: 2 },
		{ expr: '\\sqrt{12}', factor: 2, rest: 3 },
		{ expr: '\\sqrt{18}', factor: 3, rest: 2 },
		{ expr: '\\sqrt{20}', factor: 2, rest: 5 },
		{ expr: '\\sqrt{27}', factor: 3, rest: 3 },
		{ expr: '\\sqrt{50}', factor: 5, rest: 2 },
		{ expr: '\\sqrt{45}', factor: 3, rest: 5 },
		{ expr: '\\sqrt{75}', factor: 5, rest: 3 },
	];
	const c = pick(cases);
	return { atomId: 'algebra__wurzelterme_umformen', prompt: `\\(${c.expr} = \\_\\_ \\cdot \\sqrt{${c.rest}}\\)`, answerType: 'integer', correctAnswer: String(c.factor), hint: `\\(${c.expr} = \\sqrt{${c.factor ** 2} \\cdot ${c.rest}} = ${c.factor}\\sqrt{${c.rest}}\\)`, difficulty: 0.5 };
});

// ── 23. Algebra: Lineare Funktionen ──────────────────────────────────────────

reg('algebra__lineare_funktion_steigung_achsenabschnitt', () => {
	const m = rand(-4, 4), n = rand(-5, 5);
	while (m === 0) return registry.get('algebra__lineare_funktion_steigung_achsenabschnitt')!();
	const nSign = (v: number) => v >= 0 ? `+${v}` : `${v}`;
	const type = rand(0, 1);
	if (type === 0) {
		return { atomId: 'algebra__lineare_funktion_steigung_achsenabschnitt', prompt: `\\(f(x) = ${m}x ${nSign(n)}\\). Wie groß ist die Steigung \\(m\\)?`, answerType: 'integer', correctAnswer: String(m), hint: `In \\(y=mx+n\\) ist \\(m\\) der Koeffizient vor \\(x\\).`, difficulty: 0.35 };
	} else {
		return { atomId: 'algebra__lineare_funktion_steigung_achsenabschnitt', prompt: `\\(f(x) = ${m}x ${nSign(n)}\\). Wie groß ist der y-Achsenabschnitt \\(n\\)?`, answerType: 'integer', correctAnswer: String(n), hint: `In \\(y=mx+n\\) ist \\(n\\) der y-Achsenabschnitt (konstantes Glied).`, difficulty: 0.35 };
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
		prompt: `Bestimme die Nullstelle von \\(f(x) = ${m}x ${nSign(n)}\\).`,
		answerType: 'integer',
		correctAnswer: String(x0),
		inputData: {
			steps: [
				`\\(${m}x ${nSign(n)} = 0\\)`,
				`\\(${m}x = ${-n}\\)`,
				`\\(x_0 = ${x0}\\)`
			]
		},
		difficulty: 0.45
	};
});

reg('algebra__lineare_funktion_gleichung_aufstellen', () => {
	const m = rand(-3, 4), n = rand(-5, 5);
	while (m === 0) return registry.get('algebra__lineare_funktion_gleichung_aufstellen')!();
	const nSign = (v: number) => v >= 0 ? `+${v}` : `${v}`;
	const type = rand(0, 1);
	if (type === 0) {
		const choices = [`\\(y = ${m}x ${nSign(n)}\\)`, `\\(y = ${m}x ${nSign(n + 1)}\\)`, `\\(y = ${m + 1}x ${nSign(n)}\\)`, `\\(y = ${-m}x ${nSign(n)}\\)`].sort(() => Math.random() - 0.5);
		return { atomId: 'algebra__lineare_funktion_gleichung_aufstellen', prompt: `Steigung \\(m = ${m}\\), y-Achsenabschnitt \\(n = ${n}\\). Wie lautet die Funktionsgleichung?`, answerType: 'text', correctAnswer: `\\(y = ${m}x ${nSign(n)}\\)`, choices, difficulty: 0.4 };
	} else {
		const x1 = rand(-2, 2), y1 = m * x1 + n;
		const x2 = x1 + rand(1, 3), y2 = m * x2 + n;
		const choices = [`\\(y = ${m}x ${nSign(n)}\\)`, `\\(y = ${m}x ${nSign(n - 1)}\\)`, `\\(y = ${m + 1}x ${nSign(n)}\\)`, `\\(y = ${m}x ${nSign(n + 2)}\\)`].sort(() => Math.random() - 0.5);
		return {
			atomId: 'algebra__lineare_funktion_gleichung_aufstellen',
			prompt: `Die Gerade geht durch \\((${x1}|${y1})\\) und \\((${x2}|${y2})\\). Wie lautet die Gleichung?`,
			answerType: 'text',
			correctAnswer: `\\(y = ${m}x ${nSign(n)}\\)`,
			choices,
			hint: `Steigung: \\(m = \\frac{${y2}−${y1}}{${x2}−${x1}} = ${m}\\); dann \\(n\\) bestimmen.`,
			difficulty: 0.55
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
	const nSign = (v: number) => v >= 0 ? `+${v}` : `${v}`;
	return { atomId: 'algebra__lineare_funktion_graph_zeichnen', prompt: `Welcher Punkt liegt auf dem Graphen von \\(f(x) = ${m}x ${nSign(n)}\\)?`, answerType: 'text', correctAnswer: `(${testX} | ${correctY})`, choices, hint: `Einsetzen: \\(f(${testX}) = ${m} \\cdot ${testX}${nSign(n)} = ${correctY}\\)`, difficulty: 0.4 };
});

// ── 24. Algebra: Quadratische Funktionen und Gleichungen ─────────────────────

reg('algebra__normalparabel_streckung', () => {
	const type = rand(0, 2);
	if (type === 0) {
		const a = pick([2, 3, 0.5, 0.25]);
		const desc = a > 1 ? 'schmaler als die Normalparabel' : 'breiter als die Normalparabel';
		const choices = ['schmaler als die Normalparabel', 'breiter als die Normalparabel', 'nach oben verschoben', 'nach links verschoben'];
		return { atomId: 'algebra__normalparabel_streckung', prompt: `Was beschreibt \\(f(x) = ${a}x^2\\) im Vergleich zur Normalparabel \\(y = x^2\\)?`, answerType: 'text', correctAnswer: desc, choices: choices.sort(() => Math.random() - 0.5), hint: '\\(a > 1\\): schmaler (gestreckt), \\(0 < a < 1\\): breiter (gestaucht)', difficulty: 0.45 };
	} else if (type === 1) {
		const c = rand(1, 5);
		const choices = [`um ${c} nach oben`, `um ${c} nach unten`, `um ${c} nach rechts`, `um ${c} nach links`];
		return { atomId: 'algebra__normalparabel_streckung', prompt: `Was bewirkt das \\(+${c}\\) in \\(f(x) = x^2 + ${c}\\)?`, answerType: 'text', correctAnswer: `um ${c} nach oben`, choices: choices.sort(() => Math.random() - 0.5), hint: `\\(+c\\) verschiebt den Graphen um \\(c\\) nach oben.`, difficulty: 0.4 };
	} else {
		const c = rand(1, 4);
		const choices = [`um ${c} nach rechts`, `um ${c} nach links`, `um ${c} nach oben`, `um ${c} nach unten`];
		return { atomId: 'algebra__normalparabel_streckung', prompt: `Was bewirkt \\(f(x) = (x − ${c})^2\\) gegenüber \\(y = x^2\\)?`, answerType: 'text', correctAnswer: `um ${c} nach rechts`, choices: choices.sort(() => Math.random() - 0.5), hint: `\\((x−c)^2\\): Verschiebung um \\(c\\) nach rechts.`, difficulty: 0.45 };
	}
});

reg('algebra__scheitelpunktform', () => {
	const d = rand(-4, 4), e = rand(-4, 4), a = pick([1, -1, 2]);
	// d=0 or e=0 causes duplicate choices: (0|e)==(-0|e) and (d|0)==(d|-0)
	if (d === 0 || e === 0) return registry.get('algebra__scheitelpunktform')!();
	const dSign = d >= 0 ? `${d}` : `(${d})`;
	const eSign = (v: number) => v >= 0 ? `+${v}` : `${v}`;
	const choices = [`(${d} | ${e})`, `(${-d} | ${e})`, `(${d} | ${-e})`, `(${-d} | ${-e})`];
	return { atomId: 'algebra__scheitelpunktform', prompt: `Lies den Scheitelpunkt ab: \\(f(x) = ${a === 1 ? '' : a}(x − ${dSign})^2 ${eSign(e)}\\)`, answerType: 'text', correctAnswer: `(${d} | ${e})`, choices: choices.sort(() => Math.random() - 0.5), hint: `Scheitelpunktform \\(y=a(x−d)^2+e\\) → Scheitel \\(S(d \\mid e)\\)`, difficulty: 0.5 };
});

reg('algebra__scheitelform_umwandeln', () => {
	const d = rand(-4, 4), e = rand(-4, 4);
	// d=0 causes "x² x +q" in LaTeX (literal "x" without coefficient)
	if (d === 0) return registry.get('algebra__scheitelform_umwandeln')!();
	// (x-d)² + e = x² - 2dx + d² + e
	const p = -2 * d, q = d * d + e;
	const pSign = (v: number) => v > 0 ? `+${v}` : v < 0 ? `${v}` : '';
	const correct = `\\(x^2 ${pSign(p)}x ${pSign(q)}\\)`;
	const choices = [correct, `\\(x^2 ${pSign(p + 2)}x ${pSign(q)}\\)`, `\\(x^2 ${pSign(p)}x ${pSign(q + 1)}\\)`, `\\(x^2 ${pSign(p - 1)}x ${pSign(q)}\\)`].sort(() => Math.random() - 0.5);
	const dStr = d >= 0 ? `${d}` : `(${d})`;
	return {
		atomId: 'algebra__scheitelform_umwandeln',
		prompt: `Schreibe in allgemeiner Form: \\(f(x) = (x − ${dStr})^2 ${pSign(e)}\\)`,
		answerType: 'text',
		correctAnswer: correct,
		choices,
		inputData: {
			steps: [
				`\\((x−${dStr})^2 = x^2 ${pSign(-2 * d)}x + ${d * d}\\)`,
				`\\(+ (${e})\\): \\(x^2 ${pSign(p)}x + ${d * d} + (${e})\\)`,
				`\\(= x^2 ${pSign(p)}x ${pSign(q)}\\)`
			]
		},
		difficulty: 0.6
	};
});

reg('algebra__parabel_nullstellen', () => {
	const x1 = rand(-4, 4), x2 = rand(-4, 4);
	// x1+x2===0: distractor "x₁=-s; x₂=-l" would equal correct "x₁=s; x₂=l" (symmetric roots)
	while (x1 === x2 || x1 + x2 === 0) return registry.get('algebra__parabel_nullstellen')!();
	const [s, l] = x1 < x2 ? [x1, x2] : [x2, x1];
	const type = rand(0, 1);
	if (type === 0) {
		const correct = `x₁=${s}; x₂=${l}`;
		const choices = [correct, `x₁=${-s}; x₂=${-l}`, `x₁=${s+1}; x₂=${l}`, `x₁=${s}; x₂=${l+1}`].sort(() => Math.random() - 0.5);
		return { atomId: 'algebra__parabel_nullstellen', prompt: `Bestimme die Nullstellen von \\(f(x) = (x ${x1 >= 0 ? '−' : '+'} ${Math.abs(x1)})(x ${x2 >= 0 ? '−' : '+'} ${Math.abs(x2)})\\)`, answerType: 'text', correctAnswer: correct, choices, hint: `Satz vom Nullprodukt: Jeder Faktor = 0 setzen.`, difficulty: 0.5 };
	} else {
		const a2 = -(x1 + x2), a0 = x1 * x2;
		const correct = `x₁=${s}; x₂=${l}`;
		const choices = [correct, `x₁=${-s}; x₂=${-l}`, `x₁=${s}; x₂=${l-1}`, `x₁=${s+1}; x₂=${l}`].sort(() => Math.random() - 0.5);
		const pSign = (v: number) => v >= 0 ? `+${v}` : `${v}`;
		return {
			atomId: 'algebra__parabel_nullstellen',
			prompt: `Bestimme die Nullstellen: \\(f(x) = x^2 ${pSign(a2)}x ${pSign(a0)}\\)`,
			answerType: 'text',
			correctAnswer: correct,
			choices,
			inputData: {
				steps: [
					`\\(x^2 ${pSign(a2)}x ${pSign(a0)} = 0\\)`,
					`\\(p = ${a2},\\; q = ${a0}\\)`,
					`\\(x = -\\frac{${a2}}{2} \\pm \\sqrt{(\\frac{${a2}}{2})^2 - ${a0}}\\)`,
					`\\(x_1 = ${s},\\quad x_2 = ${l}\\)`
				]
			},
			difficulty: 0.6
		};
	}
});

reg('algebra__parametereinfluss_graphen', () => {
	const templates = [
		{ q: 'Was bewirkt \\(a > 1\\) in \\(f(x) = a \\cdot x^2\\)?', a: 'Graph wird schmaler', w: ['Graph wird breiter', 'Graph verschiebt sich nach oben', 'Graph spiegelt sich'] },
		{ q: 'Was bewirkt \\(c > 0\\) in \\(f(x) = x^2 + c\\)?', a: 'Verschiebung nach oben um \\(c\\)', w: ['Verschiebung nach unten um \\(c\\)', 'Verschiebung nach rechts', 'Streckung um \\(c\\)'] },
		{ q: 'Was bewirkt ein negatives \\(a\\) in \\(f(x) = a \\cdot x^2\\)?', a: 'Parabel öffnet nach unten', w: ['Parabel öffnet nach oben', 'Verschiebung nach links', 'Stauchung'] },
		{ q: 'Was bewirkt \\(c > 0\\) in \\(f(x) = (x - c)^2\\)?', a: 'Verschiebung um \\(c\\) nach rechts', w: ['Verschiebung um \\(c\\) nach links', 'Verschiebung um \\(c\\) nach oben', 'Verschiebung um \\(c\\) nach unten'] },
	];
	const t = pick(templates);
	const choices = [t.a, ...t.w].sort(() => Math.random() - 0.5);
	return { atomId: 'algebra__parametereinfluss_graphen', prompt: t.q, answerType: 'text', correctAnswer: t.a.toLowerCase(), choices, difficulty: 0.45 };
});

reg('algebra__quadratische_gleichung_reinquadratisch', () => {
	// ~20% chance: keine Lösung (negative RHS)
	if (rand(0, 4) === 0) {
		const x = rand(2, 9);
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
			difficulty: 0.45
		};
	}

	const x = rand(2, 9);
	const c = x * x;
	const correct = `\\(x = ${x}\\) oder \\(x = −${x}\\)`;

	// Two "oder"-form distractors with adjacent values so students can't just pick "the ± one"
	const d1 = x < 9 ? x + 1 : x - 2;
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

	const type = rand(0, 1);
	if (type === 0) {
		return {
			atomId: 'algebra__quadratische_gleichung_reinquadratisch',
			prompt: `Löse: \\(x^2 = ${c}\\)`,
			answerType: 'text',
			correctAnswer: correct,
			choices,
			hint: `\\(x^2 = ${c}\\) → \\(x = \\pm\\sqrt{${c}} = \\pm${x}\\)`,
			difficulty: 0.4
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
	const t1 = x1 >= 0 ? `x − ${x1}` : `x + ${-x1}`;
	const t2 = x2 >= 0 ? `x − ${x2}` : `x + ${-x2}`;
	const correct = `\\(x = ${x1}\\) oder \\(x = ${x2}\\)`;
	const choices = [correct, `\\(x = ${-x1}\\) oder \\(x = ${-x2}\\)`, `\\(x = ${x1}\\)`, `\\(x = ${x1 + 1}\\) oder \\(x = ${x2 + 1}\\)`].sort(() => Math.random() - 0.5);
	return { atomId: 'algebra__quadratische_gleichung_faktorisiert', prompt: `Löse: \\((${t1})(${t2}) = 0\\)`, answerType: 'text', correctAnswer: correct, choices, hint: `Satz vom Nullprodukt: \\(${t1} = 0\\) oder \\(${t2} = 0\\)`, difficulty: 0.45 };
});

reg('algebra__quadratische_gleichung_loesungsformel', () => {
	const x1 = rand(-4, 4), x2 = rand(-4, 4);
	const p = -(x1 + x2), q = x1 * x2;
	// p=0: step-1 choices degenerate; q=0: step-1 choices collapse to 2 options
	if (x1 === x2 || p % 2 !== 0 || x1 + x2 === 0 || q === 0) return registry.get('algebra__quadratische_gleichung_loesungsformel')!();
	const [s, l] = x1 < x2 ? [x1, x2] : [x2, x1];
	const pStr = (v: number) => v >= 0 ? `+${v}` : `${v}`;
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
		prompt: `Löse mit der pq-Formel: \\(x^2 ${pStr(p)}x ${pStr(q)} = 0\\)`,
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
		difficulty: 0.65
	};
});

reg('algebra__quadratische_gleichung_diskriminante', () => {
	const type = rand(0, 2);
	const choices = ['keine Lösung', 'genau eine Lösung', 'zwei Lösungen'];
	if (type === 0) {
		const p = rand(1, 4), q = p * p + rand(1, 3);
		const D = (p / 2) ** 2 - q;
		return { atomId: 'algebra__quadratische_gleichung_diskriminante', prompt: `\\(x^2 + ${p}x + ${q} = 0\\): Wie viele Lösungen? \\(D = (\\frac{${p}}{2})^2 - ${q} = ${+(D.toFixed(2))}\\)`, answerType: 'text', correctAnswer: 'keine lösung', choices: choices.sort(() => Math.random() - 0.5), hint: 'D < 0 → keine reellen Lösungen', difficulty: 0.5 };
	} else if (type === 1) {
		const r = rand(2, 5);
		const p = 2 * r, q = r * r;
		return { atomId: 'algebra__quadratische_gleichung_diskriminante', prompt: `\\(x^2 + ${p}x + ${q} = 0\\): Wie viele Lösungen? \\(D = ${r}^2 - ${q} = 0\\)`, answerType: 'text', correctAnswer: 'genau eine lösung', choices: choices.sort(() => Math.random() - 0.5), hint: 'D = 0 → genau eine (doppelte) Lösung', difficulty: 0.5 };
	} else {
		const x1 = rand(-3, 3), x2 = rand(-3, 3);
		while (x1 === x2) return registry.get('algebra__quadratische_gleichung_diskriminante')!();
		const p = -(x1 + x2), q = x1 * x2;
		const D = (p / 2) ** 2 - q;
		const pSign = (v: number) => v >= 0 ? `+${v}` : `${v}`;
		return { atomId: 'algebra__quadratische_gleichung_diskriminante', prompt: `\\(x^2 ${pSign(p)}x ${pSign(q)} = 0\\): Wie viele Lösungen? (\\(D = ${D}\\))`, answerType: 'text', correctAnswer: 'zwei lösungen', choices: choices.sort(() => Math.random() - 0.5), hint: 'D > 0 → zwei verschiedene Lösungen', difficulty: 0.5 };
	}
});

// ── Export ────────────────────────────────────────────────────────────────────

export function generateTask(atomId: string, mastery?: number): GeneratedTask | null {
	const gen = registry.get(atomId);
	if (!gen) return null;
	return gen(mastery);
}

export function hasGenerator(atomId: string): boolean {
	return registry.has(atomId);
}

export const registeredAtomIds: string[] = [...registry.keys()];
