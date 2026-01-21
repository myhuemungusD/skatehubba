import { useAuth } from "../context/AuthProvider";
import { Redirect } from "wouter";

function isE2EBypass(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.hostname !== "localhost") return false;
  return window.sessionStorage.getItem("e2eAuthBypass") === "true";
}

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireEmailVerification?: boolean;
}

export default function ProtectedRoute({
  children,
  requireEmailVerification = false,
}: ProtectedRouteProps) {
  const authContext = useAuth();
  const user = authContext?.user ?? null;
  const isLoading = authContext?.loading ?? true;
  const bypass = isE2EBypass();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#181818] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user && !bypass) return <Redirect to="/login" />;

  if (!bypass && requireEmailVerification && user && !user.emailVerified) {
    return <Redirect to="/verify" />;
  }

  return <>{children}</>;
}
