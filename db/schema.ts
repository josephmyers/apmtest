import { sql } from 'drizzle-orm';
import { boolean, doublePrecision, integer, jsonb, pgTable, varchar, text, timestamp, serial } from 'drizzle-orm/pg-core';

export const teams = pgTable('teams', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).unique().notNull(),
    passwordHash: varchar('password_hash', { length: 255 }),
    teamIds: integer('team_ids').array().notNull().default(sql`'{}'::int[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const projects = pgTable('projects', {
    id: serial('id').primaryKey(),
    teamId: integer('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    flags: jsonb('flags').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const sections = pgTable('sections', {
    id: serial('id').primaryKey(),
    projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const passages = pgTable('passages', {
    id: serial('id').primaryKey(),
    sectionId: integer('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
    reference: varchar('reference', { length: 255 }).notNull(),
    description: text('description').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    audioKey: varchar('audio_key', { length: 255 }),
    unversionedRendering: varchar('unversioned_rendering', { length: 255 }),
    speaker: varchar('speaker', { length: 255 }),
    currentStep: integer('current_step').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const speakers = pgTable('speakers', {
    name: varchar('name', { length: 255 }).primaryKey(),
});

export const passageVersions = pgTable('passage_versions', {
    id: serial('id').primaryKey(),
    passageId: integer('passage_id').notNull().references(() => passages.id, { onDelete: 'cascade' }),
    audioKey: varchar('audio_key', { length: 255 }).notNull(),
    renderSource: varchar('render_source', { length: 255 }),
    note: varchar('note', { length: 255 }).notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const replacements = pgTable('replacements', {
    id: serial('id').primaryKey(),
    passageId: integer('passage_id').notNull().references(() => passages.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    note: varchar('note', { length: 255 }).notNull().default(''),
    name: varchar('name', { length: 255 }).notNull().default(''),
    selectionStart: doublePrecision('selection_start'),
    selectionEnd: doublePrecision('selection_end'),
    audioKey: varchar('audio_key', { length: 255 }),
    original: boolean('original').notNull().default(true),
    versionId: integer('version_id').references(() => passageVersions.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const questions = pgTable('questions', {
    id: serial('id').primaryKey(),
    passageId: integer('passage_id').notNull().references(() => passages.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull().default(''),
    selectionStart: doublePrecision('selection_start').notNull(),
    selectionEnd: doublePrecision('selection_end').notNull(),
    audioKey: varchar('audio_key', { length: 255 }),
    sortOrder: integer('sort_order'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const answers = pgTable('answers', {
    id: serial('id').primaryKey(),
    questionId: integer('question_id').notNull().unique().references(() => questions.id, { onDelete: 'cascade' }),
    speaker: varchar('speaker', { length: 255 }).notNull().default(''),
    audioKey: varchar('audio_key', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});