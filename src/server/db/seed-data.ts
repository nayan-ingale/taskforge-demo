// Deterministic demo data. Every id and timestamp is fixed so that tests, docs and screenshots
// can refer to them. Tests import these through tests/support/fixtures.ts.
//
// Id scheme (all valid UUIDs): 1xxxxxxx = users, 2xxxxxxx = projects, 3xxxxxxx = tasks.
import type { TaskPriority, TaskStatus, UserRole } from '@/domain/enums';

export const USER_IDS = {
  alice: '10000000-0000-4000-8000-000000000001',
  bob: '10000000-0000-4000-8000-000000000002',
  vera: '10000000-0000-4000-8000-000000000003',
} as const;

export type DemoUserKey = keyof typeof USER_IDS;

export const PROJECT_IDS = {
  web: '20000000-0000-4000-8000-000000000001',
  mobile: '20000000-0000-4000-8000-000000000002',
} as const;

export interface SeedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export const SEED_USERS: readonly SeedUser[] = [
  { id: USER_IDS.alice, name: 'Alice Admin', email: 'alice@taskforge.test', role: 'admin' },
  { id: USER_IDS.bob, name: 'Bob Member', email: 'bob@taskforge.test', role: 'member' },
  { id: USER_IDS.vera, name: 'Vera Viewer', email: 'vera@taskforge.test', role: 'viewer' },
];

export interface SeedProject {
  id: string;
  key: string;
  name: string;
  description: string;
  createdAt: string;
}

export const SEED_PROJECTS: readonly SeedProject[] = [
  {
    id: PROJECT_IDS.web,
    key: 'WEB',
    name: 'Website Redesign',
    description: 'Marketing site and customer portal refresh.',
    createdAt: '2026-08-25T09:00:00.000Z',
  },
  {
    id: PROJECT_IDS.mobile,
    key: 'MOB',
    name: 'Mobile App',
    description: 'iOS and Android apps built with React Native.',
    createdAt: '2026-08-26T09:00:00.000Z',
  },
];

export interface SeedTask {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  dueDate: string | null;
  estimateHours: number | null;
  createdAt: string;
  /** Set for archived (soft-deleted) tasks, which must never appear in lists, counts or search. */
  archivedAt: string | null;
}

const { alice, bob, vera } = USER_IDS;
const { web, mobile } = PROJECT_IDS;

