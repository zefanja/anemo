import { relations } from 'drizzle-orm';
import {
	atoms,
	edges,
	school,
	teachers,
	classes,
	students,
	sessions,
	tasks,
	studentAtomStatus,
	attempts,
	gamificationState,
	badges,
	passwordResets,
	loginAttempts
} from './schema.js';

export const atomsRelations = relations(atoms, ({ many }) => ({
	outgoingEdges: many(edges, { relationName: 'source' }),
	incomingEdges: many(edges, { relationName: 'target' }),
	tasks: many(tasks),
	studentStatuses: many(studentAtomStatus)
}));

export const edgesRelations = relations(edges, ({ one }) => ({
	source: one(atoms, { fields: [edges.sourceId], references: [atoms.id], relationName: 'source' }),
	target: one(atoms, { fields: [edges.targetId], references: [atoms.id], relationName: 'target' })
}));

export const schoolRelations = relations(school, ({ many }) => ({
	teachers: many(teachers),
	classes: many(classes)
}));

export const teachersRelations = relations(teachers, ({ one, many }) => ({
	school: one(school, { fields: [teachers.schoolId], references: [school.id] }),
	classes: many(classes),
	passwordResets: many(passwordResets)
}));

export const passwordResetsRelations = relations(passwordResets, ({ one }) => ({
	teacher: one(teachers, { fields: [passwordResets.teacherId], references: [teachers.id] })
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
	school: one(school, { fields: [classes.schoolId], references: [school.id] }),
	teacher: one(teachers, { fields: [classes.teacherId], references: [teachers.id] }),
	students: many(students)
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
	class: one(classes, { fields: [students.classId], references: [classes.id] }),
	sessions: many(sessions),
	atomStatuses: many(studentAtomStatus),
	attempts: many(attempts),
	gamification: one(gamificationState),
	badges: many(badges)
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
	student: one(students, { fields: [sessions.studentId], references: [students.id] }),
	teacher: one(teachers, { fields: [sessions.teacherId], references: [teachers.id] })
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
	atom: one(atoms, { fields: [tasks.atomId], references: [atoms.id] }),
	attempts: many(attempts)
}));

export const studentAtomStatusRelations = relations(studentAtomStatus, ({ one }) => ({
	student: one(students, { fields: [studentAtomStatus.studentId], references: [students.id] }),
	atom: one(atoms, { fields: [studentAtomStatus.atomId], references: [atoms.id] })
}));

export const attemptsRelations = relations(attempts, ({ one }) => ({
	student: one(students, { fields: [attempts.studentId], references: [students.id] }),
	atom: one(atoms, { fields: [attempts.atomId], references: [atoms.id] }),
	task: one(tasks, { fields: [attempts.taskId], references: [tasks.id] })
}));

export const gamificationStateRelations = relations(gamificationState, ({ one, many }) => ({
	student: one(students, { fields: [gamificationState.studentId], references: [students.id] }),
	badges: many(badges)
}));

export const badgesRelations = relations(badges, ({ one }) => ({
	student: one(students, { fields: [badges.studentId], references: [students.id] })
}));
