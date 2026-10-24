import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const cases = sqliteTable('cases', {
  id: text('id').primaryKey(), owner: text('owner').notNull(),
  title: text('title').notNull(), mode: text('mode').notNull(),
  document: text('document').notNull(), revision: integer('revision').notNull().default(0),
  updatedAt: text('updated_at').notNull(), lockToken: text('lock_token'),
  lockedUntil: integer('locked_until').notNull().default(0),
}, (t) => [index('cases_owner_updated').on(t.owner, t.updatedAt)]);

export const receipts = sqliteTable('receipts', {
  id: text('id').primaryKey(), caseId: text('case_id').notNull(), owner: text('owner').notNull(),
  provider: text('provider').notNull(), phase: text('phase').notNull(),
  request: text('request').notNull(), response: text('response'),
  status: integer('status'), createdAt: text('created_at').notNull(),
}, (t) => [index('receipts_owner_date').on(t.owner, t.createdAt)]);
