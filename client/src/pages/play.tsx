import { Construction } from "lucide-react";

export default function PlayPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center max-w-md mx-auto px-4">
        <Construction className="w-16 h-16 text-yellow-400 mx-auto mb-6" />
        <h1 className="text-2xl font-bold text-white mb-3">S.K.A.T.E. Coming Soon</h1>
        <p className="text-neutral-400 text-sm leading-relaxed">
          Async 1v1 S.K.A.T.E. battles are being rebuilt from the ground up. Challenge opponents,
          trade video tricks over 24-hour windows, and settle disputes — all without needing to be
          online at the same time.
        </p>
        <p className="text-neutral-500 text-xs mt-4">Check back soon.</p>
      </div>
    </div>
  );
}
