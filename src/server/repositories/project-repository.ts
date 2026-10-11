// Data access for projects.
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { projects, type ProjectRow } from '../db/schema';

export async function findProjectById(db: Db, id: string): Promise<ProjectRow | undefined> {
  const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return row;
}

export async function findProjectByKey(db: Db, key: string): Promise<ProjectRow | undefined> {
  const [row] = await db.select().from(projects).where(eq(projects.key, key)).limit(1);
  return row;
}

export async function listProjects(db: Db): Promise<ProjectRow[]> {
  return db.select().from(projects).orderBy(asc(projects.key));
}

export async function insertProject(
  db: Db,
  values: { key: string; name: string; description: string; createdAt: Date },
): Promise<ProjectRow> {
  const [row] = await db.insert(projects).values(values).returning();
  if (!row) throw new Error('insert into projects returned no row');
  return row;
}
