/**
 * Reusable full-stack smoke test verifying API health, DB/Redis readiness,
 * production payment gating, and Next.js SSR integration with live API data.
 *
 * Usage:
 *   node scripts/smoke-stack.mjs --api-url http://127.0.0.1:4000 --web-url http://127.0.0.1:3000 [--expect-prod] [--expected-commit <sha>]
 */

/**
 * Parse CLI flag pairs (--key value or boolean --flag).
 * @param {Array<string>} argv
 * @returns {{ apiUrl: string, webUrl: string, expectProd: boolean, expectedCommit: string|null }}
 */
function parseArgs(argv) {
  const result = {
    apiUrl: process.env.API_BASE_URL || 'http://127.0.0.1:4000',
    webUrl: process.env.WEB_BASE_URL || 'http://127.0.0.1:3000',
    expectProd: false,
    expectedCommit: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--api-url' && argv[i + 1]) {
      result.apiUrl = argv[i + 1];
      i += 1;
    } else if (arg === '--web-url' && argv[i + 1]) {
      result.webUrl = argv[i + 1];
      i += 1;
    } else if (arg === '--expected-commit' && argv[i + 1]) {
      result.expectedCommit = argv[i + 1].trim() || null;
      i += 1;
    } else if (arg === '--expect-prod') {
      result.expectProd = true;
    }
  }

  return {
    apiUrl: result.apiUrl.replace(/\/+$/, ''),
    webUrl: result.webUrl.replace(/\/+$/, ''),
    expectProd: result.expectProd,
    expectedCommit: result.expectedCommit,
  };
}

