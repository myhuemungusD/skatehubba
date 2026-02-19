import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, AtSign } from "lucide-react";
import { useLocation } from "wouter";
import { useEmailVerification } from "../../hooks/useEmailVerification";
import { useToast } from "../../hooks/use-toast";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Progress } from "../../components/ui/progress";
import { formSchema, type FormValues } from "./schemas/profileSchemas";
import { useUsernameCheck } from "./hooks/useUsernameCheck";
import { useProfileSubmit } from "./hooks/useProfileSubmit";

export default function ProfileSetup() {
  const { requiresVerification, resendVerificationEmail, isResending, canResend, userEmail } =
    useEmailVerification();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      username: "",
      stance: undefined,
    },
  });

  const username = watch("username");

  const {
    usernameStatus,
    setUsernameStatus,
    usernameMessage,
    setUsernameMessage,
    availabilityBadge,
    checkUsernameAvailability,
  } = useUsernameCheck(username);

  const { submitting, uploadProgress, submitError, onSubmit, handleSkip } = useProfileSubmit(
    usernameStatus,
    setUsernameStatus,
    setUsernameMessage,
    checkUsernameAvailability
  );

  const submitDisabled = Boolean(
    submitting ||
    (username &&
      (usernameStatus === "taken" || usernameStatus === "invalid" || usernameStatus === "checking"))
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur md:p-10">
        <header className="space-y-3 text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-yellow-500/80">Onboarding</p>
          <h1 className="text-3xl font-bold text-white md:text-4xl">
            Build your SkateHubba profile
          </h1>
          <p className="text-sm text-neutral-300">
            Lock in a unique handle and show the crew how you skate. This only happens once.
          </p>
        </header>

        {requiresVerification && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3">
            <Mail className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-300">Email verification (optional)</p>
              <p className="text-xs text-neutral-400 mt-1">
                We sent a verification link to <span className="text-neutral-200">{userEmail}</span>
                . Some features require a verified email, but you can set up your profile now and
                verify later.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    resendVerificationEmail()
                      .then(() => {
                        toast({
                          title: "Verification email sent!",
                          description: "Check your inbox and spam folder.",
                        });
                      })
                      .catch((err: Error) => {
                        toast({
                          title: "Could not send email",
                          description: err.message,
                          variant: "destructive",
                        });
                      });
                  }}
                  disabled={isResending || !canResend}
                  className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 disabled:opacity-50 disabled:no-underline"
                >
                  {isResending ? "Sending..." : "Resend verification email"}
                </button>
                <a
                  href="/verify"
                  onClick={(e) => {
                    e.preventDefault();
                    setLocation("/verify");
                  }}
                  className="text-xs text-neutral-400 hover:text-neutral-200 underline underline-offset-2"
                >
                  Go to verification page
                </a>
              </div>
            </div>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          {userEmail && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-neutral-200">
                Email
              </label>
              <div className="relative">
                <AtSign className="absolute left-3 top-3.5 h-4 w-4 text-neutral-500" />
                <div className="flex h-12 w-full items-center rounded-lg bg-neutral-900/40 border border-neutral-700/50 pl-10 text-sm text-neutral-400">
                  {userEmail}
                </div>
              </div>
              <p className="text-xs text-neutral-500">
                This is the email from your account. You can&apos;t change it here.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-semibold text-neutral-200" htmlFor="username">
              Username
            </label>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <Input
                id="username"
                data-testid="profile-username"
                placeholder="skatelegend"
                className="h-12 bg-neutral-900/60 border-neutral-700 text-white"
                {...register("username", {
                  onChange: (event) => {
                    const next = String(event.target.value || "").toLowerCase();
                    setValue("username", next, { shouldValidate: true });
                  },
                })}
              />
              <div className="min-w-[140px]">{availabilityBadge}</div>
            </div>
            <p className="text-xs text-neutral-400">{usernameMessage}</p>
            {errors.username && <p className="text-xs text-red-400">{errors.username.message}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-neutral-200" htmlFor="stance">
              Stance
            </label>
            <select
              id="stance"
              className="h-12 w-full rounded-lg bg-neutral-900/60 border border-neutral-700 text-white px-3"
              {...register("stance")}
            >
              <option value="">Select stance</option>
              <option value="regular">Regular</option>
              <option value="goofy">Goofy</option>
            </select>
          </div>

          {submitting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span>Uploading profile</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2 bg-neutral-800" />
            </div>
          )}

          {submitError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {submitError}
            </div>
          )}

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Button
              type="submit"
              className="h-12 w-full bg-yellow-500 text-black hover:bg-yellow-400 md:w-auto"
              disabled={submitDisabled}
              data-testid="profile-submit"
            >
              {submitting ? "Creating profile..." : "Create profile"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="h-12 w-full text-neutral-300 hover:bg-white/5 md:w-auto"
              onClick={handleSkip}
              disabled={submitting}
              data-testid="profile-skip"
            >
              Skip for now
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
