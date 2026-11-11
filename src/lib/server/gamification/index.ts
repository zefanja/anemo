import { db } from '../db/index.js';
import { gamificationState, badges, studentAtomStatus } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { attempts } from '../db/schema.js';
import { xpToLevel, comboBonus, DEFAULT_DAILY_XP_GOAL, LEVEL_THRESHOLDS } from '$lib/gamification.js';
import { advanceStreak, displayedStreak, countCombo, isoDate } from './streak.js';

export function dailyXpGoal(): number {
	const n = parseInt(env.DAILY_XP_GOAL ?? '');
	return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_XP_GOAL;
}

// XP rewards by atom grade level (minimum Jahrgangsstufe of the atom)
const XP_TABLE: Array<{ maxGrade: number; correct: number; review: number; mastered: number }> = [
	{ maxGrade: 2, correct: 5, review: 3, mastered: 25 },
	{ maxGrade: 4, correct: 8, review: 4, mastered: 40 },
	{ maxGrade: 6, correct: 10, review: 5, mastered: 50 },
	{ maxGrade: 8, correct: 15, review: 8, mastered: 75 },
	{ maxGrade: 10, correct: 20, review: 10, mastered: 100 },
	{ maxGrade: Infinity, correct: 25, review: 13, mastered: 125 }
];

function xpForGrade(grade: number | null): { correct: number; review: number; mastered: number } {
	const g = grade ?? 5;
	return XP_TABLE.find((row) => g <= row.maxGrade)!;
}

export interface GamificationResult {
	xpGained: number;
	newXp: number;
	newLevel: number;
	levelUp: boolean;
	newBadges: string[];
	streakDays: number;
	combo: number;
	comboBonus: number;
	dailyXp: number;
	dailyGoal: number;
	dailyGoalReached: boolean;
	streakFreezes: number;
	freezeUsed: boolean;
	freezeEarned: boolean;
}

export async function recordAttempt(
	studentId: string,
	isCorrect: boolean,
	isReview: boolean,
	justMastered: boolean,
	atomId: string,
	atomGrade: number | null = null
): Promise<GamificationResult> {
	const now = new Date();
	const todayStr = isoDate(now);
	const state = await getOrCreateState(studentId);

	// Combo: consecutive correct answers (the current attempt is already stored)
	let combo = 0;
	if (isCorrect) {
		const recent = await db
			.select({ isCorrect: attempts.isCorrect, answeredAt: attempts.answeredAt })
			.from(attempts)
			.where(eq(attempts.studentId, studentId))
			.orderBy(desc(attempts.answeredAt))
			.limit(30);
		combo = countCombo(recent);
	}

	// XP
	const xp = xpForGrade(atomGrade);
	let xpGained = 0;
	let bonus = 0;
	if (isCorrect) {
		xpGained += isReview ? xp.review : xp.correct;
		if (justMastered) xpGained += xp.mastered;
		bonus = comboBonus(combo);
		xpGained += bonus;
	}

	// Streak (with streak freezes)
	const streak = advanceStreak(state.streakLastDate, todayStr, state.streakDays, state.streakFreezes);

	// Daily goal
	const goal = dailyXpGoal();
	const prevDaily = state.dailyXpDate === todayStr ? state.dailyXp : 0;
	const dailyXp = prevDaily + xpGained;

	const newXp = state.xp + xpGained;
	const oldLevel = state.level;
	const newLevel = xpToLevel(newXp);
	const levelUp = newLevel > oldLevel;

	await db
		.update(gamificationState)
		.set({
			xp: newXp,
			level: newLevel,
			streakDays: streak.streakDays,
			streakLastDate: todayStr,
			streakFreezes: streak.freezes,
			dailyXp,
			dailyXpDate: todayStr,
			updatedAt: now
		})
		.where(eq(gamificationState.studentId, studentId));

	const newBadges = await checkAndAwardBadges(studentId, {
		justMastered,
		atomId,
		streakDays: streak.streakDays,
		newXp
	});

	return {
		xpGained,
		newXp,
		newLevel,
		levelUp,
		newBadges,
		streakDays: streak.streakDays,
		combo,
		comboBonus: bonus,
		dailyXp,
		dailyGoal: goal,
		dailyGoalReached: prevDaily < goal && dailyXp >= goal,
		streakFreezes: streak.freezes,
		freezeUsed: streak.freezesUsed > 0,
		freezeEarned: streak.freezeEarned
	};
}

async function getOrCreateState(studentId: string) {
	const state = await db.query.gamificationState.findFirst({
		where: (g, { eq }) => eq(g.studentId, studentId)
	});
	if (state) return state;
	const [created] = await db
		.insert(gamificationState)
		.values({ studentId })
		.onConflictDoNothing()
		.returning();
	return (
		created ??
		(await db.query.gamificationState.findFirst({ where: (g, { eq }) => eq(g.studentId, studentId) }))!
	);
}

// Called once after the placement test completes to award XP and badges
// based on how many atoms were mastered. Tested atoms earn XP; propagated
// atoms only contribute to badge thresholds.
export async function recordPlacementCompletion(
	studentId: string,
	testedPassed: number
): Promise<{ xpGained: number; newBadges: string[] }> {
	const now = new Date();
	const todayStr = isoDate(now);
	const state = await getOrCreateState(studentId);

	// Award XP for each atom correctly answered during placement (use grade 5 as neutral default)
	const xpGained = testedPassed * xpForGrade(5).mastered;

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
	const [state, earnedBadges] = await Promise.all([
		db.query.gamificationState.findFirst({ where: (g, { eq }) => eq(g.studentId, studentId) }),
		db.query.badges.findMany({ where: (b, { eq }) => eq(b.studentId, studentId) })
	]);
	const todayStr = isoDate(new Date());
	const xp = state?.xp ?? 0;
	const freezes = state?.streakFreezes ?? 1;
	const streak = displayedStreak(state?.streakLastDate ?? null, todayStr, state?.streakDays ?? 0, freezes);
	const level = state?.level ?? 1;
	return {
		xp,
		level,
		streakDays: streak.streakDays,
		streakAtRisk: streak.atRisk,
		practicedToday: state?.streakLastDate === todayStr,
		streakFreezes: freezes,
		dailyXp: state?.dailyXpDate === todayStr ? state.dailyXp : 0,
		dailyGoal: dailyXpGoal(),
		xpToNextLevel: LEVEL_THRESHOLDS[level] ?? Infinity,
		badges: earnedBadges.map((b) => ({ type: b.badgeType, awardedAt: b.awardedAt }))
	};
}
