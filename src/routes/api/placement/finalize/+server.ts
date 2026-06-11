import { json, error } from '@sveltejs/kit';
import { finalizePlacement, type PlacementState } from '$lib/server/learning/placement.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || locals.session.type !== 'student') {
		throw error(401, 'Nicht angemeldet');
	}

	const body = await request.json().catch(() => null);
	if (!body) throw error(400, 'Ungültige Anfrage');

	const state: PlacementState = body.state ?? { tested: {}, propagated: [], candidates: [], totalTested: 0 };

	const summary = await finalizePlacement(locals.session.studentId, state);
	return json(summary);
};
