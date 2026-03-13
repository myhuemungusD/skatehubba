/**
 * Default tutorial steps seeded on first database initialization.
 * Focused on the async S.K.A.T.E. game flow.
 */
export const defaultTutorialSteps = [
  {
    title: "Welcome to SkateHubba",
    description:
      "SkateHubba is your skate community — find spots, challenge friends to async S.K.A.T.E. games, and track your progress. Let's get you started!",
    type: "intro" as const,
    content: { videoUrl: "/tutorial/welcome" },
    order: 1,
    isActive: true,
  },
  {
    title: "Find the Play Page",
    description:
      "The Play page is where all S.K.A.T.E. action happens. Tap the Play icon in your navigation to see active games, incoming challenges, and create new ones.",
    type: "interactive" as const,
    content: {
      interactiveElements: [
        {
          type: "tap" as const,
          target: "play-nav",
          instruction: "Tap the Play button in the navigation bar to open the games page.",
        },
      ],
    },
    order: 2,
    isActive: true,
  },
  {
    title: "Create a S.K.A.T.E. Challenge",
    description:
      "Challenge another skater to a 1v1 async S.K.A.T.E. game. Pick your opponent, film your opening trick, and wait for them to respond.",
    type: "interactive" as const,
    content: {
      interactiveElements: [
        {
          type: "tap" as const,
          target: "create-game",
          instruction: "Tap 'Create Game' to start a new challenge.",
        },
        {
          type: "tap" as const,
          target: "search-opponent",
          instruction:
            "Search for an opponent by username — they'll get notified when you challenge them.",
        },
      ],
    },
    order: 3,
    isActive: true,
  },
  {
    title: "Film Your Trick",
    description:
      "Tricks are filmed one-take with no retries — that's the SkateHubba way. Hit record, land your trick, and it auto-sends to your opponent.",
    type: "interactive" as const,
    content: {
      interactiveElements: [
        {
          type: "tap" as const,
          target: "record-button",
          instruction:
            "When it's your turn, tap the Record button. Film your trick in one take — it sends automatically!",
        },
      ],
    },
    order: 4,
    isActive: true,
  },
  {
    title: "Understand the Rules",
    description:
      "The setter films a trick. The opponent tries to match it within 24 hours. Miss it? You get a letter (S-K-A-T-E). First to spell S.K.A.T.E. loses. Simple!",
    type: "intro" as const,
    content: {},
    order: 5,
    isActive: true,
  },
  {
    title: "Your First Challenge",
    description:
      "Time to put it all together! Head to the Play page and create your first S.K.A.T.E. challenge.",
    type: "challenge" as const,
    content: {
      challengeData: {
        action: "Go to Play and create a new S.K.A.T.E. game challenge",
        expectedResult: "You've created a game and sent your opening trick to an opponent",
      },
    },
    order: 6,
    isActive: true,
  },
];
