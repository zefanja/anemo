import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
	// /teacher/login is public
	if (url.pathname === '/teacher/login' || url.pathname === '/teacher/password-reset') {
		return {};
	}
	if (!locals.session || locals.session.type !== 'teacher') {
		throw redirect(303, `/teacher/login?next=${encodeURIComponent(url.pathname)}`);
	}
	return {
		teacherId: locals.session.teacherId,
		teacherEmail: locals.session.teacherEmail,
		isAdmin: locals.session.isAdmin
	};
};
