import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROJECT_IDS } from '../support/fixtures';
import { createTestContext, type TestContext } from '../support/harness';

const WEB = PROJECT_IDS.web;

describe('forbidden requests', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('are rejected before the body is validated', async () => {
    const res = await ctx.request('POST', `/api/projects/${WEB}/tasks`, {
      as: 'vera',
      body: { title: 'x' },
    });
    expect(res.status).toBe(403);
  });
});
