// Project use cases.
import { isUuid } from '@/domain/ids';
import { createProjectSchema } from '@/domain/project-validation';
import type { Project } from '@/lib/api-types';
import { conflict, notFound, parseOrThrow } from '../errors';
import {
  findProjectById,
  findProjectByKey,
  insertProject,
  listProjects as listProjectRows,
} from '../repositories/project-repository';
import { authorize, type ServiceContext } from './context';
import { toProjectDto } from './dto';

/** GET /api/projects — ordered by key. */
export async function listProjects(ctx: ServiceContext): Promise<Project[]> {
  authorize(ctx, 'project:read');
  const rows = await listProjectRows(ctx.db);
  return rows.map(toProjectDto);
}

/** GET /api/projects/:id */
export async function getProject(ctx: ServiceContext, projectId: string): Promise<Project> {
  authorize(ctx, 'project:read');
  const project = isUuid(projectId) ? await findProjectById(ctx.db, projectId) : undefined;
  if (!project) throw notFound('Project not found');
  return toProjectDto(project);
}

/** POST /api/projects — admin only; keys are unique. */
export async function createProject(ctx: ServiceContext, body: unknown): Promise<Project> {
  authorize(ctx, 'project:create');
  const input = parseOrThrow(createProjectSchema, body);
  if (await findProjectByKey(ctx.db, input.key)) {
    throw conflict(`A project with key ${input.key} already exists`);
  }
  const row = await insertProject(ctx.db, { ...input, createdAt: ctx.now() });
  return toProjectDto(row);
}
