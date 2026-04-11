import { useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { usePredict } from '@/hooks/usePrediction';
import { EstimateForm } from '@/components/forms/EstimateForm';
import { AttributeCard } from '@/components/ui/AttributeCard';
import { ResultCard } from '@/components/ui/ResultCard';
import { Skeleton } from '@/components/ui/Skeleton';

export function EstimatePage() {
  const predictMutation = usePredict();
  const [showResults, setShowResults] = useState(false);

  const handleSubmit = async (data: {
    location_text: string;
    size_acres: number;
    amenity_score: number;
    accessibility_score: number;
    infrastructure_score: number;
  }) => {
    setShowResults(true);
    await predictMutation.mutateAsync(data);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="badge-amber text-xs">BETA MODEL</span>
          <span className="text-[var(--text-muted)] text-sm">OLS R² = 0.71</span>
        </div>
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-[var(--text-primary)]">
          Land Valuation Estimator
        </h1>
        <p className="text-[var(--text-secondary)] mt-2">
          Enter your property details to receive an AI-generated price estimate based on
          real-time market telemetry.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Form */}
        <div>
          <EstimateForm onSubmit={handleSubmit} isLoading={predictMutation.isPending} />
        </div>

        {/* Results */}
        <div>
          {!showResults ? (
            <EmptyState />
          ) : predictMutation.isPending ? (
            <LoadingState />
          ) : predictMutation.isError ? (
            <ErrorState onRetry={() => predictMutation.reset()} />
          ) : predictMutation.data ? (
            <div className="space-y-6">
              <ResultCard prediction={predictMutation.data} />
              <AttributeCard features={predictMutation.data.features} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card h-full min-h-[400px] flex flex-col items-center justify-center text-center">
      <div className="h-16 w-16 rounded-full bg-[var(--surface)] flex items-center justify-center mb-4">
        <MapPin className="h-8 w-8 text-[var(--text-muted)]" />
      </div>
      <h3 className="font-serif font-semibold text-lg text-[var(--text-primary)] mb-2">
        Enter a location to get started
      </h3>
      <p className="text-[var(--text-secondary)] text-sm max-w-xs">
        Fill in the property details on the left to receive your AI-generated valuation.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-64 w-full rounded-card" />
      <Skeleton className="h-80 w-full rounded-card" />
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="card h-full min-h-[400px] flex flex-col items-center justify-center text-center">
      <div className="h-16 w-16 rounded-full bg-alert/10 flex items-center justify-center mb-4">
        <Loader2 className="h-8 w-8 text-alert" />
      </div>
      <h3 className="font-serif font-semibold text-lg text-[var(--text-primary)] mb-2">
        Something went wrong
      </h3>
      <p className="text-[var(--text-secondary)] text-sm mb-4">
        We couldn't generate your valuation. Please try again.
      </p>
      <button onClick={onRetry} className="btn-primary">
        Try Again
      </button>
    </div>
  );
}
