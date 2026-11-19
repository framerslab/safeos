/**
 * Dashboard page
 *
 * The app's hub. A device whose setup is not done sees the same page with
 * Start setup as its one key, so this address never forwards to setup.
 *
 * @module app/dashboard/page
 */

import { Dashboard } from '@/components/dashboard/Dashboard';

export default function DashboardPage() {
  return <Dashboard />;
}
