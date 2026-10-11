'use client';

// Demo login: choose one of the seeded users (POST /api/session sets the session cookie).
import { useState } from 'react';
import type { User } from '@/lib/api-types';
import { apiClient, errorMessage } from '@/lib/api-client';

export interface LoginPickerProps {
  users: User[];
}

const ROLE_HINTS: Record<User['role'], string> = {
  admin: 'Everything, including archiving tasks and creating projects',
  member: 'Create and edit tasks, change status',
  viewer: 'Read-only',
};

export function LoginPicker({ users }: LoginPickerProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function logIn(userId: string) {
    setPending(userId);
    setError(null);
    try {
      await apiClient.logIn(userId);
      // Full page load (not router.push) so the root layout re-reads the new session cookie.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/projects');
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {users.map((user) => (
          <li key={user.id}>
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => void logIn(user.id)}
              className="w-full rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-indigo-300 disabled:opacity-60"
            >
              <span className="block font-semibold text-slate-900">
                Continue as {user.name}
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {user.role}
                </span>
              </span>
              <span className="mt-1 block text-sm text-slate-600">{ROLE_HINTS[user.role]}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
