import { Database, MapPin, FileText, AlertTriangle } from 'lucide-react';

export function AboutPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="mb-16">
        <h1 className="font-serif text-4xl md:text-5xl font-bold text-[var(--text-primary)] mb-4">
          About LandIQ Kenya
        </h1>
        <p className="text-lg text-[var(--text-secondary)] max-w-3xl">
          An editorial approach to land valuation. Bridging the gap between raw
          geospatial data and actionable property intelligence through high-fidelity AI
          modelling.
        </p>
      </div>

      <div className="grid lg:grid-cols-4 gap-8">
        {/* Table of Contents */}
        <div className="lg:col-span-1">
          <nav className="sticky top-24 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)] mb-4">
              Contents
            </p>
            <a
              href="#dataset"
              className="block text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              01. The Dataset
            </a>
            <a
              href="#model"
              className="block text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              02. How The Model Works
            </a>
            <a
              href="#limitations"
              className="block text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              03. System Limitations
            </a>
            <a
              href="#data-sources"
              className="block text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              04. Data & Acknowledgements
            </a>
          </nav>
        </div>

        {/* Content */}
        <div className="lg:col-span-3 space-y-16">
          {/* The Dataset */}
          <section id="dataset">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-sienna font-serif font-bold">01/</span>
              <h2 className="section-title">The Dataset</h2>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <p className="text-[var(--text-secondary)] mb-4">
                  Our engine is fueled by a curated repository of{' '}
                  <strong className="text-[var(--text-primary)]">
                    5,875 historical listings
                  </strong>
                  , scraped and cleaned from Property24 Kenya — covering land parcels
                  across 47 counties. Prices are standardised to KSh, log-transformed,
                  and filtered to a credible range of KSh 100K to KSh 900M per listing.
                </p>

                <div className="bg-[var(--surface)] rounded-lg p-4 mt-6">
                  <h4 className="font-medium text-[var(--text-primary)] mb-3">
                    Pipeline Details
                  </h4>
                  <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
                    <li className="flex items-start gap-2">
                      <Database className="h-4 w-4 mt-0.5 text-forest" />
                      Automated extraction of price, acreage, and location — with
                      currency normalisation (KSh / USD) and shorthand parsing (20M, 1.5B)
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 text-earth" />
                      Outlier suppression via hard bounds; prices outside KSh 100K–900M
                      dropped before training
                    </li>
                    <li className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-0.5 text-sienna" />
                      Geocoding via Google Plus Codes and OSM Nominatim; coordinates
                      validated against Kenya bounding box
                    </li>
                  </ul>
                </div>
              </div>

              <div className="bg-forest rounded-card p-6 text-white">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="font-mono text-3xl font-bold">5,875</p>
                    <p className="text-sm text-white/70">Listings</p>
                  </div>
                  <div>
                    <p className="font-mono text-3xl font-bold">47</p>
                    <p className="text-sm text-white/70">Counties</p>
                  </div>
                  <div>
                    <p className="font-mono text-3xl font-bold">MLP</p>
                    <p className="text-sm text-white/70">Model</p>
                  </div>
                </div>
                <div className="border-t border-white/20 mt-6 pt-4 grid grid-cols-2 gap-4 text-center">
                  <div>
                    <p className="font-mono text-2xl font-bold">10</p>
                    <p className="text-sm text-white/70">Model Features</p>
                  </div>
                  <div>
                    <p className="font-mono text-2xl font-bold">±30%</p>
                    <p className="text-sm text-white/70">Confidence Band</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* How The Model Works */}
          <section id="model" className="bg-forest rounded-card p-8 text-white">
            <div className="flex items-center gap-3 mb-8">
              <span className="text-sage font-serif font-bold">02/</span>
              <h2 className="font-serif text-2xl font-bold">How The Model Works</h2>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="flex gap-4">
                  <span className="text-sage font-serif font-bold text-xl">01</span>
                  <div>
                    <h4 className="font-medium mb-1">Location Resolution</h4>
                    <p className="text-sm text-white/70">
                      Google Plus Codes are decoded locally for maximum precision.
                      County names and landmarks are resolved via OSM Nominatim with
                      results cached to avoid repeat API calls.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <span className="text-sage font-serif font-bold text-xl">02</span>
                  <div>
                    <h4 className="font-medium mb-1">Feature Computation</h4>
                    <p className="text-sm text-white/70">
                      10 spatial and market variables are computed: plot size (log),
                      distance to Nairobi, nearest urban centre, reference city,
                      coordinates, geocode confidence, amenities score, road
                      accessibility, and a county price index derived from training data.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <span className="text-sage font-serif font-bold text-xl">03</span>
                  <div>
                    <h4 className="font-medium mb-1">MLP Inference</h4>
                    <p className="text-sm text-white/70">
                      A two-layer neural network (64 → 32 neurons, BatchNorm + Dropout)
                      predicts log(price per acre). The output is exponentiated and
                      scaled by plot size to produce a total KSh estimate with a ±30%
                      confidence band.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white/10 rounded-lg p-6">
                <h4 className="font-medium mb-4 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Model Features
                </h4>
                <div className="space-y-3">
                  {[
                    { label: 'County Price Index', pct: 72 },
                    { label: 'Distance to Nairobi', pct: 65 },
                    { label: 'Plot Size (log acres)', pct: 58 },
                    { label: 'Nearest Urban Centre', pct: 50 },
                    { label: 'Amenities Score', pct: 42 },
                    { label: 'Road Accessibility', pct: 38 },
                  ].map(({ label, pct }) => (
                    <div key={label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{label}</span>
                        <span className="text-white/60 text-xs">{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-sage rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-white/50 mt-4">
                  * Relative OLS coefficient magnitudes. County price index captures
                  historical market level per county.
                </p>
              </div>
            </div>
          </section>

          {/* System Limitations */}
          <section id="limitations">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-sienna font-serif font-bold">03/</span>
              <h2 className="section-title">System Limitations</h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <LimitationCard
                icon={<AlertTriangle className="h-5 w-5 text-alert" />}
                title="Training Data Coverage"
                description="Model is trained on ~5,800 usable listings after cleaning. Sparsely listed counties such as Mandera or Turkana carry higher prediction variance."
              />
              <LimitationCard
                icon={<AlertTriangle className="h-5 w-5 text-earth" />}
                title="Temporal Drift"
                description="Model reflects market conditions at scrape time. It does not account for inflation, interest rate shifts, or post-election land price movements."
              />
              <LimitationCard
                icon={<MapPin className="h-5 w-5 text-forest" />}
                title="Geocoding Quality"
                description="Short or incomplete Plus Codes decode to approximate centroids. County-level inputs produce county-centroid coordinates, reducing spatial precision."
              />
              <LimitationCard
                icon={<FileText className="h-5 w-5 text-sienna" />}
                title="Regulatory Notice"
                description="LandIQ is a research and advisory tool only. Outputs do not constitute formal valuation, financial, or legal advice under Kenyan law."
              />
            </div>
          </section>

          {/* Data Sources */}
          <section id="data-sources">
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)] mb-4">
                  Data Sources
                </p>
                <div className="space-y-4">
                  <DataSource
                    code="P24"
                    name="Property24 Kenya"
                    description="5,875 raw land listings — prices, sizes, locations"
                  />
                  <DataSource
                    code="OSM"
                    name="OpenStreetMap / Nominatim"
                    description="Geocoding, reverse geocoding, amenity proximity"
                  />
                  <DataSource
                    code="G+"
                    name="Google Plus Codes"
                    description="High-precision coordinate encoding for rural Kenya"
                  />
                  <DataSource
                    code="KNB"
                    name="Kenya National Bureau of Statistics"
                    description="County boundaries and administrative reference data"
                  />
                </div>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)] mb-4">
                  Institutional Acknowledgements
                </p>
                <p className="text-[var(--text-secondary)] text-sm">
                  This project contributes to the open-data landscape in Kenya. The
                  model architecture builds on PyTorch, scikit-learn, and the broader
                  geospatial Python ecosystem (GeoPandas, OSMnx, Geopy). Special thanks
                  to the spatial data community in Nairobi for ongoing feedback during
                  Alpha testing, and to the OSM Kenya contributors whose amenity data
                  powers our accessibility scoring.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function LimitationCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="card card-hover">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          <h4 className="font-medium text-[var(--text-primary)] mb-1">{title}</h4>
          <p className="text-sm text-[var(--text-secondary)]">{description}</p>
        </div>
      </div>
    </div>
  );
}

function DataSource({
  code,
  name,
  description,
}: {
  code: string;
  name: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg bg-[var(--surface)] flex items-center justify-center font-mono font-bold text-sm text-[var(--text-muted)]">
        {code}
      </div>
      <div>
        <p className="font-medium text-[var(--text-primary)]">{name}</p>
        <p className="text-sm text-[var(--text-secondary)]">{description}</p>
      </div>
    </div>
  );
}
