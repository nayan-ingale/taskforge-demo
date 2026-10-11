import { describe, expect, it } from 'vitest';
import { TASK_STATUSES, type TaskStatus } from '@/domain/enums';
import { canTransition, transitionLabel } from '@/domain/transitions';

const LEGAL: ReadonlyArray<[TaskStatus, TaskStatus]> = [
  ['todo', 'in_progress'],
  ['in_progress', 'in_review'],
  ['in_progress', 'todo'],
  ['in_review', 'done'],
  ['in_review', 'in_progress'],
  ['done', 'in_progress'],
];

describe('task status transitions', () => {
  it('never allows staying in the same status', () => {
    for (const status of TASK_STATUSES) expect(canTransition(status, status)).toBe(false);
  });

  it('has a human label for every legal transition', () => {
    for (const [from, to] of LEGAL) {
      expect(transitionLabel(from, to)).not.toMatch(/^Move to /);
    }
    expect(transitionLabel('done', 'in_progress')).toBe('Reopen');
  });
});
