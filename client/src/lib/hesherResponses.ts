/**
 * Hardcoded smart response engine for Hesher — the AI Skate Buddy.
 *
 * Responses are organized by topic and matched via keyword patterns.
 * No external API key required.
 *
 * IMPORTANT: Order matters — more specific patterns must come before
 * broader catch-all patterns. Matching is first-match-wins.
 */

interface HesherResponse {
  pattern: RegExp;
  replies: string[];
}

const responses: HesherResponse[] = [
  // ── Greetings (exact start-of-message match, low collision risk) ──
  {
    pattern: /^(hey|hi|hello|yo|sup|what'?s up|howdy)\b/i,
    replies: [
      "Yo! I'm Hesher, your skate buddy. Ask me anything about SkateHubba — spots, S.K.A.T.E. games, or how to get around.",
      "What's good! Hesher here. Need help finding spots, starting a game, or setting up your profile?",
      "Hey! Ready to shred? I can help you navigate SkateHubba. What do you wanna know?",
    ],
  },

  // ── S.K.A.T.E. game — how to play (specific: requires "how" + "play/start" + "game/skate") ──
  {
    pattern: /how.*(play|start|begin|work).*(skate|game|s\.?k\.?a\.?t\.?e)/i,
    replies: [
      "Here's how S.K.A.T.E. works on SkateHubba:\n\n1. Go to the **Play** page from the nav\n2. Create a new game or accept a challenge\n3. The setter films a trick (one take, no retries!)\n4. The opponent has 24 hours to match it\n5. If they miss, they get a letter (S, K, A, T, E)\n6. First to spell S.K.A.T.E. loses\n\nIt's all async — you don't need to be online at the same time!",
    ],
  },

  // ── S.K.A.T.E. game — general ──
  {
    pattern: /(skate|s\.?k\.?a\.?t\.?e)\s*(game|match|battle|challenge)/i,
    replies: [
      "S.K.A.T.E. games are async 1v1 trick battles. You set a trick, your opponent tries to match it. Miss = you get a letter. Spell S.K.A.T.E. and you lose. Head to **Play** to start one!",
      "The S.K.A.T.E. game is the core of SkateHubba — async trick battles where you challenge friends. Each turn you have 24 hours to respond. Check out the **Play** page to jump in.",
    ],
  },

  // ── Challenge / how to challenge (specific: "challenge" keyword) ──
  {
    pattern: /(how|where).*(challenge|invite|1v1|versus)/i,
    replies: [
      "To challenge someone:\n1. Go to **Play**\n2. Tap **Create Game**\n3. Pick your opponent (search by username)\n4. Film your opening trick\n5. They get notified and have 24 hours to respond\n\nYou can also accept incoming challenges from your Play page.",
    ],
  },

  // ── Tricks / filming ──
  {
    pattern: /(trick|film|record|video|upload|submit)/i,
    replies: [
      "Tricks are filmed one-take — no retries, no edits. That's the SkateHubba way. When it's your turn, hit the record button, land your trick, and it auto-sends. Keep it raw and real!",
      "When it's your turn in a S.K.A.T.E. game, you'll see a **Record** button. Film your trick in one take — it sends automatically. No do-overs!",
    ],
  },

  // ── Turn / deadline / timer ──
  {
    pattern: /(turn|deadline|timer|24.?hour|time.?limit|expire)/i,
    replies: [
      "Each turn has a **24-hour deadline**. If you don't respond in time, you forfeit that round and get a letter. You'll get a notification when it's your turn and a warning before the deadline hits.",
    ],
  },

  // ── Forfeit ──
  {
    pattern: /(forfeit|quit|give up|surrender|leave game)/i,
    replies: [
      "You can forfeit a game anytime from the game screen — but you'll take the L. If you don't respond within 24 hours, the game auto-forfeits that round for you. No shame in bailing if you gotta!",
    ],
  },

  // ── Check-in (before spots, since "check in" is more specific) ──
  {
    pattern: /(check.?in|check in|checking in)/i,
    replies: [
      "Check-ins let you mark that you're at a spot. Go to the **Map**, find the spot you're at, and hit **Check In**. It uses your location to verify you're actually there. Stack up check-ins to build your skater cred!",
    ],
  },

  // ── Spots / map ──
  {
    pattern: /(spot|skatepark|park|where.*skate)/i,
    replies: [
      "Check out the **Map** page to find skate spots near you! You can:\n- Browse spots on the interactive map\n- Filter by type (street, park, DIY, etc.)\n- Check in when you're at a spot\n- Add new spots you discover\n\nEvery spot shows who's been there and when.",
      "The Map is your go-to for finding skate spots. Tap any pin to see details, check-ins, and ratings. Found a new spot? You can add it right from the map!",
    ],
  },

  // ── Profile / settings ──
  {
    pattern: /(profile|setting|account|username|stance|edit.*profile|setup)/i,
    replies: [
      "Head to **Settings** (gear icon) to manage your profile:\n- Set your username and display name\n- Choose your stance (regular/goofy)\n- Update your bio and avatar\n- View your XP and stats\n\nFirst time? You'll go through profile setup automatically.",
    ],
  },

  // ── XP / levels / leaderboard ──
  {
    pattern: /(xp|experience|level|rank|leaderboard|score|points)/i,
    replies: [
      "You earn XP by:\n- Winning S.K.A.T.E. games\n- Checking in at spots\n- Completing tutorial steps\n- Being active in the community\n\nCheck the **Leaderboard** to see where you stack up against other skaters!",
    ],
  },

  // ── Help / what can you do ──
  {
    pattern: /(help|what can you|what do you|tutorial)/i,
    replies: [
      'I can help with:\n- **S.K.A.T.E. games** — how to play, challenge friends, rules\n- **Spots & Map** — finding spots, checking in\n- **Profile** — setting up your account\n- **Navigation** — finding your way around the app\n\nJust ask me anything! Try: "How do I start a S.K.A.T.E. game?"',
    ],
  },

  // ── Navigation / where is (BROAD — must be near the bottom) ──
  {
    pattern: /(navigate|how.*get to|menu|nav\b|go to|where.*find|where.*is)/i,
    replies: [
      "Here's the main nav:\n- **Home** — your hub with recent activity\n- **Skaters** — discover and find other skaters\n- **Map** — find and check into skate spots\n- **Play** — start or continue S.K.A.T.E. games\n- **Settings** — manage your profile\n\nOn mobile, use the bottom nav bar. On desktop, it's the sidebar on the left.",
    ],
  },

  // ── Thanks ──
  {
    pattern: /(thank|thanks|thx|appreciate|cheers)/i,
    replies: [
      "No problem! Happy shredding. Hit me up anytime you need help.",
      "Anytime! Now get out there and land some tricks.",
      "You got it! Let me know if anything else comes up.",
    ],
  },

  // ── Bye ──
  {
    pattern: /(bye|later|peace|see ya|cya|gtg|gotta go)/i,
    replies: [
      "Later! Go land something sick.",
      "Peace! See you on the map.",
      "Catch you later — happy shredding!",
    ],
  },
];

const fallbackReplies = [
  "Hmm, not sure about that one. Try asking about S.K.A.T.E. games, skate spots, or how to navigate the app!",
  "I'm best at helping with S.K.A.T.E. games, the spot map, and getting around SkateHubba. What do you need?",
  'Not sure I follow — try something like "How do I start a S.K.A.T.E. game?" or "Where do I find spots?"',
];

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function getHesherResponse(userMessage: string): string {
  const trimmed = userMessage.trim();
  if (!trimmed) {
    return "Type something and I'll help you out!";
  }

  for (const entry of responses) {
    if (entry.pattern.test(trimmed)) {
      return pickRandom(entry.replies);
    }
  }

  return pickRandom(fallbackReplies);
}
