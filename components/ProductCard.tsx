'use client';

import { Product } from '@/types';
import { useApp } from '@/context/AppContext';

interface Props {
  product: Product;
}

export default function ProductCard({ product }: Props) {
  const { addToCart, cart } = useApp();
  const quantity = cart
    .filter(item => item.product.id === product.id)
    .reduce((sum, item) => sum + item.quantity, 0);

  return (
    <button
      onClick={() => product.available && addToCart(product)}
      disabled={!product.available}
      className={`relative bg-white rounded-xl p-4 shadow-sm border-2 transition-all text-left w-full ${
        product.available
          ? 'border-transparent hover:border-primary hover:shadow-md active:scale-[0.98] cursor-pointer'
          : 'border-transparent opacity-50 cursor-not-allowed'
      }`}
    >
      {quantity > 0 && (
        <span className="absolute -top-2 -right-2 bg-accent text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md">
          {quantity}
        </span>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="font-semibold text-foreground text-sm sm:text-base leading-tight">
          {product.name}
        </h3>
        <div className="flex items-center justify-between">
          <span className="text-primary font-bold text-lg">
            ${product.price.toFixed(2)}
          </span>
          {!product.available && (
            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
              No disponible
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
