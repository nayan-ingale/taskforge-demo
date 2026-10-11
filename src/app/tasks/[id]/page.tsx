import type { Metadata } from 'next';
import { TaskDetail } from '@/components/task-detail';
import { requirePageUser } from '@/server/page-session';

export const metadata: Metadata = { title: 'Task · TaskForge' };

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  return <TaskDetail taskId={id} currentUser={user} />;
}
