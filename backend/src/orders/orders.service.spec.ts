import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * A minimal mock of PrismaService that supports both:
 *  - interactive transactions: prisma.$transaction(async (tx) => ...)
 *  - array-style transactions: prisma.$transaction([queryA, queryB])
 * mirroring how OrdersService actually calls it.
 */
function createPrismaMock() {
  const prisma: any = {
    product: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    order: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (arg: any) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return arg(prisma);
    }),
  };
  return prisma;
}

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [OrdersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  describe('create', () => {
    const product = {
      id: 'prod-1',
      name: 'Widget',
      priceCents: 1000,
      stock: 5,
      isActive: true,
    };

    it('computes the total, decrements stock, and creates the order', async () => {
      prisma.product.findMany.mockResolvedValue([product]);
      prisma.order.create.mockResolvedValue({ id: 'order-1', totalCents: 2000 });

      const result = await service.create(
        { customerId: 'cust-1', items: [{ productId: 'prod-1', quantity: 2 }] } as any,
        'user-1',
      );

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { stock: { decrement: 2 } },
      });
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: 'cust-1',
            createdById: 'user-1',
            totalCents: 2000,
            status: OrderStatus.PENDING,
          }),
        }),
      );
      expect(result).toEqual({ id: 'order-1', totalCents: 2000 });
    });

    it('rejects duplicate productId entries in the same order', async () => {
      await expect(
        service.create(
          {
            customerId: 'cust-1',
            items: [
              { productId: 'prod-1', quantity: 1 },
              { productId: 'prod-1', quantity: 1 },
            ],
          } as any,
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when a product does not exist', async () => {
      prisma.product.findMany.mockResolvedValue([]);

      await expect(
        service.create(
          { customerId: 'cust-1', items: [{ productId: 'missing', quantity: 1 }] } as any,
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when requested quantity exceeds stock', async () => {
      prisma.product.findMany.mockResolvedValue([{ ...product, stock: 1 }]);

      await expect(
        service.create(
          { customerId: 'cust-1', items: [{ productId: 'prod-1', quantity: 5 }] } as any,
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for an inactive (discontinued) product', async () => {
      prisma.product.findMany.mockResolvedValue([{ ...product, isActive: false }]);

      await expect(
        service.create(
          { customerId: 'cust-1', items: [{ productId: 'prod-1', quantity: 1 }] } as any,
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateStatus', () => {
    it('applies a valid transition and does not restock PENDING -> PAID', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PENDING,
        items: [{ productId: 'prod-1', quantity: 2 }],
      });
      prisma.order.update.mockResolvedValue({ id: 'order-1', status: OrderStatus.PAID });

      const result = await service.updateStatus('order-1', OrderStatus.PAID);

      expect(prisma.product.update).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'order-1', status: OrderStatus.PAID });
    });

    it('restocks products when cancelling a PENDING order', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PENDING,
        items: [{ productId: 'prod-1', quantity: 3 }],
      });
      prisma.order.update.mockResolvedValue({ id: 'order-1', status: OrderStatus.CANCELLED });

      await service.updateStatus('order-1', OrderStatus.CANCELLED);

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { stock: { increment: 3 } },
      });
    });

    it('rejects an illegal transition, e.g. PENDING -> SHIPPED', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PENDING,
        items: [],
      });

      await expect(service.updateStatus('order-1', OrderStatus.SHIPPED)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a non-existent order', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.updateStatus('missing', OrderStatus.PAID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
