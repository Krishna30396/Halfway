import { notFound } from 'next/navigation';
import NavSim from './NavSim';

// Local test harness for the navigation view; never served in production.
export default function NavSimPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <NavSim />;
}
