import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback render */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Class-based error boundary that catches render-time errors anywhere in its
 * subtree and shows a generic "Something went wrong" fallback with a retry
 * button. Uses the design system's error surface colors.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          className="min-h-[60vh] flex flex-col items-center justify-center p-margin"
        >
          <div className="max-w-md w-full rounded-md bg-error-container/40 p-6 text-center shadow-level-1">
            <span
              className="material-symbols-outlined text-error text-[40px]"
              aria-hidden="true"
            >
              error
            </span>
            <h1 className="mt-4 font-outfit text-headline-section text-on-error-container">
              Something went wrong
            </h1>
            <p className="mt-2 text-body-regular text-on-error-container/80">
              {this.state.error?.message ??
                'An unexpected error occurred while rendering this view.'}
            </p>
            <button
              type="button"
              onClick={this.handleRetry}
              className="mt-6 inline-flex items-center gap-2 px-6 py-2 rounded-full bg-error text-on-error font-outfit text-body-medium hover:opacity-90 transition-opacity"
            >
              <span className="material-symbols-outlined text-[20px]">refresh</span>
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
