import { PRIORITY_LABELS, STATUS_LABELS, type TaskPriority, type TaskStatus } from '@/domain/enums';

const STATUS_STYLES: Record<TaskStatus, string> = {
  todo: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-800',
  in_review: 'bg-amber-100 text-amber-800',
  done: 'bg-emerald-100 text-emerald-800',
};

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-sky-100 text-sky-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
};

const BASE = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`${BASE} ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span className={`${BASE} ${PRIORITY_STYLES[priority]}`}>{PRIORITY_LABELS[priority]}</span>
  );
}
