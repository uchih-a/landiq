import { useState } from 'react';
import { useDashboardStore } from '@/store';
import { CountyFilter } from '@/components/ui/CountyFilter';
import { KpiStrip } from '@/components/ui/KpiStrip';
import { TabToggle } from '@/components/ui/TabToggle';
import { ChoroplethMapDeck } from '@/components/charts/spatial/ChoroplethMapDeck';
import { ScatterMapDeck } from '@/components/charts/spatial/ScatterMapDeck';
import { CityProximityChart } from '@/components/charts/proximity/CityProximityChart';
import { AmenitiesScoreChart } from '@/components/charts/scores/AmenitiesScoreChart';
import { AccessibilityScoreChart } from '@/components/charts/scores/AccessibilityScoreChart';
import { BestInvestmentChart } from '@/components/charts/investment/BestInvestmentChart';
import { HistoryTable } from '@/components/ui/HistoryTable';

export function DashboardPage() {
  const { activeTab, setTab, countyFilter } = useDashboardStore();
  const [spatialTab, setSpatialTab] = useState<'choropleth' | 'scatter'>('choropleth');
  const [scoreTab, setScoreTab] = useState<'amenities' | 'accessibility'>('amenities');

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-[var(--text-primary)]">
          Dashboard
        </h1>
        <p className="text-[var(--text-secondary)] mt-2">
          Aggregated insights from 796 listings across 30 Kenyan counties
        </p>
      </div>

      <div className="mb-6">
        <TabToggle
          options={[
            { value: 'market', label: 'Market Analytics' },
            { value: 'history', label: 'My Valuations' },
          ]}
          value={activeTab}
          onChange={(value) => setTab(value as 'market' | 'history')}
        />
      </div>

      <div className="mb-8">
        <KpiStrip mode={activeTab} countyFilter={countyFilter} />
      </div>

      {activeTab === 'market' ? (
        <>
          <div className="mb-6 flex items-center gap-4">
            <CountyFilter />
            <span className="text-sm text-[var(--text-muted)]">Filter all charts by county</span>
          </div>

          {/* Spatial Analysis — Choropleth + Scatter only */}
          <section className="mb-12">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="section-title">Spatial Analysis</h2>
                <p className="text-[var(--text-secondary)] text-sm">
                  Where is land cheap and where is it expensive across Kenya?
                </p>
              </div>
              <TabToggle
                options={[
                  { value: 'choropleth', label: 'Choropleth' },
                  { value: 'scatter', label: 'Scatter' },
                ]}
                value={spatialTab}
                onChange={(value) => setSpatialTab(value as typeof spatialTab)}
              />
            </div>
            <div className="map-container h-[400px] md:h-[520px]">
              {spatialTab === 'choropleth' && <ChoroplethMapDeck />}
              {spatialTab === 'scatter' && <ScatterMapDeck />}
            </div>
          </section>

          {/* Proximity Analysis — Reference City only */}
          <section className="mb-12">
            <div className="mb-4">
              <h2 className="section-title">Proximity Analysis</h2>
              <p className="text-[var(--text-secondary)] text-sm">
                Price decay based on distance to key urban hubs
              </p>
            </div>
            <div className="card">
              <CityProximityChart />
            </div>
          </section>

          {/* Scores */}
          <section className="mb-12">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="section-title">How Amenities and Accessibility Drive Land Price</h2>
                <p className="text-[var(--text-secondary)] text-sm">
                  Properties with higher scores consistently command higher prices per acre
                </p>
              </div>
              <TabToggle
                options={[
                  { value: 'amenities', label: 'Amenities' },
                  { value: 'accessibility', label: 'Accessibility' },
                ]}
                value={scoreTab}
                onChange={(value) => setScoreTab(value as typeof scoreTab)}
              />
            </div>
            <div className="card">
              {scoreTab === 'amenities' && <AmenitiesScoreChart />}
              {scoreTab === 'accessibility' && <AccessibilityScoreChart />}
            </div>
          </section>

          {/* Best Investment */}
          <section className="mb-12">
            <div className="mb-4">
              <h2 className="section-title">Best Investment Opportunities</h2>
              <p className="text-[var(--text-secondary)] text-sm">
                Top 5 counties ranked by composite investment value score
              </p>
            </div>
            <div className="card">
              <BestInvestmentChart />
            </div>
          </section>
        </>
      ) : (
        <section>
          <HistoryTable />
        </section>
      )}
    </div>
  );
}