'use strict';
/**
 * Repeatable seed (L1-13, T-09): `npm run db:seed`
 * Every record is UPSERTED on a natural unique key (email, slug, sku, code),
 * so re-running never creates duplicates. Demo credentials are TEST-ONLY.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const php = (pesos) => Math.round(pesos * 100);

const categories = [
  { name: 'Processors', slug: 'processors', componentType: 'CPU' },
  { name: 'Motherboards', slug: 'motherboards', componentType: 'MOTHERBOARD' },
  { name: 'Memory', slug: 'memory', componentType: 'RAM' },
  { name: 'Graphics Cards', slug: 'graphics-cards', componentType: 'GPU' },
  { name: 'Power Supplies', slug: 'power-supplies', componentType: 'PSU' },
  { name: 'PC Cases', slug: 'pc-cases', componentType: 'CASE' },
  { name: 'Storage', slug: 'storage', componentType: 'STORAGE' },
  { name: 'Accessories', slug: 'accessories', componentType: 'ACCESSORY' },
];

// [sku, name, brand, categorySlug, pricePesos, stock, specs, description]
const products = [
  // ---- CPUs
  ['CPU-R5-7600', 'AMD Ryzen 5 7600', 'AMD', 'processors', 11495, 12,
    { socket: 'AM5', cores: 6, threads: 12, tdpWatts: 65, memoryType: 'DDR5', integratedGraphics: true },
    '6-core, 12-thread AM5 processor with Radeon graphics. A great value starting point for 1080p and 1440p gaming builds.'],
  ['CPU-R7-7800X3D', 'AMD Ryzen 7 7800X3D', 'AMD', 'processors', 24995, 1,
    { socket: 'AM5', cores: 8, threads: 16, tdpWatts: 120, memoryType: 'DDR5', integratedGraphics: true },
    '8-core gaming CPU with 3D V-Cache. Last unit in the Session Road store – used for the concurrency demo.'],
  ['CPU-R5-5600', 'AMD Ryzen 5 5600', 'AMD', 'processors', 5995, 20,
    { socket: 'AM4', cores: 6, threads: 12, tdpWatts: 65, memoryType: 'DDR4', integratedGraphics: false },
    'Budget-friendly AM4 six-core processor. Pairs with affordable B550 boards and DDR4 memory.'],
  ['CPU-I5-14400F', 'Intel Core i5-14400F', 'Intel', 'processors', 9995, 15,
    { socket: 'LGA1700', cores: 10, threads: 16, tdpWatts: 65, memoryType: 'DDR4/DDR5', integratedGraphics: false },
    '10-core Intel processor for LGA1700 boards. Supports both DDR4 and DDR5 depending on motherboard. Requires a graphics card.'],
  ['CPU-I7-14700K', 'Intel Core i7-14700K', 'Intel', 'processors', 23495, 6,
    { socket: 'LGA1700', cores: 20, threads: 28, tdpWatts: 125, memoryType: 'DDR4/DDR5', integratedGraphics: true },
    '20-core unlocked Intel processor for streaming, editing and high-refresh gaming.'],
  // ---- Motherboards
  ['MB-MSI-B650M-GP', 'MSI B650M Gaming Plus WiFi', 'MSI', 'motherboards', 9495, 10,
    { socket: 'AM5', memoryType: 'DDR5', formFactor: 'mATX', ramSlots: 4, maxMemoryGb: 192, wifi: true },
    'Micro-ATX AM5 board with Wi-Fi 6E, DDR5 support and PCIe 4.0 M.2 slots.'],
  ['MB-ASUS-B650-TUF', 'ASUS TUF Gaming B650-Plus WiFi', 'ASUS', 'motherboards', 12995, 7,
    { socket: 'AM5', memoryType: 'DDR5', formFactor: 'ATX', ramSlots: 4, maxMemoryGb: 192, wifi: true },
    'Durable full ATX AM5 board with robust VRMs, Wi-Fi 6 and three M.2 slots.'],
  ['MB-GB-B550M-DS3H', 'Gigabyte B550M DS3H', 'Gigabyte', 'motherboards', 5495, 14,
    { socket: 'AM4', memoryType: 'DDR4', formFactor: 'mATX', ramSlots: 4, maxMemoryGb: 128, wifi: false },
    'Reliable micro-ATX AM4 board for Ryzen 5000 builds with dual M.2 slots.'],
  ['MB-MSI-B760M-A', 'MSI PRO B760M-A WiFi DDR5', 'MSI', 'motherboards', 8295, 9,
    { socket: 'LGA1700', memoryType: 'DDR5', formFactor: 'mATX', ramSlots: 4, maxMemoryGb: 192, wifi: true },
    'Micro-ATX LGA1700 board for 12th–14th gen Intel CPUs with DDR5 and Wi-Fi.'],
  ['MB-ASR-B760M-D4', 'ASRock B760M Pro RS/D4', 'ASRock', 'motherboards', 6495, 4,
    { socket: 'LGA1700', memoryType: 'DDR4', formFactor: 'mATX', ramSlots: 4, maxMemoryGb: 128, wifi: false },
    'Budget LGA1700 micro-ATX board that keeps costs down with DDR4 memory support.'],
  // ---- RAM
  ['RAM-KF-32-D5-6000', 'Kingston FURY Beast 32GB (2x16GB) DDR5-6000', 'Kingston', 'memory', 6295, 25,
    { memoryType: 'DDR5', capacityGb: 32, modules: 2, speedMhz: 6000 },
    'Dual-channel DDR5 kit tuned for AMD EXPO and Intel XMP profiles.'],
  ['RAM-COR-16-D4-3200', 'Corsair Vengeance LPX 16GB (2x8GB) DDR4-3200', 'Corsair', 'memory', 2495, 30,
    { memoryType: 'DDR4', capacityGb: 16, modules: 2, speedMhz: 3200 },
    'Low-profile DDR4 kit – the safe choice for AM4 and DDR4 Intel boards.'],
  ['RAM-GS-64-D5-6400', 'G.Skill Trident Z5 RGB 64GB (2x32GB) DDR5-6400', 'G.Skill', 'memory', 13995, 3,
    { memoryType: 'DDR5', capacityGb: 64, modules: 2, speedMhz: 6400 },
    'High-capacity RGB DDR5 kit for video editing, 3D work and heavy multitasking.'],
  // ---- GPUs
  ['GPU-RTX4060-MSI', 'MSI GeForce RTX 4060 Ventus 2X 8GB', 'MSI', 'graphics-cards', 17995, 11,
    { chipset: 'RTX 4060', vramGb: 8, tdpWatts: 115, lengthMm: 199, recommendedPsuWatts: 550 },
    'Compact, efficient 1080p graphics card with DLSS 3 frame generation.'],
  ['GPU-RTX4070S-ASUS', 'ASUS Dual GeForce RTX 4070 SUPER 12GB', 'ASUS', 'graphics-cards', 36995, 5,
    { chipset: 'RTX 4070 SUPER', vramGb: 12, tdpWatts: 220, lengthMm: 267, recommendedPsuWatts: 650 },
    'Excellent 1440p performance with 12GB VRAM and quiet dual-fan cooling.'],
  ['GPU-RX7800XT-SAP', 'Sapphire Pulse Radeon RX 7800 XT 16GB', 'Sapphire', 'graphics-cards', 31495, 4,
    { chipset: 'RX 7800 XT', vramGb: 16, tdpWatts: 263, lengthMm: 280, recommendedPsuWatts: 700 },
    '16GB AMD card for high-refresh 1440p gaming with plenty of VRAM headroom.'],
  ['GPU-ARC-B580', 'Intel Arc B580 Limited Edition 12GB', 'Intel', 'graphics-cards', 15495, 8,
    { chipset: 'Arc B580', vramGb: 12, tdpWatts: 190, lengthMm: 272, recommendedPsuWatts: 600 },
    'Budget 1440p-capable card with 12GB of memory and XeSS upscaling.'],
  // ---- PSUs
  ['PSU-COR-CX550', 'Corsair CX550 550W 80+ Bronze', 'Corsair', 'power-supplies', 3295, 18,
    { wattage: 550, efficiency: '80+ Bronze', modular: false },
    'Dependable 550W power supply for entry-level and mid-range builds.'],
  ['PSU-CM-MWE650', 'Cooler Master MWE 650 Bronze V2', 'Cooler Master', 'power-supplies', 3495, 12,
    { wattage: 650, efficiency: '80+ Bronze', modular: false },
    '650W Bronze unit – enough headroom for an RTX 4070 SUPER class system.'],
  ['PSU-SS-GX750', 'Seasonic FOCUS GX-750 750W 80+ Gold', 'Seasonic', 'power-supplies', 6495, 8,
    { wattage: 750, efficiency: '80+ Gold', modular: true },
    'Fully modular Gold-rated 750W PSU with a 10-year warranty.'],
  // ---- Cases
  ['CASE-MONTECH-903', 'Montech AIR 903 MAX', 'Montech', 'pc-cases', 4995, 9,
    { supportedFormFactors: ['ATX', 'mATX', 'ITX'], maxGpuLengthMm: 400 },
    'High-airflow mid tower with four pre-installed 140mm fans.'],
  ['CASE-TEC-FORGE-M2', 'Tecware Forge M2', 'Tecware', 'pc-cases', 2495, 16,
    { supportedFormFactors: ['mATX', 'ITX'], maxGpuLengthMm: 330 },
    'Compact micro-ATX case with tempered glass – fits small Baguio dorm desks.'],
  ['CASE-NZXT-H5', 'NZXT H5 Flow', 'NZXT', 'pc-cases', 5295, 6,
    { supportedFormFactors: ['ATX', 'mATX', 'ITX'], maxGpuLengthMm: 365 },
    'Clean, airflow-focused ATX mid tower with simple cable management.'],
  // ---- Storage
  ['SSD-SAM-990EVO-1TB', 'Samsung 990 EVO Plus 1TB NVMe', 'Samsung', 'storage', 5495, 20,
    { interface: 'NVMe', capacityGb: 1000 },
    'Fast PCIe 4.0 NVMe SSD for quick boot and game load times.'],
  ['SSD-WD-SN580-1TB', 'WD Blue SN580 1TB NVMe', 'Western Digital', 'storage', 3595, 22,
    { interface: 'NVMe', capacityGb: 1000 },
    'Affordable PCIe 4.0 NVMe drive – the budget build favourite.'],
  ['SSD-CRU-MX500-1TB', 'Crucial MX500 1TB SATA SSD', 'Crucial', 'storage', 3295, 2,
    { interface: 'SATA', capacityGb: 1000 },
    '2.5-inch SATA SSD for upgrading older PCs or adding extra game storage.'],
  // ---- Accessories
  ['ACC-ARCTIC-MX6', 'Arctic MX-6 Thermal Paste 4g', 'Arctic', 'accessories', 395, 40,
    {}, 'Non-conductive, long-lasting thermal compound for CPU installs and repastes.'],
];

const imageFor = { CPU: 'cpu', MOTHERBOARD: 'motherboard', RAM: 'ram', GPU: 'gpu', PSU: 'psu', CASE: 'case', STORAGE: 'storage', ACCESSORY: 'accessory' };

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

async function main() {
  const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
  const users = [
    { email: 'admin@baguiopcparts.test', name: 'Store Admin', role: 'admin', password: 'Admin#2026' },
    { email: 'juan@baguiopcparts.test', name: 'Juan Dela Cruz', role: 'customer', password: 'Customer#2026' },
    { email: 'maria@baguiopcparts.test', name: 'Maria Bautista', role: 'customer', password: 'Customer#2026' },
  ];
  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, rounds);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role },
      create: { email: u.email, name: u.name, role: u.role, passwordHash },
    });
  }

  const catBySlug = {};
  for (const c of categories) {
    catBySlug[c.slug] = await prisma.category.upsert({ where: { slug: c.slug }, update: c, create: c });
  }

  for (const [sku, name, brand, cat, price, stock, specs, description] of products) {
    const category = catBySlug[cat];
    const data = {
      name, brand, description, specs,
      slug: slugify(name),
      priceCents: php(price),
      categoryId: category.id,
      imageUrl: `/images/${imageFor[category.componentType]}.webp`,
      isActive: true,
      deletedAt: null,
    };
    // Stock is only set on create so re-seeding does not wipe real stock movements.
    await prisma.product.upsert({ where: { sku }, update: data, create: { ...data, sku, stock } });
  }

  const coupons = [
    { code: 'BAGUIO10', description: '10% off orders ₱10,000+ (max ₱3,000)', type: 'percentage', value: 10,
      maxDiscountCents: php(3000), minSpendCents: php(10000), expiresAt: new Date('2027-06-30T15:59:59Z'),
      usageLimit: 100, perCustomerLimit: 1 },
    { code: 'STUDENT500', description: '₱500 off for SLU/UC/UB students on ₱5,000+', type: 'fixed', value: php(500),
      minSpendCents: php(5000), expiresAt: new Date('2027-03-31T15:59:59Z'), usageLimit: 200, perCustomerLimit: 2 },
    { code: 'EXPIRED2025', description: 'Expired promo for demo', type: 'percentage', value: 15,
      minSpendCents: 0, expiresAt: new Date('2025-12-31T15:59:59Z'), usageLimit: 50, perCustomerLimit: 1 },
    { code: 'PANAGBENGA1', description: 'Single-use ₱1,500 off ₱30,000+', type: 'fixed', value: php(1500),
      minSpendCents: php(30000), expiresAt: new Date('2027-02-28T15:59:59Z'), usageLimit: 1, perCustomerLimit: 1 },
  ];
  for (const c of coupons) {
    const { code, ...rest } = c;
    await prisma.coupon.upsert({ where: { code }, update: { ...rest, isActive: true }, create: { ...c, isActive: true } });
  }

  const counts = {
    users: await prisma.user.count(),
    categories: await prisma.category.count(),
    products: await prisma.product.count(),
    coupons: await prisma.coupon.count(),
  };
  // eslint-disable-next-line no-console
  console.log('Seed complete:', counts);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