/** Id of seeded task number `n` (1-30), e.g. seedTaskId(3) = '30000000-0000-4000-8000-000000000003'. */
export function seedTaskId(n: number): string {
  return `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

const taskId = seedTaskId;

/**
 * 30 tasks: WEB has 18 visible + 2 archived, MOB has 9 visible + 1 archived.
 * Notable cases (relative to the default test clock 2026-10-20):
 * - overdue (due before 2026-10-20, not done): tasks 3, 7, 15 (WEB) and 22, 25 (MOB);
 * - due today (not overdue): task 10; done with a past due date (not overdue): tasks 1, 2, 11, 23, 29;
 * - tasks 12 and 13 share the same createdAt, so the list order falls back to id DESC;
 * - "login" appears in mixed case in titles/descriptions of tasks 3, 4, 15 (WEB), 24 (MOB)
 *   and in archived tasks 19 and 30, which search must not return;
 * - tasks 8 and 9 contain the LIKE wildcards "%" and "_" literally.
 */
export const SEED_TASKS: readonly SeedTask[] = [
  // --- WEB: Website Redesign ---------------------------------------------------------------
  {
    id: taskId(1),
    projectId: web,
    title: 'Set up design tokens',
    description: 'Colors, spacing and typography tokens shared by web and mobile.',
    status: 'done',
    priority: 'medium',
    assigneeId: alice,
    dueDate: '2026-09-20',
    estimateHours: 5,
    createdAt: '2026-09-01T09:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(2),
    projectId: web,
    title: 'Build responsive header',
    description: 'Collapsible navigation for small screens.',
    status: 'done',
    priority: 'high',
    assigneeId: bob,
    dueDate: '2026-09-25',
    estimateHours: 8,
    createdAt: '2026-09-02T09:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(3),
    projectId: web,
    title: 'Login page redesign',
    description: 'New layout for the sign-in form with SSO buttons.',
    status: 'in_review',
    priority: 'high',
    assigneeId: bob,
    dueDate: '2026-10-18',
    estimateHours: 6,
    createdAt: '2026-09-03T09:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(4),
    projectId: web,
    title: 'Password reset email template',
    description: 'Copy and layout for the reset flow that starts on the LOGIN screen.',
    status: 'in_progress',
    priority: 'medium',
    assigneeId: alice,
    dueDate: '2026-10-25',
    estimateHours: 3,
    createdAt: '2026-09-04T09:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(5),
    projectId: web,
    title: 'Footer links audit',
    description: null,
    status: 'todo',
    priority: 'low',
    assigneeId: null,
    dueDate: null,
    estimateHours: null,
    createdAt: '2026-09-05T09:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(6),
    projectId: web,
    title: 'Pricing page A/B test',
    description: 'Compare annual-first and monthly-first pricing tables.',
    status: 'todo',
    priority: 'high',
    assigneeId: bob,
    dueDate: '2026-11-10',
    estimateHours: 13,
    createdAt: '2026-09-06T09:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(7),
    projectId: web,
    title: 'Fix layout shift on blog images',
    description: 'Reserve space for images so the page does not jump while loading.',
    status: 'in_progress',
    priority: 'urgent',
    assigneeId: bob,
    dueDate: '2026-10-15',
    estimateHours: 2,
    createdAt: '2026-09-08T09:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(8),
    projectId: web,
    title: 'Show 100% width banner on mobile',
    description: 'The promo banner should span the full viewport.',
    status: 'todo',
    priority: 'medium',
    assigneeId: null,
    dueDate: '2026-11-01',
    estimateHours: 1,
    createdAt: '2026-09-09T09:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(9),
    projectId: web,
    title: 'Rename user_id column in CSV exports',
    description: 'Customers expect the column to be called customer id.',
    status: 'todo',
    priority: 'low',
    assigneeId: alice,
    dueDate: null,
    estimateHours: 2,
    createdAt: '2026-09-10T09:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(10),
    projectId: web,
    title: 'Accessibility pass on forms',
    description: 'Labels, focus order and error announcements.',
    status: 'in_review',
    priority: 'high',
    assigneeId: alice,
    dueDate: '2026-10-20',
    estimateHours: 8,
    createdAt: '2026-09-11T09:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(11),
    projectId: web,
    title: 'Cookie consent banner',
    description: 'Only load analytics after consent.',
    status: 'done',
    priority: 'urgent',
    assigneeId: bob,
    dueDate: '2026-10-01',
    estimateHours: 5,
    createdAt: '2026-09-12T09:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(12),
    projectId: web,
    title: 'Add sitemap.xml',
    description: null,
    status: 'todo',
    priority: 'low',
    assigneeId: null,
    dueDate: null,
    estimateHours: 1,
    createdAt: '2026-09-14T10:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(13),
    projectId: web,
    title: 'Add robots.txt rules',
    description: null,
    status: 'todo',
    priority: 'low',
    assigneeId: null,
    dueDate: null,
    estimateHours: 1,
    createdAt: '2026-09-14T10:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(14),
    projectId: web,
    title: 'Customer portal: invoices table',
    description: 'Sortable table with PDF download links.',
    status: 'in_progress',
    priority: 'high',
    assigneeId: bob,
    dueDate: '2026-11-05',
    estimateHours: 13,
    createdAt: '2026-09-16T09:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(15),
    projectId: web,
    title: 'Customer portal: Login with magic link',
    description: 'Passwordless sign-in by email.',
    status: 'todo',
    priority: 'urgent',
    assigneeId: null,
    dueDate: '2026-10-10',
    estimateHours: 8,
    createdAt: '2026-09-18T09:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(16),
    projectId: web,
    title: 'Optimize hero image loading',
    description: 'Serve AVIF with a blurred placeholder.',
    status: 'todo',
    priority: 'medium',
    assigneeId: alice,
    dueDate: '2026-10-30',
    estimateHours: 3,
    createdAt: '2026-09-21T09:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(17),
    projectId: web,
    title: 'Write end-to-end smoke tests',
    description: 'Cover sign-up, checkout and the customer portal.',
    status: 'todo',
    priority: 'medium',
    assigneeId: bob,
    dueDate: null,
    estimateHours: 5,
    createdAt: '2026-09-24T09:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(18),
    projectId: web,
    title: 'Dark mode toggle',
    description: 'Respect the system preference and remember the choice.',
    status: 'in_progress',
    priority: 'low',
    assigneeId: alice,
    dueDate: '2026-12-01',
    estimateHours: 8,
    createdAt: '2026-09-28T09:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(19),
    projectId: web,
    title: 'Legacy login widget cleanup',
    description: 'Archived: replaced by the new login page.',
    status: 'todo',
    priority: 'high',
    assigneeId: bob,
    dueDate: '2026-10-01',
    estimateHours: 3,
    createdAt: '2026-09-30T09:00:00.000Z',
    archivedAt: '2026-10-05T09:00:00.000Z',
  },
  {
    id: taskId(20),
    projectId: web,
    title: 'Old analytics snippet',
    description: 'Archived: superseded by the consent-aware loader.',
    status: 'in_progress',
    priority: 'medium',
    assigneeId: null,
    dueDate: null,
    estimateHours: null,
    createdAt: '2026-10-02T09:00:00.000Z',
    archivedAt: '2026-10-06T09:00:00.000Z',
  },
  // --- MOB: Mobile App -----------------------------------------------------------------------
  {
    id: taskId(21),
    projectId: mobile,
    title: 'Push notification permissions prompt',
    description: 'Ask only after the user creates their first task.',
    status: 'todo',
    priority: 'high',
    assigneeId: bob,
    dueDate: '2026-11-15',
    estimateHours: 5,
    createdAt: '2026-09-05T12:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(22),
    projectId: mobile,
    title: 'Offline mode for task list',
    description: 'Cache the last synced tasks and queue edits.',
    status: 'in_progress',
    priority: 'urgent',
    assigneeId: alice,
    dueDate: '2026-10-12',
    estimateHours: 20,
    createdAt: '2026-09-07T12:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(23),
    projectId: mobile,
    title: 'App store screenshots',
    description: 'Six screenshots per device class.',
    status: 'done',
    priority: 'low',
    assigneeId: vera,
    dueDate: '2026-09-30',
    estimateHours: 2,
    createdAt: '2026-09-09T12:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(24),
    projectId: mobile,
    title: 'Biometric login',
    description: 'Face ID and fingerprint unlock.',
    status: 'in_review',
    priority: 'high',
    assigneeId: bob,
    dueDate: '2026-10-28',
    estimateHours: 8,
    createdAt: '2026-09-13T12:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(25),
    projectId: mobile,
    title: 'Crash on rotate in settings',
    description: 'Reproducible on Android 15 tablets.',
    status: 'todo',
    priority: 'urgent',
    assigneeId: null,
    dueDate: '2026-10-19',
    estimateHours: 3,
    createdAt: '2026-09-15T12:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(26),
    projectId: mobile,
    title: 'Deep links for shared tasks',
    description: null,
    status: 'todo',
    priority: 'medium',
    assigneeId: alice,
    dueDate: null,
    estimateHours: 5,
    createdAt: '2026-09-19T12:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(27),
    projectId: mobile,
    title: 'Upgrade React Native',
    description: 'Move to the latest stable release and the new architecture.',
    status: 'in_progress',
    priority: 'medium',
    assigneeId: bob,
    dueDate: '2026-11-20',
    estimateHours: 13,
    createdAt: '2026-09-22T12:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(28),
    projectId: mobile,
    title: 'Reduce bundle size',
    description: null,
    status: 'todo',
    priority: 'low',
    assigneeId: null,
    dueDate: null,
    estimateHours: null,
    createdAt: '2026-09-26T12:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(29),
    projectId: mobile,
    title: 'Tablet layout',
    description: 'Two-pane layout for screens wider than 900dp.',
    status: 'done',
    priority: 'medium',
    assigneeId: alice,
    dueDate: '2026-10-05',
    estimateHours: 8,
    createdAt: '2026-09-29T12:00:00.000Z',
    archivedAt: null,
  },
  {
    id: taskId(30),
    projectId: mobile,
    title: 'Deprecated login SDK removal',
    description: 'Archived: the SDK was removed upstream.',
    status: 'todo',
    priority: 'low',
    assigneeId: null,
    dueDate: null,
    estimateHours: null,
    createdAt: '2026-10-01T12:00:00.000Z',
    archivedAt: '2026-10-03T12:00:00.000Z',
  },
];
