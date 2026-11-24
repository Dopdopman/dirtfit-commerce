import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { toVndBigInt } from '@dirtfit/shared/money';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.resolve(__dirname, '../.env');

if (!process.env.DATABASE_URL && fs.existsSync(ENV_PATH)) {
  process.loadEnvFile(ENV_PATH);
}

const prisma = new PrismaClient();

const ARGON2_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
});

const BRANDS = [
  { name: 'Honda', slug: 'honda', country: 'Japan' },
  { name: 'Yamaha', slug: 'yamaha', country: 'Japan' },
  { name: 'Kawasaki', slug: 'kawasaki', country: 'Japan' },
  { name: 'KTM', slug: 'ktm', country: 'Austria' },
  { name: 'Husqvarna', slug: 'husqvarna', country: 'Sweden' },
];

const BIKES = [
  {
    brandSlug: 'honda',
    sku: 'HON-CRF150L-2026',
    name: 'Honda CRF150L',
    slug: 'honda-crf150l',
    modelYear: 2026,
    category: 'DUAL_SPORT',
    ridingFocus: 'ON_OFF_MIXED',
    engineCc: 149,
    streetLegal: true,
    priceVnd: 78_000_000,
    depositAmountVnd: 8_000_000,
    stockQty: 6,
    shortSummary: 'Xe cào cào phổ thông 150cc dễ làm quen, bền bỉ cho phố và đường mòn nhẹ.',
    geometry: {
      unladenSeatHeightMm: 869,
      seatWidthMm: 165,
      wheelbaseMm: 1375,
      groundClearanceMm: 285,
      frontWheelDiameterIn: 21,
      rearWheelDiameterIn: 18,
      frontTireOuterRadiusMm: 350,
      rearTireOuterRadiusMm: 332,
      frontTravelMm: 225,
      rearTravelMm: 207,
      staticSagRearMm: 24,
      staticSagFrontMm: 20,
      targetRiderSagRatio: 0.34,
      referenceRiderWeightKg: 75,
      linkageProgressionAlpha: 0.92,
      seatFoamFirmness: 'MEDIUM',
      seatPocketXMm: 520,
      seatPocketYMm: 869,
      footpegXMm: 580,
      footpegYMm: 380,
      handlebarGripXMm: 870,
      handlebarGripYMm: 1090,
      rakeDeg: 27,
      trailMm: 103,
      wetWeightKg: 122,
      fuelCapacityL: 7.2,
    },
  },
  {
    brandSlug: 'honda',
    sku: 'HON-CRF300L-2026',
    name: 'Honda CRF300L',
    slug: 'honda-crf300l',
    modelYear: 2026,
    category: 'DUAL_SPORT',
    ridingFocus: 'ON_OFF_MIXED',
    engineCc: 286,
    streetLegal: true,
    priceVnd: 168_000_000,
    depositAmountVnd: 15_000_000,
    stockQty: 4,
    shortSummary: 'Dual-Sport 300cc quốc dân: hành trình phuộc êm 260mm, đi tour lẫn off-road.',
    geometry: {
      unladenSeatHeightMm: 880,
      seatWidthMm: 175,
      wheelbaseMm: 1455,
      groundClearanceMm: 285,
      frontWheelDiameterIn: 21,
      rearWheelDiameterIn: 18,
      frontTireOuterRadiusMm: 355,
      rearTireOuterRadiusMm: 338,
      frontTravelMm: 260,
      rearTravelMm: 260,
      staticSagRearMm: 32,
      staticSagFrontMm: 24,
      targetRiderSagRatio: 0.35,
      referenceRiderWeightKg: 78,
      linkageProgressionAlpha: 0.95,
      seatFoamFirmness: 'MEDIUM',
      seatPocketXMm: 560,
      seatPocketYMm: 880,
      footpegXMm: 615,
      footpegYMm: 365,
      handlebarGripXMm: 930,
      handlebarGripYMm: 1120,
      rakeDeg: 27.5,
      trailMm: 109,
      wetWeightKg: 142,
      fuelCapacityL: 7.8,
    },
  },
  {
    brandSlug: 'yamaha',
    sku: 'YAM-WR155R-2026',
    name: 'Yamaha WR155R',
    slug: 'yamaha-wr155r',
    modelYear: 2026,
    category: 'DUAL_SPORT',
    ridingFocus: 'ON_OFF_MIXED',
    engineCc: 155,
    streetLegal: true,
    priceVnd: 79_000_000,
    depositAmountVnd: 8_000_000,
    stockQty: 5,
    shortSummary: 'Động cơ VVA 155cc làm mát dung dịch mạnh mẽ ở tua cao, khung gầm chắc.',
    geometry: {
      unladenSeatHeightMm: 880,
      seatWidthMm: 168,
      wheelbaseMm: 1430,
      groundClearanceMm: 245,
      frontWheelDiameterIn: 21,
      rearWheelDiameterIn: 18,
      frontTireOuterRadiusMm: 352,
      rearTireOuterRadiusMm: 334,
      frontTravelMm: 215,
      rearTravelMm: 185,
      staticSagRearMm: 22,
      staticSagFrontMm: 20,
      targetRiderSagRatio: 0.33,
      referenceRiderWeightKg: 76,
      linkageProgressionAlpha: 0.9,
      seatFoamFirmness: 'MEDIUM',
      seatPocketXMm: 545,
      seatPocketYMm: 880,
      footpegXMm: 605,
      footpegYMm: 375,
      handlebarGripXMm: 910,
      handlebarGripYMm: 1105,
      rakeDeg: 27.3,
      trailMm: 106,
      wetWeightKg: 134,
      fuelCapacityL: 8.1,
    },
  },
  {
    brandSlug: 'kawasaki',
    sku: 'KAW-KLX230-2026',
    name: 'Kawasaki KLX230',
    slug: 'kawasaki-klx230',
    modelYear: 2026,
    category: 'DUAL_SPORT',
    ridingFocus: 'ON_OFF_MIXED',
    engineCc: 233,
    streetLegal: true,
    priceVnd: 149_000_000,
    depositAmountVnd: 12_000_000,
    stockQty: 4,
    shortSummary: 'Mô-men xoắn tầm thấp dồi dào, góc lái linh hoạt cho đường đèo và trail đá.',
    geometry: {
      unladenSeatHeightMm: 885,
      seatWidthMm: 170,
      wheelbaseMm: 1380,
      groundClearanceMm: 265,
      frontWheelDiameterIn: 21,
      rearWheelDiameterIn: 18,
      frontTireOuterRadiusMm: 352,
      rearTireOuterRadiusMm: 335,
      frontTravelMm: 220,
      rearTravelMm: 223,
      staticSagRearMm: 25,
      staticSagFrontMm: 22,
      targetRiderSagRatio: 0.33,
      referenceRiderWeightKg: 78,
      linkageProgressionAlpha: 0.9,
      seatFoamFirmness: 'MEDIUM',
      seatPocketXMm: 530,
      seatPocketYMm: 885,
      footpegXMm: 590,
      footpegYMm: 375,
      handlebarGripXMm: 890,
      handlebarGripYMm: 1110,
      rakeDeg: 27.5,
      trailMm: 116,
      wetWeightKg: 134,
      fuelCapacityL: 7.5,
    },
  },
  {
    brandSlug: 'ktm',
    sku: 'KTM-350EXCF-2026',
    name: 'KTM 350 EXC-F',
    slug: 'ktm-350-exc-f',
    modelYear: 2026,
    category: 'ENDURO',
    ridingFocus: 'OFF_ROAD',
    engineCc: 349,
    streetLegal: true,
    priceVnd: 359_000_000,
    depositAmountVnd: 30_000_000,
    stockQty: 3,
    shortSummary: 'Chuẩn mực Enduro chuyên nghiệp: phuộc WP XACT 300/310mm, trọng lượng siêu nhẹ.',
    geometry: {
      unladenSeatHeightMm: 963,
      seatWidthMm: 145,
      wheelbaseMm: 1489,
      groundClearanceMm: 347,
      frontWheelDiameterIn: 21,
      rearWheelDiameterIn: 18,
      frontTireOuterRadiusMm: 358,
      rearTireOuterRadiusMm: 342,
      frontTravelMm: 300,
      rearTravelMm: 310,
      staticSagRearMm: 35,
      staticSagFrontMm: 26,
      targetRiderSagRatio: 0.33,
      referenceRiderWeightKg: 83,
      linkageProgressionAlpha: 0.88,
      seatFoamFirmness: 'FIRM',
      seatPocketXMm: 565,
      seatPocketYMm: 963,
      footpegXMm: 620,
      footpegYMm: 410,
      handlebarGripXMm: 955,
      handlebarGripYMm: 1175,
      rakeDeg: 26.5,
      trailMm: 98,
      wetWeightKg: 111,
      fuelCapacityL: 8.5,
    },
  },
  {
    brandSlug: 'husqvarna',
    sku: 'HQV-FE350-2026',
    name: 'Husqvarna FE 350',
    slug: 'husqvarna-fe-350',
    modelYear: 2026,
    category: 'ENDURO',
    ridingFocus: 'OFF_ROAD',
    engineCc: 349,
    streetLegal: true,
    priceVnd: 375_000_000,
    depositAmountVnd: 30_000_000,
    stockQty: 2,
    shortSummary: 'Enduro cao cấp dùng hệ thống link phuộc sau lũy tiến, ổn định cao ở tốc độ lớn.',
    geometry: {
      unladenSeatHeightMm: 952,
      seatWidthMm: 148,
      wheelbaseMm: 1489,
      groundClearanceMm: 343,
      frontWheelDiameterIn: 21,
      rearWheelDiameterIn: 18,
      frontTireOuterRadiusMm: 358,
      rearTireOuterRadiusMm: 342,
      frontTravelMm: 300,
      rearTravelMm: 300,
      staticSagRearMm: 34,
      staticSagFrontMm: 26,
      targetRiderSagRatio: 0.33,
      referenceRiderWeightKg: 83,
      linkageProgressionAlpha: 0.85,
      seatFoamFirmness: 'FIRM',
      seatPocketXMm: 565,
      seatPocketYMm: 952,
      footpegXMm: 620,
      footpegYMm: 405,
      handlebarGripXMm: 955,
      handlebarGripYMm: 1170,
      rakeDeg: 26.5,
      trailMm: 98,
      wetWeightKg: 112,
      fuelCapacityL: 8.5,
    },
  },
  {
    brandSlug: 'yamaha',
    sku: 'YAM-TENERE700-2026',
    name: 'Yamaha Ténéré 700',
    slug: 'yamaha-tenere-700',
    modelYear: 2026,
    category: 'ADVENTURE',
    ridingFocus: 'ON_ROAD_ADV',
    engineCc: 689,
    streetLegal: true,
    priceVnd: 399_000_000,
    depositAmountVnd: 35_000_000,
    stockQty: 3,
    shortSummary: 'Adventure CP2 689cc xuyên lục địa: bình xăng 16L, yên rộng 220mm đi tour dài.',
    geometry: {
      unladenSeatHeightMm: 875,
      seatWidthMm: 220,
      wheelbaseMm: 1595,
      groundClearanceMm: 240,
      frontWheelDiameterIn: 21,
      rearWheelDiameterIn: 18,
      frontTireOuterRadiusMm: 355,
      rearTireOuterRadiusMm: 342,
      frontTravelMm: 210,
      rearTravelMm: 200,
      staticSagRearMm: 22,
      staticSagFrontMm: 20,
      targetRiderSagRatio: 0.3,
      referenceRiderWeightKg: 85,
      linkageProgressionAlpha: 0.85,
      seatFoamFirmness: 'PLUSH',
      seatPocketXMm: 610,
      seatPocketYMm: 875,
      footpegXMm: 660,
      footpegYMm: 375,
      handlebarGripXMm: 1010,
      handlebarGripYMm: 1165,
      rakeDeg: 27,
      trailMm: 105,
      wetWeightKg: 204,
      fuelCapacityL: 16,
    },
  },
  {
    brandSlug: 'honda',
    sku: 'HON-CRF250R-2026',
    name: 'Honda CRF250R',
    slug: 'honda-crf250r',
    modelYear: 2026,
    category: 'MOTOCROSS',
    ridingFocus: 'OFF_ROAD',
    engineCc: 249,
    streetLegal: false,
    priceVnd: 245_000_000,
    depositAmountVnd: 25_000_000,
    stockQty: 2,
    shortSummary: 'Motocross chuyên sân đua (không biển số), phuộc Showa 310/313mm chịu nhảy cao.',
    geometry: {
      unladenSeatHeightMm: 960,
      seatWidthMm: 142,
      wheelbaseMm: 1483,
      groundClearanceMm: 333,
      frontWheelDiameterIn: 21,
      rearWheelDiameterIn: 19,
      frontTireOuterRadiusMm: 358,
      rearTireOuterRadiusMm: 344,
      frontTravelMm: 310,
      rearTravelMm: 313,
      staticSagRearMm: 36,
      staticSagFrontMm: 28,
      targetRiderSagRatio: 0.33,
      referenceRiderWeightKg: 83,
      linkageProgressionAlpha: 0.85,
      seatFoamFirmness: 'FIRM',
      seatPocketXMm: 560,
      seatPocketYMm: 960,
      footpegXMm: 618,
      footpegYMm: 412,
      handlebarGripXMm: 950,
      handlebarGripYMm: 1170,
      rakeDeg: 27.3,
      trailMm: 115,
      wetWeightKg: 104,
      fuelCapacityL: 6.3,
    },
  },
];

