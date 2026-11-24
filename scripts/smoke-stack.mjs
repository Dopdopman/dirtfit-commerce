/**
 * Reusable full-stack smoke test verifying API health, DB/Redis readiness,
 * production payment gating, and Next.js SSR integration with live API data.
 *
 * Usage:
 *   node scripts/smoke-stack.mjs --api-url http://127.0.0.1:4000 --web-url http://127.0.0.1:3000 [--expect-prod]
 */

/**
 * Parse CLI flag pairs (--key value or boolean --flag).
 * @param {Array<string>} argv
 * @returns {{ apiUrl: string, webUrl: string, expectProd: boolean }}
 */
function parseArgs(argv) {
  const result = {
    apiUrl: process.env.API_BASE_URL || 'http://127.0.0.1:4000',
    webUrl: process.env.WEB_BASE_URL || 'http://127.0.0.1:3000',
    expectProd: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--api-url' && argv[i + 1]) {
      result.apiUrl = argv[i + 1];
      i += 1;
    } else if (arg === '--web-url' && argv[i + 1]) {
      result.webUrl = argv[i + 1];
      i += 1;
    } else if (arg === '--expect-prod') {
      result.expectProd = true;
    }
  }

  return {
    apiUrl: result.apiUrl.replace(/\/+$/, ''),
    webUrl: result.webUrl.replace(/\/+$/, ''),
    expectProd: result.expectProd,
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
  const { apiUrl, webUrl, expectProd } = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify({ phase: 'smoke_start', apiUrl, webUrl, expectProd }));

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

  // 3. Production safety gate: mock payment completion must be unmounted (404)
  if (expectProd) {
    const mockRes = await fetch(`${apiUrl}/api/v1/payments/mock/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderNumber: 'DF-SMOKE-0001' }),
    });
    assert(
      mockRes.status === 404,
      `Expected /api/v1/payments/mock/complete to return 404 in production, got ${mockRes.status}`
    );
  }

  // 4. Web SSR routes + verify live bike data from API renders on Storefront HTML
  const routes = ['/', '/bikes', `/bikes/${firstBike.slug}`, '/compare', '/accessories', '/admin'];
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
      mockPaymentBlocked404: expectProd,
      webRoutes: routeChecks,
    })
  );
}

await main();
