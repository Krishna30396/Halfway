import { notFound } from 'next/navigation';
import ProfilePreview from './ProfilePreview';

// Local preview of the Profile page with sample data; never served in production.
export default function ProfilePreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <ProfilePreview />;
}
