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
	if (which === 0) return { atomId: 'arithmetik__division_mit_rest', prompt: `${a} : ${b} = ? Rest ___ — gib den Quotienten an`, answerType: 'integer', correctAnswer: String(q), hint: `${a} = ${b} · ${q} + ${r}`, difficulty: 0.4 };
	return { atomId: 'arithmetik__division_mit_rest', prompt: `${a} : ${b} = ${q} Rest ___`, answerType: 'integer', correctAnswer: String(r), hint: `${a} − ${b} · ${q} = ?`, difficulty: 0.4 };
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
		const which = pick([0, 1, 2] as const);
		const bottom = [a, b, c].map((v, i) => i === which ? '___' : String(v));
		const missing = which === 0 ? a : which === 1 ? b : c;
		return { atomId, prompt: `Zahlenmauer (jede Zahl = Summe der zwei darunter): Oben: ${top} | Mitte: ${ab}, ${bc} | Unten: ${bottom.join(', ')}. Welche Zahl fehlt unten?`, answerType: 'integer', correctAnswer: String(missing), hint: 'Nutze die Mitte: Mitte − bekannte Nachbarzahl = fehlende Zahl.', difficulty: 0.4 };
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
		prompt: `Der Pfeil zeigt auf einen Punkt. Welcher Bruch mit Nenner ${d} liegt dort? Gib den Zähler an.`,
		answerType: 'integer', correctAnswer: String(n),
		svg: svgFractionLine(d, n),
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
		return { atomId, prompt: `Erweitere ${fmtFrac(n, d)} mit ${factor} — neuer Zähler?`, answerType: 'integer', correctAnswer: String(n * factor), hint, difficulty: 0.35 };
	}
	return { atomId, prompt: `Erweitere ${fmtFrac(n, d)} mit ${factor} — neuer Nenner?`, answerType: 'integer', correctAnswer: String(d * factor), hint, difficulty: 0.35 };
});

reg('arithmetik__kuerzen', () => {
	const atomId = 'arithmetik__kuerzen';
	const n = rand(1, 5), d = rand(n + 1, 8);
	const factor = rand(2, 4);
	const g = gcd(n * factor, d * factor);
	const hint = `Teile Zähler und Nenner durch ${g}.`;
	if (rand(0, 1) === 0) {
		return { atomId, prompt: `Kürze ${fmtFrac(n * factor, d * factor)} vollständig — neuer Zähler?`, answerType: 'integer', correctAnswer: String(n), hint, difficulty: 0.4 };
	}
	return { atomId, prompt: `Kürze ${fmtFrac(n * factor, d * factor)} vollständig — neuer Nenner?`, answerType: 'integer', correctAnswer: String(d), hint, difficulty: 0.4 };
});

reg('arithmetik__gemischte_zahlen_unechte_brueche', () => {
	const atomId = 'arithmetik__gemischte_zahlen_unechte_brueche';
	const whole = rand(1, 5), n = rand(1, 5), d = rand(n + 1, 6);
	const num = whole * d + n;
	const type = rand(0, 2);
	if (type === 0) {
		return { atomId, prompt: `${fmtMixed(whole, n, d)} als unechter Bruch?`, answerType: 'fraction', correctAnswer: frac(num, d), hint: `${whole} · ${d} + ${n} = ${num}`, difficulty: 0.45 };
	} else if (type === 1) {
		return { atomId, prompt: `${fmtFrac(num, d)} als gemischte Zahl — ganzer Anteil?`, answerType: 'integer', correctAnswer: String(whole), difficulty: 0.4 };
	} else {
		return { atomId, prompt: `${fmtFrac(num, d)} als gemischte Zahl — Bruchanteil?`, answerType: 'fraction', correctAnswer: frac(n, d), hint: `${num} : ${d} = ${whole} Rest ${n}`, difficulty: 0.5 };
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
		const n = parseFloat((rand(10, 99) + Math.random()).toFixed(2));
		const place = rand(0, 1);
		if (place === 0) return { atomId: 'arithmetik__dezimalzahlen_vergleichen_ordnen_runden', prompt: `Runde ${dec(n)} auf eine Nachkommastelle: ___`, answerType: 'number', correctAnswer: dec(Math.round(n * 10) / 10), difficulty: 0.4 };
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
	const d = rand(2, 8), q = rand(1, 9), r = rand(1, 9);
	const dividend = d * q + r / 10;
	return { atomId: 'arithmetik__dezimal_division_natuerliche_zahl', prompt: `${dec(dividend)} : ${d} = ?`, answerType: 'number', correctAnswer: dec(dividend / d), difficulty: 0.5 };
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
	return { atomId, prompt: `${dec(val)} als vollständig gekürzten Bruch — Nenner?`, answerType: 'integer', correctAnswer: String(d), hint: `${dec(val)} = ${fmtFrac(n, d)}`, difficulty: 0.4 };
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
		return { atomId, prompt: `Welche Zahl liegt weiter rechts auf dem Zahlenstrahl: ${a} oder ${b}?`, answerType: 'integer', correctAnswer: String(bigger), svg: svgIntegerLine(Math.min(a, b) - 1, 1, [a, b]), hint: 'Weiter rechts = größer.', difficulty: 0.4 };
	} else if (type === 1) {
		// Positive vs negative
		const pos = rand(1, 8), neg = -rand(1, 8);
		return { atomId, prompt: `Welche Zahl liegt weiter rechts auf dem Zahlenstrahl: ${neg} oder ${pos}?`, answerType: 'integer', correctAnswer: String(pos), svg: svgIntegerLine(neg - 1, pos + 1, [neg, pos]), hint: 'Positive Zahlen liegen rechts von Null, negative links.', difficulty: 0.3 };
	} else {
		// Everyday context: temperature
		const t1 = rand(-15, 20), t2 = rand(-15, 20);
		if (t1 === t2) return registry.get(atomId)!();
		const warmer = Math.max(t1, t2);
		return { atomId, prompt: `Welche Temperatur ist wärmer: ${t1} °C oder ${t2} °C?`, answerType: 'integer', correctAnswer: String(warmer), hint: 'Höhere Temperatur = größere Zahl auf dem Thermometer.', difficulty: 0.35 };
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
	const signs = pick([[1, -1], [-1, 1], [-1, -1], [1, 1]]);
	const [sa, sb] = signs;
	const op = rand(0, 1);
	if (op === 0) return { atomId: 'arithmetik__vorzeichenregeln_mult_div', prompt: `(${sa * a}) · (${sb * b}) = ?`, answerType: 'integer', correctAnswer: String(sa * a * sb * b), hint: '(−) · (−) = (+), (−) · (+) = (−)', difficulty: 0.45 };
	const product = a * b;
	return { atomId: 'arithmetik__vorzeichenregeln_mult_div', prompt: `(${sa * product}) : (${sa * a}) = ?`, answerType: 'integer', correctAnswer: String(b), hint: 'Gleiches Vorzeichen → positiv, verschiedene → negativ.', difficulty: 0.45 };
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
