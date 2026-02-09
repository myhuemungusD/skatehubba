/**
 * Transactional Email Service
 *
 * Sends transactional emails (welcome, payment receipt, weekly digest)
 * via Resend. All emails use the SkateHubba brand styling.
 */

import { Resend } from "resend";
import { env } from "../config/env";
import logger from "../logger";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

const FROM_ADDRESS = "SkateHubba <hello@skatehubba.com>";

const getBaseUrl = (): string => {
  if (env.NODE_ENV === "production") {
    return env.PRODUCTION_URL || "https://skatehubba.com";
  }
  return "http://localhost:5000";
};

// ============================================================================
// Shared email wrapper
// ============================================================================

function wrapEmail(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #181818; color: #fafafa;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #f97316; font-size: 32px; margin: 0;">SkateHubba</h1>
      <p style="color: #fafafa; margin: 10px 0 0 0;">Own your tricks. Play SKATE anywhere.</p>
    </div>
    <div style="background-color: #232323; border-radius: 8px; padding: 30px; border: 1px solid #333;">
      ${content}
    </div>
    <div style="text-align: center; margin-top: 30px; color: #666; font-size: 12px;">
      <p>SkateHubba &mdash; <a href="${getBaseUrl()}" style="color: #f97316;">skatehubba.com</a></p>
      <p style="margin-top: 8px;">
        <a href="${getBaseUrl()}/settings" style="color: #888; text-decoration: underline;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    logger.debug(`[Email] Would send to ${to}: ${subject}`);
    return { success: true };
  }

  try {
    await resend.emails.send({ from: FROM_ADDRESS, to, subject, html });
    logger.info("[Email] Sent", { to, subject });
    return { success: true };
  } catch (error) {
    logger.error("[Email] Failed to send", { to, subject, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Welcome email — sent after email verification
// ============================================================================

export async function sendWelcomeEmail(
  to: string,
  name: string
): Promise<{ success: boolean; error?: string }> {
  const html = wrapEmail(`
    <h2 style="color: #fafafa; margin-top: 0;">Welcome to SkateHubba, ${name}!</h2>
    <p style="color: #fafafa; line-height: 1.6;">
      You're in. Your account is verified and ready to go.
    </p>
    <p style="color: #fafafa; line-height: 1.6;">
      Here's what you can do now:
    </p>
    <ul style="color: #fafafa; line-height: 2; padding-left: 20px;">
      <li>Discover and check in to skate spots near you</li>
      <li>Challenge other skaters to async S.K.A.T.E. games</li>
      <li>Track your trick progression and stats</li>
      <li>Climb the leaderboard</li>
    </ul>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${getBaseUrl()}/hub"
         style="background-color: #f97316; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Open SkateHubba
      </a>
    </div>
    <p style="color: #888; font-size: 14px;">
      If you need help, reply to this email or visit our support page.
    </p>
  `);

  return sendEmail(to, "Welcome to SkateHubba", html);
}

// ============================================================================
// Payment receipt email — sent after Premium purchase
// ============================================================================

export async function sendPaymentReceiptEmail(
  to: string,
  name: string,
  details: {
    amount: string;
    tier: string;
    date: string;
    transactionId?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const html = wrapEmail(`
    <h2 style="color: #fafafa; margin-top: 0;">Payment Confirmation</h2>
    <p style="color: #fafafa; line-height: 1.6;">
      Thanks, ${name}. Your payment has been processed.
    </p>
    <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
      <tr>
        <td style="color: #888; padding: 8px 0; border-bottom: 1px solid #333;">Plan</td>
        <td style="color: #fafafa; padding: 8px 0; border-bottom: 1px solid #333; text-align: right; font-weight: bold;">${details.tier}</td>
      </tr>
      <tr>
        <td style="color: #888; padding: 8px 0; border-bottom: 1px solid #333;">Amount</td>
        <td style="color: #fafafa; padding: 8px 0; border-bottom: 1px solid #333; text-align: right; font-weight: bold;">${details.amount}</td>
      </tr>
      <tr>
        <td style="color: #888; padding: 8px 0; border-bottom: 1px solid #333;">Date</td>
        <td style="color: #fafafa; padding: 8px 0; border-bottom: 1px solid #333; text-align: right;">${details.date}</td>
      </tr>
      ${details.transactionId ? `
      <tr>
        <td style="color: #888; padding: 8px 0;">Transaction ID</td>
        <td style="color: #fafafa; padding: 8px 0; text-align: right; font-family: monospace; font-size: 12px;">${details.transactionId}</td>
      </tr>
      ` : ""}
    </table>
    <p style="color: #fafafa; line-height: 1.6;">
      You now have full access to all ${details.tier} features. Game on.
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${getBaseUrl()}/hub"
         style="background-color: #f97316; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Start Playing
      </a>
    </div>
  `);

  return sendEmail(to, "SkateHubba Payment Receipt", html);
}

// ============================================================================
// Weekly activity digest email
// ============================================================================

export async function sendWeeklyDigestEmail(
  to: string,
  name: string,
  stats: {
    gamesPlayed: number;
    gamesWon: number;
    spotsVisited: number;
    pendingChallenges: number;
  }
): Promise<{ success: boolean; error?: string }> {
  const hasActivity =
    stats.gamesPlayed > 0 || stats.spotsVisited > 0 || stats.pendingChallenges > 0;

  const activitySection = hasActivity
    ? `
    <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
      <tr>
        <td style="color: #888; padding: 8px 0; border-bottom: 1px solid #333;">Games Played</td>
        <td style="color: #fafafa; padding: 8px 0; border-bottom: 1px solid #333; text-align: right; font-weight: bold;">${stats.gamesPlayed}</td>
      </tr>
      <tr>
        <td style="color: #888; padding: 8px 0; border-bottom: 1px solid #333;">Games Won</td>
        <td style="color: #fafafa; padding: 8px 0; border-bottom: 1px solid #333; text-align: right; font-weight: bold;">${stats.gamesWon}</td>
      </tr>
      <tr>
        <td style="color: #888; padding: 8px 0; border-bottom: 1px solid #333;">Spots Visited</td>
        <td style="color: #fafafa; padding: 8px 0; border-bottom: 1px solid #333; text-align: right; font-weight: bold;">${stats.spotsVisited}</td>
      </tr>
      ${stats.pendingChallenges > 0 ? `
      <tr>
        <td style="color: #f97316; padding: 8px 0; font-weight: bold;">Pending Challenges</td>
        <td style="color: #f97316; padding: 8px 0; text-align: right; font-weight: bold;">${stats.pendingChallenges}</td>
      </tr>
      ` : ""}
    </table>
    `
    : `
    <p style="color: #888; line-height: 1.6;">
      No activity this week. Get out there and skate.
    </p>
    `;

  const ctaText = stats.pendingChallenges > 0
    ? "Answer Challenges"
    : "Find a Game";

  const html = wrapEmail(`
    <h2 style="color: #fafafa; margin-top: 0;">Your Week on SkateHubba</h2>
    <p style="color: #fafafa; line-height: 1.6;">
      Hey ${name}, here's your weekly recap.
    </p>
    ${activitySection}
    <div style="text-align: center; margin: 30px 0;">
      <a href="${getBaseUrl()}/hub"
         style="background-color: #f97316; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        ${ctaText}
      </a>
    </div>
  `);

  return sendEmail(to, `SkateHubba Weekly Recap - ${name}`, html);
}

// ============================================================================
// Game event email notifications
// ============================================================================

export async function sendGameEventEmail(
  to: string,
  name: string,
  event: {
    type: "challenge_received" | "your_turn" | "game_over";
    opponentName?: string;
    gameId: string;
    won?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  let subject: string;
  let content: string;

  const gameUrl = `${getBaseUrl()}/play?game=${event.gameId}`;

  switch (event.type) {
    case "challenge_received":
      subject = `${event.opponentName || "Someone"} challenged you to S.K.A.T.E.`;
      content = `
        <h2 style="color: #fafafa; margin-top: 0;">New Challenge</h2>
        <p style="color: #fafafa; line-height: 1.6;">
          ${event.opponentName || "A skater"} challenged you to a game of S.K.A.T.E.
        </p>
        <p style="color: #888; line-height: 1.6;">
          Accept or decline from the app.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${gameUrl}"
             style="background-color: #f97316; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            View Challenge
          </a>
        </div>
      `;
      break;

    case "your_turn":
      subject = "Your turn in S.K.A.T.E.";
      content = `
        <h2 style="color: #fafafa; margin-top: 0;">Your Turn</h2>
        <p style="color: #fafafa; line-height: 1.6;">
          ${event.opponentName || "Your opponent"} is waiting. It's your move.
        </p>
        <p style="color: #888; line-height: 1.6;">
          You have 24 hours to respond before the game is forfeited.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${gameUrl}"
             style="background-color: #f97316; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Take Your Turn
          </a>
        </div>
      `;
      break;

    case "game_over":
      subject = event.won ? "You won your S.K.A.T.E. game" : "S.K.A.T.E. game over";
      content = `
        <h2 style="color: #fafafa; margin-top: 0;">${event.won ? "You Won" : "Game Over"}</h2>
        <p style="color: #fafafa; line-height: 1.6;">
          ${event.won
            ? "Nice work. You won the S.K.A.T.E. game."
            : "You spelled S.K.A.T.E. Better luck next time."
          }
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${getBaseUrl()}/hub"
             style="background-color: #f97316; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Play Again
          </a>
        </div>
      `;
      break;
  }

  const html = wrapEmail(content);
  return sendEmail(to, subject, html);
}
