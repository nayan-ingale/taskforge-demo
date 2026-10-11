'use client';

// The /projects screen.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiClient, errorMessage } from '@/lib/api-client';
import type { Project } from '@/lib/api-types';
import { secondaryButtonClass } from './styles';

type LoadResult = { key: number; data: Project[] } | { key: number; error: string };

export function ProjectList() {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);

  useEffect(() => {
    let active = true;
    apiClient.listProjects().then(
      (data) => {
        if (active) setResult({ key: attempt, data });
      },
      (error: unknown) => {
        if (active) setResult({ key: attempt, error: errorMessage(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  const current = result?.key === attempt ? result : null;

  if (!current) {
    return (
      <p role="status" className="text-sm text-slate-500">
        Loading projects…
      </p>
    );
  }
  if ('error' in current) {
    return (
      <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm">
        <p className="text-red-800">Could not load projects: {current.error}</p>
        <button
          type="button"
          className={`${secondaryButtonClass} mt-3`}
          onClick={() => setAttempt((value) => value + 1)}
        >
          Retry
        </button>
      </div>
    );
  }
  if (current.data.length === 0) {
    return <p className="text-sm text-slate-500">No projects yet.</p>;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {current.data.map((project) => (
        <li key={project.id}>
          <Link
            href={`/projects/${project.id}`}
            className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-300"
          >
            <span className="font-mono text-sm text-slate-500">{project.key}</span>
            <span className="mt-1 block text-lg font-semibold text-slate-900">{project.name}</span>
            <span className="mt-1 block text-sm text-slate-600">{project.description}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
