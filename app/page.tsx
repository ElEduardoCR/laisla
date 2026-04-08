'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import CategoryTabs from '@/components/CategoryTabs';
import ProductCard from '@/components/ProductCard';
import FloatingCart from '@/components/FloatingCart';
import CartDrawer from '@/components/CartDrawer';

export default function HomePage() {
  const { categories, products, isDayOpen } = useApp();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const filteredProducts = selectedCategory
    ? products.filter(p => p.categoryId === selectedCategory)
    : products;

  const availableProducts = filteredProducts.filter(p => p.available);
  const unavailableProducts = filteredProducts.filter(p => !p.available);

  if (!isDayOpen) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="text-6xl mb-4">🔴</div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Día no iniciado</h2>
          <p className="text-gray-500 mb-6 max-w-sm">
            Para empezar a tomar pedidos, primero debes iniciar el día desde la configuración.
          </p>
          <a
            href="/configuracion"
            className="bg-primary hover:bg-primary-dark text-white font-bold px-6 py-3 rounded-xl transition-colors"
          >
            ⚙️ Ir a Configuración
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Category Tabs */}
      <div className="mb-6">
        <CategoryTabs
          categories={categories}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
        />
      </div>

      {/* Products Grid */}
      {availableProducts.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {availableProducts.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">🍤</div>
          <p className="font-medium">No hay productos disponibles en esta categoría</p>
        </div>
      )}

      {/* Unavailable products */}
      {unavailableProducts.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">
            No disponibles
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {unavailableProducts.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      )}

      {/* Floating Cart */}
      <FloatingCart onOpen={() => setCartOpen(true)} />

      {/* Cart Drawer */}
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}
