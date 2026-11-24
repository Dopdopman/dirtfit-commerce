const CART_ITEMS_INCLUDE = {
  items: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      bike: {
        include: {
          brand: true,
          media: {
            where: { deletedAt: null },
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
            take: 2,
          },
        },
      },
      accessory: true,
    },
  },
};

/**
 * Find an existing cart by authenticated userId or guestToken.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} owner
 * @param {string|null} [owner.userId]
 * @param {string|null} [owner.guestToken]
 * @returns {Promise<object|null>}
 */
export async function findCartByOwner(prisma, { userId = null, guestToken = null }) {
  if (!userId && !guestToken) {
    return null;
  }

  return prisma.cart.findFirst({
    where: userId ? { userId } : { guestToken },
    include: CART_ITEMS_INCLUDE,
  });
}

/**
 * Find or create a persistent Cart for either an authenticated user or guest token.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} owner
 * @param {string|null} [owner.userId]
 * @param {string|null} [owner.guestToken]
 * @returns {Promise<object>}
 */
export async function findOrCreateCart(prisma, { userId = null, guestToken = null }) {
  const existing = await findCartByOwner(prisma, { userId, guestToken });
  if (existing) {
    return existing;
  }

  const expiresAt = userId ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return prisma.cart.create({
    data: userId ? { userId } : { guestToken, expiresAt },
    include: CART_ITEMS_INCLUDE,
  });
}

/**
 * Fetch a single CartItem by id.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} itemId
 * @returns {Promise<object|null>}
 */
export async function findCartItemById(prisma, itemId) {
  return prisma.cartItem.findUnique({ where: { id: itemId } });
}

/**
 * Find an existing unbundled cart line item matching bikeId or accessoryId.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} cartId
 * @param {object} ref
 * @param {string} ref.itemType
 * @param {string} [ref.bikeId]
 * @param {string} [ref.accessoryId]
 * @returns {Promise<object|null>}
 */
export async function findUnbundledCartItem(prisma, cartId, { itemType, bikeId, accessoryId }) {
  return prisma.cartItem.findFirst({
    where: {
      cartId,
      itemType,
      bundleGroupId: null,
      ...(itemType === 'BIKE' ? { bikeId } : { accessoryId }),
    },
  });
}

/**
 * Upsert an unbundled CartItem quantity inside a transaction.
 * @param {import('@prisma/client').PrismaClient} tx
 * @param {string} cartId
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function upsertSingleCartItem(tx, cartId, input) {
  if (input.existingItemId) {
    return tx.cartItem.update({
      where: { id: input.existingItemId },
      data: { quantity: input.quantity },
    });
  }

  return tx.cartItem.create({
    data: {
      cartId,
      itemType: input.itemType,
      bikeId: input.itemType === 'BIKE' ? input.bikeId : null,
      accessoryId: input.itemType === 'ACCESSORY' ? input.accessoryId : null,
      bundleGroupId: null,
      quantity: input.quantity,
    },
  });
}

/**
 * Insert a Bike + Compatible Accessories Simulator Bundle sharing a single bundleGroupId.
 * @param {import('@prisma/client').PrismaClient} tx
 * @param {string} cartId
 * @param {object} bundle
 * @param {string} bundle.bikeId
 * @param {string[]} bundle.accessoryIds
 * @param {number} bundle.quantity
 * @param {string} bundle.bundleGroupId
 * @returns {Promise<void>}
 */
export async function createBundleCartItems(
  tx,
  cartId,
  { bikeId, accessoryIds, quantity, bundleGroupId }
) {
  await tx.cartItem.create({
    data: {
      cartId,
      itemType: 'BIKE',
      bikeId,
      bundleGroupId,
      quantity,
    },
  });

  if (accessoryIds.length > 0) {
    await tx.cartItem.createMany({
      data: accessoryIds.map((accessoryId) => ({
        cartId,
        itemType: 'ACCESSORY',
        accessoryId,
        bundleGroupId,
        quantity,
      })),
    });
  }
}

/**
 * Merge any anonymous guest cart into an authenticated user cart on login.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} guestToken
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function mergeGuestCartToUser(prisma, guestToken, userId) {
  if (!guestToken) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const guestCart = await tx.cart.findUnique({
      where: { guestToken },
      include: { items: true },
    });
    if (!guestCart) {
      return;
    }

    if (guestCart.items.length === 0) {
      await tx.cart.delete({ where: { id: guestCart.id } });
      return;
    }

    let userCart = await tx.cart.findUnique({
      where: { userId },
      include: { items: true },
    });
    if (!userCart) {
      userCart = await tx.cart.create({
        data: { userId },
        include: { items: true },
      });
    }

    for (const gItem of guestCart.items) {
      if (!gItem.bundleGroupId) {
        const match = userCart.items.find(
          (uItem) =>
            !uItem.bundleGroupId &&
            uItem.itemType === gItem.itemType &&
            (uItem.itemType === 'BIKE'
              ? uItem.bikeId === gItem.bikeId
              : uItem.accessoryId === gItem.accessoryId)
        );
        if (match) {
          await tx.cartItem.update({
            where: { id: match.id },
            data: { quantity: Math.min(20, match.quantity + gItem.quantity) },
          });
          continue;
        }
      }

      await tx.cartItem.create({
        data: {
          cartId: userCart.id,
          itemType: gItem.itemType,
          bikeId: gItem.bikeId,
          accessoryId: gItem.accessoryId,
          bundleGroupId: gItem.bundleGroupId,
          quantity: gItem.quantity,
        },
      });
    }

    await tx.cart.delete({ where: { id: guestCart.id } });
  });
}
