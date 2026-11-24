import { mapMoneyFieldsToNumbers } from '@dirtfit/shared';

/**
 * Convert a Prisma Accessory record (and optional compatible bikes) to a JSON-safe DTO.
 * @param {object} accessory
 * @returns {object}
 */
export function mapAccessoryRecord(accessory) {
  const safe = mapMoneyFieldsToNumbers(accessory, ['priceVnd']);

  return {
    id: safe.id,
    sku: safe.sku,
    name: safe.name,
    slug: safe.slug,
    category: safe.category,
    brandName: safe.brandName ?? null,
    priceVnd: safe.priceVnd,
    stockQty: safe.stockQty,
    reservedQty: safe.reservedQty,
    version: safe.version,
    status: safe.status,
    imageUrl: safe.imageUrl ?? null,
    descriptionMd: safe.descriptionMd ?? null,
    ergoImpactJson: safe.ergoImpactJson ?? null,
    createdAt: safe.createdAt instanceof Date ? safe.createdAt.toISOString() : safe.createdAt,
    updatedAt: safe.updatedAt instanceof Date ? safe.updatedAt.toISOString() : safe.updatedAt,
    deletedAt:
      safe.deletedAt instanceof Date ? safe.deletedAt.toISOString() : (safe.deletedAt ?? null),
    compatibleBikes: Array.isArray(safe.compatibilities)
      ? safe.compatibilities
          .filter((comp) => comp.bike && comp.bike.deletedAt === null)
          .map((comp) => {
            const safeComp = mapMoneyFieldsToNumbers(comp, ['installLaborVnd']);
            const safeBike = mapMoneyFieldsToNumbers(comp.bike, ['priceVnd', 'depositAmountVnd']);
            return {
              id: safeComp.id,
              bikeId: safeComp.bikeId,
              exactSeatDropMm: safeComp.exactSeatDropMm ?? null,
              exactForkDropMm: safeComp.exactForkDropMm ?? null,
              requiresWorkshopInstall: Boolean(safeComp.requiresWorkshopInstall),
              installLaborVnd: safeComp.installLaborVnd ?? 0,
              fitmentNotes: safeComp.fitmentNotes ?? null,
              bike: {
                id: safeBike.id,
                name: safeBike.name,
                slug: safeBike.slug,
                category: safeBike.category,
                priceVnd: safeBike.priceVnd,
                depositAmountVnd: safeBike.depositAmountVnd,
                brand: safeBike.brand ?? null,
              },
            };
          })
      : [],
  };
}
