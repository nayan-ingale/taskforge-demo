'use client';

// Count cards for a project (GET /api/projects/:id/dashboard).
import { useEffect, useState } from 'react';
import { STATUS_LABELS, TASK_STATUSES } from '@/domain/enums';
import { apiClient, errorMessage } from '@/lib/api-client';
import type { Dashboard } from '@/lib/api-types';
import { secondaryButtonClass } from './styles';

export interface DashboardCardsProps {
  projectId: string;
  /** Change this value to force a reload. */
  refreshKey?: number;
}

type LoadResult = { key: string; data: Dashboard } | { key: string; error: string };

export function DashboardCards({ projectId, refreshKey = 0 }: DashboardCardsProps) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  const requestKey = JSON.stringify([projectId, refreshKey, attempt]);

  useEffect(() => {
    let active = true;
    apiClient.getDashboard(projectId).then(
      (data) => {
        if (active) setResult({ key: requestKey, data });
      },
      (error: unknown) => {
        if (active) setResult({ key: requestKey, error: errorMessage(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [requestKey, projectId]);

  const current = result?.key === requestKey ? result : null;

  if (current && 'error' in current) {
    return (
      <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm">
        <p className="text-red-800">Could not load the dashboard: {current.error}</p>
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

  const data = current?.data;
  const cards: { label: string; value: number | undefined; tone?: string }[] = [
    { label: 'Total', value: data?.total },
    ...TASK_STATUSES.map((status) => ({
      label: STATUS_LABELS[status],
      value: data?.byStatus[status],
    })),
    { label: 'Overdue', value: data?.overdue, tone: 'text-red-700' },
  ];

  return (
    <section aria-label="Dashboard" aria-busy={!data}>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
          >
            <dt className="text-xs font-medium uppercase text-slate-500">{card.label}</dt>
            <dd className={`mt-1 text-2xl font-semibold ${card.tone ?? 'text-slate-900'}`}>
              {card.value ?? '…'}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