const ACCESSORIES = [
  {
    sku: 'ACC-ZETA-LINK-30',
    name: 'Zeta Lowering Link -30mm',
    slug: 'zeta-lowering-link-30mm',
    category: 'LOWERING_LINK',
    brandName: 'Zeta Racing',
    priceVnd: 3_200_000,
    stockQty: 14,
    ergoImpactJson: { loweringLinkMm: 30, forkDropMm: 10 },
  },
  {
    sku: 'ACC-SOUBEY-LINK-25',
    name: 'Soubeyras Pro Lowering Link -25mm',
    slug: 'soubeyras-pro-lowering-link-25mm',
    category: 'LOWERING_LINK',
    brandName: 'Soubeyras',
    priceVnd: 2_850_000,
    stockQty: 12,
    ergoImpactJson: { loweringLinkMm: 25, forkDropMm: 8 },
  },
  {
    sku: 'ACC-TOURING-LINK-35',
    name: 'Lust Racing Tenere Lowering Kit -35mm',
    slug: 'lust-racing-tenere-lowering-kit-35mm',
    category: 'LOWERING_LINK',
    brandName: 'Lust Racing',
    priceVnd: 3_950_000,
    stockQty: 8,
    ergoImpactJson: { loweringLinkMm: 35, forkDropMm: 12 },
  },
  {
    sku: 'ACC-OEM-LOWSEAT-25',
    name: 'Factory Low Seat -25mm (Slim Edge)',
    slug: 'factory-low-seat-25mm',
    category: 'LOW_SEAT',
    brandName: 'Seat Concepts',
    priceVnd: 4_800_000,
    stockQty: 10,
    ergoImpactJson: { lowSeatMm: 25, seatWidthReductionMm: 12 },
  },
  {
    sku: 'ACC-ENDURO-LOWSEAT-20',
    name: 'Enduro Shaved Low Seat -20mm',
    slug: 'enduro-shaved-low-seat-20mm',
    category: 'LOW_SEAT',
    brandName: 'PowerParts',
    priceVnd: 4_200_000,
    stockQty: 9,
    ergoImpactJson: { lowSeatMm: 20, seatWidthReductionMm: 10 },
  },
  {
    sku: 'ACC-ROX-RISER-30',
    name: 'Rox Pivoting Bar Riser +30mm',
    slug: 'rox-pivoting-bar-riser-30mm',
    category: 'BAR_RISER',
    brandName: 'Rox Speed FX',
    priceVnd: 2_100_000,
    stockQty: 18,
    ergoImpactJson: { barRiserMm: 30, barBackOffsetMm: 8 },
  },
  {
    sku: 'ACC-WP-SOFT-SPRING',
    name: 'WP Linear Rear Shock Spring (57 N/mm Light Rider)',
    slug: 'wp-linear-rear-shock-spring-57n',
    category: 'SHOCK_SPRING',
    brandName: 'WP Pro Components',
    priceVnd: 5_400_000,
    stockQty: 6,
    ergoImpactJson: { springRateRatio: 0.84 },
  },
  {
    sku: 'ACC-ALPINESTARS-TECH7',
    name: 'Alpinestars Tech 7 MX Boots (Black/Orange)',
    slug: 'alpinestars-tech-7-mx-boots',
    category: 'APPAREL',
    brandName: 'Alpinestars',
    priceVnd: 10_900_000,
    stockQty: 20,
    ergoImpactJson: null,
  },
];

