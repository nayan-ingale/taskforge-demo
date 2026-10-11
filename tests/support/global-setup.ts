// Vitest globalSetup for the `node` project: builds the seeded database image once per run and
// hands its path to the test workers (read by tests/support/harness.ts via `inject`).
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TestProject } from 'vitest/node';
import { buildSeededDatabaseImage } from './seeded-database';

declare module 'vitest' {
  export interface ProvidedContext {
    seededDatabaseImage: string;
  }
}

export default async function setup(project: TestProject) {
  const dir = await mkdtemp(path.join(tmpdir(), 'taskforge-test-'));
  const file = path.join(dir, 'seeded-db.tar');
  const image = await buildSeededDatabaseImage();
  await writeFile(file, Buffer.from(await image.arrayBuffer()));
  project.provide('seededDatabaseImage', file);
  return async () => {
    await rm(dir, { recursive: true, force: true });
  };
}
