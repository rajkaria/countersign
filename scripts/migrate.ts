import { readFile, readdir } from 'node:fs/promises';
import { database, transaction } from '../src/lib/server/db';
const pool=database();
try {
 await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
 for (const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort()) {
  const version=file.slice(0,-4);
  await transaction(async db=>{
   await db.query('SELECT pg_advisory_xact_lock(71983018)');
   if((await db.query('SELECT 1 FROM schema_migrations WHERE version=$1',[version])).rows.length) return;
   await db.query(await readFile(`migrations/${file}`,'utf8'));
   console.log(`Applied ${version}`);
  });
 }
} finally {await pool.end();}
