import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CreateTaskForm } from '@/components/create-task-form';
import {
  deferred,
  errorResponse,
  jsonResponse,
  makeTask,
  mockFetch,
  requestedInit,
  requestedUrl,
} from '../support/fetch-mock';
import { PROJECT_IDS, SEED_USERS, USER_IDS } from '../support/fixtures';

const PROJECT = PROJECT_IDS.web;

function renderForm(onCreated = vi.fn()) {
  const user = userEvent.setup();
  render(<CreateTaskForm projectId={PROJECT} users={[...SEED_USERS]} onCreated={onCreated} />);
  return { user, onCreated };
}

const field = (label: string) => screen.getByLabelText(label);
const submit = () => screen.getByRole('button', { name: 'Create task' });

describe('CreateTaskForm validation', () => {
  it('shows an inline error for a missing title and does not call the API', async () => {
    const fetchMock = mockFetch();
    const { user } = renderForm();

    await user.click(submit());

    expect(field('Title')).toHaveAttribute('aria-invalid', 'true');
    expect(field('Title')).toHaveAccessibleDescription('Title must be at least 3 characters');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('trims the title before checking its length', async () => {
    mockFetch();
    const { user } = renderForm();
    await user.type(field('Title'), '   ab   ');
    await user.click(submit());
    expect(screen.getByText('Title must be at least 3 characters')).toBeInTheDocument();
  });

  it('rejects a title longer than 120 characters', async () => {
    mockFetch();
    const { user } = renderForm();
    await user.click(field('Title'));
    await user.paste('x'.repeat(121));
    await user.click(submit());
    expect(screen.getByText('Title must be at most 120 characters')).toBeInTheDocument();
  });

  it('shows one message per invalid field', async () => {
    const fetchMock = mockFetch();
    const { user } = renderForm();

    await user.type(field('Title'), 'ok');
    await user.type(field('Due date'), '2000-01-01');
    await user.type(field('Estimate (hours)'), '500');
    await user.click(submit());

    expect(field('Title')).toHaveAccessibleDescription('Title must be at least 3 characters');
    expect(field('Due date')).toHaveAccessibleDescription('Due date cannot be in the past');
    expect(field('Estimate (hours)')).toHaveAccessibleDescription(
      'Estimate must be at most 200 hours',
    );
    expect(field('Description')).not.toHaveAttribute('aria-invalid');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a fractional estimate', async () => {
    mockFetch();
    const { user } = renderForm();
    await user.type(field('Title'), 'Valid title');
    await user.type(field('Estimate (hours)'), '2.5');
    await user.click(submit());
    expect(screen.getByText('Estimate must be a whole number of hours')).toBeInTheDocument();
  });

  it('clears old errors once the input is valid', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(makeTask({ title: 'Valid title' }), 201));
    const { user } = renderForm();
    await user.click(submit());
    expect(screen.getByText('Title must be at least 3 characters')).toBeInTheDocument();

    await user.type(field('Title'), 'Valid title');
    await user.click(submit());

    expect(await screen.findByRole('status')).toHaveTextContent('Created “Valid title”.');
    expect(screen.queryByText('Title must be at least 3 characters')).not.toBeInTheDocument();
  });
});

describe('CreateTaskForm submission', () => {
  it('posts the task, reports it and resets the form', async () => {
    const fetchMock = mockFetch();
    const created = makeTask({ title: 'Plan the launch', priority: 'high' });
    fetchMock.mockResolvedValueOnce(jsonResponse(created, 201));
    const { user, onCreated } = renderForm();

    await user.type(field('Title'), '  Plan the launch ');
    await user.selectOptions(field('Priority'), 'high');
    await user.selectOptions(field('Assignee'), USER_IDS.bob);
    await user.type(field('Due date'), '2099-12-31');
    await user.type(field('Estimate (hours)'), '5');
    await user.click(submit());

    expect(await screen.findByRole('status')).toHaveTextContent('Created “Plan the launch”.');
    expect(onCreated).toHaveBeenCalledWith(created);
    expect(requestedUrl(fetchMock).pathname).toBe(`/api/projects/${PROJECT}/tasks`);
    expect(requestedInit(fetchMock)).toEqual({
      method: 'POST',
      body: {
        title: '  Plan the launch ',
        description: null,
        priority: 'high',
        assigneeId: USER_IDS.bob,
        dueDate: '2099-12-31',
        estimateHours: 5,
      },
    });
    expect(field('Title')).toHaveValue('');
    expect(field('Priority')).toHaveValue('medium');
    expect(field('Assignee')).toHaveValue('');
  });

  it('disables the button while the request is in flight', async () => {
    const fetchMock = mockFetch();
    const response = deferred<Response>();
    fetchMock.mockReturnValueOnce(response.promise);
    const { user } = renderForm();

    await user.type(field('Title'), 'Slow task');
    await user.click(submit());

    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
    response.resolve(jsonResponse(makeTask({ title: 'Slow task' }), 201));
    expect(await screen.findByRole('button', { name: 'Create task' })).toBeEnabled();
  });

  it('shows server-side field errors inline and keeps the input', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(
      errorResponse(400, 'validation_failed', 'Validation failed', {
        fieldErrors: { assigneeId: ['Assignee does not exist'] },
        formErrors: [],
      }),
    );
    const onCreated = vi.fn();
    const { user } = renderForm(onCreated);

    await user.type(field('Title'), 'Assigned task');
    await user.selectOptions(field('Assignee'), USER_IDS.vera);
    await user.click(submit());

    expect(await screen.findByText('Assignee does not exist')).toBeInTheDocument();
    expect(field('Assignee')).toHaveAttribute('aria-invalid', 'true');
    expect(field('Title')).toHaveValue('Assigned task');
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('shows other API errors as a form-level alert', async () => {
    mockFetch().mockResolvedValueOnce(
      errorResponse(403, 'forbidden', 'You do not have permission to do that'),
    );
    const { user } = renderForm();

    await user.type(field('Title'), 'Not allowed');
    await user.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have permission to do that',
    );
    expect(submit()).toBeEnabled();
  });
});
