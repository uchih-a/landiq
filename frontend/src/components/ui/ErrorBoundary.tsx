import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      const isDebug = import.meta.env.DEV;

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg-primary)]">
          <div className="text-center max-w-lg">
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <div className="h-16 w-16 rounded-xl bg-forest flex items-center justify-center">
                <span className="text-white font-serif font-bold text-2xl">LQ</span>
              </div>
            </div>

            <h1 className="font-serif text-3xl font-semibold text-[var(--text-primary)] mb-4">
              Something went wrong
            </h1>

            <p className="text-[var(--text-secondary)] mb-8">
              We apologize for the inconvenience. Please try refreshing the page or
              contact support if the problem persists.
            </p>

            <button
              onClick={() => window.location.reload()}
              className="btn-primary"
            >
              Reload Page
            </button>

            {isDebug && this.state.error && (
              <pre className="mt-8 p-4 rounded-lg bg-[var(--surface)] text-left text-sm text-[var(--text-secondary)] overflow-auto">
                {this.state.error.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
