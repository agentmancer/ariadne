/**
 * Page container with responsive layout
 * - Mobile: Full width with bottom nav padding
 * - Desktop: Content area with sidebar offset
 */

import { ReactNode } from 'react';
import { Header } from './Header';

interface PageContainerProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  /** Additional action buttons for the header area (desktop only) */
  actions?: ReactNode;
}

export function PageContainer({ children, title, subtitle, actions }: PageContainerProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile header */}
      <Header title={title} subtitle={subtitle} />

      {/* Desktop header */}
      <div className="hidden lg:block bg-white border-b border-gray-200 px-8 py-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
          </div>
          {actions && <div className="flex gap-3">{actions}</div>}
        </div>
      </div>

      {/* Content */}
      <main className="p-4 lg:p-8 pb-24 lg:pb-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
