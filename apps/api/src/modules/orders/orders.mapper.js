import {
  IMAGE_KINDS,
  buildAccessoryProductUrl,
  buildBikeProductUrl,
  mapMoneyFieldsToNumbers,
  resolveAccessoryMedia,
  resolveBikeMedia,
} from '@dirtfit/shared';

const ORDER_MONEY_FIELDS = [
  'subtotalVnd',
  'installLaborTotalVnd',
  'shippingFeeVnd',
  'discountVnd',
  'totalVnd',
  'payableNowVnd',
  'paidAmountVnd',
  'remainingBalanceVnd',
];

const ORDER_ITEM_MONEY_FIELDS = ['unitPriceVnd', 'installLaborVnd', 'lineTotalVnd'];

/**
 * Convert Prisma OrderItem records into JSON-safe DTOs with live productUrl & imageUrl fallback.
 * @param {object} item
 * @returns {object}
 */
export function mapOrderItem(item) {
  const safe = mapMoneyFieldsToNumbers(item, ORDER_ITEM_MONEY_FIELDS);
  const meta =
    safe.metadataJson && typeof safe.metadataJson === 'object' ? safe.metadataJson : null;

  let slug = meta?.slug ?? null;
  let productUrl = meta?.productUrl ?? null;
  let imageUrl = meta?.imageUrl ?? null;
  let imageKind = meta?.imageKind ?? IMAGE_KINDS.PLACEHOLDER;

  if (safe.itemType === 'BIKE') {
    const liveSlug = safe.bike?.slug ?? slug;
    slug = liveSlug;
    if (liveSlug) {
      productUrl = buildBikeProductUrl(liveSlug);
    }
    if (safe.bike?.media) {
      const resolved = resolveBikeMedia(safe.bike.media);
      imageUrl = resolved.commercialImageUrl ?? imageUrl;
      imageKind = resolved.commercialImageUrl ? resolved.commercialImageKind : imageKind;
    }
  } else if (safe.itemType === 'ACCESSORY') {
    const liveSku = safe.accessory?.sku ?? safe.skuSnapshot;
    slug = safe.accessory?.slug ?? slug;
    productUrl = liveSku ? buildAccessoryProductUrl(liveSku) : (productUrl ?? '/accessories');
    if (safe.accessory) {
      const resolved = resolveAccessoryMedia(safe.accessory);
      imageUrl = resolved.imageUrl ?? imageUrl;
      imageKind = resolved.imageUrl ? resolved.imageKind : imageKind;
    }
  }

  return {
    id: safe.id,
    orderId: safe.orderId,
    itemType: safe.itemType,
    bikeId: safe.bikeId ?? null,
    accessoryId: safe.accessoryId ?? null,
    productNameSnapshot: safe.productNameSnapshot,
    skuSnapshot: safe.skuSnapshot,
    slug,
    productUrl,
    imageUrl,
    imageKind,
    unitPriceVnd: safe.unitPriceVnd,
    installLaborVnd: safe.installLaborVnd,
    quantity: safe.quantity,
    lineTotalVnd: safe.lineTotalVnd,
    metadataJson: meta,
  };
}

/**
 * Convert Prisma PaymentTransaction record into a JSON-safe DTO.
 * @param {object} txRow
 * @returns {object}
 */
export function mapPaymentTransaction(txRow) {
  const safe = mapMoneyFieldsToNumbers(txRow, ['amountVnd']);
  return {
    id: safe.id,
    orderId: safe.orderId,
    provider: safe.provider,
    providerTxId: safe.providerTxId ?? null,
    checkoutUrl: safe.checkoutUrl ?? null,
    amountVnd: safe.amountVnd,
    currency: safe.currency,
    status: safe.status,
    failureReason: safe.failureReason ?? null,
    verifiedAt:
      safe.verifiedAt instanceof Date ? safe.verifiedAt.toISOString() : (safe.verifiedAt ?? null),
    createdAt: safe.createdAt instanceof Date ? safe.createdAt.toISOString() : safe.createdAt,
  };
}

/**
 * Convert Prisma Order graph into a JSON-safe DTO (every BigInt VND column converted to Number).
 * @param {object} order
 * @returns {object}
 */
export function mapOrderRecord(order) {
  const safe = mapMoneyFieldsToNumbers(order, ORDER_MONEY_FIELDS);

  return {
    id: safe.id,
    orderNumber: safe.orderNumber,
    userId: safe.userId,
    orderType: safe.orderType,
    status: safe.status,
    paymentMethod: safe.paymentMethod,
    subtotalVnd: safe.subtotalVnd,
    installLaborTotalVnd: safe.installLaborTotalVnd,
    shippingFeeVnd: safe.shippingFeeVnd,
    discountVnd: safe.discountVnd,
    totalVnd: safe.totalVnd,
    payableNowVnd: safe.payableNowVnd,
    paidAmountVnd: safe.paidAmountVnd,
    remainingBalanceVnd: safe.remainingBalanceVnd,
    reservationExpiresAt:
      safe.reservationExpiresAt instanceof Date
        ? safe.reservationExpiresAt.toISOString()
        : (safe.reservationExpiresAt ?? null),
    shippingAddressJson: safe.shippingAddressJson,
    riderFitSnapshotJson: safe.riderFitSnapshotJson ?? null,
    customerNote: safe.customerNote ?? null,
    internalNote: safe.internalNote ?? null,
    createdAt: safe.createdAt instanceof Date ? safe.createdAt.toISOString() : safe.createdAt,
    updatedAt: safe.updatedAt instanceof Date ? safe.updatedAt.toISOString() : safe.updatedAt,
    ...(safe.user
      ? {
          user: {
            id: safe.user.id,
            email: safe.user.email,
            fullName: safe.user.fullName,
            phone: safe.user.phone ?? null,
          },
        }
      : {}),
    items: Array.isArray(safe.items) ? safe.items.map(mapOrderItem) : [],
    reservations: Array.isArray(safe.reservations)
      ? safe.reservations.map((r) => ({
          id: r.id,
          itemType: r.itemType,
          bikeId: r.bikeId ?? null,
          accessoryId: r.accessoryId ?? null,
          quantity: r.quantity,
          status: r.status,
          expiresAt: r.expiresAt instanceof Date ? r.expiresAt.toISOString() : r.expiresAt,
          resolvedAt:
            r.resolvedAt instanceof Date ? r.resolvedAt.toISOString() : (r.resolvedAt ?? null),
        }))
      : [],
    transactions: Array.isArray(safe.transactions)
      ? safe.transactions.map(mapPaymentTransaction)
      : [],
  };
}
