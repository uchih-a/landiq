import { ArrowRight, BarChart3, MapPin, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMarketSummary } from '@/hooks/useMarketData';
import { formatKES, formatNumber } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';

export function HomePage() {
  const { data: summary, isLoading } = useMarketSummary();

  return (
    <div>
      {/* Hero Section */}
      <section className="relative bg-forest overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDM0aDR2NGgtNHpNMjAgMjBoNHY0aC00eiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight">
                Know What Land Is{' '}
                <span className="text-sage">Worth Before You Buy</span>
              </h1>
              <p className="mt-6 text-lg text-white/80 max-w-lg">
                Kenya's first AI-powered land ledger. We process millions of data
                points across 47 counties to deliver bank-grade valuations in seconds.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link to="/estimate" className="btn-primary bg-sienna hover:bg-sienna-dark">
                  Start Free Valuation
                </Link>
                <Link to="/dashboard" className="btn-ghost border-white/30 text-white hover:bg-white/10">
                  View Market Trends
                </Link>
              </div>
            </div>

            {/* Preview Card */}
            <div className="hidden lg:block">
              <div className="relative">
                <div className="bg-white/10 backdrop-blur-lg rounded-card p-6 border border-white/20">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-lg bg-sage/20 flex items-center justify-center">
                      <MapPin className="h-5 w-5 text-sage" />
                    </div>
                    <div>
                      <p className="text-white font-medium">2 acres in Kiambu County</p>
                      <p className="text-white/60 text-sm">Gatundu South Sector B</p>
                    </div>
                  </div>
                  <div className="bg-forest-dark/50 rounded-lg p-4">
                    <p className="text-white/60 text-sm mb-1">ESTIMATED VALUE</p>
                    <p className="font-mono text-2xl text-white">
                      KES 4,200,000 <span className="text-lg text-white/60">/ acre</span>
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
                      <div className="h-full w-[82%] bg-gradient-to-r from-sage to-earth rounded-full" />
                    </div>
                    <span className="text-white/60 text-sm">82% Confidence</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-y border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <StatItem
              value={isLoading ? null : formatKES(summary?.national_avg_price_per_acre || 0)}
              label="Avg. Plot Value"
              isLoading={isLoading}
            />
            <StatItem
              value={isLoading ? null : `${summary?.counties_covered || 0}`}
              label="Counties Indexed"
              isLoading={isLoading}
            />
            <StatItem
              value={isLoading ? null : formatNumber(summary?.total_listings || 0)}
              label="Total Listings"
              isLoading={isLoading}
            />
            <StatItem
              value={isLoading ? null : `${summary?.ols_r2?.toFixed(2) || '0.71'}`}
              label="Model Accuracy"
              isLoading={isLoading}
            />
          </div>
        </div>
      </section>
      {/* How It Works */}
      <section className="py-20 bg-[var(--bg-primary)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="section-title mb-4">Intelligence in Three Acts</h2>
            <p className="text-[var(--text-secondary)] max-w-2xl mx-auto">
              We strip away the complexity of land valuation, replacing guesswork with
              scientific precision.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <StepCard
              number="01"
              title="Pin Your Property"
              description="Enter a Google Plus Code, county name, or landmark. Our geocoding engine resolves your exact coordinates and county automatically."
            />
            <StepCard
              number="02"
              title="Model Analyses 10 Factors"
              description="Plot size, distance to Nairobi, nearest urban centre, reference city proximity, amenities, road accessibility, coordinates, geocode precision, and county price index are computed."
            />
            <StepCard
              number="03"
              title="Get Your KES Estimate"
              description="Receive a price-per-acre valuation with a ±30% confidence range, backed by a neural network trained on thousands of Kenyan land listings."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-forest">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-white mb-4">
            The Future of Land Ownership is Data-Driven
          </h2>
          <p className="text-white/80 mb-8">
            Stop guessing. Start knowing. using LandIQ to secures
            their financial legacy.
          </p>
          <Link to="/estimate" className="btn-primary bg-sienna hover:bg-sienna-dark inline-flex items-center gap-2">
            Get Started <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function StatItem({
  value,
  label,
  isLoading,
}: {
  value: string | null;
  label: string;
  isLoading: boolean;
}) {
  return (
    <div className="text-center">
      {isLoading ? (
        <>
          <div className="h-8 w-24 mx-auto skeleton mb-2" />
          <div className="h-4 w-20 mx-auto skeleton" />
        </>
      ) : (
        <>
          <p className="font-mono text-2xl md:text-3xl font-semibold text-[var(--text-primary)]">
            {value}
          </p>
          <p className="text-sm text-[var(--text-muted)] uppercase tracking-wide mt-1">
            {label}
          </p>
        </>
      )}
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-sienna/10 text-sienna font-serif font-bold text-lg mb-4">
        {number}
      </div>
      <h3 className="font-serif font-semibold text-lg text-[var(--text-primary)] mb-2">
        {title}
      </h3>
      <p className="text-[var(--text-secondary)] text-sm">{description}</p>
    </div>
  );
}

function RegionCard({
  name,
  price,
  trend,
  trendColor,
}: {
  name: string;
  price: string;
  trend: string;
  trendColor: 'green' | 'amber' | 'grey';
}) {
  const trendColors = {
    green: 'text-forest',
    amber: 'text-earth',
    grey: 'text-[var(--text-muted)]',
  };

  return (
    <div className="card card-hover">
      <p className="font-medium text-[var(--text-primary)]">{name}</p>
      <p className="font-mono text-lg text-[var(--text-primary)] mt-1">
        {parseInt(price).toLocaleString()}
      </p>
      <p className={`text-xs mt-2 ${trendColors[trendColor]}`}>{trend}</p>
    </div>
  );
}
