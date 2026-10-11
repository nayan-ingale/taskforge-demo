import type { Metadata } from 'next';
import { ProjectView } from '@/components/project-view';
import { requirePageUser } from '@/server/page-session';

export const metadata: Metadata = { title: 'Project · TaskForge' };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  return <ProjectView projectId={id} currentUser={user} />;
}
