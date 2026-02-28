import { useAuth } from "../hooks/useAuth";
import { LoadingScreen } from "../components/LoadingScreen";
import RouteErrorBoundary from "../components/RouteErrorBoundary";
import AppShell from "../components/layout/AppShell";
import DashboardLayout from "../components/layout/DashboardLayout";
import type { Params } from "../lib/protected-route";

import {
  HubPage,
  PlayPage,
  ProfilePage,
  MapPage,
  LeaderboardPage,
  SpotDetailPage,
  TrickMintPage,
  Tutorial,
  SkaterProfilePage,
  PublicProfileView,
  AdminLayout,
  AdminDashboard,
  AdminReports,
  AdminUsers,
  AdminAuditLog,
  AdminMetrics,
} from "./lazyPages";

// ============================================================================
// APPSHELL LAYOUT ROUTES
// ============================================================================

export function AppShellSpotDetailRoute(props: { params: Params }) {
  return (
    <AppShell>
      <RouteErrorBoundary fallbackMessage="Failed to load spot details.">
        <SpotDetailPage params={props.params} />
      </RouteErrorBoundary>
    </AppShell>
  );
}

export function AppShellTrickmintRoute(_props: { params: Params }) {
  return (
    <AppShell>
      <RouteErrorBoundary fallbackMessage="Failed to load TrickMint.">
        <TrickMintPage />
      </RouteErrorBoundary>
    </AppShell>
  );
}

export function AppShellTutorialRoute(_props: { params: Params }) {
  const { user, loading, isInitialized } = useAuth();
  if (loading || !isInitialized || !user) {
    return <LoadingScreen />;
  }
  const userId = user.uid;
  return (
    <AppShell>
      <RouteErrorBoundary fallbackMessage="Failed to load tutorial.">
        <Tutorial userId={userId} />
      </RouteErrorBoundary>
    </AppShell>
  );
}

export function AppShellSkaterProfileRoute(_props: { params: Params }) {
  return (
    <AppShell>
      <RouteErrorBoundary fallbackMessage="Failed to load skater profile.">
        <SkaterProfilePage />
      </RouteErrorBoundary>
    </AppShell>
  );
}

export function AppShellPublicProfileRoute(_props: { params: Params }) {
  return (
    <AppShell>
      <RouteErrorBoundary fallbackMessage="Failed to load profile.">
        <PublicProfileView />
      </RouteErrorBoundary>
    </AppShell>
  );
}

// ============================================================================
// DASHBOARD LAYOUT ROUTES (New Consolidated Pages)
// ============================================================================

export function DashboardHubRoute() {
  return (
    <DashboardLayout>
      <RouteErrorBoundary fallbackMessage="Failed to load the hub.">
        <HubPage />
      </RouteErrorBoundary>
    </DashboardLayout>
  );
}

export function DashboardPlayRoute() {
  return (
    <DashboardLayout>
      <RouteErrorBoundary fallbackMessage="Failed to load the play area.">
        <PlayPage />
      </RouteErrorBoundary>
    </DashboardLayout>
  );
}

export function DashboardProfileRoute() {
  return (
    <DashboardLayout>
      <RouteErrorBoundary fallbackMessage="Failed to load your profile.">
        <ProfilePage />
      </RouteErrorBoundary>
    </DashboardLayout>
  );
}

export function DashboardMapRoute() {
  return (
    <DashboardLayout>
      <RouteErrorBoundary fallbackMessage="Failed to load the map.">
        <MapPage />
      </RouteErrorBoundary>
    </DashboardLayout>
  );
}

export function DashboardLeaderboardRoute() {
  return (
    <DashboardLayout>
      <RouteErrorBoundary fallbackMessage="Failed to load the leaderboard.">
        <LeaderboardPage />
      </RouteErrorBoundary>
    </DashboardLayout>
  );
}

// ============================================================================
// ADMIN LAYOUT ROUTES (Role-gated)
// ============================================================================

export function AdminDashboardRoute() {
  return (
    <AdminLayout>
      <RouteErrorBoundary fallbackMessage="Failed to load admin dashboard.">
        <AdminDashboard />
      </RouteErrorBoundary>
    </AdminLayout>
  );
}

export function AdminReportsRoute() {
  return (
    <AdminLayout>
      <RouteErrorBoundary fallbackMessage="Failed to load reports.">
        <AdminReports />
      </RouteErrorBoundary>
    </AdminLayout>
  );
}

export function AdminUsersRoute() {
  return (
    <AdminLayout>
      <RouteErrorBoundary fallbackMessage="Failed to load users.">
        <AdminUsers />
      </RouteErrorBoundary>
    </AdminLayout>
  );
}

export function AdminAuditLogRoute() {
  return (
    <AdminLayout>
      <RouteErrorBoundary fallbackMessage="Failed to load audit log.">
        <AdminAuditLog />
      </RouteErrorBoundary>
    </AdminLayout>
  );
}

export function AdminMetricsRoute() {
  return (
    <AdminLayout>
      <RouteErrorBoundary fallbackMessage="Failed to load metrics.">
        <AdminMetrics />
      </RouteErrorBoundary>
    </AdminLayout>
  );
}
