// Shared (client + server) gamification definitions: levels, badges, combo, daily goal.

export const LEVEL_THRESHOLDS = [
	0, 100, 250, 500, 900, 1400, 2000, 3000, 4500, 6500, 9000,
	12500, 17000, 22500, 29000, 37000, 46500, 57500, 70000, 85000
];

export function xpToLevel(xp: number): number {
	for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
		if (xp >= LEVEL_THRESHOLDS[i]) return i + 1;
	}
	return 1;
}

/** Progress within the current level: percent and XP still missing for the next level. */
export function levelProgress(xp: number, level: number): { pct: number; remaining: number; nextLevelXp: number | null } {
	const lo = LEVEL_THRESHOLDS[level - 1] ?? 0;
	const hi = LEVEL_THRESHOLDS[level];
	if (hi === undefined) return { pct: 100, remaining: 0, nextLevelXp: null };
	return {
		pct: Math.max(0, Math.min(100, Math.round(((xp - lo) / (hi - lo)) * 100))),
		remaining: Math.max(0, hi - xp),
		nextLevelXp: hi
	};
}

/** Bonus XP for a run of consecutive correct answers (combo counts the current answer). */
export function comboBonus(combo: number): number {
	if (combo >= 10) return 5;
	if (combo >= 5) return 3;
	if (combo >= 3) return 2;
	return 0;
}

export const DEFAULT_DAILY_XP_GOAL = 50;
export const MAX_STREAK_FREEZES = 2;

export type BadgeCategory = 'atoms' | 'streak' | 'xp' | 'other';
export type BadgeMetric = 'mastered' | 'streak' | 'xp' | null;

export interface BadgeDef {
	type: string;
	name: string;
	desc: string;
	category: BadgeCategory;
	metric: BadgeMetric;
	/** Target value for `metric`; null for special badges (e.g. "all atoms"). */
	target: number | null;
}

export const BADGES: BadgeDef[] = [
	{ type: 'first_atom', name: 'Erster Stern', desc: '1 Thema gemeistert', category: 'atoms', metric: 'mastered', target: 1 },
	{ type: 'atoms_5', name: 'Abel', desc: '5 Themen gemeistert', category: 'atoms', metric: 'mastered', target: 5 },
	{ type: 'atoms_10', name: 'Thales', desc: '10 Themen gemeistert', category: 'atoms', metric: 'mastered', target: 10 },
	{ type: 'atoms_25', name: 'Fibonacci', desc: '25 Themen gemeistert', category: 'atoms', metric: 'mastered', target: 25 },
	{ type: 'atoms_50', name: 'Leibniz', desc: '50 Themen gemeistert', category: 'atoms', metric: 'mastered', target: 50 },
	{ type: 'atoms_all', name: 'Gauß', desc: 'Alle Themen gemeistert', category: 'atoms', metric: 'mastered', target: null },
	{ type: 'streak_3', name: 'Hypatia', desc: '3 Tage am Stück', category: 'streak', metric: 'streak', target: 3 },
	{ type: 'streak_7', name: 'Pythagoras', desc: '7 Tage am Stück', category: 'streak', metric: 'streak', target: 7 },
	{ type: 'streak_30', name: 'Archimedes', desc: '30 Tage am Stück', category: 'streak', metric: 'streak', target: 30 },
	{ type: 'streak_100', name: 'Ramanujan', desc: '100 Tage am Stück', category: 'streak', metric: 'streak', target: 100 },
	{ type: 'xp_100', name: 'Euklid', desc: '100 XP gesammelt', category: 'xp', metric: 'xp', target: 100 },
	{ type: 'xp_500', name: 'Kepler', desc: '500 XP gesammelt', category: 'xp', metric: 'xp', target: 500 },
	{ type: 'xp_1500', name: 'Descartes', desc: '1.500 XP gesammelt', category: 'xp', metric: 'xp', target: 1500 },
	{ type: 'xp_4000', name: 'Newton', desc: '4.000 XP gesammelt', category: 'xp', metric: 'xp', target: 4000 },
	{ type: 'xp_8000', name: 'Euler', desc: '8.000 XP gesammelt', category: 'xp', metric: 'xp', target: 8000 },
	{ type: 'cluster_complete', name: 'Bereich fertig', desc: 'Einen ganzen Bereich abgeschlossen', category: 'other', metric: null, target: null }
];

export const BADGE_BY_TYPE: Record<string, BadgeDef> = Object.fromEntries(BADGES.map((b) => [b.type, b]));

export function greeting(date = new Date()): string {
	const h = date.getHours();
	if (h < 5) return 'Hallo';
	if (h < 11) return 'Guten Morgen';
	if (h < 17) return 'Hallo';
	return 'Guten Abend';
}
