import {
	pgTable,
	text,
	integer,
	real,
	boolean,
	timestamp,
	jsonb,
	primaryKey,
	index,
	uniqueIndex,
	pgEnum
} from 'drizzle-orm/pg-core';

// ── Enums ─────────────────────────────────────────────────────────────────────

export const atomLevelEnum = pgEnum('atom_level', ['atom', 'cluster']);
export const edgeTypeEnum = pgEnum('edge_type', ['required', 'helpful', 'deepens']);
export const answerTypeEnum = pgEnum('answer_type', ['number', 'fraction', 'integer', 'text']);
export const badgeTypeEnum = pgEnum('badge_type', [
	'first_atom',
	'cluster_complete',
	'streak_7',
	'streak_30',
	'atoms_10',
	'atoms_50',
	'atoms_all'
]);

// ── Graph ─────────────────────────────────────────────────────────────────────

export const atoms = pgTable(
	'atoms',
	{
		id: text('id').primaryKey(),
		label: text('label').notNull(),
		description: text('description'),
		domain: text('domain').notNull(),
		subdomain: text('subdomain'),
		level: atomLevelEnum('level').notNull(),
		granularity: integer('granularity'),
		schulformen: jsonb('schulformen').$type<string[]>(),
		jahrgangsstufen: jsonb('jahrgangsstufen').$type<number[]>(),
		// weight fields
		masteryRequired: real('mastery_required').notNull().default(0.8),
		curriculumCentrality: real('curriculum_centrality').notNull().default(0.5),
		transferValue: real('transfer_value').notNull().default(0.5),
		cognitiveLoad: real('cognitive_load').notNull().default(0.5),
		// meta
		lehrplanRef: jsonb('lehrplan_ref'),
		related: jsonb('related'),
		tags: jsonb('tags').$type<string[]>(),
		status: text('status').notNull().default('draft'),
		createdBy: text('created_by'),
		version: integer('version').notNull().default(1)
	},
	(t) => [index('atoms_domain_idx').on(t.domain), index('atoms_level_idx').on(t.level)]
);

export const edges = pgTable(
	'edges',
	{
		sourceId: text('source_id')
			.notNull()
			.references(() => atoms.id, { onDelete: 'cascade' }),
		targetId: text('target_id')
			.notNull()
			.references(() => atoms.id, { onDelete: 'cascade' }),
		edgeType: edgeTypeEnum('edge_type').notNull(),
		masteryLevelNeeded: real('mastery_level_needed').notNull().default(0.8),
		note: text('note')
	},
	(t) => [
		primaryKey({ columns: [t.sourceId, t.targetId] }),
		index('edges_target_idx').on(t.targetId),
		index('edges_source_idx').on(t.sourceId)
	]
);

// ── School / Org ──────────────────────────────────────────────────────────────

