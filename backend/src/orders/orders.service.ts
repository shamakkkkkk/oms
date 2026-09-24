import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderFilterDto } from './dto/order-filter.dto';
import {
  generateOrderNumber,
  isTransitionAllowed,
  shouldRestock,
} from './order-status.util';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Creates an order inside a single DB transaction:
   *  1. Loads and locks-in the current price/stock of every requested product.
   *  2. Validates every product exists, is active, and has sufficient stock.
   *  3. Decrements stock, snapshots unit prices onto the order items, and
   *     computes the order total — all atomically, so a failure anywhere
   *     rolls back the whole order (no partial stock deduction).
   */
  async create(dto: CreateOrderDto, createdById: string) {
    const productIds = dto.items.map((i) => i.productId);
    const uniqueProductIds = new Set(productIds);
    if (uniqueProductIds.size !== productIds.length) {
      throw new BadRequestException('Duplicate productId entries are not allowed; combine quantities instead');
    }

    return this.prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({ where: { id: { in: productIds } } });

      const productMap = new Map(products.map((p) => [p.id, p]));
      let totalCents = 0;

      for (const item of dto.items) {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new NotFoundException(`Product ${item.productId} not found`);
        }
        if (!product.isActive) {
          throw new BadRequestException(`Product "${product.name}" is no longer available`);
        }
        if (product.stock < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for "${product.name}": requested ${item.quantity}, available ${product.stock}`,
          );
        }
        totalCents += product.priceCents * item.quantity;
      }

      // Decrement stock for every line item.
      for (const item of dto.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      const order = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          customerId: dto.customerId,
          createdById,
          notes: dto.notes,
          totalCents,
          status: OrderStatus.PENDING,
          items: {
            create: dto.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPriceCents: productMap.get(item.productId)!.priceCents,
            })),
          },
        },
        include: { items: { include: { product: true } }, customer: true },
      });

      return order;
    });
  }

  async findAll(filter: OrderFilterDto) {
    const { page, limit } = filter;
    const where: Prisma.OrderWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.customerId ? { customerId: filter.customerId } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { customer: true, items: { include: { product: true } } },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        createdBy: { select: { id: true, name: true, email: true } },
        items: { include: { product: true } },
      },
    });
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return order;
  }

  /**
   * Transitions an order's status, enforcing the allowed state machine and
   * restocking inventory atomically if the order is cancelled pre-shipment.
   */
  async updateStatus(id: string, nextStatus: OrderStatus) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id }, include: { items: true } });
      if (!order) {
        throw new NotFoundException(`Order ${id} not found`);
      }

      if (!isTransitionAllowed(order.status, nextStatus)) {
        throw new BadRequestException(
          `Cannot transition order from ${order.status} to ${nextStatus}`,
        );
      }

      if (shouldRestock(order.status, nextStatus)) {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }

      return tx.order.update({
        where: { id },
        data: { status: nextStatus },
        include: { customer: true, items: { include: { product: true } } },
      });
    });
  }
}
