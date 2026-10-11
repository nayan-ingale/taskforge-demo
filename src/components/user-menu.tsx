'use client';

// Header widget: who is signed in, and a sign-out button.
import { apiClient } from '@/lib/api-client';
import type { User } from '@/lib/api-types';
import { secondaryButtonClass } from './styles';

export function UserMenu({ user }: { user: User }) {
  async function logOut() {
    try {
      await apiClient.logOut();
    } finally {
      // Full page load so the root layout re-reads the (now cleared) session cookie.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/login');
    }
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-slate-700">
        {user.name} <span className="text-slate-500">({user.role})</span>
      </span>
      <button type="button" className={secondaryButtonClass} onClick={() => void logOut()}>
        Sign out
      </button>
    </div>
  );
}
