import crypto from 'node:crypto';
import {
  AppError,
  COD_MAX_AMOUNT_VND,
  ERROR_CODES,
  ORDER_TYPES,
  buildAccessoryProductUrl,
  buildBikeProductUrl,
  resolveAccessoryMedia,
  resolveBikeMedia,
  toSafeVndNumber,
  validateCodEligibility,
} from '@dirtfit/shared';
import {
  computeAvailableQty,
  getActiveReservedQtyByAccessoryIds,
  getActiveReservedQtyByBikeIds,
} from '../../common/inventory/availability.js';
import {
  createBundleCartItems,
  findCartByOwner,
  findCartItemById,
  findOrCreateCart,
  findUnbundledCartItem,
  upsertSingleCartItem,
} from './cart.repository.js';

/**
 * Hydrate a Cart entity with live Lazy Expiration stock status and exact BigInt -> Number totals.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object|null} cart
 * @returns {Promise<object>}
 */
async function buildHydratedCart(prisma, cart) {
  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
    return {
      id: cart?.id ?? null,
      items: [],
      itemCount: 0,
      hasBike: false,
      summary: {
        subtotalVnd: 0,
        installLaborTotalVnd: 0,
        totalVnd: 0,
        depositPayableNowVnd: 0,
        remainingBalanceVnd: 0,
        suggestedOrderType: ORDER_TYPES.ACCESSORY_ONLY,
        codEligible: true,
        codMaxAmountVnd: COD_MAX_AMOUNT_VND,
      },
    };
  }

  const bikeIds = Array.from(
    new Set(cart.items.filter((i) => i.itemType === 'BIKE' && i.bikeId).map((i) => i.bikeId))
  );
  const accessoryIds = Array.from(
    new Set(
      cart.items
        .filter((i) => i.itemType === 'ACCESSORY' && i.accessoryId)
        .map((i) => i.accessoryId)
    )
  );

  const [bikeReservedMap, accessoryReservedMap, compatRows] = await Promise.all([
    getActiveReservedQtyByBikeIds(prisma, bikeIds),
    getActiveReservedQtyByAccessoryIds(prisma, accessoryIds),
    bikeIds.length > 0 && accessoryIds.length > 0
      ? prisma.bikeAccessoryCompatibility.findMany({
          where: {
            bikeId: { in: bikeIds },
            accessoryId: { in: accessoryIds },
          },
          select: {
            bikeId: true,
            accessoryId: true,
            installLaborVnd: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const bikeIdByBundleGroup = new Map();
  for (const item of cart.items) {
    if (item.itemType === 'BIKE' && item.bundleGroupId && item.bikeId) {
      bikeIdByBundleGroup.set(item.bundleGroupId, item.bikeId);
    }
  }

  let subtotalBigInt = 0n;
  let installLaborTotalBigInt = 0n;
  let bikeDepositTotalBigInt = 0n;
  let accessoryWithLaborBigInt = 0n;
  let itemCount = 0;
  let hasBike = false;

  const hydratedItems = cart.items.map((item) => {
    const qtyBigInt = BigInt(item.quantity);
    itemCount += item.quantity;

    if (item.itemType === 'BIKE' && item.bike) {
      hasBike = true;
      const activeReserved = bikeReservedMap.get(item.bike.id) ?? 0;
      const availableQty =
        item.bike.deletedAt === null && item.bike.status === 'ACTIVE'
          ? computeAvailableQty(item.bike.stockQty, activeReserved)
          : 0;
      const unitPriceBigInt = BigInt(item.bike.priceVnd);
      const depositBigInt = BigInt(item.bike.depositAmountVnd);
      const lineTotalBigInt = unitPriceBigInt * qtyBigInt;

      subtotalBigInt += lineTotalBigInt;
      bikeDepositTotalBigInt += depositBigInt * qtyBigInt;

      const bikeMedia = resolveBikeMedia(item.bike.media);
      const productUrl = buildBikeProductUrl(item.bike.slug);
      const brandName = item.bike.brand?.name ?? null;

      return {
        id: item.id,
        itemType: 'BIKE',
        bikeId: item.bikeId,
        accessoryId: null,
        bundleGroupId: item.bundleGroupId ?? null,
        quantity: item.quantity,
        unitPriceVnd: toSafeVndNumber(unitPriceBigInt, 'unitPriceVnd'),
        depositAmountVnd: toSafeVndNumber(depositBigInt, 'depositAmountVnd'),
        installLaborVnd: 0,
        lineTotalVnd: toSafeVndNumber(lineTotalBigInt, 'lineTotalVnd'),
        availableQty,
        inStock: availableQty >= item.quantity,
        slug: item.bike.slug,
        sku: item.bike.sku,
        brand: brandName,
        category: item.bike.category,
        productUrl,
        imageUrl: bikeMedia.commercialImageUrl,
        imageKind: bikeMedia.commercialImageKind,
        product: {
          id: item.bike.id,
          sku: item.bike.sku,
          name: item.bike.name,
          slug: item.bike.slug,
          category: item.bike.category,
          brandName,
          brand: brandName,
          productUrl,
          imageUrl: bikeMedia.commercialImageUrl,
          imageKind: bikeMedia.commercialImageKind,
          status: item.bike.status,
        },
      };
    }

    const acc = item.accessory;
    const activeReserved = acc ? (accessoryReservedMap.get(acc.id) ?? 0) : 0;
    const availableQty =
      acc && acc.deletedAt === null && acc.status === 'ACTIVE'
        ? computeAvailableQty(acc.stockQty, activeReserved)
        : 0;

    let installLaborBigInt = 0n;
    if (acc && item.bundleGroupId && bikeIdByBundleGroup.has(item.bundleGroupId)) {
      const bundleBikeId = bikeIdByBundleGroup.get(item.bundleGroupId);
      const compat = compatRows.find((c) => c.bikeId === bundleBikeId && c.accessoryId === acc.id);
      if (compat) {
        installLaborBigInt = BigInt(compat.installLaborVnd ?? 0n);
      }
    }

    const unitPriceBigInt = BigInt(acc?.priceVnd ?? 0n);
    const lineTotalBigInt = (unitPriceBigInt + installLaborBigInt) * qtyBigInt;

    subtotalBigInt += unitPriceBigInt * qtyBigInt;
    installLaborTotalBigInt += installLaborBigInt * qtyBigInt;
    accessoryWithLaborBigInt += lineTotalBigInt;

    const accMedia = resolveAccessoryMedia(acc);
    const accProductUrl = acc ? buildAccessoryProductUrl(acc.sku) : '/accessories';
    const accBrand = acc?.brandName ?? null;

    return {
      id: item.id,
      itemType: 'ACCESSORY',
      bikeId: null,
      accessoryId: item.accessoryId,
      bundleGroupId: item.bundleGroupId ?? null,
      quantity: item.quantity,
      unitPriceVnd: toSafeVndNumber(unitPriceBigInt, 'unitPriceVnd'),
      depositAmountVnd: 0,
      installLaborVnd: toSafeVndNumber(installLaborBigInt, 'installLaborVnd'),
      lineTotalVnd: toSafeVndNumber(lineTotalBigInt, 'lineTotalVnd'),
      availableQty,
      inStock: availableQty >= item.quantity,
      slug: acc?.slug ?? null,
      sku: acc?.sku ?? null,
      brand: accBrand,
      category: acc?.category ?? null,
      productUrl: accProductUrl,
      imageUrl: accMedia.imageUrl,
      imageKind: accMedia.imageKind,
      product: acc
        ? {
            id: acc.id,
            sku: acc.sku,
            name: acc.name,
            slug: acc.slug,
            category: acc.category,
            brandName: accBrand,
            brand: accBrand,
            productUrl: accProductUrl,
            imageUrl: accMedia.imageUrl,
            imageKind: accMedia.imageKind,
            status: acc.status,
          }
        : null,
    };
  });

  const totalBigInt = subtotalBigInt + installLaborTotalBigInt;
  const rawDepositNowBigInt = bikeDepositTotalBigInt + accessoryWithLaborBigInt;
  const depositPayableNowBigInt = hasBike
    ? rawDepositNowBigInt < totalBigInt
      ? rawDepositNowBigInt
      : totalBigInt
    : totalBigInt;
  const remainingBalanceBigInt = totalBigInt - depositPayableNowBigInt;

  const totalVnd = toSafeVndNumber(totalBigInt, 'totalVnd');
  const suggestedOrderType = hasBike ? ORDER_TYPES.BIKE_DEPOSIT : ORDER_TYPES.ACCESSORY_ONLY;
  const codCheck = validateCodEligibility({ orderType: suggestedOrderType, totalVnd });

  return {
    id: cart.id,
    items: hydratedItems,
    itemCount,
    hasBike,
    summary: {
      subtotalVnd: toSafeVndNumber(subtotalBigInt, 'subtotalVnd'),
      installLaborTotalVnd: toSafeVndNumber(installLaborTotalBigInt, 'installLaborTotalVnd'),
      totalVnd,
      depositPayableNowVnd: toSafeVndNumber(depositPayableNowBigInt, 'depositPayableNowVnd'),
      remainingBalanceVnd: toSafeVndNumber(remainingBalanceBigInt, 'remainingBalanceVnd'),
      suggestedOrderType,
      codEligible: codCheck.eligible,
      codMaxAmountVnd: COD_MAX_AMOUNT_VND,
    },
  };
}

/**
 * Retrieve the current Cart (empty if none exists yet).
 * @param {import('fastify').FastifyInstance} app
 * @param {object} owner
 * @returns {Promise<object>}
 */
export async function getCart(app, owner) {
  const cart = await findCartByOwner(app.prisma, owner);
  return buildHydratedCart(app.prisma, cart);
}

/**
 * Add a motorcycle + compatible lowering/ergo accessories bundle to cart in one transaction.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} owner
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function addBundleToCart(app, owner, payload) {
  const quantity = payload.quantity ?? 1;
  const uniqueAccIds = Array.from(new Set(payload.accessoryIds));

  const [bike, accessories, compatRows, bikeReservedMap, accReservedMap] = await Promise.all([
    app.prisma.bike.findFirst({
      where: { id: payload.bikeId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, name: true, stockQty: true },
    }),
    app.prisma.accessory.findMany({
      where: { id: { in: uniqueAccIds }, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, name: true, stockQty: true },
    }),
    app.prisma.bikeAccessoryCompatibility.findMany({
      where: { bikeId: payload.bikeId, accessoryId: { in: uniqueAccIds } },
      select: { accessoryId: true },
    }),
    getActiveReservedQtyByBikeIds(app.prisma, [payload.bikeId]),
    getActiveReservedQtyByAccessoryIds(app.prisma, uniqueAccIds),
  ]);

  if (!bike) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Motorcycle not found',
      detail: `Active motorcycle ${payload.bikeId} does not exist.`,
    });
  }

  const bikeAvailable = computeAvailableQty(bike.stockQty, bikeReservedMap.get(bike.id) ?? 0);
  if (bikeAvailable < quantity) {
    throw new AppError({
      code: ERROR_CODES.INSUFFICIENT_STOCK,
      status: 409,
      title: 'Insufficient motorcycle stock',
      detail: `${bike.name} only has ${bikeAvailable} unit(s) available.`,
    });
  }

  if (accessories.length !== uniqueAccIds.length) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Accessory not found',
      detail: 'One or more selected accessories do not exist or are inactive.',
    });
  }

  const compatSet = new Set(compatRows.map((c) => c.accessoryId));
  for (const acc of accessories) {
    if (!compatSet.has(acc.id)) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION_ERROR,
        status: 400,
        title: 'Incompatible accessory in combo',
        detail: `Accessory ${acc.name} is not compatible with ${bike.name}.`,
      });
    }
    const available = computeAvailableQty(acc.stockQty, accReservedMap.get(acc.id) ?? 0);
    if (available < quantity) {
      throw new AppError({
        code: ERROR_CODES.INSUFFICIENT_STOCK,
        status: 409,
        title: 'Insufficient accessory stock',
        detail: `Accessory ${acc.name} only has ${available} unit(s) available.`,
      });
    }
  }

  const cart = await findOrCreateCart(app.prisma, owner);
  const bundleGroupId = crypto.randomUUID();
  await app.prisma.$transaction(async (tx) => {
    await createBundleCartItems(tx, cart.id, {
      bikeId: payload.bikeId,
      accessoryIds: uniqueAccIds,
      quantity,
      bundleGroupId,
    });
  });

  return getCart(app, owner);
}

/**
 * Add either a single motorcycle/accessory OR a combo bundle to the persistent cart.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} owner
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function addToCart(app, owner, payload) {
  if (Array.isArray(payload.accessoryIds)) {
    return addBundleToCart(app, owner, payload);
  }

  const quantity = payload.quantity ?? 1;
  const cart = await findOrCreateCart(app.prisma, owner);

  if (payload.itemType === 'BIKE') {
    const [bike, reservedMap, existing] = await Promise.all([
      app.prisma.bike.findFirst({
        where: { id: payload.bikeId, deletedAt: null, status: 'ACTIVE' },
        select: { id: true, name: true, stockQty: true },
      }),
      getActiveReservedQtyByBikeIds(app.prisma, [payload.bikeId]),
      findUnbundledCartItem(app.prisma, cart.id, { itemType: 'BIKE', bikeId: payload.bikeId }),
    ]);

    if (!bike) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        status: 404,
        title: 'Motorcycle not found',
        detail: `Active motorcycle ${payload.bikeId} does not exist.`,
      });
    }

    const available = computeAvailableQty(bike.stockQty, reservedMap.get(bike.id) ?? 0);
    const targetQty = (existing?.quantity ?? 0) + quantity;
    if (available < targetQty) {
      throw new AppError({
        code: ERROR_CODES.INSUFFICIENT_STOCK,
        status: 409,
        title: 'Insufficient motorcycle stock',
        detail: `${bike.name} only has ${available} unit(s) available.`,
      });
    }

    await upsertSingleCartItem(app.prisma, cart.id, {
      itemType: 'BIKE',
      bikeId: bike.id,
      quantity: targetQty,
      existingItemId: existing?.id,
    });
    return getCart(app, owner);
  }

  const [accessory, reservedMap, existing] = await Promise.all([
    app.prisma.accessory.findFirst({
      where: { id: payload.accessoryId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, name: true, stockQty: true },
    }),
    getActiveReservedQtyByAccessoryIds(app.prisma, [payload.accessoryId]),
    findUnbundledCartItem(app.prisma, cart.id, {
      itemType: 'ACCESSORY',
      accessoryId: payload.accessoryId,
    }),
  ]);

  if (!accessory) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Accessory not found',
      detail: `Active accessory ${payload.accessoryId} does not exist.`,
    });
  }

  const available = computeAvailableQty(accessory.stockQty, reservedMap.get(accessory.id) ?? 0);
  const targetQty = (existing?.quantity ?? 0) + quantity;
  if (available < targetQty) {
    throw new AppError({
      code: ERROR_CODES.INSUFFICIENT_STOCK,
      status: 409,
      title: 'Insufficient accessory stock',
      detail: `${accessory.name} only has ${available} unit(s) available.`,
    });
  }

  await upsertSingleCartItem(app.prisma, cart.id, {
    itemType: 'ACCESSORY',
    accessoryId: accessory.id,
    quantity: targetQty,
    existingItemId: existing?.id,
  });
  return getCart(app, owner);
}

/**
 * Update quantity of an owned cart item after validating live available stock.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} owner
 * @param {string} itemId
 * @param {number} quantity
 * @returns {Promise<object>}
 */
export async function updateCartItem(app, owner, itemId, quantity) {
  const cart = await findCartByOwner(app.prisma, owner);
  const item = await findCartItemById(app.prisma, itemId);
  if (!cart || !item || item.cartId !== cart.id) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Cart item not found',
      detail: `Cart item ${itemId} was not found in your cart.`,
    });
  }

  if (item.itemType === 'BIKE' && item.bikeId) {
    const [bike, reservedMap] = await Promise.all([
      app.prisma.bike.findFirst({
        where: { id: item.bikeId, deletedAt: null, status: 'ACTIVE' },
        select: { name: true, stockQty: true },
      }),
      getActiveReservedQtyByBikeIds(app.prisma, [item.bikeId]),
    ]);
    const available = bike
      ? computeAvailableQty(bike.stockQty, reservedMap.get(item.bikeId) ?? 0)
      : 0;
    if (available < quantity) {
      throw new AppError({
        code: ERROR_CODES.INSUFFICIENT_STOCK,
        status: 409,
        title: 'Insufficient motorcycle stock',
        detail: `${bike?.name ?? 'Motorcycle'} only has ${available} unit(s) available.`,
      });
    }
  } else if (item.accessoryId) {
    const [acc, reservedMap] = await Promise.all([
      app.prisma.accessory.findFirst({
        where: { id: item.accessoryId, deletedAt: null, status: 'ACTIVE' },
        select: { name: true, stockQty: true },
      }),
      getActiveReservedQtyByAccessoryIds(app.prisma, [item.accessoryId]),
    ]);
    const available = acc
      ? computeAvailableQty(acc.stockQty, reservedMap.get(item.accessoryId) ?? 0)
      : 0;
    if (available < quantity) {
      throw new AppError({
        code: ERROR_CODES.INSUFFICIENT_STOCK,
        status: 409,
        title: 'Insufficient accessory stock',
        detail: `${acc?.name ?? 'Accessory'} only has ${available} unit(s) available.`,
      });
    }
  }

  await app.prisma.cartItem.update({
    where: { id: itemId },
    data: { quantity },
  });
  return getCart(app, owner);
}

/**
 * Remove a single item from the caller's cart.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} owner
 * @param {string} itemId
 * @returns {Promise<object>}
 */
export async function removeCartItem(app, owner, itemId) {
  const cart = await findCartByOwner(app.prisma, owner);
  const item = await findCartItemById(app.prisma, itemId);
  if (!cart || !item || item.cartId !== cart.id) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Cart item not found',
      detail: `Cart item ${itemId} was not found in your cart.`,
    });
  }

  await app.prisma.cartItem.delete({ where: { id: itemId } });
  return getCart(app, owner);
}

/**
 * Remove all items from the caller's cart.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} owner
 * @returns {Promise<object>}
 */
export async function clearCart(app, owner) {
  const cart = await findCartByOwner(app.prisma, owner);
  if (cart) {
    await app.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  }
  return getCart(app, owner);
}
