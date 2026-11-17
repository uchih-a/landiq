/**
 * ComponentPreview — a single route showing every design-system primitive.
 *
 * Accessible at /dev/components in dev mode only (not in the main nav).
 * This serves the same purpose as Storybook without adding a dependency.
 */

import { ValuationCard } from '@/components/ValuationCard';
import { PillButton } from '@/components/PillButton';
import { PillInput } from '@/components/PillInput';
import { PillDropdown } from '@/components/PillDropdown';
import { ValuationChip } from '@/components/ValuationChip';
import { HoneycombBadge } from '@/components/HoneycombBadge';
import { ScoreRing } from '@/components/ScoreRing';
import { KpiStatBlock } from '@/components/KpiStatBlock';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSkeleton, LoadingSkeletonCard } from '@/components/LoadingSkeleton';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-headline-section text-headline-section text-on-surface">{title}</h2>
      <div className="flex flex-wrap gap-4 items-start">{children}</div>
    </section>
  );
}

export default function ComponentPreview() {
  return (
    <div className="flex flex-col gap-space-xl p-margin max-w-6xl mx-auto">
      <div className="flex items-baseline gap-3 pt-4">
        <h1 className="font-headline-page text-headline-page text-on-surface">Component Preview</h1>
        <span className="text-label-uppercase text-secondary">Design System Primitives</span>
      </div>

      {/* ValuationCard */}
      <Section title="Valuation Card">
        <ValuationCard className="w-80">
          <p className="text-body-regular text-on-surface">Base card — 24px radius, surface-container-lowest, level-1 shadow, hairline border.</p>
        </ValuationCard>
        <ValuationCard hoverable className="w-80">
          <p className="text-body-regular text-on-surface">Hoverable card — elevates to level-2 shadow + primary border tint on hover.</p>
        </ValuationCard>
        <ValuationCard noPadding className="w-80">
          <div className="p-space-lg">
            <p className="text-body-regular text-on-surface">No-padding card — manages its own internal layout.</p>
          </div>
        </ValuationCard>
      </Section>

      {/* PillButton */}
      <Section title="Pill Button">
        <PillButton leadingIcon="calculate">Estimate a price</PillButton>
        <PillButton variant="secondary" leadingIcon="location_on">Filter County</PillButton>
        <PillButton variant="secondary" trailingIcon="keyboard_arrow_down">Filter Property type</PillButton>
        <PillButton disabled>Disabled</PillButton>
      </Section>

      {/* PillInput */}
      <Section title="Pill Input">
        <PillInput placeholder="Search location..." className="w-64" />
        <PillInput placeholder="Search..." leadingIcon="search" className="w-64" />
        <PillInput placeholder="Size in acres" trailingIcon="straighten" className="w-64" />
      </Section>

      {/* PillDropdown */}
      <Section title="Pill Dropdown">
        <PillDropdown
          label="Filter County"
          leadingIcon="location_on"
          options={[
            { value: 'nairobi', label: 'Nairobi' },
            { value: 'kiambu', label: 'Kiambu' },
            { value: 'nakuru', label: 'Nakuru' },
          ]}
        />
      </Section>

      {/* ValuationChip */}
      <Section title="Valuation Chip">
        <ValuationChip verdict="underpriced" count={118} />
        <ValuationChip verdict="fair" count={540} />
        <ValuationChip verdict="overpriced" count={154} />
        <ValuationChip verdict="constrained" label="Constrained Volume" />
      </Section>

      {/* HoneycombBadge */}
      <Section title="Honeycomb Badge">
        <div className="flex gap-2 items-center">
          <HoneycombBadge>A</HoneycombBadge>
          <HoneycombBadge>B+</HoneycombBadge>
          <HoneycombBadge>T1</HoneycombBadge>
          <HoneycombBadge>T2</HoneycombBadge>
          <span className="text-body-regular text-secondary">— confidence/tier ratings</span>
        </div>
      </Section>

      {/* ScoreRing */}
      <Section title="Score Ring">
        <ValuationCard className="flex gap-space-lg">
          <ScoreRing score={84} label="Amenities" />
          <ScoreRing score={92} label="Accessibility" />
          <ScoreRing score={67} label="Infrastructure" />
          <ScoreRing score={null} label="Amenities" />
          <ScoreRing score={null} label="Accessibility" />
        </ValuationCard>
      </Section>

      {/* KpiStatBlock */}
      <Section title="KPI Stat Block">
        <KpiStatBlock
          badge="Total sample"
          value="812"
          label="Listings analysed"
          context="812 listings analysed"
        />
        <KpiStatBlock
          badge="Middle half KSh 1.1M – 9M"
          value="KSh 3.4M"
          label="National median per acre"
          context="Middle half KSh 1.1M - 9M"
        />
        <KpiStatBlock
          badge="Reliability"
          value="31%"
          label="Typical model error"
          context="80% range holds 81% of the time"
          mobile
        />
      </Section>

      {/* StatusBadge */}
      <Section title="Status Badge">
        <StatusBadge status="reliable" />
        <StatusBadge status="limited" />
        <StatusBadge status="unsupported" />
      </Section>

      {/* EmptyState */}
      <Section title="Empty State">
        <EmptyState
          title="Data unavailable"
          message="The model artifacts are not loaded. Copy the artifacts into ARTIFACTS_DIR and restart the backend service."
          actionLabel="Retry"
          onAction={() => console.log('retry clicked')}
          className="w-full max-w-lg"
        />
      </Section>

      {/* LoadingSkeleton */}
      <Section title="Loading Skeleton">
        <div className="flex flex-col gap-2">
          <LoadingSkeleton className="h-6 w-48" />
          <LoadingSkeleton className="h-4 w-72" />
          <LoadingSkeletonCard className="w-80 h-40" />
        </div>
      </Section>

      {/* Outfit font weight verification */}
      <Section title="Outfit Font Weight Check">
        <div className="flex flex-col gap-1">
          <span className="text-display-kpi" style={{ fontFamily: 'Outfit', fontWeight: 300 }}>
            300 weight (display-kpi) — KSh 3.4M
          </span>
          <span className="text-headline-section" style={{ fontFamily: 'Outfit', fontWeight: 600 }}>
            600 weight (headline-section) — Section Title
          </span>
          <span className="text-body-regular" style={{ fontFamily: 'Outfit', fontWeight: 400 }}>
            400 weight (body-regular) — Body text
          </span>
          <span className="text-body-medium" style={{ fontFamily: 'Outfit', fontWeight: 500 }}>
            500 weight (body-medium) — Medium body
          </span>
          <span className="text-label-uppercase" style={{ fontFamily: 'Outfit', fontWeight: 500 }}>
            500 weight (label-uppercase) — UPPERCASE LABEL
          </span>
        </div>
      </Section>
    </div>
  );
}
