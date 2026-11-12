import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const sql = postgres(url, { max: 1 });

// Transform DDL statements so they never fail because something already exists.
function makeIdempotent(stmt) {
  const s = stmt.trim();

  // Statements with no IF NOT EXISTS support → wrap in DO block catching duplicate_object.
  if (
    /^CREATE TYPE\s+.+?\s+AS ENUM\s*\(/is.test(s) ||
    /\bADD CONSTRAINT\b/i.test(s)
  ) {
    const body = s.replace(/;?\s*$/, '');
    return `DO $$ BEGIN ${body}; EXCEPTION WHEN duplicate_object THEN NULL; END $$`;
  }

  return s
    .replace(/\bADD VALUE '([^']+)'/g,              "ADD VALUE IF NOT EXISTS '$1'")
    .replace(/\bCREATE UNIQUE INDEX\b(?!\s+IF)/g,   'CREATE UNIQUE INDEX IF NOT EXISTS')
    .replace(/\bCREATE INDEX\b(?!\s+IF)/g,          'CREATE INDEX IF NOT EXISTS')
    .replace(/\bADD COLUMN\b(?!\s+IF)/g,            'ADD COLUMN IF NOT EXISTS')
    .replace(/\bCREATE TABLE\b(?!\s+IF)/g,          'CREATE TABLE IF NOT EXISTS')
    .replace(/\bCREATE SCHEMA\b(?!\s+IF)/g,         'CREATE SCHEMA IF NOT EXISTS');
}

try {
  // Ensure the tracking table exists (same schema as drizzle-kit).
  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS drizzle."__drizzle_migrations" (
      id serial PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  const applied = new Set(
    (await sql`SELECT hash FROM drizzle."__drizzle_migrations"`).map((r) => r.hash)
  );

  const dir = resolve('./drizzle');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  let count = 0;
  for (const file of files) {
    const content = await readFile(join(dir, file), 'utf8');
    // Same hash drizzle-kit uses – already-applied migrations are skipped.
    const hash = createHash('sha256').update(content).digest('hex');

    if (applied.has(hash)) {
      console.log(`  skip:    ${file}`);
      continue;
    }

    console.log(`  running: ${file}`);
    const statements = content
      .split('--> statement-breakpoint')
      .map((s) => makeIdempotent(s.trim()))
      .filter(Boolean);

    for (const stmt of statements) {
      await sql.unsafe(stmt);
    }

    await sql`
      INSERT INTO drizzle."__drizzle_migrations" (hash, created_at)
      VALUES (${hash}, ${Date.now()})
    `;
    count++;
  }

  console.log(`✓ ${count} migration(s) applied`);
} finally {
  await sql.end();
}
