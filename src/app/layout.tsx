import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { UserMenu } from '@/components/user-menu';
import { getPageUser } from '@/server/page-session';
import './globals.css';

export const metadata: Metadata = {
  title: 'TaskForge',
  description: 'A small project-management demo app.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getPageUser();
  return (
    <html lang="en">
      <body>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link
              href={user ? '/projects' : '/login'}
              className="text-lg font-bold text-indigo-700"
            >
              TaskForge
            </Link>
            {user && <UserMenu user={user} />}
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
