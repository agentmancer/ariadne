/**
 * Header component for mobile and tablet screens
 */

import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const { logout } = useAuth();

  return (
    <header className="lg:hidden bg-primary-600 text-white p-4 shadow-md">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm opacity-90">{subtitle}</p>}
        </div>
        <button
          onClick={logout}
          className="text-sm px-3 py-1 bg-white/20 rounded-lg active:bg-white/30"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
