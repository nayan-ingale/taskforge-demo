import { describe, expect, it } from 'vitest';
import { TASK_STATUSES, type TaskStatus } from '@/domain/enums';
import { allowedTransitions, canTransition, transitionLabel } from '@/domain/transitions';

const LEGAL: ReadonlyArray<[TaskStatus, TaskStatus]> = [
  ['todo', 'in_progress'],
  ['in_progress', 'in_review'],
  ['in_progress', 'todo'],
  ['in_review', 'done'],
  ['in_review', 'in_progress'],
  ['done', 'in_progress'],
];

const isLegal = (from: TaskStatus, to: TaskStatus) =>
  LEGAL.some(([legalFrom, legalTo]) => legalFrom === from && legalTo === to);

describe('task status transitions', () => {
  const allPairs = TASK_STATUSES.flatMap((from) => TASK_STATUSES.map((to) => [from, to] as const));

  it.each(allPairs)('%s -> %s matches the workflow table', (from, to) => {
    expect(canTransition(from, to)).toBe(isLegal(from, to));
  });

  it('never allows staying in the same status', () => {
    for (const status of TASK_STATUSES) expect(canTransition(status, status)).toBe(false);
  });

  it('does not allow skipping review (todo -> done, in_progress -> done)', () => {
    expect(canTransition('todo', 'done')).toBe(false);
    expect(canTransition('in_progress', 'done')).toBe(false);
    expect(canTransition('todo', 'in_review')).toBe(false);
  });

  it('lists allowed targets per status', () => {
    expect(allowedTransitions('todo')).toEqual(['in_progress']);
    expect(allowedTransitions('in_progress')).toEqual(['in_review', 'todo']);
    expect(allowedTransitions('in_review')).toEqual(['done', 'in_progress']);
    expect(allowedTransitions('done')).toEqual(['in_progress']);
  });

  it('has a human label for every legal transition', () => {
    for (const [from, to] of LEGAL) {
      expect(transitionLabel(from, to)).not.toMatch(/^Move to /);
    }
    expect(transitionLabel('done', 'in_progress')).toBe('Reopen');
  });
});
