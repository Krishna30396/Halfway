import { notFound } from 'next/navigation';
import MeetupsPreview from './MeetupsPreview';

// Local preview of the Meetups page with sample friends; never served in production.
export default function MeetupsPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <MeetupsPreview />;
}
