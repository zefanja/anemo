import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	// /teacher/login is public
	if (url.pathname === '/teacher/login' || url.pathname.startsWith('/teacher/password-reset')) {
		return {};
	}
	if (!locals.session || locals.session.type !== 'teacher') {
		throw redirect(303, `/teacher/login?next=${encodeURIComponent(url.pathname)}`);
	}
	const { teacherId } = locals.session;

	// Class list for the sidebar sub-navigation
	const navClasses = await db.query.classes.findMany({
		where: (c, { eq }) => eq(c.teacherId, teacherId),
		orderBy: (c, { asc }) => [asc(c.name)],
		columns: { id: true, name: true }
	});

	return {
		teacherId,
		teacherEmail: locals.session.teacherEmail,
		isAdmin: locals.session.isAdmin,
		navClasses
	};
};
