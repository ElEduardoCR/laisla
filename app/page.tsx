'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import CategoryTabs from '@/components/CategoryTabs';
import ProductCard from '@/components/ProductCard';
import FloatingCart from '@/components/FloatingCart';
import CartDrawer from '@/components/CartDrawer';

export default function HomePage() {
  const { categories, products } = useApp();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const filteredProducts = selectedCategory
    ? products.filter(p => p.categoryId === selectedCategory)
    : products;

  const availableProducts = filteredProducts.filter(p => p.available);
  const unavailableProducts = filteredProducts.filter(p => !p.available);

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
