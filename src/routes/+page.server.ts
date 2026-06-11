import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.session?.type === 'student') throw redirect(303, '/practice');
	if (locals.session?.type === 'teacher') throw redirect(303, '/teacher/dashboard');
	throw redirect(303, '/login');
};
