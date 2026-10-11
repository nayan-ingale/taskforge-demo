import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
      <Link href="/projects" className="text-indigo-700 hover:underline">
        Go to projects
      </Link>
    </div>
  );
}
