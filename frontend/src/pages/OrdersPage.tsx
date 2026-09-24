import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, extractErrorMessage, formatMoney } from '../lib/api';
import { Customer, Order, OrderStatus, Paginated, Product } from '../types';
import { StatusBadge } from '../components/StatusBadge';

const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

interface LineItem {
  productId: string;
  quantity: number;
}

export function OrdersPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [showForm, setShowForm] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([{ productId: '', quantity: 1 }]);
  const [error, setError] = useState<string | null>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders', statusFilter],
    queryFn: async () => {
      const res = await api.get<Paginated<Order>>('/orders', {
        params: { limit: 100, ...(statusFilter ? { status: statusFilter } : {}) },
      });
      return res.data;
    },
  });

  const { data: customers } = useQuery({
    queryKey: ['customers-all'],
    queryFn: async () => (await api.get<Paginated<Customer>>('/customers', { params: { limit: 100 } })).data,
    enabled: showForm,
  });

  const { data: products } = useQuery({
    queryKey: ['products-all'],
    queryFn: async () =>
      (await api.get<Paginated<Product>>('/products', { params: { limit: 100, activeOnly: true } })).data,
    enabled: showForm,
  });

  const createOrder = useMutation({
    mutationFn: async () => {
      const items = lineItems
        .filter((i) => i.productId && i.quantity > 0)
        .map((i) => ({ productId: i.productId, quantity: Number(i.quantity) }));
      const res = await api.post('/orders', { customerId, items, notes: notes || undefined });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['products-all'] });
      setShowForm(false);
      setCustomerId('');
      setNotes('');
      setLineItems([{ productId: '', quantity: 1 }]);
      setError(null);
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) =>
      (await api.patch(`/orders/${id}/status`, { status })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['products-all'] });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createOrder.mutate();
  }

  function updateLineItem(idx: number, patch: Partial<LineItem>) {
    setLineItems((items) => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  const selectedOrder = orders?.data.find((o) => o.id === selectedOrderId) ?? null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Orders</h2>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OrderStatus | '')}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            {(['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as OrderStatus[]).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 transition-colors"
          >
            {showForm ? 'Cancel' : 'New Order'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg p-5 mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Customer</label>
            <select
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select a customer…</option>
              {customers?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Items</label>
            <div className="space-y-2">
              {lineItems.map((item, idx) => (
                <div key={idx} className="flex gap-2">
                  <select
                    required
                    value={item.productId}
                    onChange={(e) => updateLineItem(idx, { productId: e.target.value })}
                    className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select a product…</option>
                    {products?.data.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {formatMoney(p.priceCents)} ({p.stock} in stock)
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    required
                    value={item.quantity}
                    onChange={(e) => updateLineItem(idx, { quantity: Number(e.target.value) })}
                    className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setLineItems((items) => items.filter((_, i) => i !== idx))}
                    disabled={lineItems.length === 1}
                    className="text-slate-400 hover:text-red-600 disabled:opacity-30 px-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setLineItems((items) => [...items, { productId: '', quantity: 1 }])}
              className="mt-2 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              + Add item
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={createOrder.isPending}
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-60"
          >
            {createOrder.isPending ? 'Placing order…' : 'Place order'}
          </button>
        </form>
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className={selectedOrder ? 'col-span-2' : 'col-span-3'}>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Order #</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Placed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                )}
                {orders?.data.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => setSelectedOrderId(o.id)}
                    className={`cursor-pointer hover:bg-slate-50 ${selectedOrderId === o.id ? 'bg-brand-50' : ''}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{o.orderNumber}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{o.customer?.name}</td>
                    <td className="px-4 py-3 text-slate-600">{formatMoney(o.totalCents)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(o.createdAt).toLocaleDateString('de-DE')}
                    </td>
                  </tr>
                ))}
                {orders && orders.data.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                      No orders yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {selectedOrder && (
          <div className="col-span-1">
            <div className="bg-white border border-slate-200 rounded-lg p-5 sticky top-8">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900 text-sm">{selectedOrder.orderNumber}</h3>
                <button
                  onClick={() => setSelectedOrderId(null)}
                  className="text-slate-400 hover:text-slate-600 text-sm"
                >
                  ✕
                </button>
              </div>

              <StatusBadge status={selectedOrder.status} />

              <div className="mt-4 text-sm text-slate-600 space-y-1">
                <p className="font-medium text-slate-900">{selectedOrder.customer?.name}</p>
                <p>{selectedOrder.customer?.email}</p>
                {selectedOrder.notes && <p className="italic text-slate-500 mt-2">"{selectedOrder.notes}"</p>}
              </div>

              <div className="mt-4 border-t border-slate-100 pt-4 space-y-2">
                {selectedOrder.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-slate-700">
                      {item.quantity} × {item.product?.name}
                    </span>
                    <span className="text-slate-500">{formatMoney(item.unitPriceCents * item.quantity)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-semibold pt-2 border-t border-slate-100">
                  <span>Total</span>
                  <span>{formatMoney(selectedOrder.totalCents)}</span>
                </div>
              </div>

              {NEXT_STATUS[selectedOrder.status].length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-4 flex flex-wrap gap-2">
                  {NEXT_STATUS[selectedOrder.status].map((next) => (
                    <button
                      key={next}
                      onClick={() => updateStatus.mutate({ id: selectedOrder.id, status: next })}
                      disabled={updateStatus.isPending}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        next === 'CANCELLED'
                          ? 'bg-red-50 text-red-700 hover:bg-red-100'
                          : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                      }`}
                    >
                      Mark as {next}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
