import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginPicker } from '@/components/login-picker';
import { SEED_USERS } from '@/server/db/seed-data';
import { getPageUser } from '@/server/page-session';

export const metadata: Metadata = { title: 'Sign in · TaskForge' };

export default async function LoginPage() {
  if (await getPageUser()) redirect('/projects');
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Sign in</h1>
      <p className="text-slate-600">This is a demo. Pick a user to continue as.</p>
      <LoginPicker users={[...SEED_USERS]} />
    </div>
  );
}
