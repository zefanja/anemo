import { redirect, fail } from '@sveltejs/kit';
import { importTasks, type TaskImportRow } from '$lib/server/tasks/import.js';
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

		let rows: TaskImportRow[];
		try {
			const parsed = JSON.parse(raw);
			rows = Array.isArray(parsed) ? parsed : [parsed];
		} catch {
			return fail(400, { importError: 'Ungültiges JSON-Format.' });
		}

		if (rows.length === 0) return fail(400, { importError: 'Keine Aufgaben gefunden.' });
		if (rows.length > 500) return fail(400, { importError: 'Maximal 500 Aufgaben pro Import.' });

		const result = await importTasks(rows);

		if (result.errors.length > 0) {
			return fail(422, {
				importError: `Import fehlgeschlagen: ${result.errors.slice(0, 5).join('; ')}`,
				errors: result.errors
			});
		}

		return {
			success: true,
			inserted: result.inserted,
			skipped: result.skipped
		};
	}
};
