import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui';

export default function NotFound() {
  return (
    <EmptyState icon="🧭" title="Page not found" action={<Link to="/" className="btn">Back to home</Link>}>
      The page you're looking for doesn't exist – maybe it was moved, like a jeep route on Session Road.
    </EmptyState>
  );
}