export const school = pgTable('school', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// ── Teachers ──────────────────────────────────────────────────────────────────

export const teachers = pgTable('teachers', {
	id: text('id').primaryKey(),
	schoolId: text('school_id').references(() => school.id),
	email: text('email').notNull(),
	passwordHash: text('password_hash').notNull(),
	name: text('name'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const passwordResets = pgTable('password_resets', {
	token: text('token').primaryKey(),
	teacherId: text('teacher_id')
		.notNull()
		.references(() => teachers.id, { onDelete: 'cascade' }),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	usedAt: timestamp('used_at', { withTimezone: true })
});

// ── Classes ───────────────────────────────────────────────────────────────────

export const classes = pgTable('classes', {
	id: text('id').primaryKey(),
	schoolId: text('school_id').references(() => school.id),
	teacherId: text('teacher_id').references(() => teachers.id),
	name: text('name').notNull(),
	// which domains/atoms are enabled for this class (null = all)
	enabledDomains: jsonb('enabled_domains').$type<string[] | null>(),
	// session settings (null = use server defaults)
	sessionMaxTotal: integer('session_max_total'),
	sessionMaxReview: integer('session_max_review'),
	cognitiveWeight: real('cognitive_weight'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// ── Students ──────────────────────────────────────────────────────────────────

export const students = pgTable(
	'students',
	{
		id: text('id').primaryKey(),
		classId: text('class_id')
			.notNull()
			.references(() => classes.id),
		displayName: text('display_name').notNull(),
		codeHash: text('code_hash').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
		placementDone: boolean('placement_done').notNull().default(false)
	},
	(t) => [index('students_class_idx').on(t.classId)]
);

// rate limiting: failed login attempts per identifier (IP or student-id)
export const loginAttempts = pgTable(
	'login_attempts',
	{
		identifier: text('identifier').notNull(),
		attempts: integer('attempts').notNull().default(0),
		lockedUntil: timestamp('locked_until', { withTimezone: true }),
		lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [primaryKey({ columns: [t.identifier] })]
);

// ── Sessions ──────────────────────────────────────────────────────────────────

export const sessions = pgTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		// either studentId or teacherId is set, not both
		studentId: text('student_id').references(() => students.id, { onDelete: 'cascade' }),
		teacherId: text('teacher_id').references(() => teachers.id, { onDelete: 'cascade' }),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('sessions_student_idx').on(t.studentId), index('sessions_teacher_idx').on(t.teacherId)]
);

// ── Tasks (Aufgaben) ──────────────────────────────────────────────────────────

export const tasks = pgTable(
	'tasks',
	{
		id: text('id').primaryKey(),
		atomId: text('atom_id')
			.notNull()
			.references(() => atoms.id, { onDelete: 'cascade' }),
		// null = procedurally generated on-the-fly (template reference), non-null = imported static task
		prompt: text('prompt'),
		answerType: answerTypeEnum('answer_type').notNull().default('number'),
		correctAnswer: text('correct_answer'),
		distractors: jsonb('distractors').$type<string[]>(),
		hint: text('hint'),
		difficulty: real('difficulty'),
		// generator reference for procedural tasks
		generatorId: text('generator_id'),
		// content hash for idempotent import
		contentHash: text('content_hash'),
		importedAt: timestamp('imported_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('tasks_atom_idx').on(t.atomId),
		uniqueIndex('tasks_content_hash_idx').on(t.contentHash)
	]
);

// ── Student Atom Status (Mastery + FSRS) ──────────────────────────────────────

export const studentAtomStatus = pgTable(
	'student_atom_status',
	{
		studentId: text('student_id')
			.notNull()
			.references(() => students.id, { onDelete: 'cascade' }),
		atomId: text('atom_id')
			.notNull()
			.references(() => atoms.id, { onDelete: 'cascade' }),
		// mastery: rolling weighted ratio of correct answers (0–1)
		mastery: real('mastery').notNull().default(0),
		totalAttempts: integer('total_attempts').notNull().default(0),
		correctAttempts: integer('correct_attempts').notNull().default(0),
		// FSRS state (only set once atom is mastered)
		fsrsState: jsonb('fsrs_state'), // { stability, difficulty, due, lapses, reps, state }
		// derived: is this atom currently mastered?
		isMastered: boolean('is_mastered').notNull().default(false),
		// when mastery was first reached
		masteredAt: timestamp('mastered_at', { withTimezone: true }),
		lastPracticedAt: timestamp('last_practiced_at', { withTimezone: true }),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		// null = normal practice; 'placement_tested' = answered in placement test;
		// 'placement_propagated' = assumed mastered via graph back-propagation
		placementSource: text('placement_source')
	},
	(t) => [
		primaryKey({ columns: [t.studentId, t.atomId] }),
		index('sas_student_idx').on(t.studentId),
		index('sas_mastered_idx').on(t.studentId, t.isMastered)
	]
);

// ── Attempts ──────────────────────────────────────────────────────────────────

export const attempts = pgTable(
	'attempts',
	{
		id: text('id').primaryKey(),
		studentId: text('student_id')
			.notNull()
			.references(() => students.id, { onDelete: 'cascade' }),
		atomId: text('atom_id')
			.notNull()
			.references(() => atoms.id, { onDelete: 'cascade' }),
		taskId: text('task_id').references(() => tasks.id),
		isCorrect: boolean('is_correct').notNull(),
		// FSRS rating used (1=Again, 2=Hard, 3=Good, 4=Easy) — null for non-mastered
		fsrsRating: integer('fsrs_rating'),
		answeredAt: timestamp('answered_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('attempts_student_atom_idx').on(t.studentId, t.atomId),
		index('attempts_student_date_idx').on(t.studentId, t.answeredAt)
	]
);

// ── Gamification ──────────────────────────────────────────────────────────────

export const gamificationState = pgTable('gamification_state', {
	studentId: text('student_id')
		.primaryKey()
		.references(() => students.id, { onDelete: 'cascade' }),
	xp: integer('xp').notNull().default(0),
	level: integer('level').notNull().default(1),
	streakDays: integer('streak_days').notNull().default(0),
	streakLastDate: text('streak_last_date'), // ISO date string YYYY-MM-DD
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const badges = pgTable(
	'badges',
	{
		studentId: text('student_id')
			.notNull()
			.references(() => students.id, { onDelete: 'cascade' }),
		badgeType: badgeTypeEnum('badge_type').notNull(),
		awardedAt: timestamp('awarded_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [primaryKey({ columns: [t.studentId, t.badgeType] })]
);
