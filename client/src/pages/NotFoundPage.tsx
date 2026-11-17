import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '../components/ui/States';

export default function NotFoundPage() {
  return (
    <div className="rounded-xl border border-ink-200 bg-surface shadow-card">
      <EmptyState
        icon={<Compass className="h-5 w-5" />}
        title="Page not found"
        description="The page you're looking for doesn't exist or you don't have access to it."
        action={
          <Link to="/" className="text-sm font-medium text-brand-700 hover:underline">
            Back to dashboard
          </Link>
        }
      />
    </div>
  );
}
