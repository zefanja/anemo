#!/usr/bin/env tsx
/**
 * Seed script: imports the graph, creates the school, a demo teacher,
 * one demo class and three demo students (prints their codes).
 *
 * Safe to re-run: skips already-existing records.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { config } from 'dotenv';
import bcrypt from 'bcryptjs';
import { randomBytes, createHmac } from 'node:crypto';
import { execSync } from 'node:child_process';

config({ path: '.env' });

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function makeId(): string {
	return randomBytes(12).toString('hex');
}

function generateCode(): string {
	const arr = new Uint8Array(6);
	crypto.getRandomValues(arr);
	return Array.from(arr).map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

async function seed() {
	if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is required (student codes are hashed with it)');
	const client = postgres(process.env.DATABASE_URL!);
	const db = drizzle(client, { schema });

	// ── 1. Run graph import ────────────────────────────────────────────────────
	console.log('Running graph import...');
	try {
		execSync('npm run import-graph', { stdio: 'inherit' });
	} catch {
		console.error('Graph import failed. Aborting seed.');
		process.exit(1);
	}

	// ── 2. School ─────────────────────────────────────────────────────────────
	let school = await db.query.school.findFirst();
	if (!school) {
		const id = makeId();
		await db.insert(schema.school).values({ id, name: 'Demo-Schule' });
		school = { id, name: 'Demo-Schule', createdAt: new Date() };
		console.log('Created school:', school.name);
	} else {
		console.log('School already exists:', school.name);
	}

	// ── 3. Teacher ────────────────────────────────────────────────────────────
	const teacherEmail = 'lehrer@demo.local';
	const teacherPassword = 'Demo1234!';

	let teacher = await db.query.teachers.findFirst({
		where: (t, { eq }) => eq(t.email, teacherEmail)
	});
	if (!teacher) {
		const id = makeId();
		const passwordHash = await bcrypt.hash(teacherPassword, 12);
		await db.insert(schema.teachers).values({
			id,
			schoolId: school.id,
			email: teacherEmail,
			passwordHash,
			name: 'Demo Lehrer/in'
		});
		teacher = { id, schoolId: school.id, email: teacherEmail, passwordHash, name: 'Demo Lehrer/in', createdAt: new Date() };
		console.log(`Created teacher: ${teacherEmail} / ${teacherPassword}`);
	} else {
		console.log('Teacher already exists:', teacherEmail);
	}

	// ── 4. Class ──────────────────────────────────────────────────────────────
	const className = 'Demo-Klasse 5a';
	let cls = await db.query.classes.findFirst({
		where: (c, { eq }) => eq(c.name, className)
	});
	if (!cls) {
		const id = makeId();
		await db.insert(schema.classes).values({
			id,
			schoolId: school.id,
			teacherId: teacher.id,
			name: className,
			enabledDomains: ['arithmetik']
		});
		cls = { id, schoolId: school.id, teacherId: teacher.id, name: className, enabledDomains: ['arithmetik'], sessionMaxTotal: null, sessionMaxReview: null, cognitiveWeight: null, createdAt: new Date() };
		console.log('Created class:', className);
	} else {
		console.log('Class already exists:', className);
	}

	// ── 5. Students ───────────────────────────────────────────────────────────
	const demoStudents = ['Anna M.', 'Ben K.', 'Caro S.'];
	console.log('\nDemo students:');

	for (const name of demoStudents) {
		const existing = await db.query.students.findFirst({
			where: (s, { and, eq }) => and(eq(s.classId, cls!.id), eq(s.displayName, name))
		});
		if (existing) {
			console.log(`  ${name}: already exists`);
			continue;
		}

		const code = generateCode();
		// must match src/lib/server/auth/codes.ts (HMAC-SHA256 keyed with SESSION_SECRET)
		const codeHash = createHmac('sha256', process.env.SESSION_SECRET!).update(code).digest('hex');
		await db.insert(schema.students).values({
			id: makeId(),
			classId: cls.id,
			displayName: name,
			codeHash
		});

		// Also seed gamification state
		const newStudent = await db.query.students.findFirst({
			where: (s, { and, eq }) => and(eq(s.classId, cls!.id), eq(s.displayName, name))
		});
		if (newStudent) {
			await db.insert(schema.gamificationState).values({
				studentId: newStudent.id,
				xp: 0,
				level: 1,
				streakDays: 0
			}).onConflictDoNothing();
		}

		console.log(`  ${name}: code = ${code}`);
	}

	await client.end();
	console.log('\n✓ Seed complete. App bereit zum Testen.');
	console.log(`  Lehrer-Login:  ${teacherEmail} / ${teacherPassword}`);
	console.log('  Schüler-Login: /login (Codes siehe oben)');
}

seed().catch((err) => {
	console.error(err);
	process.exit(1);
});
