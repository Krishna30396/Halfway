import { notFound } from 'next/navigation';
import FriendsPreview from './FriendsPreview';

// Local preview of the Friends panel with sample data; never served in production.
export default function FriendsPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <FriendsPreview />;
}
