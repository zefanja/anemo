// Layout for the student star map: every topic (subdomain) becomes its own
// constellation on a tile. Stars sit in the cells of an invisible grid (one star
// per cell, only slightly jittered), so they can never overlap.

export interface StarAtom {
	id: string;
	label: string;
	domain: string;
	subdomain: string | null;
	level: 'atom' | 'cluster';
	mastery: number;
	isMastered: boolean;
	isActive: boolean;
}

export type StarStatus = 'mastered' | 'active' | 'locked';

export interface PlacedStar extends StarAtom {
	x: number;
	y: number;
	status: StarStatus;
}

export interface ConstellationLine {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	gold: boolean;
}

export interface Constellation {
	key: string;
	name: string;
	wide: boolean;
	width: number;
	height: number;
	stars: PlacedStar[];
	lines: ConstellationLine[];
	mastered: number;
	total: number;
	complete: boolean;
	locked: boolean;
}

export interface DomainSky {
	domain: string;
	name: string;
	constellations: Constellation[];
	completeCount: number;
	unlocked: boolean;
}

// Tile geometry in SVG units. Narrow tiles take half the row, wide ones all of it.
export const NARROW_W = 160;
export const WIDE_W = 330;
export const WIDE_FROM = 11; // topics with more stars than this get a wide tile
const PAD_X = 14;
const PAD_Y = 12;
const CELL_H = 32;
const SPARE = 1.4; // more cells than stars, so the figure doesn't look like a grid

export function djb2(s: string): number {
	let h = 5381;
	for (let i = 0; i < s.length; i++) h = (((h * 33) | 0) ^ s.charCodeAt(i)) >>> 0;
	return h;
}

// Seedable PRNG (mulberry32)
export function rng(seed: number): () => number {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
	};
}

export function statusOf(a: StarAtom): StarStatus {
	return a.isMastered ? 'mastered' : a.isActive ? 'active' : 'locked';
}

const SMALL_WORDS = new Set(['und', 'oder', 'von']);

export function domainName(domain: string): string {
	return domain
		.split('_')
		.map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
		.join(' ');
}

export function layoutConstellation(domain: string, name: string | null, atoms: StarAtom[]): Constellation {
	const n = atoms.length;
	const wide = n > WIDE_FROM;
	const width = wide ? WIDE_W : NARROW_W;
	const gw = width - 2 * PAD_X;
	const cols = Math.max(1, Math.min(n, Math.floor(gw / 32)));
	const rows = Math.max(n > 2 ? 2 : 1, Math.ceil((n * SPARE) / cols));
	const cw = gw / cols;
	const height = 2 * PAD_Y + rows * CELL_H;
	const key = `${domain}/${name ?? '_'}`;
	const r = rng(djb2(key));

	// Shuffle cell indices, then hand one cell to each star
	const cells = Array.from({ length: cols * rows }, (_, i) => i);
	for (let i = cells.length - 1; i > 0; i--) {
		const j = Math.floor(r() * (i + 1));
		[cells[i], cells[j]] = [cells[j], cells[i]];
	}
	const placed: PlacedStar[] = atoms.map((a, i) => {
		const c = cells[i];
		return {
			...a,
			x: PAD_X + ((c % cols) + 0.5 + (r() - 0.5) * 0.4) * cw,
			y: PAD_Y + (Math.floor(c / cols) + 0.5 + (r() - 0.5) * 0.4) * CELL_H,
			status: statusOf(a)
		};
	});

	// Nearest-neighbour chain from the leftmost star gives each topic its figure
	const pool = [...placed].sort((a, b) => a.x - b.x || a.y - b.y);
	const chain: PlacedStar[] = pool.length ? [pool.shift()!] : [];
	while (pool.length) {
		const last = chain[chain.length - 1];
		let bi = 0;
		let bd = Infinity;
		pool.forEach((p, i) => {
			const d = Math.hypot(p.x - last.x, p.y - last.y);
			if (d < bd) {
				bd = d;
				bi = i;
			}
		});
		chain.push(pool.splice(bi, 1)[0]);
	}
	const lines: ConstellationLine[] = [];
	for (let i = 1; i < chain.length; i++) {
		const a = chain[i - 1];
		const b = chain[i];
		lines.push({
			x1: a.x,
			y1: a.y,
			x2: b.x,
			y2: b.y,
			gold: a.status === 'mastered' && b.status === 'mastered'
		});
	}

	const mastered = placed.filter((s) => s.status === 'mastered').length;
	return {
		key,
		name: name ?? 'Weitere Themen',
		wide,
		width,
		height,
		stars: placed,
		lines,
		mastered,
		total: n,
		complete: n > 0 && mastered === n,
		locked: placed.every((s) => s.status === 'locked')
	};
}

// Group atoms into one sky per domain. Order inside a domain: finished
// constellations first (the collection), then those in progress by how far
// along they are, then the still hidden ones.
export function buildSky(atoms: StarAtom[]): DomainSky[] {
	const stars = atoms.filter((a) => a.level === 'atom');
	const byDomain = new Map<string, Map<string | null, StarAtom[]>>();
	for (const a of stars) {
		if (!byDomain.has(a.domain)) byDomain.set(a.domain, new Map());
		const subs = byDomain.get(a.domain)!;
		if (!subs.has(a.subdomain)) subs.set(a.subdomain, []);
		subs.get(a.subdomain)!.push(a);
	}

	const rank = (c: Constellation) => (c.complete ? 0 : c.locked ? 2 : 1);
	const skies = [...byDomain.entries()].map(([domain, subs]) => {
		const constellations = [...subs.entries()]
			.map(([sub, list]) => layoutConstellation(domain, sub, list))
			.sort(
				(a, b) =>
					rank(a) - rank(b) ||
					b.mastered / b.total - a.mastered / a.total ||
					a.name.localeCompare(b.name, 'de')
			);
		return {
			domain,
			name: domainName(domain),
			constellations,
			completeCount: constellations.filter((c) => c.complete).length,
			unlocked: constellations.some((c) => !c.locked)
		};
	});

	// Domains the student is working in come first
	return skies.sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || a.name.localeCompare(b.name, 'de'));
}

// The star Ato points at: the open star that is furthest along.
export function nextStarId(atoms: StarAtom[]): string | null {
	let best: StarAtom | null = null;
	for (const a of atoms) {
		if (a.level !== 'atom' || a.isMastered || !a.isActive) continue;
		if (!best || a.mastery > best.mastery) best = a;
	}
	return best?.id ?? null;
}
