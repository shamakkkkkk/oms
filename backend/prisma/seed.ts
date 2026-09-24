/**
 * Seeds the database with a default admin user, a couple of demo customers
 * and products so the API / frontend can be explored immediately after setup.
 */
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminPasswordHash = await bcrypt.hash('Admin123!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@oms.local' },
    update: {},
    create: {
      email: 'admin@oms.local',
      passwordHash: adminPasswordHash,
      name: 'System Administrator',
      role: Role.ADMIN,
    },
  });

  const customer = await prisma.customer.upsert({
    where: { email: 'customer@example.com' },
    update: {},
    create: {
      name: 'Jane Doe',
      email: 'customer@example.com',
      phone: '+49 176 00000000',
      address: 'Musterstraße 1, 10115 Berlin, Germany',
    },
  });

  await prisma.product.upsert({
    where: { sku: 'SKU-001' },
    update: {},
    create: {
      sku: 'SKU-001',
      name: 'Wireless Mouse',
      description: 'Ergonomic wireless mouse with USB receiver.',
      priceCents: 2499,
      stock: 100,
    },
  });

  await prisma.product.upsert({
    where: { sku: 'SKU-002' },
    update: {},
    create: {
      sku: 'SKU-002',
      name: 'Mechanical Keyboard',
      description: 'Tenkeyless mechanical keyboard, brown switches.',
      priceCents: 8999,
      stock: 40,
    },
  });

  console.log('Seed complete:', { admin: admin.email, customer: customer.email });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
