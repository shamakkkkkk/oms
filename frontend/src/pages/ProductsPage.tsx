import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, extractErrorMessage, formatMoney } from '../lib/api';
import { Paginated, Product } from '../types';
import { useAuth } from '../context/AuthContext';

const emptyForm = { sku: '', name: '', description: '', price: '', stock: '' };

export function ProductsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await api.get<Paginated<Product>>('/products', { params: { limit: 100 } });
      return res.data;
    },
  });

  const createProduct = useMutation({
    mutationFn: async () => {
      const res = await api.post('/products', {
        sku: form.sku,
        name: form.name,
        description: form.description || undefined,
        priceCents: Math.round(parseFloat(form.price) * 100),
        stock: parseInt(form.stock, 10),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setForm(emptyForm);
      setShowForm(false);
      setError(null);
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  const deactivateProduct = useMutation({
    mutationFn: async (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const reactivateProduct = useMutation({
    mutationFn: async (id: string) => api.patch(`/products/${id}`, { isActive: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const [restockId, setRestockId] = useState<string | null>(null);
  const [restockValue, setRestockValue] = useState('');

  const updateStock = useMutation({
    mutationFn: async ({ id, stock }: { id: string; stock: number }) =>
      api.patch(`/products/${id}`, { stock }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setRestockId(null);
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createProduct.mutate();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Products</h2>
        {isAdmin && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 transition-colors"
          >
            {showForm ? 'Cancel' : 'New Product'}
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-lg p-5 mb-6 grid grid-cols-2 gap-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">SKU</label>
            <input
              required
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Price (EUR)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Stock</label>
            <input
              type="number"
              min="0"
              required
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
          <div className="col-span-2">
            <button
              type="submit"
              disabled={createProduct.isPending}
              className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-60"
            >
              {createProduct.isPending ? 'Saving…' : 'Save product'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Status</th>
              {isAdmin && <th className="px-4 py-3 font-medium" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {data?.data.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.sku}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(p.priceCents)}</td>
                <td className="px-4 py-3 text-slate-600">
                  {isAdmin && restockId === p.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        autoFocus
                        value={restockValue}
                        onChange={(e) => setRestockValue(e.target.value)}
                        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
                      />
                      <button
                        onClick={() =>
                          updateStock.mutate({ id: p.id, stock: parseInt(restockValue, 10) || 0 })
                        }
                        disabled={updateStock.isPending}
                        className="text-xs font-medium text-emerald-700 hover:text-emerald-900"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setRestockId(null)}
                        className="text-xs font-medium text-slate-400 hover:text-slate-600"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span>{p.stock}</span>
                      {isAdmin && (
                        <button
                          onClick={() => {
                            setRestockId(p.id);
                            setRestockValue(String(p.stock));
                          }}
                          className="text-xs font-medium text-brand-600 hover:text-brand-800"
                        >
                          Restock
                        </button>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      p.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {p.isActive ? 'Active' : 'Discontinued'}
                  </span>
                </td>
                {isAdmin && (
                  <td className="px-4 py-3 text-right">
                    {p.isActive ? (
                      <button
                        onClick={() => deactivateProduct.mutate(p.id)}
                        className="text-xs font-medium text-red-600 hover:text-red-800"
                      >
                        Discontinue
                      </button>
                    ) : (
                      <button
                        onClick={() => reactivateProduct.mutate(p.id)}
                        className="text-xs font-medium text-emerald-600 hover:text-emerald-800"
                      >
                        Reactivate
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {data && data.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No products yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
