import { Routes, Route } from 'react-router-dom';
import LayoutShell from './LayoutShell';
import Overview from '@/features/overview';
import Predictor from '@/features/predictor';
import MarketInsights from '@/features/market-insights';
import DealFinder from '@/features/deal-finder';
import ModelPerformance from '@/features/model-performance';
import Explainability from '@/features/explainability';
import DataExplorer from '@/features/data-explorer';
import About from '@/features/about';
import Settings from '@/features/settings';
import MorePage from '@/features/more';
import NotFound from '@/features/not-found';
import ComponentPreview from '@/features/component-preview';

export default function App() {
  return (
    <Routes>
      <Route element={<LayoutShell />}>
        <Route path="/" element={<Overview />} />
        <Route path="/predictor" element={<Predictor />} />
        <Route path="/market-insights" element={<MarketInsights />} />
        <Route path="/deal-finder" element={<DealFinder />} />
        <Route path="/model-performance" element={<ModelPerformance />} />
        <Route path="/explainability" element={<Explainability />} />
        <Route path="/data-explorer" element={<DataExplorer />} />
        <Route path="/about" element={<About />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/more" element={<MorePage />} />
        {/* Dev-only: component preview route — not in the main nav */}
        <Route path="/dev/components" element={<ComponentPreview />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
