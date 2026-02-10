import { useAuth } from "../hooks/useAuth";
import { LoadingScreen } from "../components/LoadingScreen";
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
} from "./lazyPages";

// ============================================================================
// APPSHELL LAYOUT ROUTES
// ============================================================================

export function AppShellSpotDetailRoute(props: { params: Params }) {
  return (
    <AppShell>
      <SpotDetailPage params={props.params} />
    </AppShell>
  );
}

export function AppShellTrickmintRoute(_props: { params: Params }) {
  return (
    <AppShell>
      <TrickMintPage />
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
      <Tutorial userId={userId} />
    </AppShell>
  );
}

export function AppShellSkaterProfileRoute(_props: { params: Params }) {
  return (
    <AppShell>
      <SkaterProfilePage />
    </AppShell>
  );
}

export function AppShellPublicProfileRoute(_props: { params: Params }) {
  return (
    <AppShell>
      <PublicProfileView />
    </AppShell>
  );
}

// ============================================================================
// DASHBOARD LAYOUT ROUTES (New Consolidated Pages)
// ============================================================================

export function DashboardHubRoute() {
  return (
    <DashboardLayout>
      <HubPage />
    </DashboardLayout>
  );
}

export function DashboardPlayRoute() {
  return (
    <DashboardLayout>
      <PlayPage />
    </DashboardLayout>
  );
}

export function DashboardProfileRoute() {
  return (
    <DashboardLayout>
      <ProfilePage />
    </DashboardLayout>
  );
}

export function DashboardMapRoute() {
  return (
    <DashboardLayout>
      <MapPage />
    </DashboardLayout>
  );
}

export function DashboardLeaderboardRoute() {
  return (
    <DashboardLayout>
      <LeaderboardPage />
    </DashboardLayout>
  );
}

// ============================================================================
// ADMIN LAYOUT ROUTES (Role-gated)
// ============================================================================

export function AdminDashboardRoute() {
  return (
    <AdminLayout>
      <AdminDashboard />
    </AdminLayout>
  );
}

export function AdminReportsRoute() {
  return (
    <AdminLayout>
      <AdminReports />
    </AdminLayout>
  );
}

export function AdminUsersRoute() {
  return (
    <AdminLayout>
      <AdminUsers />
    </AdminLayout>
  );
}

export function AdminAuditLogRoute() {
  return (
    <AdminLayout>
      <AdminAuditLog />
    </AdminLayout>
  );
}
