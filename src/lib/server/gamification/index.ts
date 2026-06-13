import { db } from '../db/index.js';
import { gamificationState, badges, studentAtomStatus } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// XP rewards
const XP_CORRECT = 10;
const XP_ATOM_MASTERED = 50;
const XP_REVIEW_CORRECT = 5;

// Level thresholds: level N requires this many total XP
const LEVEL_THRESHOLDS = [0, 100, 250, 500, 900, 1400, 2000, 3000, 4500, 6500, 9000];

function xpToLevel(xp: number): number {
	for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
		if (xp >= LEVEL_THRESHOLDS[i]) return i + 1;
	}
	return 1;
}

export interface GamificationResult {
	xpGained: number;
	newXp: number;
	newLevel: number;
	levelUp: boolean;
	newBadges: string[];
	streakDays: number;
}

export async function recordAttempt(
	studentId: string,
	isCorrect: boolean,
	isReview: boolean,
	justMastered: boolean,
	atomId: string
): Promise<GamificationResult> {
	const now = new Date();
	const todayStr = now.toISOString().slice(0, 10);

	let state = await db.query.gamificationState.findFirst({
		where: (g, { eq }) => eq(g.studentId, studentId)
	});

	if (!state) {
		await db.insert(gamificationState).values({
			studentId,
			xp: 0,
			level: 1,
			streakDays: 0,
			streakLastDate: null
		});
		state = { studentId, xp: 0, level: 1, streakDays: 0, streakLastDate: null, updatedAt: now };
	}

	// XP
	let xpGained = 0;
	if (isCorrect) {
		xpGained += isReview ? XP_REVIEW_CORRECT : XP_CORRECT;
		if (justMastered) xpGained += XP_ATOM_MASTERED;
	}

	// Streak
	let streakDays = state.streakDays;
	const lastDate = state.streakLastDate;
	if (lastDate !== todayStr) {
		const yesterday = new Date(now);
		yesterday.setDate(yesterday.getDate() - 1);
		const yesterdayStr = yesterday.toISOString().slice(0, 10);
		if (lastDate === yesterdayStr) {
			streakDays += 1;
		} else {
			streakDays = 1;
		}
	}

	const newXp = state.xp + xpGained;
	const oldLevel = state.level;
	const newLevel = xpToLevel(newXp);
	const levelUp = newLevel > oldLevel;

	await db
		.update(gamificationState)
		.set({ xp: newXp, level: newLevel, streakDays, streakLastDate: todayStr, updatedAt: now })
		.where(eq(gamificationState.studentId, studentId));

	const newBadges = await checkAndAwardBadges(studentId, {
		justMastered,
		atomId,
		streakDays,
		newXp
	});

	return { xpGained, newXp, newLevel, levelUp, newBadges, streakDays };
}

// Called once after the placement test completes to award XP and badges
// based on how many atoms were mastered. Tested atoms earn XP; propagated
// atoms only contribute to badge thresholds.
export async function recordPlacementCompletion(
	studentId: string,
	testedPassed: number
): Promise<{ xpGained: number; newBadges: string[] }> {
	const now = new Date();
	const todayStr = now.toISOString().slice(0, 10);

	let state = await db.query.gamificationState.findFirst({
		where: (g, { eq }) => eq(g.studentId, studentId)
	});

	if (!state) {
		await db.insert(gamificationState).values({
			studentId,
			xp: 0,
			level: 1,
			streakDays: 0,
			streakLastDate: null
		});
		state = { studentId, xp: 0, level: 1, streakDays: 0, streakLastDate: null, updatedAt: now };
	}

	// Award XP for each atom correctly answered during placement
	const xpGained = testedPassed * XP_ATOM_MASTERED;

	// Count total mastered atoms (includes placement_propagated) for badge checks
	const masteredRows = await db.query.studentAtomStatus.findMany({
		where: (s, { and, eq }) => and(eq(s.studentId, studentId), eq(s.isMastered, true)),
		columns: { atomId: true }
	});
	const totalMastered = masteredRows.length;

	const newXp = state.xp + xpGained;
	const newLevel = xpToLevel(newXp);

	await db
		.update(gamificationState)
		.set({ xp: newXp, level: newLevel, streakLastDate: todayStr, updatedAt: now })
		.where(eq(gamificationState.studentId, studentId));

	const newBadges = await checkAndAwardBadges(studentId, {
		justMastered: totalMastered > 0,
		atomId: '',
		streakDays: state.streakDays,
		newXp
	});

	return { xpGained, newBadges };
}

