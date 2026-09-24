import { OrderStatus } from '@prisma/client';

/**
 * Defines which status transitions are legal. An Order Management System's
 * integrity depends on orders moving through a predictable lifecycle:
 *
 *   PENDING -> PAID -> SHIPPED -> DELIVERED
 *   PENDING -> CANCELLED
 *   PAID    -> CANCELLED
 *
 * SHIPPED and DELIVERED orders can no longer be cancelled (goods are already
 * in transit / received), and CANCELLED / DELIVERED are terminal states.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.PAID, OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

export function isTransitionAllowed(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Stock is returned to inventory only when an order is cancelled before shipping. */
export function shouldRestock(from: OrderStatus, to: OrderStatus): boolean {
  return to === OrderStatus.CANCELLED && (from === OrderStatus.PENDING || from === OrderStatus.PAID);
}

/** Generates a human-readable, sortable order number, e.g. ORD-20260922-4F3A9B. */
export function generateOrderNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(16).slice(2, 8).toUpperCase();
  return `ORD-${datePart}-${randomPart}`;
}
