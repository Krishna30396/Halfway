import { notFound } from 'next/navigation';
import MapStyles from './MapStyles';

// Local gallery of candidate map styles; never served in production.
export default function MapStylesPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <MapStyles />;
}
