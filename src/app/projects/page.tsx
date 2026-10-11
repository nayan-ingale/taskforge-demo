import type { Metadata } from 'next';
import { ProjectList } from '@/components/project-list';
import { requirePageUser } from '@/server/page-session';

export const metadata: Metadata = { title: 'Projects · TaskForge' };

export default async function ProjectsPage() {
  await requirePageUser();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
      <ProjectList />
    </div>
  );
}
