import { describe, it, expect } from 'vitest';
import { buildSky, domainName, layoutConstellation, nextStarId, type StarAtom } from './constellations';

function atoms(n: number, domain = 'arithmetik', subdomain: string | null = 'Bruchrechnung', over: Partial<StarAtom> = {}): StarAtom[] {
	return Array.from({ length: n }, (_, i) => ({
		id: `${domain}_${subdomain}_${i}`,
		label: `Atom ${i}`,
		domain,
		subdomain,
		level: 'atom',
		mastery: 0,
		isMastered: false,
		isActive: false,
		...over
	}));
}

describe('layoutConstellation', () => {
	it('keeps stars apart and inside the tile for every topic size', () => {
		for (let n = 1; n <= 45; n++) {
			const c = layoutConstellation('arithmetik', `T${n}`, atoms(n, 'arithmetik', `T${n}`));
			expect(c.stars).toHaveLength(n);
			for (const s of c.stars) {
				expect(s.x).toBeGreaterThan(0);
				expect(s.x).toBeLessThan(c.width);
				expect(s.y).toBeGreaterThan(0);
				expect(s.y).toBeLessThan(c.height);
			}
			for (let i = 0; i < n; i++)
				for (let j = i + 1; j < n; j++)
					expect(Math.hypot(c.stars[i].x - c.stars[j].x, c.stars[i].y - c.stars[j].y)).toBeGreaterThan(12);
			expect(c.lines).toHaveLength(Math.max(0, n - 1));
		}
	});

	it('is stable for the same topic', () => {
		const a = layoutConstellation('geometrie', 'Kreis', atoms(6, 'geometrie', 'Kreis'));
		const b = layoutConstellation('geometrie', 'Kreis', atoms(6, 'geometrie', 'Kreis', { isMastered: true }));
		expect(b.stars.map((s) => [s.x, s.y])).toEqual(a.stars.map((s) => [s.x, s.y]));
		expect(b.complete).toBe(true);
		expect(b.lines.every((l) => l.gold)).toBe(true);
	});

	it('uses wide tiles for big topics', () => {
		expect(layoutConstellation('a', 'x', atoms(20)).wide).toBe(true);
		expect(layoutConstellation('a', 'x', atoms(7)).wide).toBe(false);
	});
});

describe('buildSky', () => {
	it('orders finished, then started, then hidden constellations', () => {
		const sky = buildSky([
			...atoms(3, 'arithmetik', 'Zu'),
			...atoms(4, 'arithmetik', 'Fertig', { isMastered: true }),
			...atoms(5, 'arithmetik', 'Offen', { isActive: true }),
			...atoms(2, 'algebra', 'Terme')
		]);
		expect(sky.map((d) => d.domain)).toEqual(['arithmetik', 'algebra']);
		expect(sky[0].constellations.map((c) => c.name)).toEqual(['Fertig', 'Offen', 'Zu']);
		expect(sky[0].completeCount).toBe(1);
		expect(sky[1].unlocked).toBe(false);
	});

	it('ignores clusters', () => {
		const sky = buildSky(atoms(2, 'a', 'b', { level: 'cluster' }));
		expect(sky).toHaveLength(0);
	});
});

describe('helpers', () => {
	it('formats domain names', () => {
		expect(domainName('analytische_geometrie')).toBe('Analytische Geometrie');
		expect(domainName('logik_und_mengen')).toBe('Logik und Mengen');
	});

	it('points Ato at the most advanced open star', () => {
		const list = atoms(3, 'a', 'b', { isActive: true });
		list[1].mastery = 0.6;
		expect(nextStarId(list)).toBe(list[1].id);
		expect(nextStarId(atoms(2))).toBeNull();
	});
});
