/**
 * HowToPlay - Collapsible guide explaining Remote S.K.A.T.E. rules and flow
 */

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Swords,
  Shield,
  Upload,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function HowToPlay() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-neutral-800/50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-neutral-300">
          <HelpCircle className="h-4 w-4 text-yellow-400" />
          How to Play
        </span>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-neutral-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-neutral-500" />
        )}
      </button>

      <div
        className={cn(
          "grid transition-all duration-200 ease-in-out",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 space-y-4 text-sm">
            {/* What is it */}
            <div className="space-y-1">
              <h4 className="font-semibold text-white">What is Remote S.K.A.T.E.?</h4>
              <p className="text-neutral-400 leading-relaxed">
                A classic game of S.K.A.T.E. played remotely with video clips. Take turns setting
                tricks and matching them. Miss a trick and you earn a letter. First to spell
                S-K-A-T-E loses!
              </p>
            </div>

            {/* Steps */}
            <div className="space-y-3">
              <h4 className="font-semibold text-white">How a Round Works</h4>

              <div className="space-y-2.5">
                <Step
                  number={1}
                  icon={<Swords className="h-3.5 w-3.5 text-purple-400" />}
                  title="Offense sets a trick"
                  description="Record yourself landing a trick and upload the video. This is the trick your opponent must match."
                />
                <Step
                  number={2}
                  icon={<Shield className="h-3.5 w-3.5 text-blue-400" />}
                  title="Defense replies"
                  description="Watch the set trick, then record your attempt and upload it."
                />
                <Step
                  number={3}
                  icon={<Upload className="h-3.5 w-3.5 text-yellow-400" />}
                  title="Offense calls it"
                  description="After watching the reply, the offense decides: did the defense land it or miss it?"
                />
                <Step
                  number={4}
                  icon={<CheckCircle2 className="h-3.5 w-3.5 text-green-400" />}
                  title="Defense confirms"
                  description="The defense can agree with the call or dispute it. If both agree, the round is resolved."
                />
              </div>
            </div>

            {/* What happens */}
            <div className="space-y-2">
              <h4 className="font-semibold text-white">Scoring</h4>
              <ul className="space-y-1.5 text-neutral-400">
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">&#8226;</span>
                  <span>
                    <strong className="text-neutral-300">Landed:</strong> Roles swap — the defense
                    becomes offense for the next round.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5">&#8226;</span>
                  <span>
                    <strong className="text-neutral-300">Missed:</strong> Defense gets a letter (S,
                    then K, then A...). Offense stays on offense.
                  </span>
                </li>
              </ul>
            </div>

            {/* Disputes */}
            <div className="flex items-start gap-2 rounded-md bg-orange-400/5 border border-orange-400/20 p-3">
              <AlertTriangle className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" />
              <p className="text-neutral-400 leading-relaxed">
                <strong className="text-orange-300">Disputes:</strong> If you disagree with the
                offense's call, you can dispute it. Disputed rounds are sent to admins for review.
              </p>
            </div>

            {/* Tips */}
            <div className="space-y-1">
              <h4 className="font-semibold text-white">Quick Tips</h4>
              <ul className="space-y-1 text-neutral-400">
                <li className="flex items-start gap-2">
                  <span className="text-yellow-400 mt-0.5">&#8226;</span>
                  <span>Videos must be under 60 seconds and 100MB</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-400 mt-0.5">&#8226;</span>
                  <span>Supported formats: MP4, MOV, WebM</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-400 mt-0.5">&#8226;</span>
                  <span>Film clearly so your opponent can see the trick</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({
  number,
  icon,
  title,
  description,
}: {
  number: number;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-neutral-800 border border-neutral-700 text-xs font-bold text-neutral-400 shrink-0 mt-0.5">
        {number}
      </div>
      <div className="space-y-0.5">
        <p className="flex items-center gap-1.5 font-medium text-neutral-200">
          {icon}
          {title}
        </p>
        <p className="text-neutral-400 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
