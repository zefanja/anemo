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

type Gen = () => GeneratedTask;

// ── Math helpers ──────────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
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
	const start = rand(1, 20) * step;
	const terms = [start, start + step, start + 2 * step, start + 3 * step];
	const missing = rand(0, 3);
	const display = terms.map((v, i) => (i === missing ? '___' : String(v))).join(', ');
	return {
		atomId: 'arithmetik__zaehlen_zahlwortreihe',
		prompt: `Welche Zahl fehlt? ${display}`,
		answerType: 'integer',
		correctAnswer: String(terms[missing]),
		hint: `Die Zahlenfolge zählt in ${step}er-Schritten.`,
		difficulty: step === 1 ? 0.1 : step === 2 ? 0.2 : 0.3
	};
});

reg('arithmetik__zahlverstaendnis_bis_20', () => {
	const type = rand(0, 2);
	if (type === 0) {
		const a = rand(1, 20), b = rand(1, 20);
		const [bigger, smaller] = a > b ? [a, b] : [b, a];
		return { atomId: 'arithmetik__zahlverstaendnis_bis_20', prompt: `Welche Zahl ist größer: ${a} oder ${b}?`, answerType: 'integer', correctAnswer: String(bigger), difficulty: 0.15 };
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
	return { atomId: 'arithmetik__natuerliche_zahlen_darstellen_ordnen', prompt: `Ordne von klein nach groß: ${nums.join(', ')} — was ist die kleinste Zahl?`, answerType: 'integer', correctAnswer: String(sorted[0]), difficulty: 0.3 };
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
	const a = rand(2, 9) * 10 + rand(3, 7);
	const b = rand(2, 9) * 10 + rand(3, 7);
	const ra = Math.round(a / 10) * 10;
	const rb = Math.round(b / 10) * 10;
	return { atomId: 'arithmetik__ueberschlagsrechnung', prompt: `Schätze: ${a} + ${b} ≈ ___  (runde zuerst auf Zehner)`, answerType: 'integer', correctAnswer: String(ra + rb), hint: `${a} ≈ ${ra}, ${b} ≈ ${rb}`, difficulty: 0.35 };
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
	const a = rand(7, 9), b = rand(10 - a + 1, 9);
	return { atomId: 'arithmetik__zehnerueberschreitung_bis_20', prompt: `${a} + ${b} = ?`, answerType: 'integer', correctAnswer: String(a + b), hint: `Nutze den Zehner als Zwischenschritt: ${a} + ${10 - a} = 10, dann noch ${b - (10 - a)}.`, difficulty: 0.25 };
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
	const a = rand(12, 999), b = rand(2, 9);
	return { atomId: 'arithmetik__schriftliche_multiplikation', prompt: `${a} · ${b} = ?`, answerType: 'integer', correctAnswer: String(a * b), difficulty: 0.5 };
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
	const type = rand(0, 2);
	if (type === 0) {
		const a = rand(1, 9), b = rand(1, 9);
		return { atomId: 'arithmetik__rechengesetze_rechenvorteile', prompt: `${a} + ${b} = ${b} + ___  (Kommutativgesetz)`, answerType: 'integer', correctAnswer: String(a), difficulty: 0.2 };
	} else if (type === 1) {
		const a = rand(10, 50), b = rand(1, 9) * 10, c = rand(1, 9) * 10;
		return { atomId: 'arithmetik__rechengesetze_rechenvorteile', prompt: `${a} + ${b} + ${100 - b} = ?  (suche den Rechenweg)`, answerType: 'integer', correctAnswer: String(a + 100), difficulty: 0.35 };
	} else {
		const a = rand(2, 9), b = rand(2, 9), c = rand(2, 9);
		return { atomId: 'arithmetik__rechengesetze_rechenvorteile', prompt: `(${a} · ${b}) · ${c} = ${a} · (${b} · ___)`, answerType: 'integer', correctAnswer: String(c), difficulty: 0.25 };
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
	const rows = [1, 2, 5, 10];
	const a = pick(rows), b = rand(1, 10);
	return { atomId: 'arithmetik__einmaleins_kernaufgaben', prompt: `${a} · ${b} = ?`, answerType: 'integer', correctAnswer: String(a * b), difficulty: 0.25 };
});

reg('arithmetik__einmaleins_ableiten', () => {
	const b = rand(3, 9);
	const baseRow = pick([2, 5]);
	const a = baseRow + 1;
	return { atomId: 'arithmetik__einmaleins_ableiten', prompt: `Wenn ${baseRow} · ${b} = ${baseRow * b}, was ist dann ${a} · ${b}?`, answerType: 'integer', correctAnswer: String(a * b), hint: `Addiere einmal ${b} zum bekannten Ergebnis.`, difficulty: 0.3 };
});

reg('arithmetik__einmaleins_automatisierung', () => {
	const a = rand(2, 9), b = rand(2, 9);
	return { atomId: 'arithmetik__einmaleins_automatisierung', prompt: `${a} · ${b} = ?`, answerType: 'integer', correctAnswer: String(a * b), difficulty: 0.35 };
});

reg('arithmetik__division_grundverstaendnis', () => {
	const b = rand(2, 9), q = rand(2, 10);
	const a = b * q;
	const type = rand(0, 1);
	if (type === 0) return { atomId: 'arithmetik__division_grundverstaendnis', prompt: `${a} : ${b} = ?`, answerType: 'integer', correctAnswer: String(q), difficulty: 0.3 };
	return { atomId: 'arithmetik__division_grundverstaendnis', prompt: `${a} Äpfel gleichmäßig auf ${b} Körbe — wie viele pro Korb?`, answerType: 'integer', correctAnswer: String(q), difficulty: 0.3 };
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
	const type = rand(0, 2);
	if (type === 0) {
		const start = rand(1, 10), step = rand(2, 5);
		const seq = [0, 1, 2, 3, 4].map(i => start + i * step);
		const missing = rand(1, 3);
		const display = seq.slice(0, 5).map((v, i) => i === missing ? '___' : String(v)).join(', ');
		return { atomId: 'arithmetik__muster_zahlenfolgen_grundschule', prompt: `Welche Zahl fehlt? ${display}`, answerType: 'integer', correctAnswer: String(seq[missing]), hint: `Die Folge wächst in ${step}er-Schritten.`, difficulty: 0.3 };
	} else if (type === 1) {
		const start = rand(5, 20), step = rand(2, 4);
		const seq = [0, 1, 2, 3, 4].map(i => start - i * step);
		return { atomId: 'arithmetik__muster_zahlenfolgen_grundschule', prompt: `Wie geht die Folge weiter? ${seq.slice(0, 4).join(', ')}, ___`, answerType: 'integer', correctAnswer: String(seq[4]), difficulty: 0.3 };
	} else {
		const base = rand(1, 5);
		const seq = [base, base * 2, base * 4, base * 8];
		return { atomId: 'arithmetik__muster_zahlenfolgen_grundschule', prompt: `${seq[0]}, ${seq[1]}, ${seq[2]}, ___`, answerType: 'integer', correctAnswer: String(seq[3]), hint: 'Jede Zahl wird verdoppelt.', difficulty: 0.35 };
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
	const n = pick([6, 8, 10, 12, 15, 18, 20, 24, 30, 36]);
	const divisors = Array.from({ length: n }, (_, i) => i + 1).filter(d => n % d === 0);
	const q = rand(0, 1);
	if (q === 0) {
		const d = pick(divisors.slice(1, -1));
		return { atomId: 'arithmetik__teiler_vielfache', prompt: `Ist ${d} ein Teiler von ${n}?`, answerType: 'boolean', correctAnswer: 'ja', difficulty: 0.3 };
	}
	const notDiv = pick([...Array.from({ length: n - 1 }, (_, i) => i + 2).filter(d => n % d !== 0)]);
	return { atomId: 'arithmetik__teiler_vielfache', prompt: `Ist ${notDiv} ein Teiler von ${n}?`, answerType: 'boolean', correctAnswer: 'nein', difficulty: 0.3 };
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
	const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
	const composites = [4, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21, 22, 24, 25, 26, 27, 28];
	const q = rand(0, 2);
	if (q === 0) {
		const n = pick([...primes, ...composites.slice(0, 6)]);
		return { atomId: 'arithmetik__primzahlen_primfaktorzerlegung', prompt: `Ist ${n} eine Primzahl?`, answerType: 'boolean', correctAnswer: primes.includes(n) ? 'ja' : 'nein', difficulty: 0.4 };
	} else if (q === 1) {
		const p1 = pick([2, 3, 5, 7]), p2 = pick([2, 3, 5, 7]);
		return { atomId: 'arithmetik__primzahlen_primfaktorzerlegung', prompt: `Was ist der kleinste Primfaktor von ${p1 * p2}?`, answerType: 'integer', correctAnswer: String(Math.min(p1, p2)), difficulty: 0.45 };
	} else {
		let p: number, e: number;
		do { p = pick(primes.slice(0, 8)); e = rand(2, 4); } while (p ** e > 100);
		return { atomId: 'arithmetik__primzahlen_primfaktorzerlegung', prompt: `${pow(p, e)} = ?`, answerType: 'integer', correctAnswer: String(p ** e), difficulty: 0.45 };
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

reg('arithmetik__brueche_vergleichen_ordnen', () => {
	const d = pick([3, 4, 5, 6, 8, 10, 12]);
	const n1 = rand(1, d - 1), n2 = rand(1, d - 1);
	if (n1 === n2) return registry.get('arithmetik__brueche_vergleichen_ordnen')!();
	const bigger = n1 > n2 ? `${n1}/${d}` : `${n2}/${d}`;
	return { atomId: 'arithmetik__brueche_vergleichen_ordnen', prompt: `Welcher Bruch ist größer: ${fmtFrac(n1, d)} oder ${fmtFrac(n2, d)}? (Gib den Zähler des größeren an)`, answerType: 'integer', correctAnswer: String(Math.max(n1, n2)), difficulty: 0.4 };
});

reg('arithmetik__erweitern', () => {
	const n = rand(1, 5), d = rand(2, 6), factor = rand(2, 5);
	return { atomId: 'arithmetik__erweitern', prompt: `Erweitere ${fmtFrac(n, d)} mit ${factor}: Neuer Nenner = ?`, answerType: 'integer', correctAnswer: String(d * factor), hint: `Zähler und Nenner mit ${factor} multiplizieren.`, difficulty: 0.35 };
});

reg('arithmetik__kuerzen', () => {
	const n = rand(1, 5), d = rand(n + 1, 8);
	const factor = rand(2, 4);
	return { atomId: 'arithmetik__kuerzen', prompt: `Kürze ${fmtFrac(n * factor, d * factor)} vollständig — neuer Nenner?`, answerType: 'integer', correctAnswer: String(d), hint: `Teile Zähler und Nenner durch ${gcd(n * factor, d * factor)}.`, difficulty: 0.4 };
});

reg('arithmetik__gemischte_zahlen_unechte_brueche', () => {
	const whole = rand(1, 5), n = rand(1, 5), d = rand(n + 1, 6);
	const q = rand(0, 1);
	if (q === 0) {
		// mixed → improper
		const num = whole * d + n;
		return { atomId: 'arithmetik__gemischte_zahlen_unechte_brueche', prompt: `${fmtMixed(whole, n, d)} als unechter Bruch — Zähler?`, answerType: 'integer', correctAnswer: String(num), difficulty: 0.45 };
	} else {
		// improper → mixed: whole part
		const num = whole * d + n;
		return { atomId: 'arithmetik__gemischte_zahlen_unechte_brueche', prompt: `${fmtFrac(num, d)} als gemischte Zahl — ganzer Anteil?`, answerType: 'integer', correctAnswer: String(Math.floor(num / d)), difficulty: 0.45 };
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
	const [w1, n1, d] = [rand(1, 4), rand(1, 3), pick([4, 6, 8])];
	const [w2, n2] = [rand(1, 3), rand(1, 3)];
	const op = rand(0, 1);
	if (op === 0) {
		const totalN = n1 + n2, totalW = w1 + w2 + Math.floor(totalN / d);
		const remN = totalN % d;
		const ans = remN === 0 ? String(totalW) : `${totalW} ${frac(remN, d)}`;
		return { atomId: 'arithmetik__gemischte_zahlen_add_sub', prompt: `${fmtMixed(w1, n1, d)} + ${fmtMixed(w2, n2, d)} — ganzer Anteil des Ergebnisses?`, answerType: 'integer', correctAnswer: String(totalW), difficulty: 0.55 };
	}
	const [bw, bn, sw, sn] = w1 + n1 / d >= w2 + n2 / d ? [w1, n1, w2, n2] : [w2, n2, w1, n1];
	const totalN = bw * d + bn - sw * d - sn;
	return { atomId: 'arithmetik__gemischte_zahlen_add_sub', prompt: `${fmtMixed(bw, bn, d)} − ${fmtMixed(sw, sn, d)} = ?`, answerType: 'fraction', correctAnswer: frac(totalN, d), difficulty: 0.55 };
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
	return { atomId: 'arithmetik__dezimalzahlen_vergleichen_ordnen_runden', prompt: `Welche Zahl ist größer: ${dec(a)} oder ${dec(b)}? (Gib die größere Zahl an)`, answerType: 'number', correctAnswer: dec(bigger), difficulty: 0.35 };
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
	const a = rand(1, 9) / 10, b = rand(1, 9) / 10;
	return { atomId: 'arithmetik__dezimal_mal_dezimal', prompt: `${dec(a)} · ${dec(b)} = ?`, answerType: 'number', correctAnswer: dec(a * b), hint: `Rechne ${a * 10} · ${b * 10} = ${a * 10 * (b * 10)}, dann : 100`, difficulty: 0.55 };
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
	const easy: Array<[number, number, number]> = [[0.5,1,2],[0.25,1,4],[0.75,3,4],[0.2,1,5],[0.4,2,5],[0.1,1,10],[0.3,3,10],[0.125,1,8],[0.6,3,5],[0.8,4,5]];
	const [val, n, d] = pick(easy);
	return { atomId: 'arithmetik__dezimalzahl_zu_bruch', prompt: `${dec(val)} als vollständig gekürzten Bruch — Nenner?`, answerType: 'integer', correctAnswer: String(d), hint: `${dec(val)} = ${fmtFrac(n, d)}`, difficulty: 0.45 };
});

reg('arithmetik__periodische_dezimalzahlen', () => {
	const finiteList: Array<[number,number]> = [[1,2],[1,4],[3,4],[1,5],[1,8],[3,8],[1,10],[3,10],[7,8]];
	const periodicList: Array<[number,number]> = [[1,3],[2,3],[1,6],[5,6],[1,7],[1,9],[2,9],[4,9]];
	const q = rand(0, 1);
	if (q === 0) {
		const [n, d] = pick(finiteList);
		return { atomId: 'arithmetik__periodische_dezimalzahlen', prompt: `Ist ${fmtFrac(n, d)} eine endliche oder periodische Dezimalzahl?`, answerType: 'text', choices: ['endlich', 'periodisch'], correctAnswer: 'endlich', hint: 'Endlich: Nenner (vollständig gekürzt) hat nur Faktoren 2 und 5.', difficulty: 0.5 };
	}
	const [n, d] = pick(periodicList);
	return { atomId: 'arithmetik__periodische_dezimalzahlen', prompt: `Ist ${fmtFrac(n, d)} eine endliche oder periodische Dezimalzahl?`, answerType: 'text', choices: ['endlich', 'periodisch'], correctAnswer: 'periodisch', hint: `${d} enthält Primfaktoren außer 2 und 5.`, difficulty: 0.5 };
});

// ── 12. Rationale Zahlen ──────────────────────────────────────────────────────

reg('arithmetik__negative_zahlen_zahlengerade', () => {
	const a = -rand(1, 10), b = -rand(1, 10);
	if (a === b) return registry.get('arithmetik__negative_zahlen_zahlengerade')!();
	const bigger = Math.max(a, b);
	const lo = Math.min(a, b) - 1;
	const hi = 1;
	return {
		atomId: 'arithmetik__negative_zahlen_zahlengerade',
		prompt: `Welche Zahl liegt weiter rechts auf dem Zahlenstrahl: ${a} oder ${b}?`,
		answerType: 'integer', correctAnswer: String(bigger),
		svg: svgIntegerLine(lo, hi, [a, b]),
		hint: 'Weiter rechts = größer.', difficulty: 0.4
	};
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
	const a = rand(-5, 5), b = rand(1, 4), c = rand(-5, 5);
	return { atomId: 'arithmetik__verbindung_rechenarten_rationale', prompt: `${a} + ${b} · ${c} = ?`, answerType: 'integer', correctAnswer: String(a + b * c), hint: 'Zuerst multiplizieren (Punkt vor Strich), dann addieren.', difficulty: 0.55 };
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
	const p = pick([5, 10, 15, 20, 25]);
	const G = pick([40, 50, 80, 100, 120, 200]);
	const type = rand(0, 1);
	if (type === 0) {
		const result = G + G * p / 100;
		return { atomId: 'arithmetik__vermehrter_verminderter_grundwert', prompt: `${G} € wird um ${p}% erhöht. Neuer Betrag = ?`, answerType: 'number', correctAnswer: dec(result), hint: `${G} + ${p}% von ${G}`, difficulty: 0.55 };
	}
	const result = G - G * p / 100;
	return { atomId: 'arithmetik__vermehrter_verminderter_grundwert', prompt: `${G} € wird um ${p}% reduziert. Neuer Betrag = ?`, answerType: 'number', correctAnswer: dec(result), hint: `${G} − ${p}% von ${G}`, difficulty: 0.55 };
});

reg('arithmetik__zinsrechnung', () => {
	const K = pick([100, 200, 500, 1000, 2000]);
	const p = pick([1, 2, 3, 4, 5]);
	const t = pick([1, 2, 3]);
	const Z = round(K * p * t / 100, 2);
	const q = rand(0, 1);
	if (q === 0) return { atomId: 'arithmetik__zinsrechnung', prompt: `Kapital ${K} €, Zinssatz ${p}%, Laufzeit ${t} Jahr(e) — Zinsen = ?`, answerType: 'number', correctAnswer: dec(Z), hint: `Z = K · p · t : 100`, difficulty: 0.6 };
	const endKapital = round(K + Z, 2);
	return { atomId: 'arithmetik__zinsrechnung', prompt: `Kapital ${K} €, ${p}% p.a., ${t} Jahr(e) — Endkapital = ?`, answerType: 'number', correctAnswer: dec(endKapital), hint: 'Endkapital = Kapital + Zinsen', difficulty: 0.6 };
});

// ── 14. Potenzen ──────────────────────────────────────────────────────────────

reg('arithmetik__potenzieren_natuerliche_zahlen', () => {
	let base: number, exp: number;
	do { base = rand(2, 9); exp = rand(2, 4); } while (base ** exp > 100);
	return { atomId: 'arithmetik__potenzieren_natuerliche_zahlen', prompt: `${pow(base, exp)} = ?`, answerType: 'integer', correctAnswer: String(base ** exp), hint: `${base} · ${base}${exp > 2 ? ` · ${base}`.repeat(exp - 2) : ''} = ?`, difficulty: 0.45 };
});

reg('arithmetik__zehnerpotenzen_normdarstellung', () => {
	const type = rand(0, 1);
	if (type === 0) {
		const exp = rand(2, 6);
		const n = rand(1, 9) + rand(1, 9) / 10;
		const value = n * 10 ** exp;
		return { atomId: 'arithmetik__zehnerpotenzen_normdarstellung', prompt: `${dec(n)} · ${pow(10, exp)} = ?`, answerType: 'integer', correctAnswer: String(value), hint: 'Komma um den Exponenten nach rechts verschieben.', difficulty: 0.55 };
	}
	const exp = rand(2, 5);
	const value = rand(1, 9) * 10 ** exp;
	const mant = value / 10 ** exp;
	return { atomId: 'arithmetik__zehnerpotenzen_normdarstellung', prompt: `${value} in Normdarstellung: ___ · ${pow(10, exp)}  — was ist die Mantisse?`, answerType: 'number', correctAnswer: dec(mant), hint: `Mantisse ist die Zahl vor · ${pow(10, 'n')}.`, difficulty: 0.55 };
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

export function generateTask(atomId: string): GeneratedTask | null {
	const gen = registry.get(atomId);
	if (!gen) return null;
	return gen();
}

export function hasGenerator(atomId: string): boolean {
	return registry.has(atomId);
}

export const registeredAtomIds: string[] = [...registry.keys()];
