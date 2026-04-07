'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppContext';

export default function ConfiguracionPage() {
  const {
    categories, products,
    addCategory, updateCategory, deleteCategory,
    addProduct, updateProduct, deleteProduct,
  } = useApp();

  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // New product form
  const [newProductForm, setNewProductForm] = useState<{ categoryId: string; name: string; price: string } | null>(null);

  // Edit product
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editProductData, setEditProductData] = useState({ name: '', price: '' });

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;
    addCategory(newCategoryName.trim());
    setNewCategoryName('');
  };

  const handleSaveCategory = (id: string) => {
    if (!editCategoryName.trim()) return;
    updateCategory(id, editCategoryName.trim());
    setEditingCategory(null);
  };

  const handleAddProduct = (categoryId: string) => {
    if (!newProductForm || !newProductForm.name.trim() || !newProductForm.price) return;
    addProduct({
      categoryId,
      name: newProductForm.name.trim(),
      price: parseFloat(newProductForm.price),
      available: true,
    });
    setNewProductForm(null);
  };

  const handleSaveProduct = (id: string) => {
    if (!editProductData.name.trim() || !editProductData.price) return;
    updateProduct(id, {
      name: editProductData.name.trim(),
      price: parseFloat(editProductData.price),
    });
    setEditingProduct(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
        ⚙️ Configuración del Menú
      </h1>

      {/* Add Category */}
      <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
        <h2 className="font-bold text-sm text-gray-500 uppercase tracking-wide mb-3">
          Nueva Categoría
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={newCategoryName}
            onChange={e => setNewCategoryName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
            placeholder="Nombre de la categoría..."
            className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary"
          />
          <button
            onClick={handleAddCategory}
            className="bg-primary hover:bg-primary-dark text-white font-bold px-5 py-2.5 rounded-lg transition-colors text-sm shrink-0"
          >
            + Agregar
          </button>
        </div>
      </div>

      {/* Categories accordion */}
      <div className="space-y-3">
        {categories.map(cat => {
          const catProducts = products.filter(p => p.categoryId === cat.id);
          const isExpanded = expandedCategory === cat.id;

          return (
            <div key={cat.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
              {/* Category header */}
              <div className="flex items-center gap-2 p-4">
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : cat.id)}
                  className="flex-1 flex items-center gap-3 text-left"
                >
                  <span className={`text-sm transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                    ▶
                  </span>
                  {editingCategory === cat.id ? (
                    <input
                      type="text"
                      value={editCategoryName}
                      onChange={e => setEditCategoryName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveCategory(cat.id);
                        if (e.key === 'Escape') setEditingCategory(null);
                      }}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 px-2 py-1 border-2 border-primary rounded text-sm focus:outline-none"
                      autoFocus
                    />
                  ) : (
                    <span className="font-bold text-foreground">{cat.name}</span>
                  )}
                  <span className="text-xs text-gray-400 font-medium">
                    {catProducts.length} producto{catProducts.length !== 1 ? 's' : ''}
                  </span>
                </button>

                <div className="flex gap-1 shrink-0">
                  {editingCategory === cat.id ? (
                    <>
                      <button
                        onClick={() => handleSaveCategory(cat.id)}
                        className="text-success hover:bg-success/10 px-2 py-1 rounded text-sm font-bold transition-colors"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => setEditingCategory(null)}
                        className="text-gray-400 hover:bg-gray-100 px-2 py-1 rounded text-sm font-bold transition-colors"
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditingCategory(cat.id);
                          setEditCategoryName(cat.name);
                        }}
                        className="text-gray-400 hover:text-primary hover:bg-primary/10 px-2 py-1 rounded text-sm transition-colors"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`¿Eliminar "${cat.name}" y todos sus productos?`)) {
                            deleteCategory(cat.id);
                          }
                        }}
                        className="text-gray-400 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded text-sm transition-colors"
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Products list */}
              {isExpanded && (
                <div className="border-t px-4 pb-4">
                  {catProducts.length > 0 ? (
                    <div className="divide-y">
                      {catProducts.map(prod => (
                        <div key={prod.id} className="flex items-center gap-3 py-3">
                          {editingProduct === prod.id ? (
                            <>
                              <input
                                type="text"
                                value={editProductData.name}
                                onChange={e => setEditProductData(d => ({ ...d, name: e.target.value }))}
                                className="flex-1 px-2 py-1.5 border-2 border-primary rounded text-sm focus:outline-none"
                              />
                              <input
                                type="number"
                                value={editProductData.price}
                                onChange={e => setEditProductData(d => ({ ...d, price: e.target.value }))}
                                className="w-24 px-2 py-1.5 border-2 border-primary rounded text-sm focus:outline-none"
                              />
                              <button
                                onClick={() => handleSaveProduct(prod.id)}
                                className="text-success font-bold text-sm"
                              >
                                ✓
                              </button>
                              <button
                                onClick={() => setEditingProduct(null)}
                                className="text-gray-400 font-bold text-sm"
                              >
                                ✕
                              </button>
                            </>
                          ) : (
                            <>
                              <div className="flex-1 min-w-0">
                                <span className={`font-medium text-sm ${!prod.available ? 'text-gray-400 line-through' : 'text-foreground'}`}>
                                  {prod.name}
                                </span>
                              </div>
                              <span className="text-primary font-bold text-sm shrink-0">
                                ${prod.price.toFixed(2)}
                              </span>
                              <button
                                onClick={() => updateProduct(prod.id, { available: !prod.available })}
                                className={`text-xs font-bold px-2 py-1 rounded-full transition-colors ${
                                  prod.available
                                    ? 'bg-success/10 text-success'
                                    : 'bg-red-50 text-red-500'
                                }`}
                              >
                                {prod.available ? 'Activo' : 'Inactivo'}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingProduct(prod.id);
                                  setEditProductData({ name: prod.name, price: prod.price.toString() });
                                }}
                                className="text-gray-400 hover:text-primary text-sm transition-colors"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`¿Eliminar "${prod.name}"?`)) {
                                    deleteProduct(prod.id);
                                  }
                                }}
                                className="text-gray-400 hover:text-red-500 text-sm transition-colors"
                              >
                                🗑️
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm py-3">No hay productos en esta categoría</p>
                  )}

                  {/* Add product */}
                  {newProductForm?.categoryId === cat.id ? (
                    <div className="flex items-center gap-2 pt-3 border-t mt-2">
                      <input
                        type="text"
                        value={newProductForm.name}
                        onChange={e => setNewProductForm(f => f ? { ...f, name: e.target.value } : f)}
                        placeholder="Nombre del producto..."
                        className="flex-1 px-2 py-1.5 border-2 border-gray-200 rounded text-sm focus:outline-none focus:border-primary"
                        autoFocus
                      />
                      <input
                        type="number"
                        value={newProductForm.price}
                        onChange={e => setNewProductForm(f => f ? { ...f, price: e.target.value } : f)}
                        placeholder="Precio"
                        className="w-24 px-2 py-1.5 border-2 border-gray-200 rounded text-sm focus:outline-none focus:border-primary"
                      />
                      <button
                        onClick={() => handleAddProduct(cat.id)}
                        className="bg-success hover:bg-success-dark text-white font-bold px-3 py-1.5 rounded text-sm transition-colors"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => setNewProductForm(null)}
                        className="text-gray-400 hover:text-gray-600 font-bold text-sm"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setNewProductForm({ categoryId: cat.id, name: '', price: '' })}
                      className="mt-3 text-primary hover:text-primary-dark font-semibold text-sm transition-colors"
                    >
                      + Agregar producto
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {categories.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">📋</div>
          <p className="font-medium">No hay categorías aún</p>
          <p className="text-sm mt-1">Agrega tu primera categoría arriba</p>
        </div>
      )}
    </div>
  );
}
