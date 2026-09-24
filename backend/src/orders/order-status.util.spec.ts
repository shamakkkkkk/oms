import { OrderStatus } from '@prisma/client';
import { isTransitionAllowed, shouldRestock, generateOrderNumber } from './order-status.util';

describe('order-status.util', () => {
  describe('isTransitionAllowed', () => {
    it('allows PENDING -> PAID', () => {
      expect(isTransitionAllowed(OrderStatus.PENDING, OrderStatus.PAID)).toBe(true);
    });

    it('allows PENDING -> CANCELLED', () => {
      expect(isTransitionAllowed(OrderStatus.PENDING, OrderStatus.CANCELLED)).toBe(true);
    });

    it('allows PAID -> SHIPPED', () => {
      expect(isTransitionAllowed(OrderStatus.PAID, OrderStatus.SHIPPED)).toBe(true);
    });

    it('allows SHIPPED -> DELIVERED', () => {
      expect(isTransitionAllowed(OrderStatus.SHIPPED, OrderStatus.DELIVERED)).toBe(true);
    });

    it('rejects skipping a state, e.g. PENDING -> SHIPPED', () => {
      expect(isTransitionAllowed(OrderStatus.PENDING, OrderStatus.SHIPPED)).toBe(false);
    });

    it('rejects cancelling a SHIPPED order', () => {
      expect(isTransitionAllowed(OrderStatus.SHIPPED, OrderStatus.CANCELLED)).toBe(false);
    });

    it('rejects any transition out of a terminal state (DELIVERED)', () => {
      expect(isTransitionAllowed(OrderStatus.DELIVERED, OrderStatus.PENDING)).toBe(false);
      expect(isTransitionAllowed(OrderStatus.DELIVERED, OrderStatus.CANCELLED)).toBe(false);
    });

    it('rejects any transition out of a terminal state (CANCELLED)', () => {
      expect(isTransitionAllowed(OrderStatus.CANCELLED, OrderStatus.PENDING)).toBe(false);
    });

    it('rejects a no-op transition to the same status', () => {
      expect(isTransitionAllowed(OrderStatus.PAID, OrderStatus.PAID)).toBe(false);
    });
  });

  describe('shouldRestock', () => {
    it('restocks when cancelling from PENDING', () => {
      expect(shouldRestock(OrderStatus.PENDING, OrderStatus.CANCELLED)).toBe(true);
    });

    it('restocks when cancelling from PAID', () => {
      expect(shouldRestock(OrderStatus.PAID, OrderStatus.CANCELLED)).toBe(true);
    });

    it('does not restock for a non-cancellation transition', () => {
      expect(shouldRestock(OrderStatus.PENDING, OrderStatus.PAID)).toBe(false);
    });
  });

  describe('generateOrderNumber', () => {
    it('produces a unique, prefixed, sortable-by-date order number', () => {
      const a = generateOrderNumber();
      const b = generateOrderNumber();
      expect(a).toMatch(/^ORD-\d{8}-[0-9A-F]{6}$/);
      expect(a).not.toEqual(b);
    });
  });
});
