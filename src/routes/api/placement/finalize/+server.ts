import { json, error } from '@sveltejs/kit';
import { finalizePlacement, type PlacementState } from '$lib/server/learning/placement.js';
import { getGamificationState } from '$lib/server/gamification/index.js';
import { buildSession } from '$lib/server/learning/session-builder.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || locals.session.type !== 'student') {
		throw error(401, 'Nicht angemeldet');
	}

	const body = await request.json().catch(() => null);
	if (!body) throw error(400, 'Ungültige Anfrage');

	const state: PlacementState = body.state ?? { tested: {}, propagated: [], candidates: [], totalTested: 0 };

	const { studentId, classId } = locals.session;
	const summary = await finalizePlacement(studentId, state);

	// For the result screen: current level and the first recommended topic
	const [gami, plan] = await Promise.all([
		getGamificationState(studentId),
		buildSession(studentId, classId).catch(() => null)
	]);

	return json({
		...summary,
		level: gami.level,
		xp: gami.xp,
		nextTopic: plan?.frontierItems[0]?.label ?? null
	});
};
