import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskDetail } from '@/components/task-detail';
import type { Task, User } from '@/lib/api-types';
import {
  errorResponse,
  jsonResponse,
  makeTask,
  mockFetch,
  requests,
  routeFetch,
} from '../support/fetch-mock';
import { SEED_USERS, USER_IDS } from '../support/fixtures';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const [alice, bob, vera] = SEED_USERS as [User, User, User];

let task: Task;
beforeEach(() => {
  push.mockReset();
  task = makeTask({
    title: 'Login page redesign',
    status: 'in_review',
    priority: 'high',
    assigneeId: USER_IDS.bob,
    version: 3,
  });
});

function setup(currentUser: User, routes: Parameters<typeof routeFetch>[1] = {}) {
  const fetchMock = mockFetch();
  routeFetch(fetchMock, {
    [`GET /api/tasks/${task.id}`]: () => jsonResponse(task),
    'GET /api/users': () => jsonResponse({ items: SEED_USERS }),
    ...routes,
  });
  const user = userEvent.setup();
  render(<TaskDetail taskId={task.id} currentUser={currentUser} />);
  return { fetchMock, user };
}

describe('TaskDetail', () => {
  it('offers only the legal status transitions', async () => {
    setup(bob);
    const section = await screen.findByRole('region', { name: 'Change status' });
    const labels = within(section)
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(labels).toEqual(['Mark as done', 'Request changes']);
  });

  it('sends the transition with the current version', async () => {
    const { fetchMock, user } = setup(bob, {
      [`POST /api/tasks/${task.id}/transition`]: (body) =>
        jsonResponse({ ...task, status: (body as { to: Task['status'] }).to, version: 4 }),
    });

    await user.click(await screen.findByRole('button', { name: 'Mark as done' }));

    expect(await screen.findByText('Status changed to Done.')).toBeInTheDocument();
    const transition = requests(fetchMock).find((r) => r.url.pathname.endsWith('/transition'));
    expect(transition?.body).toEqual({ to: 'done', version: 3 });
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument();
  });

  it('saves only the changed fields together with the version', async () => {
    const { fetchMock, user } = setup(bob, {
      [`PATCH /api/tasks/${task.id}`]: (body) =>
        jsonResponse({ ...task, ...(body as object), version: 4 }),
    });

    const title = await screen.findByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Login page v2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Changes saved.')).toBeInTheDocument();
    const patch = requests(fetchMock).find((r) => r.method === 'PATCH');
    expect(patch?.body).toEqual({ version: 3, title: 'Login page v2' });
  });

  it('tells the user when someone else changed the task (409) and reloads it', async () => {
    const { fetchMock, user } = setup(bob, {
      [`PATCH /api/tasks/${task.id}`]: () =>
        errorResponse(409, 'conflict', 'This task was changed by someone else.', {
          currentVersion: 4,
        }),
    });

    const title = await screen.findByLabelText('Title');
    await user.type(title, '!');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This task was changed by someone else since you opened it');

    task = { ...task, title: 'Renamed elsewhere', version: 4 };
    await user.click(within(alert).getByRole('button', { name: 'Reload task' }));

    expect(await screen.findByRole('heading', { name: 'Renamed elsewhere' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Renamed elsewhere');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const taskRequests = requests(fetchMock).filter(
      (r) => r.url.pathname === `/api/tasks/${task.id}`,
    );
    expect(taskRequests.map((r) => r.method)).toEqual(['GET', 'PATCH', 'GET']);
  });

  it('is read-only for viewers', async () => {
    setup(vera);
    expect(await screen.findByLabelText('Title')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Change status' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive task' })).not.toBeInTheDocument();
  });

  it('lets admins archive after confirming, then goes back to the project', async () => {
    const { user } = setup(alice, {
      [`DELETE /api/tasks/${task.id}`]: () => new Response(null, { status: 204 }),
    });

    await user.click(await screen.findByRole('button', { name: 'Archive task' }));
    await user.click(screen.getByRole('button', { name: 'Confirm archive' }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith(`/projects/${task.projectId}`));
  });

  it('does not offer archiving to members', async () => {
    setup(bob);
    await screen.findByLabelText('Title');
    expect(screen.queryByRole('button', { name: 'Archive task' })).not.toBeInTheDocument();
  });

  it('shows a load error for a missing task', async () => {
    setup(bob, {
      [`GET /api/tasks/${task.id}`]: () => errorResponse(404, 'not_found', 'Task not found'),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Task not found');
  });
});
