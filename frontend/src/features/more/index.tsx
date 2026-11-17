import { Link } from 'react-router-dom';

interface MoreLink {
  label: string;
  icon: string;
  path: string;
  description: string;
}

const MORE_LINKS: MoreLink[] = [
  {
    label: 'Model Performance',
    icon: 'speed',
    path: '/model-performance',
    description: 'Model accuracy, drift, and validation metrics',
  },
  {
    label: 'Explainability',
    icon: 'lightbulb',
    path: '/explainability',
    description: 'Feature attribution and prediction reasoning',
  },
  {
    label: 'Data Explorer',
    icon: 'table_chart',
    path: '/data-explorer',
    description: 'Browse and filter the underlying valuation dataset',
  },
  {
    label: 'About',
    icon: 'info',
    path: '/about',
    description: 'Project background and methodology',
  },
  {
    label: 'Settings',
    icon: 'settings',
    path: '/settings',
    description: 'Preferences, region, and account',
  },
];

export default function MorePage() {
  return (
    <div className="p-margin">
      <h1 className="font-outfit text-headline-page-mobile md:text-headline-page text-on-surface">
        More
      </h1>
      <p className="mt-2 text-body-regular text-on-surface-variant">
        Additional screens and tools.
      </p>

      <ul className="mt-6 flex flex-col gap-2">
        {MORE_LINKS.map((item) => (
          <li key={item.path}>
            <Link
              to={item.path}
              className="flex items-center gap-4 p-4 rounded-DEFAULT bg-surface-container-low hover:bg-surface-container-high text-on-surface transition-colors shadow-level-1"
            >
              <span className="w-10 h-10 rounded-full flex items-center justify-center bg-surface-container-highest text-primary flex-shrink-0">
                <span className="material-symbols-outlined">{item.icon}</span>
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-title-card text-on-surface truncate">
                  {item.label}
                </span>
                <span className="text-body-regular text-on-surface-variant truncate">
                  {item.description}
                </span>
              </span>
              <span
                className="material-symbols-outlined text-on-surface-variant ml-auto flex-shrink-0"
                aria-hidden="true"
              >
                chevron_right
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
