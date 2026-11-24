import { mapMoneyFieldsToNumbers, toSafeVndNumber } from '@dirtfit/shared';

/**
 * Map a Prisma Brand record into a JSON-safe DTO.
 * @param {object} brand
 * @returns {object}
 */
export function mapBrand(brand) {
  return {
    id: brand.id,
    name: brand.name,
    slug: brand.slug,
    country: brand.country ?? null,
    logoUrl: brand.logoUrl ?? null,
  };
}

/**
 * Map a Prisma BikeGeometrySpec record into a plain object.
 * @param {object|null|undefined} spec
 * @returns {object|null}
 */
export function mapGeometrySpec(spec) {
  if (!spec) {
    return null;
  }
  return {
    id: spec.id,
    bikeId: spec.bikeId,
    unladenSeatHeightMm: spec.unladenSeatHeightMm,
    seatWidthMm: spec.seatWidthMm,
    wheelbaseMm: spec.wheelbaseMm,
    groundClearanceMm: spec.groundClearanceMm,
    frontWheelDiameterIn: spec.frontWheelDiameterIn,
    rearWheelDiameterIn: spec.rearWheelDiameterIn,
    frontTireOuterRadiusMm: spec.frontTireOuterRadiusMm,
    rearTireOuterRadiusMm: spec.rearTireOuterRadiusMm,
    frontTravelMm: spec.frontTravelMm,
    rearTravelMm: spec.rearTravelMm,
    staticSagRearMm: spec.staticSagRearMm,
    staticSagFrontMm: spec.staticSagFrontMm,
    targetRiderSagRatio: spec.targetRiderSagRatio,
    referenceRiderWeightKg: spec.referenceRiderWeightKg,
    linkageProgressionAlpha: spec.linkageProgressionAlpha,
    seatFoamFirmness: spec.seatFoamFirmness,
    seatPocketXMm: spec.seatPocketXMm,
    seatPocketYMm: spec.seatPocketYMm,
    footpegXMm: spec.footpegXMm,
    footpegYMm: spec.footpegYMm,
    handlebarGripXMm: spec.handlebarGripXMm,
    handlebarGripYMm: spec.handlebarGripYMm,
    rakeDeg: spec.rakeDeg ?? null,
    trailMm: spec.trailMm ?? null,
    wetWeightKg: spec.wetWeightKg,
    fuelCapacityL: spec.fuelCapacityL ?? null,
    technicalSpecsJson: spec.technicalSpecsJson ?? null,
    updatedAt: spec.updatedAt instanceof Date ? spec.updatedAt.toISOString() : spec.updatedAt,
  };
}

/**
 * Map a Prisma BikeMedia record into a JSON-safe DTO.
 * @param {object} media
 * @returns {object}
 */
export function mapBikeMedia(media) {
  return {
    id: media.id,
    bikeId: media.bikeId,
    url: media.url,
    storageKey: media.storageKey,
    mediaType: media.mediaType,
    altText: media.altText ?? null,
    widthPx: media.widthPx ?? null,
    heightPx: media.heightPx ?? null,
    isPrimary: media.isPrimary,
    sortOrder: media.sortOrder,
    calibrationData: media.calibrationData ?? null,
    createdAt: media.createdAt instanceof Date ? media.createdAt.toISOString() : media.createdAt,
    updatedAt: media.updatedAt instanceof Date ? media.updatedAt.toISOString() : media.updatedAt,
  };
}

/**
 * Map a BikeAccessoryCompatibility row (and its nested Accessory) with safe Number VND conversions.
 * @param {object} comp
 * @returns {object}
 */
export function mapCompatibilityItem(comp) {
  const mappedComp = mapMoneyFieldsToNumbers(comp, ['installLaborVnd']);
  const mappedAcc = comp.accessory ? mapMoneyFieldsToNumbers(comp.accessory, ['priceVnd']) : null;

  return {
    id: mappedComp.id,
    bikeId: mappedComp.bikeId,
    accessoryId: mappedComp.accessoryId,
    exactSeatDropMm: mappedComp.exactSeatDropMm ?? null,
    exactForkDropMm: mappedComp.exactForkDropMm ?? null,
    requiresWorkshopInstall: Boolean(mappedComp.requiresWorkshopInstall),
    installLaborVnd: toSafeVndNumber(mappedComp.installLaborVnd ?? 0, 'installLaborVnd'),
    fitmentNotes: mappedComp.fitmentNotes ?? null,
    accessory: mappedAcc
      ? {
          id: mappedAcc.id,
          sku: mappedAcc.sku,
          name: mappedAcc.name,
          slug: mappedAcc.slug,
          category: mappedAcc.category,
          brandName: mappedAcc.brandName ?? null,
          priceVnd: mappedAcc.priceVnd,
          stockQty: mappedAcc.stockQty,
          reservedQty: mappedAcc.reservedQty,
          status: mappedAcc.status,
          imageUrl: mappedAcc.imageUrl ?? null,
          ergoImpactJson: mappedAcc.ergoImpactJson ?? null,
        }
      : null,
  };
}

/**
 * Convert a Prisma Bike graph into a JSON-safe DTO (all BigInt VND columns converted to Number).
 * @param {object} bike
 * @returns {object}
 */
export function mapBikeRecord(bike) {
  const safeBike = mapMoneyFieldsToNumbers(bike, ['priceVnd', 'depositAmountVnd']);

  return {
    id: safeBike.id,
    brandId: safeBike.brandId,
    sku: safeBike.sku,
    name: safeBike.name,
    slug: safeBike.slug,
    modelYear: safeBike.modelYear,
    category: safeBike.category,
    ridingFocus: safeBike.ridingFocus,
    engineCc: safeBike.engineCc,
    streetLegal: Boolean(safeBike.streetLegal),
    priceVnd: safeBike.priceVnd,
    depositAmountVnd: safeBike.depositAmountVnd,
    stockQty: safeBike.stockQty,
    reservedQty: safeBike.reservedQty,
    version: safeBike.version,
    status: safeBike.status,
    shortSummary: safeBike.shortSummary ?? null,
    descriptionMd: safeBike.descriptionMd ?? null,
    createdAt:
      safeBike.createdAt instanceof Date ? safeBike.createdAt.toISOString() : safeBike.createdAt,
    updatedAt:
      safeBike.updatedAt instanceof Date ? safeBike.updatedAt.toISOString() : safeBike.updatedAt,
    deletedAt:
      safeBike.deletedAt instanceof Date
        ? safeBike.deletedAt.toISOString()
        : (safeBike.deletedAt ?? null),
    brand: safeBike.brand ? mapBrand(safeBike.brand) : null,
    geometrySpec: safeBike.geometrySpec ? mapGeometrySpec(safeBike.geometrySpec) : null,
    media: Array.isArray(safeBike.media) ? safeBike.media.map(mapBikeMedia) : [],
    compatibilities: Array.isArray(safeBike.compatibilities)
      ? safeBike.compatibilities.map(mapCompatibilityItem)
      : [],
  };
}
