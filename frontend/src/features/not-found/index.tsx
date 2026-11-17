import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="p-margin min-h-[60vh] flex flex-col items-center justify-center text-center">
      <span className="material-symbols-outlined text-primary text-[64px]" aria-hidden="true">
        explore_off
      </span>
      <h1 className="mt-4 font-outfit text-headline-page-mobile md:text-headline-page text-on-surface">
        404 — Page Not Found
      </h1>
      <p className="mt-2 text-body-regular text-on-surface-variant">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-2 px-6 py-2 rounded-full bg-primary text-on-primary text-body-medium hover:opacity-90 transition-opacity"
      >
        <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        Back to Overview
      </Link>
    </div>
  );
}
