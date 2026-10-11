// Mounts the framework-agnostic API router (src/server/http/router.ts) under /api/*.
// Keep this file thin: all routing, auth and error handling live in the router.
import { getAppDb } from '@/server/db/app-db';
import { handle } from '@/server/http/router';

export const dynamic = 'force-dynamic';

function handler(request: Request): Promise<Response> {
  return handle(request, { db: getAppDb() });
}

export { handler as DELETE, handler as GET, handler as PATCH, handler as POST, handler as PUT };
