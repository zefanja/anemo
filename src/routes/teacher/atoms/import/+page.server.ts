import { redirect, fail } from '@sveltejs/kit';
import { importExplanations, type ExplanationImportRow } from '$lib/server/atoms/import-explanations.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session || locals.session.type !== 'teacher') {
		throw redirect(303, '/teacher/login');
	}
	return {};
};

export const actions: Actions = {
	import: async ({ request, locals }) => {
		if (!locals.session || locals.session.type !== 'teacher') return fail(401);

		const fd = await request.formData();
		const raw = fd.get('json')?.toString().trim();
		if (!raw) return fail(400, { importError: 'Kein JSON eingegeben.' });

		let rows: ExplanationImportRow[];
		try {
			const parsed = JSON.parse(raw);
			rows = Array.isArray(parsed) ? parsed : [parsed];
		} catch {
			return fail(400, { importError: 'Ungültiges JSON-Format.' });
		}

		if (rows.length === 0) return fail(400, { importError: 'Keine Einträge gefunden.' });
		if (rows.length > 1000) return fail(400, { importError: 'Maximal 1000 Erklärungen pro Import.' });

		const result = await importExplanations(rows);

		if (result.errors.length > 0) {
			return fail(422, {
				importError: `Import fehlgeschlagen: ${result.errors.slice(0, 5).join('; ')}`,
				errors: result.errors
			});
		}

		return { success: true, updated: result.updated, skipped: result.skipped };
	}
};