async function seedUsers() {
  const adminPasswordHash = await argon2.hash('Admin@DirtFit2026!', ARGON2_OPTIONS);
  const staffPasswordHash = await argon2.hash('Sales@DirtFit2026!', ARGON2_OPTIONS);
  const customerPasswordHash = await argon2.hash('Rider@DirtFit2026!', ARGON2_OPTIONS);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@dirtfit.vn' },
    update: {
      fullName: 'DirtFit System Admin',
      phone: '+84901000001',
      role: 'ADMIN',
      passwordHash: adminPasswordHash,
      isEmailVerified: true,
      isActive: true,
      deletedAt: null,
    },
    create: {
      email: 'admin@dirtfit.vn',
      fullName: 'DirtFit System Admin',
      phone: '+84901000001',
      role: 'ADMIN',
      passwordHash: adminPasswordHash,
      isEmailVerified: true,
      isActive: true,
    },
  });

  const sales = await prisma.user.upsert({
    where: { email: 'sales@dirtfit.vn' },
    update: {
      fullName: 'Nguyen Minh Sales',
      phone: '+84901000002',
      role: 'SALES_STAFF',
      passwordHash: staffPasswordHash,
      isEmailVerified: true,
      isActive: true,
      deletedAt: null,
    },
    create: {
      email: 'sales@dirtfit.vn',
      fullName: 'Nguyen Minh Sales',
      phone: '+84901000002',
      role: 'SALES_STAFF',
      passwordHash: staffPasswordHash,
      isEmailVerified: true,
      isActive: true,
    },
  });

  const customer = await prisma.user.upsert({
    where: { email: 'rider@dirtfit.vn' },
    update: {
      fullName: 'Tran Hoang Rider',
      phone: '+84901000003',
      role: 'CUSTOMER',
      passwordHash: customerPasswordHash,
      isEmailVerified: true,
      isActive: true,
      deletedAt: null,
    },
    create: {
      email: 'rider@dirtfit.vn',
      fullName: 'Tran Hoang Rider',
      phone: '+84901000003',
      role: 'CUSTOMER',
      passwordHash: customerPasswordHash,
      isEmailVerified: true,
      isActive: true,
    },
  });

  const existingDefaultProfile = await prisma.userBodyProfile.findFirst({
    where: { userId: customer.id, isDefault: true },
  });

  if (existingDefaultProfile) {
    await prisma.userBodyProfile.update({
      where: { id: existingDefaultProfile.id },
      data: {
        label: 'Hồ sơ Enduro mặc định',
        heightCm: 168,
        weightKg: 65,
        inseamCm: 76,
        gender: 'MALE',
        bodyProportion: 'AVERAGE',
        footwear: 'MX_BOOTS',
        gearWeightKg: 10,
        ridingExperience: 'INTERMEDIATE',
      },
    });
  } else {
    await prisma.userBodyProfile.create({
      data: {
        userId: customer.id,
        label: 'Hồ sơ Enduro mặc định',
        heightCm: 168,
        weightKg: 65,
        inseamCm: 76,
        gender: 'MALE',
        bodyProportion: 'AVERAGE',
        footwear: 'MX_BOOTS',
        gearWeightKg: 10,
        ridingExperience: 'INTERMEDIATE',
        isDefault: true,
      },
    });
  }

  return { admin, sales, customer };
}

