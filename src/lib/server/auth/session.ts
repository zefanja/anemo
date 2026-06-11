import { db } from '../db/index.js';
import { sessions } from '../db/schema.js';
import { eq, lt } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';

const SESSION_COOKIE = 'anemo_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(
	event: RequestEvent,
	payload: { studentId: string } | { teacherId: string }
): Promise<void> {
	const id = randomBytes(32).toString('hex');
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

	await db.insert(sessions).values({
		id,
		studentId: 'studentId' in payload ? payload.studentId : null,
		teacherId: 'teacherId' in payload ? payload.teacherId : null,
		expiresAt
	});

	event.cookies.set(SESSION_COOKIE, id, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: (process as NodeJS.Process).env.NODE_ENV === 'production',
		maxAge: SESSION_TTL_MS / 1000
	});
}

export async function destroySession(event: RequestEvent): Promise<void> {
	const id = event.cookies.get(SESSION_COOKIE);
	if (id) {
		await db.delete(sessions).where(eq(sessions.id, id));
	}
	event.cookies.delete(SESSION_COOKIE, { path: '/' });
}

export async function resolveSession(event: RequestEvent): Promise<App.Locals['session']> {
	const id = event.cookies.get(SESSION_COOKIE);
	if (!id) return null;

	const rows = await db.query.sessions.findFirst({
		where: (s, { and, gt }) => and(eq(s.id, id), gt(s.expiresAt, new Date())),
		with: {
			// resolved via relations defined below
		}
	});

	if (!rows) return null;

	if (rows.studentId) {
		const student = await db.query.students.findFirst({
			where: (s, { eq }) => eq(s.id, rows.studentId!),
			with: { class: true }
		});
		if (!student) return null;
		return {
			type: 'student',
			studentId: student.id,
			studentName: student.displayName,
			classId: student.classId
		};
	}

	if (rows.teacherId) {
		const teacher = await db.query.teachers.findFirst({
			where: (t, { eq }) => eq(t.id, rows.teacherId!)
		});
		if (!teacher) return null;
		return { type: 'teacher', teacherId: teacher.id, teacherEmail: teacher.email };
	}

	return null;
}

// call periodically or on startup to prune old sessions
export async function pruneExpiredSessions(): Promise<void> {
	await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