/**
 * Assert condition or throw descriptive error.
 * @param {boolean} condition
 * @param {string} message
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(`[smoke-stack] Assertion failed: ${message}`);
  }
}

async function main() {
  const { apiUrl, webUrl, expectProd, expectedCommit } = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify({ phase: 'smoke_start', apiUrl, webUrl, expectProd, expectedCommit }));

  // 1. API Liveness & Readiness (Postgres + Redis)
  const [liveRes, readyRes] = await Promise.all([
    fetch(`${apiUrl}/health/live`),
    fetch(`${apiUrl}/health/ready`),
  ]);
  assert(liveRes.status === 200, `/health/live expected 200, got ${liveRes.status}`);
  assert(readyRes.status === 200, `/health/ready expected 200, got ${readyRes.status}`);
  const readyJson = await readyRes.json();
  assert(readyJson.status === 'ready', `/health/ready status=${readyJson.status}`);
  assert(readyJson.checks?.postgres === 'ok', 'Postgres health check must be ok');
  assert(readyJson.checks?.redis === 'ok', 'Redis health check must be ok');
  if (expectedCommit) {
    assert(
      readyJson.commit === expectedCommit,
      `/health/ready commit mismatch: expected ${expectedCommit}, got ${readyJson.commit}`
    );
  }

  // 2. Live Catalog API (BigInt -> JS safe Number VND)
  const [bikesRes, accessoriesRes] = await Promise.all([
    fetch(`${apiUrl}/api/v1/bikes?limit=6`),
    fetch(`${apiUrl}/api/v1/accessories?limit=6`),
  ]);
  assert(bikesRes.status === 200, `/api/v1/bikes expected 200, got ${bikesRes.status}`);
  assert(
    accessoriesRes.status === 200,
    `/api/v1/accessories expected 200, got ${accessoriesRes.status}`
  );
  const bikesJson = await bikesRes.json();
  const bikes = bikesJson.data ?? [];
  assert(Array.isArray(bikes) && bikes.length > 0, 'Expected at least 1 seeded bike from API');
  const firstBike = bikes[0];
  assert(
    typeof firstBike.priceVnd === 'number' && Number.isFinite(firstBike.priceVnd),
    `Expected numeric priceVnd, got ${typeof firstBike.priceVnd}`
  );
  assert(
    'coverImageUrl' in firstBike &&
      (firstBike.coverImageUrl === null || typeof firstBike.coverImageUrl === 'string'),
    'Expected v2.1 coverImageUrl field on /api/v1/bikes items'
  );
  assert(
    Array.isArray(firstBike.galleryImages),
    'Expected v2.1 galleryImages array on /api/v1/bikes items'
  );
  assert(
    'blueprintImageUrl' in firstBike &&
      (firstBike.blueprintImageUrl === null || typeof firstBike.blueprintImageUrl === 'string'),
    'Expected v2.1 blueprintImageUrl field on /api/v1/bikes items'
  );

  // 3. Live Chatbot Grounded API & OAuth providers endpoint
  const [providersRes, chatRes] = await Promise.all([
    fetch(`${apiUrl}/api/v1/auth/providers`),
    fetch(`${apiUrl}/api/v1/chat/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: 'How do bike deposits and COD rules work?',
        locale: 'en',
      }),
    }),
  ]);
  assert(
    providersRes.status === 200,
    `/api/v1/auth/providers expected 200, got ${providersRes.status}`
  );
  assert(
    chatRes.status === 200 || chatRes.status === 201,
    `/api/v1/chat/messages expected 200/201, got ${chatRes.status}`
  );
  const chatJson = await chatRes.json();
  const assistantMsg = chatJson.data?.assistantMessage;
  assert(
    typeof assistantMsg?.content === 'string' && assistantMsg.content.length > 20,
    'Expected non-empty chatbot assistantMessage.content'
  );
  assert(
    Array.isArray(assistantMsg?.citations) &&
      assistantMsg.citations.some(
        (c) => typeof c.url === 'string' && c.url.startsWith('/policies/')
      ),
    'Expected chatbot response to include grounded /policies/* citation'
  );

  // Clean up ephemeral smoke guest chat session cleanly
  const setCookieHeader = chatRes.headers.get('set-cookie');
  if (setCookieHeader) {
    await fetch(`${apiUrl}/api/v1/chat/session`, {
      method: 'DELETE',
      headers: { cookie: setCookieHeader.split(';')[0] },
    }).catch(() => {});
  }

  // 4. Production safety gates: mock payment, mock OAuth & local media serve must be unmounted (404)
  if (expectProd) {
    const [mockPayRes, mockOAuthRes, localMediaRes] = await Promise.all([
      fetch(`${apiUrl}/api/v1/payments/mock/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderNumber: 'DF-SMOKE-0001' }),
      }),
      fetch(
        `${apiUrl}/api/v1/auth/google/mock-authorize?state=smoke&nonce=smoke&code_challenge=smoke`,
        { redirect: 'manual' }
      ),
      fetch(`${apiUrl}/api/v1/media/local/bikes/probe/sample.png`),
    ]);
    assert(
      mockPayRes.status === 404,
      `Expected /api/v1/payments/mock/complete to return 404 in production, got ${mockPayRes.status}`
    );
    assert(
      mockOAuthRes.status === 404,
      `Expected /api/v1/auth/google/mock-authorize to return 404 in production, got ${mockOAuthRes.status}`
    );
    assert(
      localMediaRes.status === 404,
      `Expected /api/v1/media/local/* to return 404 in production, got ${localMediaRes.status}`
    );
  }

  // 5. Web SSR routes + Policy Docs + verify live bike data from API renders on Storefront HTML
  const routes = [
    '/',
    '/bikes',
    `/bikes/${firstBike.slug}`,
    '/compare',
    '/accessories',
    '/accessories?sku=ACC-ZETA-LINK-30',
    '/cart',
    '/policies/ordering',
    '/policies/terms',
    '/policies/warranty',
    '/admin',
  ];
  const routeChecks = [];
  for (const route of routes) {
    const res = await fetch(`${webUrl}${route}`);
    const html = await res.text();
    assert(res.status === 200, `Web ${route} expected 200, got ${res.status}`);
    assert(!html.includes('Application error'), `Web ${route} rendered Application error`);
    if (route === '/bikes' || route === `/bikes/${firstBike.slug}`) {
      assert(
        html.includes(firstBike.name),
        `Web ${route} SSR HTML did not include API bike "${firstBike.name}"`
      );
    }
    if (route === '/policies/ordering') {
      assert(
        html.includes('15') && html.includes('PayOS'),
        'Web /policies/ordering HTML missing grounded PayOS / 15-minute policy text'
      );
    }
    routeChecks.push({ route, status: res.status, bytes: html.length });
  }

  console.log(
    JSON.stringify({
      status: 'PASSED',
      health: readyJson,
      apiSampleBike: {
        id: firstBike.id,
        slug: firstBike.slug,
        name: firstBike.name,
        priceVnd: firstBike.priceVnd,
        availableQty: firstBike.availableQty,
      },
      chatbotCitationsCount: assistantMsg.citations.length,
      expectedCommitMatched: Boolean(expectedCommit),
      mediaFieldsVerified: true,
      mockPaymentBlocked404: expectProd,
      mockOAuthBlocked404: expectProd,
      localMediaBlocked404: expectProd,
      webRoutes: routeChecks,
    })
  );
}

await main();
