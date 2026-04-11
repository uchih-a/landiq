import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { useAuthStore, useModalStore, useThemeStore } from '@/store';
import { cn } from '@/lib/utils';

const navLinks = [
  { path: '/', label: 'Home' },
  { path: '/estimate', label: 'Estimate' },
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/about', label: 'About' },
];

export function Navbar() {
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuthStore();
  const { openSignIn, openRegister } = useModalStore();
  const { theme, toggleTheme } = useThemeStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-[var(--border)] bg-[var(--bg-primary)]/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-forest flex items-center justify-center">
              <span className="text-white font-serif font-bold text-sm">LQ</span>
            </div>
            <span className="font-serif font-semibold text-xl text-[var(--text-primary)]">
              LandIQ
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={cn(
                  'text-sm font-medium transition-colors relative',
                  isActive(link.path)
                    ? 'text-sienna'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                )}
              >
                {link.label}
                {isActive(link.path) && (
                  <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-sienna rounded-full" />
                )}
              </Link>
            ))}
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-4">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-[var(--surface)] transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'light' ? (
                <Moon className="h-5 w-5 text-[var(--text-secondary)]" />
              ) : (
                <Sun className="h-5 w-5 text-[var(--text-secondary)]" />
              )}
            </button>

            {/* Auth Buttons */}
            <div className="hidden lg:flex items-center gap-3">
              {isAuthenticated ? (
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-forest flex items-center justify-center">
                    <span className="text-white text-xs font-medium">
                      {user?.email.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <button
                    onClick={logout}
                    className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={openSignIn}
                    className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={openRegister}
                    className="btn-primary text-sm"
                  >
                    Get Started
                  </button>
                </>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-[var(--surface)]"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-[var(--border)] bg-[var(--bg-primary)]">
          <div className="px-4 py-4 space-y-3">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'block py-2 text-sm font-medium',
                  isActive(link.path)
                    ? 'text-sienna'
                    : 'text-[var(--text-secondary)]'
                )}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-3 border-t border-[var(--border)] space-y-2">
              {isAuthenticated ? (
                <button
                  onClick={() => {
                    logout();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left py-2 text-sm text-[var(--text-secondary)]"
                >
                  Sign Out
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      openSignIn();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full text-left py-2 text-sm text-[var(--text-secondary)]"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => {
                      openRegister();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full btn-primary text-sm"
                  >
                    Get Started
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
