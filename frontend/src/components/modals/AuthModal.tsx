import { useEffect, useState } from 'react';
import { Eye, EyeOff, Mail, X } from 'lucide-react';
import { useAuthStore, useModalStore } from '@/store';
import { cn } from '@/lib/utils';

export function AuthModal() {
  const { isOpen, mode, closeModal, openSignIn, openRegister } = useModalStore();
  const { login, register, isLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setError(null);
    }
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [closeModal]);

  const handleSwitchMode = (newMode: 'signin' | 'register') => {
    setIsAnimating(true);
    setTimeout(() => {
      if (newMode === 'signin') openSignIn();
      else openRegister();
      setError(null);
      setIsAnimating(false);
    }, 150);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
      if (!/\d/.test(password)) {
        setError('Password must contain at least one digit');
        return;
      }
    }

    try {
      if (mode === 'signin') {
        await login(email, password);
      } else {
        await register(email, password);
      }
      closeModal();
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : mode === 'signin'
          ? 'Invalid email or password'
          : 'Email already registered';
      setError(errorMsg);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={closeModal}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-[var(--bg-secondary)] rounded-card shadow-modal p-8">
        {/* Close button */}
        <button
          onClick={closeModal}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-[var(--surface)] transition-colors"
        >
          <X className="h-5 w-5 text-[var(--text-secondary)]" />
        </button>

        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="h-12 w-12 rounded-xl bg-forest flex items-center justify-center">
            <svg
              className="h-6 w-6 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 21h18M5 21V7l8-4 8 4v14" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <div
          className={cn(
            'text-center mb-6 transition-all duration-150',
            isAnimating && 'opacity-0 translate-y-2'
          )}
        >
          <h2 className="font-serif text-2xl font-semibold text-[var(--text-primary)]">
            {mode === 'signin' ? 'Welcome back' : 'Get started'}
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {mode === 'signin'
              ? 'Sign in to access your valuations'
              : 'Create an account to start valuing land'}
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className={cn(
            'space-y-4 transition-all duration-150',
            isAnimating && 'opacity-0 translate-y-2'
          )}
        >
          {/* Email */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)] mb-2">
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                required
                className="input-field pl-10"
              />
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-muted)]" />
            </div>
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                Password
              </label>
              {mode === 'signin' && (
                <a
                  href="#"
                  className="text-xs text-sienna hover:underline"
                  onClick={(e) => e.preventDefault()}
                >
                  Forgot your password?
                </a>
              )}
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="input-field pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          {/* Confirm Password (register only) */}
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)] mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="input-field pr-10"
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-alert text-center">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full btn-primary py-3 disabled:opacity-50"
          >
            {isLoading
              ? 'Please wait...'
              : mode === 'signin'
              ? 'Sign In'
              : 'Create Account'}
          </button>
        </form>

        {/* Switch mode */}
        <p
          className={cn(
            'mt-6 text-center text-sm text-[var(--text-secondary)] transition-all duration-150',
            isAnimating && 'opacity-0'
          )}
        >
          {mode === 'signin' ? (
            <>
              New to LandIQ?{' '}
              <button
                onClick={() => handleSwitchMode('register')}
                className="text-sienna font-medium hover:underline"
              >
                Create an account →
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => handleSwitchMode('signin')}
                className="text-sienna font-medium hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>

        {/* Terms (register only) */}
        {mode === 'register' && (
          <p className="mt-4 text-xs text-center text-[var(--text-muted)]">
            By creating an account, you agree to our Terms of Service and Privacy Policy.
          </p>
        )}
      </div>
    </div>
  );
}
