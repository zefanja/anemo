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
	difficulty?: number; // 0–1
}

// stage: current difficulty stage within this atom's expanding sequence (0 = easiest).
// Generators that haven't been migrated to explicit stages yet simply ignore it.
type Gen = (stage?: number) => GeneratedTask;

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

function svgLabel(p: Pt, str: string, opts: { size?: number; color?: string; bold?: boolean } = {}): string {
	const { size = 13, color = '#374151', bold = true } = opts;
	return `<text x="${p[0].toFixed(1)}" y="${p[1].toFixed(1)}" text-anchor="middle" font-size="${size}" `
		+ `${bold ? 'font-weight="bold"' : ''} fill="${color}" font-family="system-ui,-apple-system,sans-serif">${str}</text>`;
}

function svgPoly(points: Pt[], opts: { fill?: string; stroke?: string; width?: number; dash?: boolean } = {}): string {
	const { fill = '#eef2ff', stroke = '#4f46e5', width = 2, dash = false } = opts;
	const pts = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
	return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" `
		+ `stroke-linejoin="round"${dash ? ' stroke-dasharray="4,3"' : ''}/>`;
}

// Right-angle marker at point P, using two reference points that indicate the two edge directions.
function rightAngleMarker(P: Pt, ref1: Pt, ref2: Pt, size = 10): string {
	const d1 = vScale(vUnit(vSub(ref1, P)), size);
	const d2 = vScale(vUnit(vSub(ref2, P)), size);
	const p1 = vAdd(P, d1), p2 = vAdd(P, d2), p3 = vAdd(p1, d2);
	const pts = [p1, p3, p2].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
	return `<polyline points="${pts}" fill="none" stroke="#374151" stroke-width="1.5"/>`;
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
	const lx = P[0] + (radius + 14) * Math.cos(mid), ly = P[1] + (radius + 14) * Math.sin(mid);
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
		extraPoints?: { at: Pt; label: string }[];
		rightAngleFeet?: { at: Pt; ref1: Pt; ref2: Pt }[];
		fill?: string;
	} = {}
): string {
	const W = 300, H = 230, pad = 40;
	const all: Pt[] = [...points, ...(opts.extraSegments?.flatMap(s => [s.from, s.to]) ?? [])];
	const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
	const minX = Math.min(...xs), maxX = Math.max(...xs);
	const minY = Math.min(...ys), maxY = Math.max(...ys);
	const spanX = Math.max(maxX - minX, 0.01), spanY = Math.max(maxY - minY, 0.01);
	const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
	const ccx = (minX + maxX) / 2, ccy = (minY + maxY) / 2;
	const tx = (p: Pt): Pt => [W / 2 + (p[0] - ccx) * scale, H / 2 - (p[1] - ccy) * scale];

	const tp = points.map(tx);
	const centroid: Pt = [tp.reduce((s, p) => s + p[0], 0) / tp.length, tp.reduce((s, p) => s + p[1], 0) / tp.length];

	let s = svgOpen(W, H);
	for (const seg of opts.extraSegments ?? []) {
		s += svgLineSeg(tx(seg.from), tx(seg.to), { color: seg.color ?? '#9ca3af', width: 1.5, dash: seg.dash });
	}
	s += svgPoly(tp, { fill: opts.fill });

	for (const v of opts.rightAngleVertices ?? []) {
		const prev = tp[(v - 1 + tp.length) % tp.length], next = tp[(v + 1) % tp.length];
		s += rightAngleMarker(tp[v], prev, next);
	}
	for (const f of opts.rightAngleFeet ?? []) {
		s += rightAngleMarker(tx(f.at), tx(f.ref1), tx(f.ref2), 9);
	}

	for (const el of opts.edgeLabels ?? []) {
		const P = tp[el.from], Q = tp[el.to];
		const mid: Pt = [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2];
		let dir = vUnit(vSub(mid, centroid));
		if (Math.hypot(dir[0], dir[1]) < 0.01) dir = [0, -1];
		const lp: Pt = [mid[0] + dir[0] * 14, mid[1] + dir[1] * 14 + 4];
		s += svgLabel(lp, el.text);
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
		s += svgLabel([p[0], p[1] - 9], ep.label, { size: 11, color: '#6b7280', bold: false });
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
		? [{ at: [(opts.heightFrom[0] + opts.heightTo[0]) / 2, (opts.heightFrom[1] + opts.heightTo[1]) / 2] as Pt, label: opts.heightLabel }]
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
		difficulty: step === 1 ? 0.1 : step === 2 ? 0.2 : 0.3
	};
});

