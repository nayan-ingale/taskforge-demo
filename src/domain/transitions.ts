// The task workflow. This is the ONLY place that decides which status changes are legal;
// the API (task-service) and the UI (transition buttons) both read from here.
import type { TaskStatus } from './enums';

const TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  todo: ['in_progress', 'done'],
  in_progress: ['in_review', 'todo'],
  in_review: ['done', 'in_progress'],
  done: ['in_progress'],
};

const TRANSITION_LABELS: Readonly<Partial<Record<`${TaskStatus}->${TaskStatus}`, string>>> = {
  'todo->in_progress': 'Start work',
  'in_progress->in_review': 'Submit for review',
  'in_progress->todo': 'Move back to To do',
  'in_review->done': 'Mark as done',
  'in_review->in_progress': 'Request changes',
  'done->in_progress': 'Reopen',
};

/** Statuses a task in `from` may move to, in display order. */
export function allowedTransitions(from: TaskStatus): readonly TaskStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Human-readable button label for a legal transition. */
export function transitionLabel(from: TaskStatus, to: TaskStatus): string {
  return TRANSITION_LABELS[`${from}->${to}`] ?? `Move to ${to}`;
}
