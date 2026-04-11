import { Link } from 'react-router-dom';


export function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--bg-primary)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-forest flex items-center justify-center">
              <span className="text-white font-serif font-bold text-xs">LQ</span>
            </div>
            <span className="font-serif font-semibold text-lg text-[var(--text-primary)]">
              LandIQ Kenya
            </span>
          </Link>

          {/* Copyright */}
          <p className="text-xs text-[var(--text-muted)]">
            © 2024 LANDIQ KENYA. AI-POWERED VALUATION BETA.
          </p>
        </div>
      </div>
    </footer>
  );
}
