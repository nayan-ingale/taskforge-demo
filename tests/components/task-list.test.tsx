import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TaskList } from '@/components/task-list';
import {
  deferred,
  jsonResponse,
  makePage,
  makeTask,
  mockFetch,
  requestedUrl,
  toUrl,
} from '../support/fetch-mock';
import { PROJECT_IDS, SEED_USERS, USER_IDS } from '../support/fixtures';

const PROJECT = PROJECT_IDS.web;

describe('TaskList states', () => {
  it('shows an empty state when the project has no tasks', async () => {
    mockFetch().mockResolvedValueOnce(jsonResponse(makePage([])));
    render(<TaskList projectId={PROJECT} />);

    expect(await screen.findByText('No tasks yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a different empty message when filters are active', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockImplementation(async () => jsonResponse(makePage([])));
    const user = userEvent.setup();
    render(<TaskList projectId={PROJECT} />);
    await screen.findByText('No tasks yet.');

    await user.selectOptions(screen.getByLabelText('Status'), 'done');

    expect(await screen.findByText('No tasks match these filters.')).toBeInTheDocument();
  });
});

describe('TaskList data', () => {
  it('requests the first page and renders one row per task', async () => {
    const fetchMock = mockFetch();
    const tasks = [
      makeTask({
        title: 'Ship it',
        status: 'in_review',
        priority: 'urgent',
        assigneeId: USER_IDS.bob,
        dueDate: '2026-11-01',
      }),
      makeTask({ title: 'Unassigned work', assigneeId: null }),
      makeTask({ title: 'Mystery owner', assigneeId: '10000000-0000-4000-8000-000000000099' }),
    ];
    fetchMock.mockResolvedValueOnce(jsonResponse(makePage(tasks)));

    render(<TaskList projectId={PROJECT} users={[...SEED_USERS]} />);

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Ship it');
    expect(rows[0]).toHaveTextContent('In review');
    expect(rows[0]).toHaveTextContent('Urgent');
    expect(rows[0]).toHaveTextContent('Bob Member');
    expect(rows[0]).toHaveTextContent('2026-11-01');
    expect(rows[1]).toHaveTextContent('Unassigned');
    expect(rows[2]).toHaveTextContent('Unknown user');
    expect(within(rows[0]!).getByRole('link', { name: 'Ship it' })).toHaveAttribute(
      'href',
      `/tasks/${tasks[0]!.id}`,
    );

    const url = requestedUrl(fetchMock);
    expect(url.pathname).toBe(`/api/projects/${PROJECT}/tasks`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ page: '1', pageSize: '10' });
  });

  it('passes the pageSize prop to the API', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(makePage([makeTask()], { pageSize: 25 })));
    render(<TaskList projectId={PROJECT} pageSize={25} />);
    await screen.findByRole('table');
    expect(requestedUrl(fetchMock).searchParams.get('pageSize')).toBe('25');
  });

  it('pages forwards and backwards', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockImplementation(async (input) => {
      const page = Number(toUrl(input).searchParams.get('page'));
      return jsonResponse(
        makePage([makeTask({ title: `Item on page ${page}` })], { page, total: 25 }),
      );
    });
    const user = userEvent.setup();
    render(<TaskList projectId={PROJECT} />);

    expect(await screen.findByText('Item on page 1')).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 3/)).toHaveTextContent('Page 1 of 3 · 25 tasks');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Item on page 2')).toBeInTheDocument();
    expect(requestedUrl(fetchMock, 1).searchParams.get('page')).toBe('2');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Item on page 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByText('Item on page 2')).toBeInTheDocument();
  });

  it('sends status and priority filters and goes back to page 1', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockImplementation(async (input) => {
      const page = Number(toUrl(input).searchParams.get('page'));
      return jsonResponse(makePage([makeTask({ title: `Row ${page}` })], { page, total: 30 }));
    });
    const user = userEvent.setup();
    render(<TaskList projectId={PROJECT} />);
    await screen.findByText('Row 1');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Row 2');

    await user.selectOptions(screen.getByLabelText('Status'), 'in_progress');
    await screen.findByText('Row 1');
    await user.selectOptions(screen.getByLabelText('Priority'), 'high');
    await screen.findByText('Row 1');

    const last = requestedUrl(fetchMock, fetchMock.mock.calls.length - 1);
    expect(Object.fromEntries(last.searchParams)).toEqual({
      status: 'in_progress',
      priority: 'high',
      page: '1',
      pageSize: '10',
    });
  });

  it('searches when the search form is submitted', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockImplementation(async () =>
      jsonResponse(makePage([makeTask({ title: 'Login page' })])),
    );
    const user = userEvent.setup();
    render(<TaskList projectId={PROJECT} />);
    await screen.findByRole('table');

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), '  Login {Enter}');

    await screen.findByRole('table');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestedUrl(fetchMock, 1).searchParams.get('q')).toBe('Login');
  });

  it('reloads when refreshKey changes', async () => {
    const fetchMock = mockFetch();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(makePage([makeTask({ title: 'Before' })])))
      .mockResolvedValueOnce(jsonResponse(makePage([makeTask({ title: 'After' })])));
    const { rerender } = render(<TaskList projectId={PROJECT} refreshKey={0} />);
    await screen.findByText('Before');

    rerender(<TaskList projectId={PROJECT} refreshKey={1} />);

    expect(await screen.findByText('After')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ignores a slow response that was superseded by a newer request', async () => {
    const fetchMock = mockFetch();
    const slow = deferred<Response>();
    fetchMock
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(jsonResponse(makePage([makeTask({ title: 'Filtered result' })])));
    const user = userEvent.setup();
    render(<TaskList projectId={PROJECT} />);

    await user.selectOptions(screen.getByLabelText('Status'), 'done');
    expect(await screen.findByText('Filtered result')).toBeInTheDocument();

    slow.resolve(jsonResponse(makePage([makeTask({ title: 'Stale result' })])));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('Stale result')).not.toBeInTheDocument();
    expect(screen.getByText('Filtered result')).toBeInTheDocument();
  });
});
