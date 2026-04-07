'use client';

import { Category } from '@/types';

interface Props {
  categories: Category[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}

export default function CategoryTabs({ categories, selected, onSelect }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
      <button
        onClick={() => onSelect(null)}
        className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
          selected === null
            ? 'bg-primary text-white shadow-md'
            : 'bg-white text-gray-600 hover:bg-primary/10 border border-gray-200'
        }`}
      >
        Todos
      </button>
      {categories.map(cat => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
            selected === cat.id
              ? 'bg-primary text-white shadow-md'
              : 'bg-white text-gray-600 hover:bg-primary/10 border border-gray-200'
          }`}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
}