async function seedCatalog() {
  const brandBySlug = new Map();
  for (const brand of BRANDS) {
    const row = await prisma.brand.upsert({
      where: { slug: brand.slug },
      update: { name: brand.name, country: brand.country },
      create: brand,
    });
    brandBySlug.set(brand.slug, row);
  }

  const bikeBySlug = new Map();
  for (const item of BIKES) {
    const brand = brandBySlug.get(item.brandSlug);
    const bike = await prisma.bike.upsert({
      where: { sku: item.sku },
      update: {
        brandId: brand.id,
        name: item.name,
        slug: item.slug,
        modelYear: item.modelYear,
        category: item.category,
        ridingFocus: item.ridingFocus,
        engineCc: item.engineCc,
        streetLegal: item.streetLegal,
        priceVnd: toVndBigInt(item.priceVnd),
        depositAmountVnd: toVndBigInt(item.depositAmountVnd),
        stockQty: item.stockQty,
        status: 'ACTIVE',
        shortSummary: item.shortSummary,
        deletedAt: null,
      },
      create: {
        brandId: brand.id,
        sku: item.sku,
        name: item.name,
        slug: item.slug,
        modelYear: item.modelYear,
        category: item.category,
        ridingFocus: item.ridingFocus,
        engineCc: item.engineCc,
        streetLegal: item.streetLegal,
        priceVnd: toVndBigInt(item.priceVnd),
        depositAmountVnd: toVndBigInt(item.depositAmountVnd),
        stockQty: item.stockQty,
        status: 'ACTIVE',
        shortSummary: item.shortSummary,
      },
    });

    await prisma.bikeGeometrySpec.upsert({
      where: { bikeId: bike.id },
      update: item.geometry,
      create: { bikeId: bike.id, ...item.geometry },
    });

    // Idempotent primary HERO & SIDE_PROFILE_BLUEPRINT media lookup by storageKey
    const heroKey = `bikes/${item.slug}/hero.webp`;
    const existingHero = await prisma.bikeMedia.findFirst({
      where: { bikeId: bike.id, storageKey: heroKey },
    });
    if (!existingHero) {
      await prisma.bikeMedia.create({
        data: {
          bikeId: bike.id,
          url: `https://cdn.dirtfit.vn/${heroKey}`,
          storageKey: heroKey,
          mediaType: 'HERO',
          altText: `${item.name} studio profile`,
          isPrimary: true,
          sortOrder: 0,
        },
      });
    }

    const blueprintKey = `bikes/${item.slug}/blueprint.png`;
    const existingBlueprint = await prisma.bikeMedia.findFirst({
      where: { bikeId: bike.id, storageKey: blueprintKey },
    });
    if (!existingBlueprint) {
      await prisma.bikeMedia.create({
        data: {
          bikeId: bike.id,
          url: `https://cdn.dirtfit.vn/${blueprintKey}`,
          storageKey: blueprintKey,
          mediaType: 'SIDE_PROFILE_BLUEPRINT',
          altText: `${item.name} 2D side-profile blueprint`,
          isPrimary: true,
          sortOrder: 1,
          calibrationData: null,
        },
      });
    }

    bikeBySlug.set(item.slug, bike);
  }

  const accessoryBySku = new Map();
  for (const acc of ACCESSORIES) {
    const row = await prisma.accessory.upsert({
      where: { sku: acc.sku },
      update: {
        name: acc.name,
        slug: acc.slug,
        category: acc.category,
        brandName: acc.brandName,
        priceVnd: toVndBigInt(acc.priceVnd),
        stockQty: acc.stockQty,
        status: 'ACTIVE',
        ergoImpactJson: acc.ergoImpactJson,
        deletedAt: null,
      },
      create: {
        sku: acc.sku,
        name: acc.name,
        slug: acc.slug,
        category: acc.category,
        brandName: acc.brandName,
        priceVnd: toVndBigInt(acc.priceVnd),
        stockQty: acc.stockQty,
        status: 'ACTIVE',
        ergoImpactJson: acc.ergoImpactJson,
      },
    });
    accessoryBySku.set(acc.sku, row);
  }

  const compatibilityPairs = [
    // Dual-sport bikes get -25mm link + -25mm low seat + bar riser
    ...['honda-crf150l', 'honda-crf300l', 'yamaha-wr155r', 'kawasaki-klx230'].flatMap((slug) => [
      {
        bikeSlug: slug,
        accSku: 'ACC-SOUBEY-LINK-25',
        exactSeatDropMm: 25,
        exactForkDropMm: 8,
        requiresWorkshopInstall: true,
        installLaborVnd: 350_000,
        fitmentNotes: 'Kèm hạ ty phuộc trước 8mm giữ cân bằng góc lái.',
      },
      {
        bikeSlug: slug,
        accSku: 'ACC-OEM-LOWSEAT-25',
        exactSeatDropMm: 25,
        exactForkDropMm: 0,
        requiresWorkshopInstall: false,
        installLaborVnd: 0,
        fitmentNotes: 'Thay thế trực tiếp ngàm yên zin.',
      },
      {
        bikeSlug: slug,
        accSku: 'ACC-ROX-RISER-30',
        exactSeatDropMm: 0,
        exactForkDropMm: 0,
        requiresWorkshopInstall: false,
        installLaborVnd: 150_000,
        fitmentNotes: 'Phù hợp ghi đông 22mm/28mm.',
      },
    ]),
    // Enduro & MX bikes get -30mm link + -20mm low seat + bar riser + soft spring
    ...['ktm-350-exc-f', 'husqvarna-fe-350', 'honda-crf250r'].flatMap((slug) => [
      {
        bikeSlug: slug,
        accSku: 'ACC-ZETA-LINK-30',
        exactSeatDropMm: slug === 'ktm-350-exc-f' ? 28 : 30,
        exactForkDropMm: 10,
        requiresWorkshopInstall: true,
        installLaborVnd: 450_000,
        fitmentNotes: 'Lắp đặt kèm cân chỉnh sag và đẩy ty phuộc 10mm.',
      },
      {
        bikeSlug: slug,
        accSku: 'ACC-ENDURO-LOWSEAT-20',
        exactSeatDropMm: 20,
        exactForkDropMm: 0,
        requiresWorkshopInstall: false,
        installLaborVnd: 0,
        fitmentNotes: 'Mút gọt gọn hai bên đùi tăng độ bám chân.',
      },
      {
        bikeSlug: slug,
        accSku: 'ACC-ROX-RISER-30',
        exactSeatDropMm: 0,
        exactForkDropMm: 0,
        requiresWorkshopInstall: false,
        installLaborVnd: 150_000,
        fitmentNotes: 'Tăng chiều cao tay lái cho tư thế đứng Attack.',
      },
      {
        bikeSlug: slug,
        accSku: 'ACC-WP-SOFT-SPRING',
        exactSeatDropMm: 0,
        exactForkDropMm: 0,
        requiresWorkshopInstall: true,
        installLaborVnd: 600_000,
        fitmentNotes: 'Khuyên dùng cho người lái dưới 65kg.',
      },
    ]),
    // Tenere 700 gets -35mm touring link + -25mm low seat + bar riser
    {
      bikeSlug: 'yamaha-tenere-700',
      accSku: 'ACC-TOURING-LINK-35',
      exactSeatDropMm: 35,
      exactForkDropMm: 12,
      requiresWorkshopInstall: true,
      installLaborVnd: 500_000,
      fitmentNotes: 'Hạ trọng tâm Adventure cho người đi tour đường trường.',
    },
    {
      bikeSlug: 'yamaha-tenere-700',
      accSku: 'ACC-OEM-LOWSEAT-25',
      exactSeatDropMm: 25,
      exactForkDropMm: 0,
      requiresWorkshopInstall: false,
      installLaborVnd: 0,
      fitmentNotes: 'Yên đơn thấp chính hãng Yamaha Ténéré 700.',
    },
    {
      bikeSlug: 'yamaha-tenere-700',
      accSku: 'ACC-ROX-RISER-30',
      exactSeatDropMm: 0,
      exactForkDropMm: 0,
      requiresWorkshopInstall: false,
      installLaborVnd: 200_000,
      fitmentNotes: 'Cần kiểm tra độ chùng dây dầu phanh trước.',
    },
  ];

  for (const pair of compatibilityPairs) {
    const bike = bikeBySlug.get(pair.bikeSlug);
    const acc = accessoryBySku.get(pair.accSku);
    await prisma.bikeAccessoryCompatibility.upsert({
      where: { bikeId_accessoryId: { bikeId: bike.id, accessoryId: acc.id } },
      update: {
        exactSeatDropMm: pair.exactSeatDropMm,
        exactForkDropMm: pair.exactForkDropMm,
        requiresWorkshopInstall: pair.requiresWorkshopInstall,
        installLaborVnd: toVndBigInt(pair.installLaborVnd),
        fitmentNotes: pair.fitmentNotes,
      },
      create: {
        bikeId: bike.id,
        accessoryId: acc.id,
        exactSeatDropMm: pair.exactSeatDropMm,
        exactForkDropMm: pair.exactForkDropMm,
        requiresWorkshopInstall: pair.requiresWorkshopInstall,
        installLaborVnd: toVndBigInt(pair.installLaborVnd),
        fitmentNotes: pair.fitmentNotes,
      },
    });
  }

  return { bikeBySlug };
}