async function checkAndAwardBadges(
	studentId: string,
	ctx: { justMastered: boolean; atomId: string; streakDays: number; newXp: number }
): Promise<string[]> {
	const existing = await db.query.badges.findMany({
		where: (b, { eq }) => eq(b.studentId, studentId)
	});
	const earned = new Set(existing.map((b) => b.badgeType));
	const toAward: (typeof badges.$inferInsert)[] = [];

	if (ctx.justMastered && !earned.has('first_atom')) {
		toAward.push({ studentId, badgeType: 'first_atom' });
	}

	if (ctx.justMastered) {
		const masteredCount = await db.query.studentAtomStatus.findMany({
			where: (s, { and, eq }) => and(eq(s.studentId, studentId), eq(s.isMastered, true))
		});
		const count = masteredCount.length;
		if (count >= 5 && !earned.has('atoms_5')) toAward.push({ studentId, badgeType: 'atoms_5' });
		if (count >= 10 && !earned.has('atoms_10')) toAward.push({ studentId, badgeType: 'atoms_10' });
		if (count >= 25 && !earned.has('atoms_25')) toAward.push({ studentId, badgeType: 'atoms_25' });
		if (count >= 50 && !earned.has('atoms_50')) toAward.push({ studentId, badgeType: 'atoms_50' });
		if (count >= 95 && !earned.has('atoms_all')) toAward.push({ studentId, badgeType: 'atoms_all' });
	}

	if (ctx.streakDays >= 3 && !earned.has('streak_3')) toAward.push({ studentId, badgeType: 'streak_3' });
	if (ctx.streakDays >= 7 && !earned.has('streak_7')) toAward.push({ studentId, badgeType: 'streak_7' });
	if (ctx.streakDays >= 30 && !earned.has('streak_30')) toAward.push({ studentId, badgeType: 'streak_30' });
	if (ctx.streakDays >= 100 && !earned.has('streak_100')) toAward.push({ studentId, badgeType: 'streak_100' });

	if (ctx.newXp >= 100 && !earned.has('xp_100')) toAward.push({ studentId, badgeType: 'xp_100' });
	if (ctx.newXp >= 500 && !earned.has('xp_500')) toAward.push({ studentId, badgeType: 'xp_500' });
	if (ctx.newXp >= 1500 && !earned.has('xp_1500')) toAward.push({ studentId, badgeType: 'xp_1500' });
	if (ctx.newXp >= 4000 && !earned.has('xp_4000')) toAward.push({ studentId, badgeType: 'xp_4000' });
	if (ctx.newXp >= 8000 && !earned.has('xp_8000')) toAward.push({ studentId, badgeType: 'xp_8000' });

	// Insert badges individually so one invalid type doesn't fail the entire batch
	const awarded: string[] = [];
	for (const badge of toAward) {
		try {
			await db.insert(badges).values(badge).onConflictDoNothing();
			awarded.push(badge.badgeType);
		} catch {
			// Badge type not yet in DB enum (pending migration) — skip silently
		}
	}

	return awarded;
}

export async function getGamificationState(studentId: string) {
	const state = await db.query.gamificationState.findFirst({
		where: (g, { eq }) => eq(g.studentId, studentId)
	});
	const earnedBadges = await db.query.badges.findMany({
		where: (b, { eq }) => eq(b.studentId, studentId)
	});
	return {
		xp: state?.xp ?? 0,
		level: state?.level ?? 1,
		streakDays: state?.streakDays ?? 0,
		xpToNextLevel: nextLevelXp(state?.xp ?? 0),
		badges: earnedBadges.map((b) => ({ type: b.badgeType, awardedAt: b.awardedAt }))
	};
}

function nextLevelXp(currentXp: number): number {
	const level = xpToLevel(currentXp);
	return LEVEL_THRESHOLDS[level] ?? Infinity;
}
