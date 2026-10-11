// STABLE TEST CONTRACT — the API test harness. See README.md "Test harness".
//
//   const ctx = await createTestContext();            // fresh, migrated + seeded in-memory DB
//   const res = await ctx.request('GET', `/api/projects/${PROJECT_IDS.web}/tasks`, { as: 'bob' });
//   expect(res.status).toBe(200); expect(res.json.total).toBe(18);
//   await ctx.close();
//
// Each context owns an isolated PGlite database, so tests may mutate data freely. Requests go
// straight to the framework-agnostic router (no Next.js, no network). The clock is frozen at
// `options.now` (default DEFAULT_TEST_NOW). Refactors must keep this API backwards compatible.
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { inject } from 'vitest';
import { createPgliteDatabase, type Db } from '@/server/db/client';
import { handle } from '@/server/http/router';
import { SESSION_COOKIE, encodeSession } from '@/server/http/session-cookie';
import { DEFAULT_TEST_NOW, USER_IDS, type DemoUserKey } from './fixtures';
import { buildSeededDatabaseImage } from './seeded-database';

export const TEST_SESSION_SECRET = 'taskforge-test-session-secret';

export interface TestRequestOptions {
  /** Send the request as this seeded user (alice = admin, bob = member, vera = viewer). Omit for an anonymous request. */
  as?: DemoUserKey;
  /** JSON-serialized into the request body (Content-Type: application/json). */
  body?: unknown;
  /** Raw request body, sent as-is instead of `body` (e.g. to test malformed JSON). */
  rawBody?: string;
  /** Extra request headers. */
  headers?: Record<string, string>;
}

export interface TestResponse {
  status: number;
  /** Parsed JSON body, or null when the body is empty (e.g. 204). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests assert on arbitrary JSON
  json: any;
  headers: Headers;
}

export interface TestContext {
  /** Drizzle handle to this context's database, for arranging or inspecting data directly. */
  db: Db;
  /** The frozen clock used by the router. */
  now: Date;
  /**
   * Sends `method path` (path may include a query string) through the API router.
   * Never throws for HTTP errors: inspect `status` and `json`.
   */
  request(method: string, path: string, options?: TestRequestOptions): Promise<TestResponse>;
  /** Sends a raw Request through the router (same db, clock and secret). */
  handle(request: Request): Promise<Response>;
  /** The Cookie header value that authenticates as `user`. */
  cookieFor(user: DemoUserKey): string;
  close(): Promise<void>;
}

let seededImage: Promise<Blob> | undefined;

/**
 * The migrated + seeded database image. Built once per run by tests/support/global-setup.ts;
 * built in-process as a fallback when the harness runs without that setup.
 */
function seededDatabaseImage(): Promise<Blob> {
  seededImage ??= (async () => {
    const file = inject('seededDatabaseImage');
    return file ? new Blob([await readFile(file)]) : buildSeededDatabaseImage();
  })();
  return seededImage;
}

export interface TestContextOptions {
  /** Frozen clock for the router ("today", createdAt/updatedAt). Default: DEFAULT_TEST_NOW. */
  now?: Date;
}

/** A fresh, isolated, migrated and seeded in-memory database plus a client for the API. */
export async function createTestContext(options: TestContextOptions = {}): Promise<TestContext> {
  const now = new Date(options.now ?? DEFAULT_TEST_NOW);
  const client = new PGlite({ loadDataDir: await seededDatabaseImage() });
  await client.waitReady;
  const database = createPgliteDatabase(client);
  const deps = { db: database.db, now: () => new Date(now), sessionSecret: TEST_SESSION_SECRET };

  const cookieFor = (user: DemoUserKey) =>
    `${SESSION_COOKIE}=${encodeURIComponent(encodeSession(USER_IDS[user], TEST_SESSION_SECRET))}`;

  return {
    db: database.db,
    now,
    cookieFor,
    handle: (request) => handle(request, deps),
    async request(method, path, { as, body, rawBody, headers = {} } = {}) {
      const requestHeaders = new Headers(headers);
      if (as) requestHeaders.set('cookie', cookieFor(as));
      let payload: string | undefined = rawBody;
      if (payload === undefined && body !== undefined) payload = JSON.stringify(body);
      if (payload !== undefined && !requestHeaders.has('content-type')) {
        requestHeaders.set('content-type', 'application/json');
      }
      const response = await handle(
        new Request(new URL(path, 'http://localhost'), {
          method: method.toUpperCase(),
          headers: requestHeaders,
          body: payload,
        }),
        deps,
      );
      const text = await response.text();
      return {
        status: response.status,
        json: text ? (JSON.parse(text) as unknown) : null,
        headers: response.headers,
      };
    },
    close: () => database.close(),
  };
}
