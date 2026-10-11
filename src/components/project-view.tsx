'use client';

// The /projects/[id] screen: dashboard cards, create form (members and admins) and task list.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { can } from '@/domain/permissions';
import { apiClient, errorMessage } from '@/lib/api-client';
import type { Project, User } from '@/lib/api-types';
import { CreateTaskForm } from './create-task-form';
import { DashboardCards } from './dashboard-cards';
import { TaskList } from './task-list';

export interface ProjectViewProps {
  projectId: string;
  currentUser: User;
}

export function ProjectView({ projectId, currentUser }: ProjectViewProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    apiClient.getProject(projectId).then(
      (data) => {
        if (active) setProject(data);
      },
      (error: unknown) => {
        if (active) setLoadError(errorMessage(error));
      },
    );
    apiClient.listUsers().then(
      (data) => {
        if (active) setUsers(data);
      },
      () => undefined, // assignee names are optional; the page still works without them
    );
    return () => {
      active = false;
    };
  }, [projectId]);

  if (loadError) {
    return (
      <div role="alert" className="space-y-3">
        <p className="text-red-700">{loadError}</p>
        <Link href="/projects" className="text-indigo-700 hover:underline">
          Back to projects
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projects" className="text-sm text-indigo-700 hover:underline">
          ← Projects
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          {project ? (
            <>
              <span className="mr-2 font-mono text-slate-500">{project.key}</span>
              {project.name}
            </>
          ) : (
            'Loading project…'
          )}
        </h1>
        {project?.description && <p className="mt-1 text-slate-600">{project.description}</p>}
      </div>

      <DashboardCards projectId={projectId} refreshKey={refreshKey} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <TaskList projectId={projectId} refreshKey={refreshKey} users={users} />
        {can(currentUser.role, 'task:create') && (
          <CreateTaskForm
            projectId={projectId}
            users={users}
            onCreated={() => setRefreshKey((value) => value + 1)}
          />
        )}
      </div>
    </div>
  );
}
