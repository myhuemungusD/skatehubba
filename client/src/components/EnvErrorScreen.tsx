interface EnvErrorScreenProps {
  missingKeys: string[];
  error?: unknown;
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

export default function EnvErrorScreen({ missingKeys, error }: EnvErrorScreenProps) {
  const hasMissing = missingKeys.length > 0;
  const hasError = Boolean(error);

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-6">
      <div className="max-w-xl w-full space-y-6 text-center">
        <div className="text-3xl font-bold tracking-tight">Configuration Required</div>
        <p className="text-neutral-300">
          We could not start the app because required environment variables are missing. Add them to
          your deployment and rebuild.
        </p>

        {hasMissing && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-left">
            <div className="text-sm font-semibold text-orange-400 mb-2">Missing variables</div>
            <ul className="list-disc list-inside space-y-1 text-sm text-neutral-200">
              {missingKeys.map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ul>
          </div>
        )}

        {hasError && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-left">
            <div className="text-sm font-semibold text-orange-400 mb-2">Error details</div>
            <p className="text-sm text-neutral-200 whitespace-pre-wrap break-words">
              {formatError(error)}
            </p>
          </div>
        )}

        <div className="text-sm text-neutral-400">
          Web builds should set <span className="font-semibold">VITE_*</span> variables. Mobile
          builds should set <span className="font-semibold">EXPO_PUBLIC_*</span> variables. Server
          builds should read from <span className="font-semibold">process.env</span>.
        </div>
      </div>
    </div>
  );
}
