'use client';

import { useApp } from '@/context/AppContext';

interface Props {
  onOpen: () => void;
}

export default function FloatingCart({ onOpen }: Props) {
  const { cartCount, cartTotal } = useApp();

  if (cartCount === 0) return null;

  return (
    <button
      onClick={onOpen}
      className="fixed bottom-6 right-6 z-30 bg-accent hover:bg-accent-dark text-white rounded-full shadow-xl flex items-center gap-3 px-5 py-3.5 transition-all hover:scale-105 active:scale-95"
    >
      <span className="text-xl">🛒</span>
      <div className="flex flex-col items-start leading-tight">
        <span className="text-xs font-medium opacity-90">{cartCount} productos</span>
        <span className="font-bold text-sm">${cartTotal.toFixed(2)}</span>
      </div>
      <span className="bg-white/25 text-white font-bold w-7 h-7 rounded-full flex items-center justify-center text-sm">
        {cartCount}
      </span>
    </button>
  );
}
