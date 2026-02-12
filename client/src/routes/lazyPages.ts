import { lazy } from "react";

// Consolidated pages (new architecture)
export const HubPage = lazy(() => import("../pages/hub"));
export const PlayPage = lazy(() => import("../pages/play"));
export const ProfilePage = lazy(() => import("../pages/me"));
export const LeaderboardPage = lazy(() => import("../pages/leaderboard"));

// Standalone pages
export const Tutorial = lazy(() => import("../pages/tutorial"));
export const Demo = lazy(() => import("../pages/demo"));
export const MapPage = lazy(() => import("../pages/map"));
export const SpotDetailPage = lazy(() => import("../pages/spots/SpotDetailPage"));
export const TrickMintPage = lazy(() => import("../pages/trickmint"));

// Admin pages
export const AdminLayout = lazy(() => import("../pages/admin/AdminLayout"));
export const AdminDashboard = lazy(() => import("../pages/admin/AdminDashboard"));
export const AdminReports = lazy(() => import("../pages/admin/AdminReports"));
export const AdminUsers = lazy(() => import("../pages/admin/AdminUsers"));
export const AdminAuditLog = lazy(() => import("../pages/admin/AdminAuditLog"));
export const AdminMetrics = lazy(() => import("../pages/admin/AdminMetrics"));

// Auth pages
export const LoginPage = lazy(() => import("../pages/login"));
export const AuthPage = lazy(() => import("../pages/AuthPage"));
export const SignupPage = lazy(() => import("../pages/signup"));
export const SigninPage = lazy(() => import("../pages/signin"));
export const ForgotPasswordPage = lazy(() => import("../pages/forgot-password"));
export const ProfileSetup = lazy(() => import("../pages/profile/ProfileSetup"));
export const VerifyPage = lazy(() => import("../pages/verify"));
export const AuthVerifyPage = lazy(() => import("../pages/auth-verify"));
export const VerifyEmailPage = lazy(() => import("../pages/verify-email"));
export const VerifiedPage = lazy(() => import("../pages/verified"));
export const ResetPasswordPage = lazy(() => import("../pages/reset-password"));

// Public pages
export const SkaterProfilePage = lazy(() => import("../pages/skater/profile"));
export const PrivacyPage = lazy(() => import("../pages/privacy"));
export const TermsPage = lazy(() => import("../pages/terms"));
export const SpecsPage = lazy(() => import("../pages/specs"));
export const PublicProfileView = lazy(
  () => import("../features/social/public-profile/PublicProfileView")
);
