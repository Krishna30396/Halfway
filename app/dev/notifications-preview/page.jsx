import { notFound } from 'next/navigation';
import NotificationsPreview from './NotificationsPreview';

// Local preview of every push alert as the recipient sees it; never served in production.
export default function NotificationsPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <NotificationsPreview />;
}
