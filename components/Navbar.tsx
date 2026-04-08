'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/context/AppContext';

export default function Navbar() {
  const pathname = usePathname();
  const { pendingOrdersCount, isDayOpen } = useApp();

  const links = [
    { href: '/', label: 'Menú', icon: '🍽️' },
    { href: '/cocina', label: 'Cocina', icon: '👨‍🍳' },
    { href: '/reportes', label: 'Reportes', icon: '📊' },
    { href: '/configuracion', label: 'Config', icon: '⚙️' },
  ];

  return (
    <nav className="bg-primary shadow-lg sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🦐</span>
            <span className="text-white font-bold text-xl hidden sm:block">POS Mariscos</span>
            {/* Day status indicator */}
            <span className={`hidden sm:inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
              isDayOpen ? 'bg-success/30 text-white' : 'bg-red-500/30 text-white/80'
            }`}>
              {isDayOpen ? '🟢 Abierto' : '🔴 Cerrado'}
            </span>
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            {links.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  pathname === link.href
                    ? 'bg-white/20 text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <span>{link.icon}</span>
                <span className="hidden sm:inline">{link.label}</span>
                {link.href === '/cocina' && pendingOrdersCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-accent text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center animate-pulse">
                    {pendingOrdersCount}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
