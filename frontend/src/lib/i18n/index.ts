/**
 * i18n setup — English + Kiswahili locale files.
 *
 * Terms deliberately left in English (technical terms that would be awkward
 * or confusing if translated to Kiswahili):
 * - "Ensemble model" — no clean Kiswahili equivalent for "ensemble" in ML context
 * - "SHAP" — proper noun (SHapley Additive exPlanations), never translated
 * - "Conformal" — statistical term, no Kiswahili equivalent
 * - "XGBoost" / "CatBoost" / "TabNet" — proper nouns (library names)
 * - "KSh" — currency symbol, always rendered as-is
 * - "Log scale" — "kipimo cha logi" would be confusing; left as "Log scale"
 * - "API" — universal technical term
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      // ---- Nav ----
      'nav.overview': 'Overview',
      'nav.predictor': 'Price Predictor',
      'nav.marketInsights': 'Market Insights',
      'nav.dealFinder': 'Deal Finder',
      'nav.modelPerformance': 'Model Performance',
      'nav.explainability': 'Explainability',
      'nav.dataExplorer': 'Data Explorer',
      'nav.about': 'About',
      'nav.settings': 'Settings',
      'nav.more': 'More',

      // ---- Overview ----
      'overview.title': 'Overview',
      'overview.subtitle': 'Ensemble Valuation Engine',
      'overview.filterCounty': 'Filter County',
      'overview.filterPropertyType': 'Filter Property type',
      'overview.estimatePrice': 'Estimate a price',
      'overview.totalSample': 'Total sample',
      'overview.coverage': 'Coverage',
      'overview.nationalMedian': 'National median',
      'overview.reliability': 'Reliability',
      'overview.lastUpdated': 'Last updated',
      'overview.priceByDistance': 'Price by distance from Nairobi',
      'overview.logScale': 'log scale',
      'overview.dealSignals': 'Deal signals',
      'overview.listingsByCounty': 'Listings by county',
      'overview.listingsAnalysed': 'listings analysed',

      // ---- Predictor ----
      'predictor.step1': 'Where is the land?',
      'predictor.step2': 'About the land',
      'predictor.searchLocation': 'Search location...',
      'predictor.parcelSize': 'Parcel size (acres)',
      'predictor.propertyType': 'Property type',
      'predictor.parcelChecklist': 'Infrastructure checklist',
      'predictor.estimate': 'Estimate price',
      'predictor.reliable': 'Reliable estimate',
      'predictor.limitedData': 'Limited data',
      'predictor.unsupported': 'Sample Threshold Unmet',
      'predictor.whatDrivesPrice': 'What drives this price',
      'predictor.nearbyInfrastructure': 'Nearby & Infrastructure',
      'predictor.similarListings': 'Similar listings',
      'predictor.tooManyRequests': 'Too many requests. Please wait before trying again.',

      // ---- Market Insights ----
      'market.title': 'Market Insights',
      'market.choropleth': 'County price map',
      'market.highestLowest': 'Highest and lowest',
      'market.countyDeepDive': 'County deep dive',
      'market.seeInDealFinder': 'See listings in Deal Finder',

      // ---- Deal Finder ----
      'deals.title': 'Deal Finder',
      'deals.sortBy': 'Sorted by',
      'deals.bestValueFirst': 'Best Value first',
      'deals.export': 'Export',
      'deals.hideDataErrors': 'Hide possible data errors',
      'deals.nearAmenity': 'Near amenity',
      'deals.radius': 'Radius',

      // ---- Model Performance ----
      'model.title': 'Model Performance',
      'model.typicalError': 'Typical error',
      'model.varianceExplained': 'Variance explained',
      'model.avgError': 'Average error',
      'model.intervalCoverage': 'Interval coverage',
      'model.comparison': 'Model comparison',
      'model.actualVsPredicted': 'Actual vs. predicted',
      'model.doRangesHold': 'Do ranges hold?',
      'model.errorBySupport': 'Error by listings nearby',

      // ---- Explainability ----
      'explain.title': 'Explainability',
      'explain.allListings': 'All listings',
      'explain.oneEstimate': 'One estimate',
      'explain.whatMattersMost': 'What matters most overall',
      'explain.howMuchExplained': 'How much is explained',
      'explain.glossary': 'Glossary',

      // ---- Settings ----
      'settings.title': 'Settings',
      'settings.language': 'Language',
      'settings.currency': 'Currency',
      'settings.defaultCounty': 'Default county',
      'settings.about': 'About',
      'settings.helpSupport': 'Help & Support',
      'settings.english': 'English',
      'settings.kiswahili': 'Kiswahili',

      // ---- Common ----
      'common.loading': 'Loading...',
      'common.retry': 'Retry',
      'common.error': 'Something went wrong',
      'common.dataUnavailable': 'Data unavailable',
      'common.kshPerAcre': 'KSh/acre',
      'common.usdPerAcre': 'USD/acre',
      'common.underpriced': 'Underpriced',
      'common.fair': 'Fair',
      'common.overpriced': 'Overpriced',
      'common.county': 'County',
      'common.allCounties': 'All counties',
    },
  },
  sw: {
    translation: {
      // ---- Nav ----
      'nav.overview': 'Muhtasari',
      'nav.predictor': 'Kikokotoo cha Bei',
      'nav.marketInsights': 'Mambo ya Soko',
      'nav.dealFinder': 'Kitafuta Matumizi',
      'nav.modelPerformance': 'Utendaji wa Modeli',
      'nav.explainability': 'Ufafanuzi',
      'nav.dataExplorer': 'Kivinjari cha Takwimu',
      'nav.about': 'Kuhusu',
      'nav.settings': 'Mipangilio',
      'nav.more': 'Zaidi',

      // ---- Overview ----
      'overview.title': 'Muhtasari',
      'overview.subtitle': 'Injini ya Tathmini ya Pamoja',
      'overview.filterCounty': 'Chagua Kaunti',
      'overview.filterPropertyType': 'Chagua Aina ya Mali',
      'overview.estimatePrice': 'Tathmini bei',
      'overview.totalSample': 'Jumla ya sampuli',
      'overview.coverage': 'Ufunikaji',
      'overview.nationalMedian': 'Wastani wa taifa',
      'overview.reliability': 'Uaminifu',
      'overview.lastUpdated': 'Ilisasishwa mwisho',
      'overview.priceByDistance': 'Bei kulingana na umbali kutoka Nairobi',
      'overview.logScale': 'Log scale', // left in English — technical term
      'overview.dealSignals': 'Dalili za afadeni',
      'overview.listingsByCounty': 'Orodha kwa kaunti',
      'overview.listingsAnalysed': 'orodha zilizochambuliwa',

      // ---- Predictor ----
      'predictor.step1': 'Eneo la ardhi liko wapi?',
      'predictor.step2': 'Kuhusu ardhi',
      'predictor.searchLocation': 'Tafuta eneo...',
      'predictor.parcelSize': 'Ukubwa wa ardhi (eka)',
      'predictor.propertyType': 'Aina ya mali',
      'predictor.parcelChecklist': 'Orodha ya miundombinu',
      'predictor.estimate': 'Tathmini bei',
      'predictor.reliable': 'Tathmini ya kuaminika',
      'predictor.limitedData': 'Takwimu chache',
      'predictor.unsupported': 'Kizingiti cha Sampuri Hakijatimizwa',
      'predictor.whatDrivesPrice': 'Kinachosukuma bei hii',
      'predictor.nearbyInfrastructure': 'Karibu & Miundombinu',
      'predictor.similarListings': 'Orodha zinazofanana',
      'predictor.tooManyRequests': 'Maombi mengi sana. Tafadhali subiri kabla ya kujaribu tena.',

      // ---- Market Insights ----
      'market.title': 'Mambo ya Soko',
      'market.choropleth': 'Ramani ya bei kaunti',
      'market.highestLowest': 'Ya juu na ya chini',
      'market.countyDeepDive': 'Taarifa za kina za kaunti',
      'market.seeInDealFinder': 'Angalia orodha katika Kitafuta Matumizi',

      // ---- Deal Finder ----
      'deals.title': 'Kitafuta Matumizi',
      'deals.sortBy': 'Ainishwa kwa',
      'deals.bestValueFirst': 'Thamani Bora kwanza',
      'deals.export': 'Toa',
      'deals.hideDataErrors': 'Ficha makosa ya takwimu',
      'deals.nearAmenity': 'Karibu na huduma',
      'deals.radius': 'Mduara',

      // ---- Model Performance ----
      'model.title': 'Utendaji wa Modeli',
      'model.typicalError': 'Kosa la kawaida',
      'model.varianceExplained': 'Tofauti iliyoelezwa',
      'model.avgError': 'Kosa la wastani',
      'model.intervalCoverage': 'Ufunikaji wa kipimo',
      'model.comparison': 'Linganisha modeli',
      'model.actualVsPredicted': 'Halisi dhidi ya iliyotabiriwa',
      'model.doRangesHold': 'Viwango vinafanya kazi?',
      'model.errorBySupport': 'Kosa kwa orodha karibu',

      // ---- Explainability ----
      'explain.title': 'Ufafanuzi',
      'explain.allListings': 'Orodha zote',
      'explain.oneEstimate': 'Tathmini moja',
      'explain.whatMattersMost': 'Kinachofaa zaidi kwa ujumla',
      'explain.howMuchExplained': 'Kiasi kilichoelezwa',
      'explain.glossary': 'Kamusi',

      // ---- Settings ----
      'settings.title': 'Mipangilio',
      'settings.language': 'Lugha',
      'settings.currency': 'Sarafu',
      'settings.defaultCounty': 'Kaunti chaguayo',
      'settings.about': 'Kuhusu',
      'settings.helpSupport': 'Msaada & Usaidizi',
      'settings.english': 'Kiingereza',
      'settings.kiswahili': 'Kiswahili',

      // ---- Common ----
      'common.loading': 'Inapakia...',
      'common.retry': 'Jaribu tena',
      'common.error': 'Hitilafu fulani imetokea',
      'common.dataUnavailable': 'Takwimu hazipatikani',
      'common.kshPerAcre': 'KSh/eka',
      'common.usdPerAcre': 'USD/eka',
      'common.underpriced': 'Bei chini',
      'common.fair': 'Haki',
      'common.overpriced': 'Bei juu',
      'common.county': 'Kaunti',
      'common.allCounties': 'Kaunti zote',
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: localStorage.getItem('lang') || 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
