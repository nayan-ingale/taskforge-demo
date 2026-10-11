import { redirect } from 'next/navigation';
import { getPageUser } from '@/server/page-session';

export default async function HomePage() {
  redirect((await getPageUser()) ? '/projects' : '/login');
}
