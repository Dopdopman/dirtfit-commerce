import { ALLOWED_ORDER_TRANSITIONS, USER_ROLES } from '@dirtfit/shared';

/**
 * Determine whether a user role can access the Admin & Sales Portal.
 * @param {string|null|undefined} role
 * @returns {boolean}
 */
export function canAccessAdminPortal(role) {
  return role === USER_ROLES.ADMIN || role === USER_ROLES.SALES_STAFF;
}

/**
 * Determine whether a user role can access strictly ADMIN-only routes/features (Audit logs, Hard mutations).
 * @param {string|null|undefined} role
 * @returns {boolean}
 */
export function canAccessAdminOnlyFeature(role) {
  return role === USER_ROLES.ADMIN;
}

/**
 * Return permitted next Order statuses from the single-source-of-truth state machine.
 * @param {string} currentStatus
 * @returns {Array<string>}
 */
export function getAllowedNextOrderStatuses(currentStatus) {
  return [...(ALLOWED_ORDER_TRANSITIONS[currentStatus] ?? [])];
}

/**
 * Compute operational KPI aggregates for the Admin Dashboard (strictly non-decorative).
 * @param {object} params
 * @param {Array<object>} [params.bikes]
 * @param {Array<object>} [params.orders]
 * @param {Array<object>} [params.testRides]
 * @returns {{
 *   pendingOrdersCount: number,
 *   pendingOrdersRevenueVnd: number,
 *   lowStockBikesCount: number,
 *   totalAvailableBikes: number,
 *   upcomingTestRidesCount: number,
 *   lowStockBikes: Array<object>,
 *   actionableOrders: Array<object>,
 *   upcomingTestRides: Array<object>
 * }}
 */
export function computeDashboardMetrics({ bikes = [], orders = [], testRides = [] }) {
  const actionableStatuses = new Set([
    'PENDING_PAYMENT',
    'DEPOSIT_PAID',
    'PAID',
    'CONFIRMED',
    'PREPARING',
    'READY_FOR_HANDOVER',
  ]);

  const actionableOrders = orders.filter((order) => actionableStatuses.has(order.status));
  const pendingOrdersRevenueVnd = actionableOrders.reduce(
    (sum, order) => sum + Number(order.totalVnd ?? 0),
    0
  );

  const lowStockBikes = bikes.filter((bike) => {
    const avail = Number(bike.availableQty ?? bike.stockQty ?? 0);
    return bike.status === 'ACTIVE' && avail <= 2;
  });

  const totalAvailableBikes = bikes.reduce(
    (sum, bike) => sum + Math.max(0, Number(bike.availableQty ?? bike.stockQty ?? 0)),
    0
  );

  const upcomingStatuses = new Set(['PENDING', 'CONFIRMED']);
  const upcomingTestRides = testRides.filter((ride) => upcomingStatuses.has(ride.status));

  return {
    pendingOrdersCount: actionableOrders.length,
    pendingOrdersRevenueVnd,
    lowStockBikesCount: lowStockBikes.length,
    totalAvailableBikes,
    upcomingTestRidesCount: upcomingTestRides.length,
    lowStockBikes: lowStockBikes.slice(0, 6),
    actionableOrders: actionableOrders.slice(0, 8),
    upcomingTestRides: upcomingTestRides.slice(0, 8),
  };
}

/**
 * Build ergonomic impact payload (`ergoImpactJson`) from accessory form numeric inputs.
 * Keys match `@dirtfit/ergonomics-engine` conventions.
 * @param {object} form
 * @param {number|string} [form.loweringLinkMm]
 * @param {number|string} [form.lowSeatMm]
 * @param {number|string} [form.forkDropMm]
 * @param {number|string} [form.barRiserMm]
 * @param {number|string} [form.pegLowerMm]
 * @returns {object|null}
 */
export function buildAccessoryErgoImpactFromForm(form) {
  const payload = {};
  const numericFields = [
    ['loweringLinkMm', form.loweringLinkMm],
    ['lowSeatMm', form.lowSeatMm],
    ['forkDropMm', form.forkDropMm],
    ['barRiserMm', form.barRiserMm],
    ['pegLowerMm', form.pegLowerMm],
  ];

  for (const [key, raw] of numericFields) {
    if (raw === '' || raw === null || raw === undefined) {
      continue;
    }
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      payload[key] = Math.round(parsed);
    }
  }

  return Object.keys(payload).length > 0 ? payload : null;
}
