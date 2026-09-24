import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end walk through the core Order Management System workflow against
 * a real (test) PostgreSQL database configured via DATABASE_URL.
 *
 * Prerequisites: `docker compose up -d db` and `npx prisma migrate deploy`
 * against a *test* database before running `npm run test:e2e`.
 * See README.md > Testing for full instructions.
 */
describe('Order Management System (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminToken: string;
  let customerId: string;
  let productId: string;
  let orderId: string;

  const uniqueSuffix = Date.now();
  const adminEmail = `e2e-admin-${uniqueSuffix}@oms.local`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a new admin user', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: adminEmail, password: 'StrongPass123!', name: 'E2E Admin', role: 'ADMIN' })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    adminToken = res.body.accessToken;
  });

  it('rejects login with a wrong password', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adminEmail, password: 'wrong-password' })
      .expect(401);
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adminEmail, password: 'StrongPass123!' })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
  });

  it('rejects unauthenticated access to protected routes', async () => {
    await request(app.getHttpServer()).get('/api/orders').expect(401);
  });

  it('creates a customer', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'E2E Customer', email: `e2e-customer-${uniqueSuffix}@example.com` })
      .expect(201);

    customerId = res.body.id;
    expect(customerId).toBeDefined();
  });

  it('creates a product', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: `E2E-SKU-${uniqueSuffix}`, name: 'E2E Product', priceCents: 1500, stock: 10 })
      .expect(201);

    productId = res.body.id;
    expect(res.body.stock).toEqual(10);
  });

  it('creates an order and decrements stock', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerId, items: [{ productId, quantity: 3 }] })
      .expect(201);

    orderId = res.body.id;
    expect(res.body.totalCents).toEqual(4500);
    expect(res.body.status).toEqual('PENDING');

    const product = await request(app.getHttpServer())
      .get(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(product.body.stock).toEqual(7);
  });

  it('rejects an order that exceeds available stock', async () => {
    await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerId, items: [{ productId, quantity: 999 }] })
      .expect(400);
  });

  it('rejects an illegal status transition (PENDING -> SHIPPED)', async () => {
    await request(app.getHttpServer())
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'SHIPPED' })
      .expect(400);
  });

  it('advances the order through its valid lifecycle', async () => {
    await request(app.getHttpServer())
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PAID' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'SHIPPED' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'DELIVERED' })
      .expect(200);

    expect(res.body.status).toEqual('DELIVERED');
  });

  it('lists orders filtered by status', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/orders?status=DELIVERED')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.some((o: any) => o.id === orderId)).toBe(true);
  });

  afterAll(async () => {
    // Clean up e2e-created records so repeated test runs stay idempotent.
    await prisma.orderItem.deleteMany({ where: { orderId } });
    await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.user.deleteMany({ where: { email: adminEmail } });
  });
});
