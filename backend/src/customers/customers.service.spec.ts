import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CustomersService } from './customers.service';
import { PrismaService } from '../prisma/prisma.service';

function prismaKnownError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code,
    clientVersion: '5.x',
  } as any);
}

describe('CustomersService', () => {
  let service: CustomersService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      customer: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((arg: any) =>
        Array.isArray(arg) ? Promise.all(arg) : arg(prisma),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
  });

  it('creates a customer', async () => {
    prisma.customer.create.mockResolvedValue({ id: 'c1', name: 'Jane' });
    const result = await service.create({ name: 'Jane', email: 'jane@example.com' } as any);
    expect(result).toEqual({ id: 'c1', name: 'Jane' });
  });

  it('throws ConflictException on duplicate email', async () => {
    prisma.customer.create.mockRejectedValue(prismaKnownError('P2002'));
    await expect(
      service.create({ name: 'Jane', email: 'jane@example.com' } as any),
    ).rejects.toThrow(ConflictException);
  });

  it('throws NotFoundException when the customer does not exist', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('paginates findAll results', async () => {
    prisma.customer.findMany.mockResolvedValue([{ id: 'c1' }]);
    prisma.customer.count.mockResolvedValue(1);

    const result = await service.findAll({ page: 1, limit: 20 } as any);

    expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(result.data).toEqual([{ id: 'c1' }]);
  });
});