reg('arithmetik__zahlverstaendnis_bis_20', (stage = 0) => {
	// Expanding sequence: Nachfolger (0.1) → Zahlenvergleich (0.15) → Zerlegung (0.2).
	const type = Math.min(stage, 2);
	if (type === 0) {
		const n = rand(2, 19);
		return { atomId: 'arithmetik__zahlverstaendnis_bis_20', prompt: `Welche Zahl kommt nach ${n}?`, answerType: 'integer', correctAnswer: String(n + 1), difficulty: 0.1 };
	} else if (type === 1) {
		const a = rand(1, 20), b = rand(1, 20);
		const bigger = Math.max(a, b);
		return { atomId: 'arithmetik__zahlverstaendnis_bis_20', prompt: `Welche Zahl ist größer: ${a} oder ${b}?`, answerType: 'integer', correctAnswer: String(bigger), choices: [String(a), String(b)], difficulty: 0.15 };
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

reg('arithmetik__runden_natuerliche_zahlen', (stage = 0) => {
	// Expanding sequence: round to tens, then hundreds, then thousands.
	const steps = [10, 100, 1000];
	const to = steps[Math.min(stage, steps.length - 1)];
	const n = rand(1, 9) * to + rand(1, to - 1);
	const rounded = Math.round(n / to) * to;
	return { atomId: 'arithmetik__runden_natuerliche_zahlen', prompt: `Runde ${n} auf ${to}er: ___`, answerType: 'integer', correctAnswer: String(rounded), hint: `Ab der Mitte (${to / 2}) wird aufgerundet.`, difficulty: 0.3 };
});

reg('arithmetik__roemische_zahlen', (stage = 0) => {
	const map: [number, string][] = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
	const n = rand(1, 399);
	let num = n, roman = '';
	for (const [val, sym] of map) { while (num >= val) { roman += sym; num -= val; } }
	const hint = 'M=1000, D=500, C=100, L=50, X=10, V=5, I=1. Subtraktionsregel: IV=4, IX=9, XL=40, XC=90, CD=400.';
	// Expanding sequence: römisch → arabisch (lesen) zuerst, arabisch → römisch (schreiben) danach.
	const q = Math.min(stage, 1);
	if (q === 0) return { atomId: 'arithmetik__roemische_zahlen', prompt: `${roman} als arabische Zahl?`, answerType: 'integer', correctAnswer: String(n), hint, difficulty: 0.35 };
	return { atomId: 'arithmetik__roemische_zahlen', prompt: `${n} als römische Zahl?`, answerType: 'text', correctAnswer: roman, hint, difficulty: 0.4 };
});

reg('arithmetik__ueberschlagsrechnung', (stage = 0) => {
	const atomId = 'arithmetik__ueberschlagsrechnung';
	// Expanding sequence: Addition → Subtraktion → Multiplikation schätzen.
	const op = ['+', '−', '·'][Math.min(stage, 2)];
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

reg('arithmetik__zehnerueberschreitung_bis_20', (stage = 0) => {
	const atomId = 'arithmetik__zehnerueberschreitung_bis_20';
	// Expanding sequence: Addition über den Zehner → Subtraktion über den Zehner.
	const op = Math.min(stage, 1);
	if (op === 0) {
		const a = rand(7, 9), b = rand(10 - a + 1, 9);
		return { atomId, prompt: `${a} + ${b} = ?`, answerType: 'integer', correctAnswer: String(a + b), hint: `Nutze den Zehner: ${a} + ${10 - a} = 10, dann noch ${b - (10 - a)}.`, difficulty: 0.25 };
	}
	// Subtraction crossing ten: minuend ∈ [11,18], result ∈ [1,9]
	const minuend = rand(11, 18);
	const result = rand(1, 9);
	if (result >= minuend) return registry.get(atomId)!(stage);
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

reg('arithmetik__rechengesetze_rechenvorteile', (stage = 0) => {
	const atomId = 'arithmetik__rechengesetze_rechenvorteile';
	// Expanding sequence: Kommutativgesetz → Assoziativgesetz → Rechenvorteil → Distributivgesetz.
	const type = Math.min(stage, 3);
	if (type === 0) {
		const a = rand(1, 9), b = rand(1, 9);
		return { atomId, prompt: `${a} + ${b} = ${b} + ___  (Kommutativgesetz)`, answerType: 'integer', correctAnswer: String(a), difficulty: 0.2 };
	} else if (type === 1) {
		const a = rand(2, 9), b = rand(2, 9), c = rand(2, 9);
		return { atomId, prompt: `(${a} · ${b}) · ${c} = ${a} · (${b} · ___)`, answerType: 'integer', correctAnswer: String(c), hint: 'Assoziativgesetz: Reihenfolge der Klammern ist egal.', difficulty: 0.25 };
	} else if (type === 2) {
		const a = rand(10, 50), b = rand(1, 9) * 10;
		return { atomId, prompt: `${a} + ${b} + ${100 - b} = ?  (suche den Rechenweg)`, answerType: 'integer', correctAnswer: String(a + 100), difficulty: 0.35 };
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

reg('arithmetik__einmaleins_kernaufgaben', (stage = 0) => {
	const atomId = 'arithmetik__einmaleins_kernaufgaben';
	// Expanding sequence: 1er/2er/5er/10er-Reihe → Quadratzahlen.
	if (Math.min(stage, 1) === 0) {
		const rows = [1, 2, 5, 10];
		const a = pick(rows), b = rand(1, 10);
		return { atomId, prompt: `${a} · ${b} = ?`, answerType: 'integer', correctAnswer: String(a * b), difficulty: 0.2 };
	}
	const n = rand(3, 10);
	return { atomId, prompt: `${n} · ${n} = ?`, answerType: 'integer', correctAnswer: String(n * n), hint: `${n}² = ${n} · ${n}`, difficulty: 0.3 };
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
	return { atomId, prompt: `Wenn ${base} · ${b} = ${base * b}, was ist dann ${derived} · ${b}?`, answerType: 'integer', correctAnswer: String(derived * b), hint: `${base} · ${b} = ${base * b} → ${hintFn(b)}.`, difficulty: 0.3 };
});

reg('arithmetik__einmaleins_automatisierung', () => {
	const a = rand(2, 9), b = rand(2, 9);
	return { atomId: 'arithmetik__einmaleins_automatisierung', prompt: `${a} · ${b} = ?`, answerType: 'integer', correctAnswer: String(a * b), difficulty: 0.35 };
});

reg('arithmetik__division_grundverstaendnis', (stage = 0) => {
	const atomId = 'arithmetik__division_grundverstaendnis';
	const b = rand(2, 9), q = rand(2, 10);
	const a = b * q;
	// Expanding sequence: reine Division → Aufteilen (Sachkontext) → Verteilen (Quotitiv, Sachkontext).
	const type = Math.min(stage, 2);
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

reg('arithmetik__vorrangregeln', (stage = 0) => {
	// Expanding sequence: core rule (Punkt vor Strich) → override rule (Klammer) → subtraction variant.
	const type = Math.min(stage, 2);
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

reg('arithmetik__muster_zahlenfolgen_grundschule', (stage = 0) => {
	const atomId = 'arithmetik__muster_zahlenfolgen_grundschule';
	// Expanding sequence: wachsende Folge (Lücke) → fallende Folge → Verdopplungsfolge → Zahlenmauer.
	const type = Math.min(stage, 3);
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

reg('arithmetik__teiler_vielfache', (stage = 0) => {
	const atomId = 'arithmetik__teiler_vielfache';
	const n = pick([6, 8, 10, 12, 15, 18, 20, 24, 30, 36]);
	const divisors = Array.from({ length: n }, (_, i) => i + 1).filter(d => n % d === 0);
	// Expanding sequence: Teiler erkennen (ja/nein) → Vielfaches nennen → alle Teiler zählen.
	const type = Math.min(stage, 3);
	if (type === 0) {
		const d = pick(divisors.slice(1, -1));
		return { atomId, prompt: `Ist ${d} ein Teiler von ${n}?`, answerType: 'boolean', correctAnswer: 'ja', difficulty: 0.3 };
	} else if (type === 1) {
		const notDiv = pick(Array.from({ length: n - 1 }, (_, i) => i + 2).filter(d => n % d !== 0));
		return { atomId, prompt: `Ist ${notDiv} ein Teiler von ${n}?`, answerType: 'boolean', correctAnswer: 'nein', difficulty: 0.3 };
	} else if (type === 2) {
		// Name a multiple of n
		const k = rand(2, 10);
		return { atomId, prompt: `Nenne das ${k}. Vielfache von ${n}.`, answerType: 'integer', correctAnswer: String(n * k), hint: `${k} · ${n} = ?`, difficulty: 0.35 };
	} else {
		// How many divisors does n have?
		return { atomId, prompt: `Wie viele Teiler hat ${n}?`, answerType: 'integer', correctAnswer: String(divisors.length), hint: `Schreibe alle Teiler auf: ${divisors.join(', ')}`, difficulty: 0.4 };
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

reg('arithmetik__primzahlen_primfaktorzerlegung', (stage = 0) => {
	const atomId = 'arithmetik__primzahlen_primfaktorzerlegung';
	const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
	const composites = [4, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21, 22, 24, 25, 26, 27, 28];
	// Expanding sequence: Primzahl erkennen → kleinsten Primfaktor finden →
	// Exponent einer einzelnen Primzahlpotenz → Exponent in gemischter Zerlegung.
	const q = Math.min(stage, 3);
	if (q === 0) {
		const n = pick([...primes, ...composites.slice(0, 6)]);
		return { atomId, prompt: `Ist ${n} eine Primzahl?`, answerType: 'boolean', correctAnswer: primes.includes(n) ? 'ja' : 'nein', difficulty: 0.4 };
	} else if (q === 1) {
		const p1 = pick([2, 3, 5, 7]), p2 = pick([2, 3, 5, 7]);
		return { atomId, prompt: `Was ist der kleinste Primfaktor von ${p1 * p2}?`, answerType: 'integer', correctAnswer: String(Math.min(p1, p2)), difficulty: 0.45 };
	} else if (q === 2) {
		// Count prime factors (with multiplicity)
		const p = pick([2, 3, 5]);
		const e = rand(2, 4);
		const n = p ** e;
		return { atomId, prompt: `${n} = ${pow(p, '?')} — welcher Exponent?`, answerType: 'integer', correctAnswer: String(e), hint: `Wie oft ist ${p} als Primfaktor enthalten?`, difficulty: 0.45 };
	} else {
		// Full prime factorisation: ask for exponent of a specific prime
		const p1 = pick([2, 3]), p2 = pick([2, 3, 5, 7].filter(x => x !== p1));
		const e1 = rand(1, 3), e2 = rand(1, 2);
		const n = p1 ** e1 * p2 ** e2;
		return { atomId, prompt: `${n} = ${pow(p1, '?')} · ${pow(p2, e2)} — welcher Exponent gehört zu ${p1}?`, answerType: 'integer', correctAnswer: String(e1), hint: `Zerlege ${n} in Primfaktoren: durch ${p1} teilen.`, difficulty: 0.5 };
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
		return { atomId, prompt: `${fmtFrac(n1, d)} ☐ ${fmtFrac(n2, d)}`, answerType: 'comparison', correctAnswer: n1 > n2 ? '>' : '<', hint: `Gleicher Nenner: größerer Zähler = größerer Bruch.`, difficulty: 0.3 };
	}

	if (strategy === 'gleicher_zaehler') {
		const n = rand(1, 5);
		const d1 = rand(n + 1, 12), d2 = rand(n + 1, 12);
		if (d1 === d2) return registry.get(atomId)!(stage);
		return { atomId, prompt: `${fmtFrac(n, d1)} ☐ ${fmtFrac(n, d2)}`, answerType: 'comparison', correctAnswer: d1 < d2 ? '>' : '<', hint: `Gleicher Zähler: kleinerer Nenner = größerer Bruch.`, difficulty: 0.45 };
	}

	if (strategy === 'vergleich_halb') {
		const d1 = pick([4, 5, 6, 8, 10]);
		const d2 = pick([3, 4, 6, 8, 10]);
		const n1 = rand(Math.ceil(d1 / 2) + 1, d1 - 1); // > 1/2
		const n2 = rand(1, Math.floor((d2 - 1) / 2));   // < 1/2
		if (n2 < 1 || n1 >= d1) return registry.get(atomId)!(stage);
		return { atomId, prompt: `${fmtFrac(n1, d1)} ☐ ${fmtFrac(n2, d2)}`, answerType: 'comparison', correctAnswer: '>', hint: `Tipp: Vergleiche mit ½. Ein Bruch ist größer als ½, der andere kleiner.`, difficulty: 0.5 };
	}

	// verschiedene_nenner: gleichnamig machen
	const pairs: [number, number][] = [[2,3],[2,5],[3,4],[3,5],[4,5],[2,7],[3,8],[4,6]];
	const [d1, d2] = pick(pairs);
	const n1 = rand(1, d1 - 1), n2 = rand(1, d2 - 1);
	const cmp = n1 * d2 - n2 * d1;
	if (cmp === 0) return registry.get(atomId)!(stage);
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

reg('arithmetik__gemischte_zahlen_add_sub', (stage = 0) => {
	const atomId = 'arithmetik__gemischte_zahlen_add_sub';
	const [w1, n1, d] = [rand(1, 4), rand(1, 3), pick([4, 6, 8])];
	const [w2, n2] = [rand(1, 3), rand(1, 3)];
	// Expanding sequence: Addition (ganzer Anteil) → Addition (Bruchanteil) → Subtraktion.
	const step = Math.min(stage, 2);
	if (step <= 1) {
		const totalN = n1 + n2, totalW = w1 + w2 + Math.floor(totalN / d);
		const remN = totalN % d;
		if (remN === 0) {
			return { atomId, prompt: `${fmtMixed(w1, n1, d)} + ${fmtMixed(w2, n2, d)} = ?`, answerType: 'integer', correctAnswer: String(totalW), difficulty: 0.5 };
		}
		if (step === 0) {
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

reg('arithmetik__dezimalzahlen_vergleichen_ordnen_runden', (stage = 0) => {
	// Expanding sequence: vergleichen → auf ganze Zahlen runden → auf eine Nachkommastelle runden.
	const type = Math.min(stage, 2);
	if (type === 0) {
		const a = parseFloat((Math.random() * 9 + 1).toFixed(2));
		const b = parseFloat((Math.random() * 9 + 1).toFixed(2));
		const bigger = Math.max(a, b);
		return { atomId: 'arithmetik__dezimalzahlen_vergleichen_ordnen_runden', prompt: `Welche Zahl ist größer: ${dec(a)} oder ${dec(b)}?`, answerType: 'text', correctAnswer: dec(bigger), choices: [dec(a), dec(b)], difficulty: 0.35 };
	}
	if (type === 1) {
		// First decimal must be 1–9 so the task is non-trivial
		const n = rand(10, 99) + rand(1, 9) / 10;
		return { atomId: 'arithmetik__dezimalzahlen_vergleichen_ordnen_runden', prompt: `Runde ${dec(n)} auf ganze Zahlen: ___`, answerType: 'integer', correctAnswer: String(Math.round(n)), difficulty: 0.35 };
	}
	// Second decimal must be 1–9 so the task is non-trivial
	const n = rand(10, 99) + rand(0, 9) / 10 + rand(1, 9) / 100;
	return { atomId: 'arithmetik__dezimalzahlen_vergleichen_ordnen_runden', prompt: `Runde ${dec(n)} auf eine Nachkommastelle: ___`, answerType: 'number', correctAnswer: dec(Math.round(n * 10) / 10), difficulty: 0.4 };
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

reg('arithmetik__dezimal_mal_dezimal', (stage = 0) => {
	const atomId = 'arithmetik__dezimal_mal_dezimal';
	// Expanding sequence: eine Nachkommastelle je Faktor → zwei/eine Nachkommastelle gemischt.
	if (Math.min(stage, 1) === 0) {
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

reg('arithmetik__dezimalzahl_zu_bruch', (stage = 0) => {
	const atomId = 'arithmetik__dezimalzahl_zu_bruch';
	const easy: Array<[number, number, number]> = [[0.5,1,2],[0.25,1,4],[0.75,3,4],[0.2,1,5],[0.4,2,5],[0.1,1,10],[0.3,3,10],[0.125,1,8],[0.6,3,5],[0.8,4,5]];
	const [val, n, d] = pick(easy);
	// Expanding sequence: nur Nenner bestimmen (Zähler bekannt) → vollständigen Bruch angeben.
	if (Math.min(stage, 1) === 0) {
		return { atomId, prompt: `${dec(val)} als vollständig gekürzten Bruch:`, answerType: 'integer' as const, correctAnswer: String(d), hint: `${dec(val)} = ${fmtFrac(n, d)}`, difficulty: 0.4,
			inputData: { type: 'fraction_part', missing: 'denominator', knownNum: n } };
	}
	return { atomId, prompt: `${dec(val)} als vollständig gekürzten Bruch?`, answerType: 'fraction', correctAnswer: frac(n, d), hint: 'Schreibe als Bruch mit Nenner 10 oder 100, dann kürzen.', difficulty: 0.5 };
});

reg('arithmetik__periodische_dezimalzahlen', (stage = 0) => {
	const atomId = 'arithmetik__periodische_dezimalzahlen';
	const finiteList: Array<[number,number]> = [[1,2],[1,4],[3,4],[1,5],[1,8],[3,8],[1,10],[3,10],[7,8]];
	const periodicList: Array<[number,number,string]> = [[1,3,'3'],[2,3,'6'],[1,6,'6'],[5,6,'3'],[1,9,'1'],[2,9,'2'],[4,9,'4']];
	// Expanding sequence: endlich erkennen → periodisch erkennen → Periodenziffer bestimmen.
	const type = Math.min(stage, 2);
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

reg('arithmetik__negative_zahlen_zahlengerade', (stage = 0) => {
	const atomId = 'arithmetik__negative_zahlen_zahlengerade';
	// Expanding sequence: positiv vs. negativ (intuitiv) → Alltagskontext (Temperatur) → beide negativ.
	const type = Math.min(stage, 2);
	if (type === 0) {
		// Positive vs negative
		const pos = rand(1, 8), neg = -rand(1, 8);
		return { atomId, prompt: `Welche Zahl liegt weiter rechts auf dem Zahlenstrahl: ${neg} oder ${pos}?`, answerType: 'integer', correctAnswer: String(pos), choices: [String(neg), String(pos)], svg: svgIntegerLine(neg - 1, pos + 1, [neg, pos]), hint: 'Positive Zahlen liegen rechts von Null, negative links.', difficulty: 0.3 };
	} else if (type === 1) {
		// Everyday context: temperature
		const t1 = rand(-15, 20), t2 = rand(-15, 20);
		if (t1 === t2) return registry.get(atomId)!(stage);
		const warmer = Math.max(t1, t2);
		return { atomId, prompt: `Welche Temperatur ist wärmer: ${t1} °C oder ${t2} °C?`, answerType: 'integer', correctAnswer: String(warmer), choices: [`${t1} °C`, `${t2} °C`], hint: 'Höhere Temperatur = größere Zahl auf dem Thermometer.', difficulty: 0.35 };
	} else {
		// Both negative
		const a = -rand(1, 10), b = -rand(1, 10);
		if (a === b) return registry.get(atomId)!(stage);
		const bigger = Math.max(a, b);
		return { atomId, prompt: `Welche Zahl liegt weiter rechts auf dem Zahlenstrahl: ${a} oder ${b}?`, answerType: 'integer', correctAnswer: String(bigger), choices: [String(a), String(b)], svg: svgIntegerLine(Math.min(a, b) - 1, 1, [a, b]), hint: 'Weiter rechts = größer.', difficulty: 0.4 };
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

reg('arithmetik__verbindung_rechenarten_rationale', (stage = 0) => {
	const atomId = 'arithmetik__verbindung_rechenarten_rationale';
	// Expanding sequence: Punkt-vor-Strich → Klammer → zwei Produkte verbinden.
	const type = Math.min(stage, 2);
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

reg('arithmetik__vermehrter_verminderter_grundwert', (stage = 0) => {
	const atomId = 'arithmetik__vermehrter_verminderter_grundwert';
	const p = pick([5, 10, 15, 20, 25]);
	const G = pick([40, 50, 80, 100, 120, 200]);
	// Expanding sequence: Erhöhung berechnen → Senkung berechnen → Grundwert aus Erhöhung → Grundwert aus Senkung.
	const type = Math.min(stage, 3);
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

reg('arithmetik__zinsrechnung', (stage = 0) => {
	const atomId = 'arithmetik__zinsrechnung';
	const K = pick([100, 200, 500, 1000]);
	const p = pick([1, 2, 3, 4, 5]);
	const t = pick([1, 2, 3]);
	// Expanding sequence: Zinsen berechnen → Endkapital (einfache Verzinsung) → Endkapital (Zinseszins).
	const type = Math.min(stage, 2);
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

reg('arithmetik__potenzieren_natuerliche_zahlen', (stage = 0) => {
	const atomId = 'arithmetik__potenzieren_natuerliche_zahlen';
	// Expanding sequence: Zehnerpotenzen (konzeptuell) → Quadratzahlen → Kubikzahlen/4. Potenzen.
	const type = Math.min(stage, 2);
	if (type === 0) {
		// Powers of 10 (conceptual)
		const exp = rand(2, 6);
		return { atomId, prompt: `${pow(10, exp)} = ?`, answerType: 'integer', correctAnswer: String(10 ** exp), hint: `${pow(10, 'n')} = 1 gefolgt von n Nullen`, difficulty: 0.3 };
	} else if (type === 1) {
		// Squares 2² to 20²
		const base = rand(2, 20);
		return { atomId, prompt: `${pow(base, 2)} = ?`, answerType: 'integer', correctAnswer: String(base * base), hint: `${base} · ${base}`, difficulty: base <= 9 ? 0.35 : 0.5 };
	} else {
		// Cubes and 4th powers (small bases only, result ≤ 100)
		let base: number, exp: number;
		do { base = rand(2, 5); exp = rand(3, 4); } while (base ** exp > 125);
		return { atomId, prompt: `${pow(base, exp)} = ?`, answerType: 'integer', correctAnswer: String(base ** exp), hint: `${base} · ${base} · ${base}${exp > 3 ? ` · ${base}` : ''} = ?`, difficulty: 0.5 };
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

reg('arithmetik__verhaeltnisse', (stage = 0) => {
	const g = rand(2, 5), a = rand(1, 5), b = rand(1, 5);
	if (a === b) return registry.get('arithmetik__verhaeltnisse')!(stage);
	// Expanding sequence: Verhältnis kürzen → Ganzes im Verhältnis aufteilen.
	const type = Math.min(stage, 1);
	if (type === 0) return { atomId: 'arithmetik__verhaeltnisse', prompt: `Kürze das Verhältnis ${a * g} : ${b * g} — erster Teil?`, answerType: 'integer', correctAnswer: String(a), hint: `Teile durch ggT = ${g}`, difficulty: 0.45 };
	const total = (a + b) * g * rand(1, 3);
	const share = (a * total) / (a + b);
	if (!Number.isInteger(share)) return registry.get('arithmetik__verhaeltnisse')!(stage);
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

reg('algebra__termwert_berechnen', (stage = 0) => {
	const x = rand(-4, 6);
	// Expanding sequence: ax−b → ax+b → ax² → ax²+bx.
	const type = Math.min(stage, 3);
	if (type === 0) {
		const a = rand(2, 6), b = rand(1, 5);
		const val = a * x - b;
		return { atomId: 'algebra__termwert_berechnen', prompt: `Berechne \\(${a}x − ${b}\\) für \\(x = ${x}\\).`, answerType: 'integer', correctAnswer: String(val), hint: `Einsetzen: ${a}·(${x}) − ${b} = ${val}`, difficulty: 0.35 };
	} else if (type === 1) {
		const a = rand(2, 5), b = rand(-5, 5);
		const val = a * x + b;
		return { atomId: 'algebra__termwert_berechnen', prompt: `Berechne \\(${a}x ${b >= 0 ? '+' : ''}${b}\\) für \\(x = ${x}\\).`, answerType: 'integer', correctAnswer: String(val), hint: `Einsetzen: ${a}·(${x}) + (${b}) = ${val}`, difficulty: 0.4 };
	} else if (type === 2) {
		const a = rand(1, 3);
		const val = a * x * x;
		return { atomId: 'algebra__termwert_berechnen', prompt: `Berechne \\(${a > 1 ? a : ''}x^2\\) für \\(x = ${x}\\).`, answerType: 'integer', correctAnswer: String(val), hint: `Einsetzen: ${a}·(${x})² = ${a}·${x * x} = ${val}`, difficulty: 0.45 };
	} else {
		const a = rand(1, 3), b = rand(1, 4);
		const val = a * x * x + b * x;
		return { atomId: 'algebra__termwert_berechnen', prompt: `Berechne \\(${a > 1 ? a : ''}x^2 ${b >= 0 ? '+' : ''}${b}x\\) für \\(x = ${x}\\).`, answerType: 'integer', correctAnswer: String(val), hint: `Einsetzen: ${a}·${x * x} + ${b}·${x} = ${val}`, difficulty: 0.5 };
	}
});

reg('algebra__terme_zusammenfassen', (stage = 0) => {
	// Expanding sequence: add same-variable terms → subtract same-variable terms → mixed two-variable term.
	const type = Math.min(stage, 2);
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

reg('algebra__ausmultiplizieren_distributiv', (stage = 0) => {
	// Expanding sequence: a(x+b) → a(x−b) → (x+p)(x+q).
	const type = Math.min(stage, 2);
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

reg('algebra__ausklammern_faktorisieren', (stage = 0) => {
	// Expanding sequence: gemeinsamen Faktor erkennen → vollständig ausklammern.
	const type = Math.min(stage, 1);
	if (type === 0) {
		// a must be odd so that gcd(k*a, k*2) = k (not a larger multiple of k)
		const k = rand(2, 5), a = rand(0, 1) * 2 + 3; // 3 or 5
		const coeff1 = k * a, coeff2 = k * 2;
		const wrongChoices = Array.from(new Set([coeff1, coeff2, k + 1].map(String).filter(c => c !== String(k)))).slice(0, 3);
		return { atomId: 'algebra__ausklammern_faktorisieren', prompt: `Welcher Faktor kann ausgeklammert werden? \\(${coeff1}x − ${coeff2}\\)`, answerType: 'integer', correctAnswer: String(k), choices: [String(k), ...wrongChoices].sort(() => Math.random() - 0.5), hint: `ggT(${coeff1}, ${coeff2}) = ${k}`, difficulty: 0.45 };
	} else {
		const k = rand(2, 6), a = rand(2, 5), b = rand(1, 5);
		return { atomId: 'algebra__ausklammern_faktorisieren', prompt: `Klammere aus: \\(${k * a}x + ${k * b} = ${k}\\cdot(\\_\\_)\\)`, answerType: 'text', correctAnswer: `\\(${a}x + ${b}\\)`, choices: [`\\(${a}x + ${b}\\)`, `\\(${a}x + ${k * b}\\)`, `\\(${k * a}x + ${b}\\)`, `\\(${a}x − ${b}\\)`].sort(() => Math.random() - 0.5), hint: `Teile jeden Term durch \\(${k}\\): \\(${k}(${a}x + ${b})\\)`, difficulty: 0.5 };
	}
});

reg('algebra__binomische_formeln_vorwaerts', (stage = 0) => {
	// Expanding sequence: 3. Formel (x+a)(x-a) → 1. Formel (x+a)² → 2. Formel (x-a)².
	const type = Math.min(stage, 2);
	if (type === 0) {
		const a = rand(2, 7);
		return { atomId: 'algebra__binomische_formeln_vorwaerts', prompt: `\\((x + ${a})(x − ${a}) = x^2 − \\_\\_\\)`, answerType: 'integer', correctAnswer: String(a * a), hint: `3. Formel: \\((x+a)(x−a) = x^2−a^2\\) → \\(a^2 = ${a * a}\\)`, difficulty: 0.45 };
	} else if (type === 1) {
		const a = rand(2, 6);
		return { atomId: 'algebra__binomische_formeln_vorwaerts', prompt: `\\((x + ${a})^2 = x^2 + \\_\\_x + ${a * a}\\)`, answerType: 'integer', correctAnswer: String(2 * a), hint: `1. Formel: \\((x+a)^2 = x^2+2ax+a^2\\) → \\(2 \\cdot ${a} \\cdot x\\)`, difficulty: 0.5 };
	} else {
		const a = rand(2, 5);
		return { atomId: 'algebra__binomische_formeln_vorwaerts', prompt: `\\((x − ${a})^2 = x^2 − \\_\\_x + ${a * a}\\)`, answerType: 'integer', correctAnswer: String(2 * a), hint: `2. Formel: \\((x−a)^2 = x^2−2ax+a^2\\) → \\(2 \\cdot ${a} \\cdot x\\)`, difficulty: 0.5 };
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

reg('algebra__wurzelgleichungen', (stage = 0) => {
	// Expanding sequence: einfache Wurzelgleichung → Wurzelgleichung mit zusätzlichem Term.
	const type = Math.min(stage, 1);
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

reg('algebra__funktion_eindeutige_zuordnung', (stage = 0) => {
	// Expanding sequence: eindeutige Zuordnung bestätigen → mehrdeutige Zuordnung erkennen.
	const type = Math.min(stage, 1);
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

reg('algebra__zahlenfolgen', (stage = 0) => {
	// Expanding sequence: arithmetische Folge → geometrische Folge → Bildungsvorschrift auswerten.
	const type = Math.min(stage, 2);
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

reg('algebra__lineare_funktion_gleichung_aufstellen', (stage = 0) => {
	const m = rand(-3, 4), n = rand(-5, 5);
	while (m === 0) return registry.get('algebra__lineare_funktion_gleichung_aufstellen')!(stage);
	const nSign = (v: number) => v >= 0 ? `+${v}` : `${v}`;
	// Expanding sequence: aus m und n → aus zwei Punkten (Steigung erst berechnen).
	const type = Math.min(stage, 1);
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

reg('algebra__normalparabel_streckung', (stage = 0) => {
	// Expanding sequence: vertikale Verschiebung (+c) → Streckung/Stauchung (a) → horizontale Verschiebung.
	const type = Math.min(stage, 2);
	if (type === 0) {
		const c = rand(1, 5);
		const choices = [`um ${c} nach oben`, `um ${c} nach unten`, `um ${c} nach rechts`, `um ${c} nach links`];
		return { atomId: 'algebra__normalparabel_streckung', prompt: `Was bewirkt das \\(+${c}\\) in \\(f(x) = x^2 + ${c}\\)?`, answerType: 'text', correctAnswer: `um ${c} nach oben`, choices: choices.sort(() => Math.random() - 0.5), hint: `\\(+c\\) verschiebt den Graphen um \\(c\\) nach oben.`, difficulty: 0.4 };
	} else if (type === 1) {
		const a = pick([2, 3, 0.5, 0.25]);
		const desc = a > 1 ? 'schmaler als die Normalparabel' : 'breiter als die Normalparabel';
		const choices = ['schmaler als die Normalparabel', 'breiter als die Normalparabel', 'nach oben verschoben', 'nach links verschoben'];
		return { atomId: 'algebra__normalparabel_streckung', prompt: `Was beschreibt \\(f(x) = ${a}x^2\\) im Vergleich zur Normalparabel \\(y = x^2\\)?`, answerType: 'text', correctAnswer: desc, choices: choices.sort(() => Math.random() - 0.5), hint: '\\(a > 1\\): schmaler (gestreckt), \\(0 < a < 1\\): breiter (gestaucht)', difficulty: 0.45 };
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

reg('algebra__quadratische_gleichung_reinquadratisch', (stage = 0) => {
	// Expanding sequence: x²=c → a·x²=a·c (Koeffizient wegdividieren) → keine Lösung erkennen (Diskrimination).
	const step = Math.min(stage, 2);

	if (step === 2) {
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

	if (step === 0) {
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

// ── 25. Geometrie: Flächen, Umfang, Einheiten ─────────────────────────────────

reg('geometrie__flaecheninhalt_einheitsquadrate', (stage = 0) => {
	const cols = rand(3, 8), rows = rand(2, 6);
	const type = Math.min(stage, 1);
	const svg = svgUnitGrid(cols, rows, cols, rows);
	if (type === 0) {
		return { atomId: 'geometrie__flaecheninhalt_einheitsquadrate', prompt: `Wie viele Einheitsquadrate bedeckt das Rechteck? (Flächeninhalt in Kästchen)`, answerType: 'integer', correctAnswer: String(cols * rows), svg, hint: `Zähle die Kästchen aus oder rechne ${cols} · ${rows}.`, difficulty: 0.3 };
	}
	return { atomId: 'geometrie__flaecheninhalt_einheitsquadrate', prompt: `Wie lang ist der Umfang des Rechtecks? (in Kästchenlängen)`, answerType: 'integer', correctAnswer: String(2 * (cols + rows)), svg, hint: `Zähle die Randstrecke: 2 · (${cols} + ${rows}).`, difficulty: 0.3 };
});

reg('geometrie__rechteck_flaeche_umfang', (stage = 0) => {
	const type = Math.min(stage, 2);
	const w = rand(3, 15), h = rand(3, 15);
	const pts: [Pt, Pt, Pt, Pt] = [[0, 0], [w, 0], [w, h], [0, h]];
	if (type === 0) {
		const svg = svgQuad(pts, { baseLabel: `${w} cm`, rightLabel: `${h} cm`, rightAngleVertices: [0] });
		return { atomId: 'geometrie__rechteck_flaeche_umfang', prompt: `Berechne den Flächeninhalt des Rechtecks.`, answerType: 'number', correctAnswer: String(w * h), svg, hint: `A = a · b = ${w} cm · ${h} cm`, difficulty: 0.3 };
	}
	if (type === 1) {
		const svg = svgQuad(pts, { baseLabel: `${w} cm`, rightLabel: `${h} cm`, rightAngleVertices: [0] });
		return { atomId: 'geometrie__rechteck_flaeche_umfang', prompt: `Berechne den Umfang des Rechtecks.`, answerType: 'number', correctAnswer: String(2 * (w + h)), svg, hint: `U = 2 · (a + b)`, difficulty: 0.3 };
	}
	const svg = svgQuad(pts, { baseLabel: `${w} cm`, rightLabel: '?', rightAngleVertices: [0] });
	return { atomId: 'geometrie__rechteck_flaeche_umfang', prompt: `Das Rechteck hat den Flächeninhalt ${w * h} cm² und eine Seite von ${w} cm. Wie lang ist die fehlende Seite?`, answerType: 'number', correctAnswer: String(h), svg, hint: `Seite = A : ${w} cm`, difficulty: 0.45 };
});

reg('geometrie__flaeche_parallelogramm', (stage = 0) => {
	const type = Math.min(stage, 1);
	const g = rand(4, 14), h = rand(3, 10);
	const slant = Math.round(g * 0.3) || 1;
	const pts: [Pt, Pt, Pt, Pt] = [[0, 0], [g, 0], [g + slant, h], [slant, h]];
	if (type === 0) {
		const svg = svgQuad(pts, { baseLabel: `${g} cm`, heightFrom: [slant, h], heightTo: [slant, 0], heightLabel: `${h} cm` });
		return { atomId: 'geometrie__flaeche_parallelogramm', prompt: `Berechne den Flächeninhalt des Parallelogramms.`, answerType: 'number', correctAnswer: String(g * h), svg, hint: `A = g · h = ${g} cm · ${h} cm`, difficulty: 0.4 };
	}
	const svg = svgQuad(pts, { baseLabel: `${g} cm`, heightFrom: [slant, h], heightTo: [slant, 0], heightLabel: '?' });
	return { atomId: 'geometrie__flaeche_parallelogramm', prompt: `Das Parallelogramm hat den Flächeninhalt ${g * h} cm² und die Grundseite ${g} cm. Wie groß ist die Höhe h?`, answerType: 'number', correctAnswer: String(h), svg, hint: `h = A : g`, difficulty: 0.5 };
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
		extraPoints: [{ at: [footX, h / 2], label: hideH ? '?' : `${h} cm` }]
	});
	if (type === 0) {
		return { atomId: 'geometrie__flaeche_dreieck', prompt: `Berechne den Flächeninhalt des Dreiecks.`, answerType: 'number', correctAnswer: dec(area), svg: diagram(false), hint: `A = (g · h) : 2 = (${g} · ${h}) : 2`, difficulty: 0.4 };
	}
	return { atomId: 'geometrie__flaeche_dreieck', prompt: `Das Dreieck hat den Flächeninhalt ${dec(area)} cm² und die Grundseite ${g} cm. Wie groß ist die Höhe?`, answerType: 'number', correctAnswer: dec(h), svg: diagram(true), hint: `h = (2 · A) : g`, difficulty: 0.5 };
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
			extraPoints: [{ at: [off, h / 2], label: `${h} cm` }]
		});
		return { atomId: 'geometrie__flaeche_trapez_zusammengesetzt', prompt: `Berechne den Flächeninhalt des Trapezes.`, answerType: 'number', correctAnswer: dec(area), svg, hint: `A = (a + c) : 2 · h = (${aB} + ${c}) : 2 · ${h}`, difficulty: 0.5 };
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
	return { atomId: 'geometrie__flaeche_trapez_zusammengesetzt', prompt: `Berechne den Flächeninhalt der zusammengesetzten Figur (zerlege sie in zwei Rechtecke).`, answerType: 'number', correctAnswer: dec(area), svg, hint: `A = ${w1}·${h1} + ${w2}·${h2}`, difficulty: 0.55 };
});

reg('geometrie__kreisumfang', (stage = 0) => {
	const type = Math.min(stage, 2);
	const r = rand(2, 12), d = 2 * r;
	if (type === 0) {
		const svg = svgCircleDiagram(r, { label: `r = ${r} cm` });
		return { atomId: 'geometrie__kreisumfang', prompt: `Berechne den Umfang des Kreises. (nutze π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(round(3.14 * d, 2)), svg, hint: `u = 2·π·r = 2 · 3,14 · ${r}`, difficulty: 0.45 };
	}
	if (type === 1) {
		const svg = svgCircleDiagram(r, { label: `d = ${d} cm`, showDiameter: true });
		return { atomId: 'geometrie__kreisumfang', prompt: `Berechne den Umfang des Kreises. (nutze π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(round(3.14 * d, 2)), svg, hint: `u = π · d = 3,14 · ${d}`, difficulty: 0.4 };
	}
	const uGiven = round(3.14 * d, 1);
	const svg = svgCircleDiagram(r, { label: '?', showDiameter: true });
	return { atomId: 'geometrie__kreisumfang', prompt: `Ein Kreis hat den Umfang ${dec(uGiven)} cm. Wie groß ist der Durchmesser? (nutze π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(round(uGiven / 3.14, 1)), svg, hint: `d = u : π`, difficulty: 0.55 };
});

reg('geometrie__kreisflaeche', (stage = 0) => {
	const type = Math.min(stage, 2);
	const r = rand(2, 12);
	const A = round(3.14 * r * r, 2);
	if (type === 0) {
		const svg = svgCircleDiagram(r, { label: `r = ${r} cm` });
		return { atomId: 'geometrie__kreisflaeche', prompt: `Berechne den Flächeninhalt des Kreises. (nutze π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(A), svg, hint: `A = π · r² = 3,14 · ${r}²`, difficulty: 0.5 };
	}
	if (type === 1) {
		const d = 2 * r;
		const svg = svgCircleDiagram(r, { label: `d = ${d} cm`, showDiameter: true });
		return { atomId: 'geometrie__kreisflaeche', prompt: `Berechne den Flächeninhalt des Kreises. (nutze π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(A), svg, hint: `r = d : 2 = ${r} cm, dann A = π · r²`, difficulty: 0.5 };
	}
	const svg = svgCircleDiagram(r, { label: '?' });
	return { atomId: 'geometrie__kreisflaeche', prompt: `Ein Kreis hat den Flächeninhalt ${dec(A)} cm². Wie groß ist der Radius? (nutze π ≈ 3,14)`, answerType: 'number', correctAnswer: String(r), svg, hint: `r = √(A : π)`, difficulty: 0.6 };
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
	return { atomId: 'geometrie__laengeneinheiten_umrechnen', prompt: `${dec(value)} ${from} = ? ${to}`, answerType: 'number', correctAnswer: dec(result), svg, hint: `1 ${from} = ${factor >= 1 ? dec(factor) : `1/${Math.round(1 / factor)}`} ${to}`, difficulty: 0.4 };
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
		return { atomId: 'geometrie__flaechen_volumeneinheiten_umrechnen', prompt: `${dec(value)} ${from} = ? ${to}`, answerType: 'number', correctAnswer: dec(result), svg, hint: `Flächeneinheiten: Faktor 100 pro Stufe (nicht 10 wie bei Längen!)`, difficulty: 0.5 };
	}
	const pairs = [
		{ from: 'cm³', to: 'dm³', factor: 0.001 }, { from: 'dm³', to: 'cm³', factor: 1000 },
		{ from: 'dm³', to: 'm³', factor: 0.001 }, { from: 'm³', to: 'dm³', factor: 1000 }
	];
	const { from, to, factor } = pick(pairs);
	const value = rand(0, 1) === 0 ? rand(2, 60) : round(rand(20, 600) / 10, 1);
	const result = round(value * factor, 4);
	const svg = svgCuboid(4, 3, 2, { w: '1 dm', h: '1 dm', d: '1 dm' });
	return { atomId: 'geometrie__flaechen_volumeneinheiten_umrechnen', prompt: `${dec(value)} ${from} = ? ${to}`, answerType: 'number', correctAnswer: dec(result), svg, hint: `Volumeneinheiten: Faktor 1000 pro Stufe.`, difficulty: 0.55 };
});

// ── 26. Geometrie: Körperberechnung ───────────────────────────────────────────

reg('geometrie__quader_volumen_oberflaeche', (stage = 0) => {
	const type = Math.min(stage, 1);
	const l = rand(3, 10), w = rand(2, 8), h = rand(2, 8);
	const svg = svgCuboid(l, h, w, { w: `${l} cm`, h: `${h} cm`, d: `${w} cm` });
	if (type === 0) {
		return { atomId: 'geometrie__quader_volumen_oberflaeche', prompt: `Berechne das Volumen des Quaders.`, answerType: 'number', correctAnswer: String(l * w * h), svg, hint: `V = l · b · h = ${l} · ${w} · ${h}`, difficulty: 0.45 };
	}
	const O = 2 * (l * w + l * h + w * h);
	return { atomId: 'geometrie__quader_volumen_oberflaeche', prompt: `Berechne den Oberflächeninhalt des Quaders.`, answerType: 'number', correctAnswer: String(O), svg, hint: `O = 2·(l·b + l·h + b·h)`, difficulty: 0.55 };
});

reg('geometrie__prismen', (stage = 0) => {
	const type = Math.min(stage, 1);
	const g = 2 * rand(2, 6), triH = rand(3, 8), l = rand(4, 12);
	const G = g * triH / 2;
	const svg = svgPrism(g, triH, l, { g: `${g} cm`, h: `${triH} cm`, l: `${l} cm` });
	if (type === 0) {
		const V = G * l;
		return { atomId: 'geometrie__prismen', prompt: `Berechne das Volumen des Prismas (Grundfläche = Dreieck).`, answerType: 'number', correctAnswer: dec(V), svg, hint: `V = G · h = (${g}·${triH}:2) · ${l}`, difficulty: 0.55 };
	}
	return { atomId: 'geometrie__prismen', prompt: `Wie groß ist die Grundfläche G (das Dreieck) des Prismas?`, answerType: 'number', correctAnswer: dec(G), svg, hint: `G = (g · h) : 2 = (${g} · ${triH}) : 2`, difficulty: 0.4 };
});

reg('geometrie__pyramiden', (stage = 0) => {
	const type = Math.min(stage, 1);
	const a = rand(3, 10), h = rand(3, 12);
	const svg = svgPyramid(a, h, { a: `${a} cm`, h: `${h} cm` });
	const G = a * a;
	if (type === 0) {
		const V = round(G * h / 3, 2);
		return { atomId: 'geometrie__pyramiden', prompt: `Berechne das Volumen der quadratischen Pyramide.`, answerType: 'number', correctAnswer: dec(V), svg, hint: `V = (1/3) · G · h = (1/3) · ${a}² · ${h}`, difficulty: 0.55 };
	}
	return { atomId: 'geometrie__pyramiden', prompt: `Wie groß ist die Grundfläche G der quadratischen Pyramide?`, answerType: 'number', correctAnswer: String(G), svg, hint: `G = a² = ${a}²`, difficulty: 0.35 };
});

reg('geometrie__zylinder_volumen_oberflaeche', (stage = 0) => {
	const type = Math.min(stage, 1);
	const r = rand(2, 8), h = rand(3, 12);
	const svg = svgCylinder(r, h, { r: `r = ${r} cm`, h: `h = ${h} cm` });
	if (type === 0) {
		const V = round(3.14 * r * r * h, 2);
		return { atomId: 'geometrie__zylinder_volumen_oberflaeche', prompt: `Berechne das Volumen des Zylinders. (π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(V), svg, hint: `V = π · r² · h`, difficulty: 0.5 };
	}
	const O = round(2 * 3.14 * r * (r + h), 2);
	return { atomId: 'geometrie__zylinder_volumen_oberflaeche', prompt: `Berechne den Oberflächeninhalt des Zylinders. (π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(O), svg, hint: `O = 2·π·r·(r + h)`, difficulty: 0.6 };
});

reg('geometrie__kugel_volumen_oberflaeche', (stage = 0) => {
	const type = Math.min(stage, 1);
	const r = rand(2, 10);
	const svg = svgSphere(r, `r = ${r} cm`);
	if (type === 0) {
		const V = round(4 / 3 * 3.14 * r * r * r, 2);
		return { atomId: 'geometrie__kugel_volumen_oberflaeche', prompt: `Berechne das Volumen der Kugel. (π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(V), svg, hint: `V = (4/3) · π · r³`, difficulty: 0.55 };
	}
	const O = round(4 * 3.14 * r * r, 2);
	return { atomId: 'geometrie__kugel_volumen_oberflaeche', prompt: `Berechne den Oberflächeninhalt der Kugel. (π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(O), svg, hint: `O = 4 · π · r²`, difficulty: 0.5 };
});

reg('geometrie__berechnungen_pyramide_kegel', (stage = 0) => {
	const type = Math.min(stage, 1);
	const r = rand(2, 8), h = rand(3, 12);
	const s = Math.sqrt(r * r + h * h);
	if (type === 0) {
		const svg = svgCone(r, h, { r: `r = ${r} cm`, h: `h = ${h} cm` });
		const V = round(3.14 * r * r * h / 3, 2);
		return { atomId: 'geometrie__berechnungen_pyramide_kegel', prompt: `Berechne das Volumen des Kreiskegels. (π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(V), svg, hint: `V = (1/3) · π · r² · h`, difficulty: 0.6 };
	}
	const O = round(3.14 * r * r + 3.14 * r * s, 2);
	const svg = svgCone(r, h, { r: `r = ${r} cm`, h: `h = ${h} cm`, s: `s ≈ ${dec(round(s, 2))} cm` });
	return { atomId: 'geometrie__berechnungen_pyramide_kegel', prompt: `Berechne den Oberflächeninhalt des Kreiskegels (Mantellinie s = √(r² + h²)). (π ≈ 3,14)`, answerType: 'number', correctAnswer: dec(O), svg, hint: `s = √(${r}² + ${h}²) ≈ ${dec(round(s, 2))}; O = π·r² + π·r·s`, difficulty: 0.7 };
});

// ── 27. Geometrie: Pythagoras, Höhensatz, Kathetensatz ────────────────────────

const PYTHAG_TRIPLES: [number, number, number][] = [
	[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [7, 24, 25], [9, 12, 15], [12, 16, 20], [20, 21, 29]
];

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
	return { atomId: 'geometrie__pythagoras_hypotenuse', prompt: `Berechne die Länge der Hypotenuse c.`, answerType: 'number', correctAnswer: dec(round(c, 2)), svg, hint: `c = √(a² + b²) = √(${a}² + ${b}²)`, difficulty: easy ? 0.45 : 0.55 };
});

reg('geometrie__pythagoras_kathete', () => {
	const [a, b, c] = pick(PYTHAG_TRIPLES);
	const hideA = rand(0, 1) === 0;
	const known = hideA ? b : a, unknown = hideA ? a : b;
	const svg = svgRightTriangle(a, b, {
		labelA: hideA ? '?' : `${a} cm`,
		labelB: hideA ? `${b} cm` : '?',
		labelC: `${c} cm`
	});
	return { atomId: 'geometrie__pythagoras_kathete', prompt: `Berechne die Länge der fehlenden Kathete.`, answerType: 'number', correctAnswer: String(unknown), svg, hint: `Kathete = √(c² − ${known}²) = √(${c}² − ${known}²)`, difficulty: 0.55 };
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
	return { atomId: 'geometrie__pythagoras_umkehrung', prompt: `Ist das Dreieck mit den Seiten ${a} cm, ${b} cm und ${c} cm rechtwinklig?`, answerType: 'boolean', correctAnswer: isRight ? 'ja' : 'nein', svg, hint: `Prüfe: Summe der Quadrate der beiden kürzeren Seiten = Quadrat der längsten Seite?`, difficulty: 0.5 };
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
				{ at: [p / 2, 0], label: `p = ${p} cm` },
				{ at: [p + q / 2, 0], label: `q = ${q} cm` },
				{ at: [p, h / 2], label: '?' }
			]
		});
		return { atomId: 'geometrie__hoehensatz_kathetensatz', prompt: `Berechne die Höhe h mithilfe des Höhensatzes.`, answerType: 'number', correctAnswer: dec(round(h, 2)), svg, hint: `Höhensatz: h² = p · q = ${p} · ${q}`, difficulty: 0.6 };
	}
	const hideA = rand(0, 1) === 0;
	const svg = svgPolyDiagram([A, B, C], {
		...common,
		edgeLabels: [
			{ from: 1, to: 2, text: hideA ? '?' : `a ≈ ${dec(round(a, 2))} cm` },
			{ from: 2, to: 0, text: hideA ? `b ≈ ${dec(round(b, 2))} cm` : '?' }
		],
		extraPoints: [
			{ at: [p / 2, 0], label: `p = ${p} cm` },
			{ at: [p + q / 2, 0], label: `q = ${q} cm` }
		]
	});
	return {
		atomId: 'geometrie__hoehensatz_kathetensatz',
		prompt: `Berechne die fehlende Kathete mithilfe des Kathetensatzes.`,
		answerType: 'number',
		correctAnswer: dec(round(hideA ? a : b, 2)),
		svg,
		hint: `Kathetensatz: ${hideA ? 'a² = q · c' : 'b² = p · c'} = ${hideA ? `${q} · ${c}` : `${p} · ${c}`}`,
		difficulty: 0.65
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
			difficulty: 0.45
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
		difficulty: 0.55
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
		prompt: `Berechne die ${names[ask]} (α = ${alphaDeg}°).`,
		answerType: 'number',
		correctAnswer: dec(round(val(ask), 1)),
		svg,
		hint: `Nutze sin/cos/tan mit α = ${alphaDeg}° und der gegebenen Seite.`,
		difficulty: 0.6
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
		svg,
		hint: `${hintText} → α = ${fnName}⁻¹(...)`,
		difficulty: 0.65
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
		prompt: `Berechne die Seite ${targetName} mit dem Sinussatz (α = ${Adeg}°, β = ${Bdeg}°, a = ${a} cm).`,
		answerType: 'number',
		correctAnswer: dec(round(target, 1)),
		svg,
		hint: `Sinussatz: a/sin(α) = ${targetName}/sin(${askC ? 'γ' : 'β'}) mit γ = 180° − α − β = ${Cdeg}°`,
		difficulty: 0.65
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
		return { atomId: 'geometrie__kosinussatz', prompt: `Berechne die Seite a mit dem Kosinussatz (b = ${b} cm, c = ${c} cm, α = ${Adeg}°).`, answerType: 'number', correctAnswer: dec(round(a, 1)), svg, hint: `a² = b² + c² − 2bc·cos(α)`, difficulty: 0.65 };
	}
	const b = rand(6, 12), c = rand(6, 12);
	const Adeg = rand(35, 110);
	const Arad = Adeg * Math.PI / 180;
	const a = Math.sqrt(b * b + c * c - 2 * b * c * Math.cos(Arad));
	const svg = svgTriangleSSS(a, b, c, { labelA: `a = ${dec(round(a, 1))} cm`, labelB: `b = ${b} cm`, labelC: `c = ${c} cm`, angleA: '?' });
	return { atomId: 'geometrie__kosinussatz', prompt: `Berechne den Winkel α mit dem Kosinussatz (a = ${dec(round(a, 1))} cm, b = ${b} cm, c = ${c} cm).`, answerType: 'number', correctAnswer: dec(round(Adeg, 1)), svg, hint: `cos(α) = (b² + c² − a²) / (2bc)`, difficulty: 0.7 };
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
		difficulty: 0.6
	};
});

reg('geometrie__zentrische_streckung_aehnlichkeit', (stage = 0) => {
	const type = Math.min(stage, 1);
	const s = rand(3, 12);
	const k = pick([0.5, 1.5, 2, 2.5]);
	const image = round(s * k, 2);
	if (type === 0) {
		const svg = svgDilation(k, { orig: `${s} cm`, image: '?' });
		return { atomId: 'geometrie__zentrische_streckung_aehnlichkeit', prompt: `Eine Strecke von ${s} cm wird mit dem Streckfaktor k = ${dec(k)} zentrisch gestreckt. Wie lang ist die Bildstrecke?`, answerType: 'number', correctAnswer: dec(image), svg, hint: `Bildlänge = Originallänge · k`, difficulty: 0.45 };
	}
	const svg = svgDilation(k, { orig: `${s} cm`, image: `${dec(image)} cm` });
	return { atomId: 'geometrie__zentrische_streckung_aehnlichkeit', prompt: `Eine Strecke von ${s} cm wird zu einer Bildstrecke von ${dec(image)} cm zentrisch gestreckt. Wie groß ist der Streckfaktor k?`, answerType: 'number', correctAnswer: dec(k), svg, hint: `k = Bildlänge : Originallänge`, difficulty: 0.5 };
});

// ── 30. Geometrie: Winkel, Koordinatensystem ──────────────────────────────────

reg('geometrie__neben_scheitelwinkel', () => {
	const theta = rand(25, 80);
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
		difficulty: 0.35
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
		difficulty: 0.45
	};
});

reg('geometrie__innenwinkelsatz_dreieck', () => {
	const Adeg = rand(35, 90);
	const remaining = 175 - Adeg;
	const Bdeg = rand(30, Math.max(31, remaining - 25));
	const Cdeg = 180 - Adeg - Bdeg;
	const a = 10;
	const k = a / Math.sin(Adeg * Math.PI / 180);
	const b = k * Math.sin(Bdeg * Math.PI / 180);
	const c = k * Math.sin(Cdeg * Math.PI / 180);
	const svg = svgTriangleSSS(a, b, c, { angleA: `${Adeg}°`, angleB: `${Bdeg}°`, angleC: '?' });
	return {
		atomId: 'geometrie__innenwinkelsatz_dreieck',
		prompt: `Berechne den fehlenden Winkel γ im Dreieck.`,
		answerType: 'integer',
		correctAnswer: String(Cdeg),
		svg,
		hint: `Innenwinkelsumme: α + β + γ = 180° → γ = 180° − ${Adeg}° − ${Bdeg}°`,
		difficulty: 0.35
	};
});

reg('geometrie__winkel_zeichnen_messen', (stage = 0) => {
	const type = Math.min(stage, 1);
	if (type === 0) {
		const deg = pick([15, 35, 55, 75, 90, 105, 125, 150, 170, 180]);
		const svg = svgSimpleAngle(deg);
		const kind = deg === 180 ? 'gestreckter Winkel' : deg === 90 ? 'rechter Winkel' : deg < 90 ? 'spitzer Winkel' : 'stumpfer Winkel';
		return {
			atomId: 'geometrie__winkel_zeichnen_messen',
			prompt: `Welche Winkelart ist das?`,
			answerType: 'text',
			correctAnswer: kind,
			choices: ['spitzer Winkel', 'rechter Winkel', 'stumpfer Winkel', 'gestreckter Winkel'],
			svg,
			hint: 'spitz < 90° < rechter Winkel < stumpf < 180° = gestreckt',
			difficulty: 0.3
		};
	}
	const deg = pick([20, 45, 60, 90, 120, 150, 180, 200, 225, 250, 280, 300, 330]);
	const kind = deg === 180 ? 'gestreckter Winkel' : deg === 90 ? 'rechter Winkel' : deg < 90 ? 'spitzer Winkel' : deg < 180 ? 'stumpfer Winkel' : 'überstumpfer Winkel';
	const svg = deg <= 180 ? svgSimpleAngle(deg) : undefined;
	return {
		atomId: 'geometrie__winkel_zeichnen_messen',
		prompt: `Ein Winkel hat ${deg}°. Welche Winkelart ist das?`,
		answerType: 'text',
		correctAnswer: kind,
		choices: ['spitzer Winkel', 'rechter Winkel', 'stumpfer Winkel', 'gestreckter Winkel', 'überstumpfer Winkel'],
		svg,
		hint: 'überstumpf: zwischen 180° und 360°',
		difficulty: 0.35
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
		difficulty: allowNeg ? 0.4 : 0.3
	};
});

// ── 31. Geometrie: Begriffe, Sätze, Klassifikation ────────────────────────────

reg('geometrie__kongruenzsaetze', () => {
	const scenarios = [
		{ desc: 'drei Seiten (a, b, c)', answer: 'sss', sides: ['a', 'b', 'c'] as const, angles: [] as const },
		{ desc: 'zwei Seiten und der eingeschlossene Winkel', answer: 'sws', sides: ['a', 'b'] as const, angles: ['C'] as const },
		{ desc: 'zwei Winkel und die Seite dazwischen', answer: 'wsw', sides: ['c'] as const, angles: ['A', 'B'] as const },
		{ desc: 'zwei Seiten und der Winkel, der der größeren Seite gegenüberliegt', answer: 'ssw', sides: ['a', 'b'] as const, angles: ['A'] as const }
	];
	const s = pick(scenarios);
	const tri: Pt[] = [[0, 0], [8, 0], [2.5, 6]];
	const edgeLabels = s.sides.map(sd => sd === 'a' ? { from: 1, to: 2, text: '•' } : sd === 'b' ? { from: 2, to: 0, text: '•' } : { from: 0, to: 1, text: '•' });
	const angleLabels = s.angles.map(a => ({ at: a === 'A' ? 0 : a === 'B' ? 1 : 2, text: '•', useArc: true }));
	const svg = svgPolyDiagram(tri, { edgeLabels, angleLabels });
	return {
		atomId: 'geometrie__kongruenzsaetze',
		prompt: `Von einem Dreieck sind gegeben: ${s.desc} (markiert im Bild: •). Mit welchem Kongruenzsatz ist es eindeutig bestimmt?`,
		answerType: 'text',
		correctAnswer: s.answer,
		choices: ['SSS', 'SWS', 'WSW', 'SsW'],
		svg,
		hint: 'SSS = 3 Seiten, SWS = 2 Seiten + eingeschlossener Winkel, WSW = 2 Winkel + Seite dazwischen, SsW = 2 Seiten + Gegenwinkel der größeren Seite.',
		difficulty: 0.5
	};
});

reg('geometrie__kreissaetze', () => {
	const type = rand(0, 3);
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
			difficulty: 0.4
		};
	}
	if (type === 1) {
		const cDeg = pick([20, 50, 80]), dDeg = pick([110, 140, 160]);
		const svg = svgCircleInscribed(
			[{ deg: 200, label: 'A' }, { deg: 340, label: 'B' }, { deg: cDeg, label: 'C' }, { deg: dDeg, label: 'D' }],
			[[0, 1], [0, 2], [1, 2], [0, 3], [1, 3]]
		);
		const angle = rand(30, 70);
		return {
			atomId: 'geometrie__kreissaetze',
			prompt: `C und D liegen auf demselben Kreisbogen über der Sehne AB. Der Winkel ACB beträgt ${angle}°. Wie groß ist der Winkel ADB (Peripheriewinkelsatz)?`,
			answerType: 'integer',
			correctAnswer: String(angle),
			svg,
			hint: 'Peripheriewinkel über derselben Sehne (auf derselben Seite) sind gleich groß.',
			difficulty: 0.5
		};
	}
	if (type === 2) {
		const svg = svgCircleInscribed(
			[{ deg: 140, label: 'A' }, { deg: 40, label: 'B' }, { deg: 260, label: 'C' }],
			[[0, 2], [1, 2]],
			{ showCenter: true, centerConnections: [0, 1] }
		);
		const giveCentral = rand(0, 1) === 0;
		const peripheral = rand(20, 70);
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
			difficulty: 0.55
		};
	}
	const svg = svgCircleInscribed(
		[{ deg: 100, label: 'A' }, { deg: 20, label: 'B' }, { deg: -60, label: 'C' }, { deg: 200, label: 'D' }],
		[[0, 1], [1, 2], [2, 3], [3, 0]]
	);
	const angleA = rand(60, 120);
	return {
		atomId: 'geometrie__kreissaetze',
		prompt: `ABCD ist ein Sehnenviereck. Der Winkel bei A beträgt ${angleA}°. Wie groß ist der gegenüberliegende Winkel bei C?`,
		answerType: 'integer',
		correctAnswer: String(180 - angleA),
		svg,
		hint: 'Im Sehnenviereck ergänzen sich gegenüberliegende Winkel zu 180°.',
		difficulty: 0.5
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
	const y = pick(names.filter(n => n !== x));
	const isTrue = ancestorsOf(x).has(y);
	const svg = svgViereckHaus([x, y]);
	return {
		atomId: 'geometrie__vierecke_systematisieren',
		prompt: `Gehört jedes ${x} automatisch auch zur Gruppe „${y}"?`,
		answerType: 'boolean',
		correctAnswer: isTrue ? 'ja' : 'nein',
		svg,
		hint: 'Haus der Vierecke: Quadrat ⊂ Rechteck/Raute ⊂ Parallelogramm ⊂ Trapez ⊂ Viereck; Raute ⊂ Drachen ⊂ Viereck.',
		difficulty: 0.45
	};
});

reg('geometrie__besondere_linien_dreieck', (stage = 0) => {
	const type = Math.min(stage, 1);
	if (type === 0) {
		const pairs = [
			{ line: 'Mittelsenkrechten', point: 'Umkreismittelpunkt' },
			{ line: 'Winkelhalbierenden', point: 'Inkreismittelpunkt' },
			{ line: 'Höhen', point: 'Höhenschnittpunkt' },
			{ line: 'Seitenhalbierenden', point: 'Schwerpunkt' }
		];
		const p = pick(pairs);
		const wrongPoints = pairs.filter(x => x.point !== p.point).map(x => x.point);
		return {
			atomId: 'geometrie__besondere_linien_dreieck',
			prompt: `Wie heißt der Schnittpunkt der ${p.line} eines Dreiecks?`,
			answerType: 'text',
			correctAnswer: p.point.toLowerCase(),
			choices: [p.point, ...wrongPoints].sort(() => Math.random() - 0.5),
			hint: 'Mittelsenkrechte→Umkreis, Winkelhalbierende→Inkreis, Höhe→Höhenschnittpunkt, Seitenhalbierende→Schwerpunkt.',
			difficulty: 0.4
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
		difficulty: 0.5
	};
});

reg('geometrie__dreieck_konstruieren', () => {
	const constructible = rand(0, 1) === 0;
	let a: number, b: number, c: number;
	if (constructible) {
		[a, b, c] = randomTriangleSides();
	} else {
		a = rand(3, 12); b = rand(3, 12);
		c = a + b + rand(1, 6);
	}
	const svg = svgTriangleSSS(a, b, c, { labelA: `${a} cm`, labelB: `${b} cm`, labelC: `${c} cm` });
	return {
		atomId: 'geometrie__dreieck_konstruieren',
		prompt: `Ist ein Dreieck mit den Seiten a = ${a} cm, b = ${b} cm, c = ${c} cm konstruierbar?`,
		answerType: 'boolean',
		correctAnswer: constructible ? 'ja' : 'nein',
		svg,
		hint: 'Dreiecksungleichung: Jede Seite muss kürzer sein als die Summe der beiden anderen.',
		difficulty: 0.45
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
		difficulty: 0.25
	};
});

reg('geometrie__ebene_figuren_grundschule', (stage = 0) => {
	const type = Math.min(stage, 1);
	const shapes = [
		{ kind: 'kreis' as const, name: 'Kreis', corners: 0 },
		{ kind: 'dreieck' as const, name: 'Dreieck', corners: 3 },
		{ kind: 'viereck' as const, name: 'Viereck', corners: 4 },
		{ kind: 'rechteck' as const, name: 'Rechteck', corners: 4 },
		{ kind: 'quadrat' as const, name: 'Quadrat', corners: 4 },
		{ kind: 'fuenfeck' as const, name: 'Fünfeck', corners: 5 }
	];
	const shape = pick(shapes);
	const svg = svgShape(shape.kind);
	if (type === 0) {
		const others = shapes.filter(s => s.name !== shape.name).sort(() => Math.random() - 0.5).slice(0, 3).map(s => s.name);
		return {
			atomId: 'geometrie__ebene_figuren_grundschule',
			prompt: `Wie heißt diese Figur?`,
			answerType: 'text',
			correctAnswer: shape.name.toLowerCase(),
			choices: [shape.name, ...others].sort(() => Math.random() - 0.5),
			svg,
			difficulty: 0.2
		};
	}
	return {
		atomId: 'geometrie__ebene_figuren_grundschule',
		prompt: `Wie viele Ecken hat diese Figur?`,
		answerType: 'integer',
		correctAnswer: String(shape.corners),
		svg,
		difficulty: 0.25
	};
});

reg('geometrie__koerper_und_netze_grundschule', (stage = 0) => {
	const type = Math.min(stage, 1);
	const bodies = [
		{ name: 'Würfel', svg: svgCuboid(5, 5, 5, {}), ecken: 8, flaechen: 6, kanten: 12 },
		{ name: 'Quader', svg: svgCuboid(7, 4, 5, {}), ecken: 8, flaechen: 6, kanten: 12 },
		{ name: 'Kugel', svg: svgSphere(5), ecken: 0, flaechen: 1, kanten: 0 },
		{ name: 'Zylinder', svg: svgCylinder(4, 8, {}), ecken: 0, flaechen: 3, kanten: 2 },
		{ name: 'Kegel', svg: svgCone(4, 8, {}), ecken: 1, flaechen: 2, kanten: 1 },
		{ name: 'Pyramide', svg: svgPyramid(6, 8, {}), ecken: 5, flaechen: 5, kanten: 8 }
	];
	const body = pick(bodies);
	if (type === 0) {
		const others = bodies.filter(b => b.name !== body.name).sort(() => Math.random() - 0.5).slice(0, 3).map(b => b.name);
		return {
			atomId: 'geometrie__koerper_und_netze_grundschule',
			prompt: `Wie heißt dieser Körper?`,
			answerType: 'text',
			correctAnswer: body.name.toLowerCase(),
			choices: [body.name, ...others].sort(() => Math.random() - 0.5),
			svg: body.svg,
			difficulty: 0.2
		};
	}
	const feature = pick(['ecken', 'flaechen', 'kanten'] as const);
	const featureName = feature === 'ecken' ? 'Ecken' : feature === 'flaechen' ? 'Flächen' : 'Kanten';
	return {
		atomId: 'geometrie__koerper_und_netze_grundschule',
		prompt: `Wie viele ${featureName} hat ein ${body.name}?`,
		answerType: 'integer',
		correctAnswer: String(body[feature]),
		svg: body.svg,
		difficulty: 0.3
	};
});

reg('geometrie__symmetrie_grundschule', (stage = 0) => {
	const type = Math.min(stage, 1);
	const shapes = [
		{ kind: 'quadrat' as const, axes: 4 },
		{ kind: 'rechteck' as const, axes: 2 },
		{ kind: 'dreieck' as const, axes: 3 },
		{ kind: 'fuenfeck' as const, axes: 5 },
		{ kind: 'sechseck' as const, axes: 6 },
		{ kind: 'viereck' as const, axes: 0 }
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
			difficulty: 0.35
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
		difficulty: 0.3
	};
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