async function seedTestRideShowrooms({ customer, sales, bikeBySlug }) {
  const showroomSeeds = [
    {
      bookingCode: 'TR-SEED-HN-01',
      showroomCode: 'HN_LONG_BIEN',
      bikeSlug: 'honda-crf300l',
      scheduledDate: new Date('2026-12-15T00:00:00.000Z'),
      timeSlot: '09:00-10:30',
    },
    {
      bookingCode: 'TR-SEED-DN-01',
      showroomCode: 'DN_SON_TRA',
      bikeSlug: 'yamaha-tenere-700',
      scheduledDate: new Date('2026-12-16T00:00:00.000Z'),
      timeSlot: '10:30-12:00',
    },
    {
      bookingCode: 'TR-SEED-HCM-01',
      showroomCode: 'HCM_THU_DUC',
      bikeSlug: 'ktm-350-exc-f',
      scheduledDate: new Date('2026-12-17T00:00:00.000Z'),
      timeSlot: '14:00-15:30',
    },
  ];

  for (const booking of showroomSeeds) {
    const bike = bikeBySlug.get(booking.bikeSlug);
    await prisma.testRideBooking.upsert({
      where: { bookingCode: booking.bookingCode },
      update: {
        userId: customer.id,
        bikeId: bike.id,
        assignedStaffId: sales.id,
        showroomCode: booking.showroomCode,
        scheduledDate: booking.scheduledDate,
        timeSlot: booking.timeSlot,
        licenseClass: 'A2',
        status: 'CONFIRMED',
        riderProfileSnapshot: {
          heightCm: 168,
          weightKg: 65,
          inseamCm: 76,
          footwear: 'MX_BOOTS',
        },
        notes: 'Seeded showroom demo slot',
      },
      create: {
        bookingCode: booking.bookingCode,
        userId: customer.id,
        bikeId: bike.id,
        assignedStaffId: sales.id,
        showroomCode: booking.showroomCode,
        scheduledDate: booking.scheduledDate,
        timeSlot: booking.timeSlot,
        licenseClass: 'A2',
        status: 'CONFIRMED',
        riderProfileSnapshot: {
          heightCm: 168,
          weightKg: 65,
          inseamCm: 76,
          footwear: 'MX_BOOTS',
        },
        notes: 'Seeded showroom demo slot',
      },
    });
  }
}

async function main() {
  const { admin, sales, customer } = await seedUsers();
  const { bikeBySlug } = await seedCatalog();
  await seedTestRideShowrooms({ customer, sales, bikeBySlug });

  const [users, brands, bikes, geometrySpecs, media, accessories, compatibilities, bookings] =
    await Promise.all([
      prisma.user.count(),
      prisma.brand.count(),
      prisma.bike.count(),
      prisma.bikeGeometrySpec.count(),
      prisma.bikeMedia.count(),
      prisma.accessory.count(),
      prisma.bikeAccessoryCompatibility.count(),
      prisma.testRideBooking.count(),
    ]);

  console.log('[seed] Completed successfully (admin:', admin.email, '). Counts:', {
    users,
    brands,
    bikes,
    geometrySpecs,
    media,
    accessories,
    compatibilities,
    testRideBookings: bookings,
  });
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
