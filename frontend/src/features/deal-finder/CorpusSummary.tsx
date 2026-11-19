/**
 * CorpusSummary — the three-segment proportion bar + verdict tiles.
 *
 * Per 06_deal_finder/code.html: a card showing the total assessed corpus
 * with a horizontal three-segment bar (Underpriced / Fairly priced /
 * Overpriced) and three tiles below with count + percentage for each
 * verdict.
 *
 * Counts come from three parallel `useListingsScored` calls (one per
 * verdict, page_size=1) in the parent — these return the REAL
 * whole-corpus counts for the current filter set, not just the current
 * page.
 *
 * Design colors (per 06_deal_finder):
 *  - Underpriced: #2D6A4F (dark green), tile bg #E8F5E9/60
 *  - Fairly priced: #5C5752 (warm grey), tile bg #F0ECE9
 *  - Overpriced: #C84B31 (terracotta red), tile bg #FBEBE8
 *
 * Threshold labels in the design say "> 15% below/above estimate" — this
 * is INCONSISTENT with the backend's actual verdict logic (which uses the
 * 80% conformal interval bounds, not a fixed 15% threshold). The design's
 * own methodology note says "below the lower 80% bound", which IS correct.
 * We use the backend truth (conformal interval) and omit the misleading
 * "> 15%" text.
 */
import { useTranslation } from 'react-i18next';
import { ValuationCard } from '@/components';
import { useLocale } from '@/lib/i18n/useLocale';

interface CorpusSummaryProps {
  counts: { underpriced: number; fair: number; overpriced: number; total: number };
  county: string;
}

const COLORS = {
  underpriced: '#2D6A4F',
  fair: '#5C5752',
  overpriced: '#C84B31',
};

const TILE_BG = {
  underpriced: 'bg-[#E8F5E9]/60',
  fair: 'bg-[#F0ECE9]',
  overpriced: 'bg-[#FBEBE8]',
};

const TILE_TEXT = {
  underpriced: 'text-[#2D6A4F]',
  fair: 'text-[#3D3834]',
  overpriced: 'text-[#C84B31]',
};

const DOT_BG = {
  underpriced: 'bg-[#2D6A4F]',
  fair: 'bg-[#5C5752]',
  overpriced: 'bg-[#C84B31]',
};

export function CorpusSummary({ counts, county }: CorpusSummaryProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { underpriced, fair, overpriced, total } = counts;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  const uPct = pct(underpriced);
  const fPct = pct(fair);
  const oPct = pct(overpriced);

  const countyLabel = county && county !== 'all' ? ` · ${county}` : '';

  return (
    <ValuationCard noPadding>
      <div className="p-space-md">
        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="font-label-metric text-label-metric text-on-surface font-semibold">
              Total Assessed Corpus:
            </span>
            <span className="font-label-metric text-label-metric text-on-surface-variant">
              {t('deals.corpusAnalyzed', { n: total.toLocaleString(locale) })}{countyLabel}
            </span>
          </div>
        </div>

        {/* Three-segment proportion bar */}
        <div className="w-full h-3 rounded-full bg-surface-container flex overflow-hidden p-0.5 gap-0.5">
          {uPct > 0 && (
            <div
              className="h-full rounded-l-full transition-all hover:opacity-90"
              style={{ width: `${uPct}%`, backgroundColor: COLORS.underpriced }}
              title={`${underpriced} ${t('common.underpriced')} (${uPct.toFixed(1)}%)`}
            />
          )}
          {fPct > 0 && (
            <div
              className="h-full transition-all hover:opacity-90"
              style={{ width: `${fPct}%`, backgroundColor: COLORS.fair }}
              title={`${fair} ${t('common.fair')} (${fPct.toFixed(1)}%)`}
            />
          )}
          {oPct > 0 && (
            <div
              className="h-full rounded-r-full transition-all hover:opacity-90"
              style={{ width: `${oPct}%`, backgroundColor: COLORS.overpriced }}
              title={`${overpriced} ${t('common.overpriced')} (${oPct.toFixed(1)}%)`}
            />
          )}
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          {/* Underpriced tile */}
          <div className={`flex items-center justify-between p-2.5 rounded-DEFAULT ${TILE_BG.underpriced}`}>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${DOT_BG.underpriced}`} />
              <span className={`font-label-metric text-label-metric ${TILE_TEXT.underpriced} font-semibold`}>
                {t('common.underpriced')}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={`font-title-card text-title-card ${TILE_TEXT.underpriced} font-medium`}>
                {underpriced.toLocaleString(locale)}
              </span>
              <span className={`font-caption-sm text-caption-sm ${TILE_TEXT.underpriced} opacity-80`}>
                {uPct.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Fairly priced tile */}
          <div className={`flex items-center justify-between p-2.5 rounded-DEFAULT ${TILE_BG.fair}`}>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${DOT_BG.fair}`} />
              <span className={`font-label-metric text-label-metric ${TILE_TEXT.fair} font-semibold`}>
                {t('common.fair')}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={`font-title-card text-title-card ${TILE_TEXT.fair} font-medium`}>
                {fair.toLocaleString(locale)}
              </span>
              <span className={`font-caption-sm text-caption-sm opacity-80`} style={{ color: COLORS.fair }}>
                {fPct.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Overpriced tile */}
          <div className={`flex items-center justify-between p-2.5 rounded-DEFAULT ${TILE_BG.overpriced}`}>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${DOT_BG.overpriced}`} />
              <span className={`font-label-metric text-label-metric ${TILE_TEXT.overpriced} font-semibold`}>
                {t('common.overpriced')}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={`font-title-card text-title-card ${TILE_TEXT.overpriced} font-medium`}>
                {overpriced.toLocaleString(locale)}
              </span>
              <span className={`font-caption-sm text-caption-sm ${TILE_TEXT.overpriced} opacity-80`}>
                {oPct.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </ValuationCard>
  );
}
