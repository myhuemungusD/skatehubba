/**
 * Constants for trick validation and judging
 */
export const TRICK_RULES = {
  BASICS: {
    NO_TOE_DRAG: 'Must roll away clean without toe dragging',
    NO_HANDS_DOWN: 'No hands touching the ground',
    NO_TIC_TACS: 'No tic-tacs to gain momentum',
    ROLL_AWAY: 'Must roll away clean for at least 3 seconds',
    FULL_ROTATION: 'Complete the full rotation of the trick'
  }
};

export const JUDGE_FEEDBACK = {
  CLEAN: [
    '🔥 Clean as can be! That was textbook perfect!',
    '💯 Buttery smooth landing, homie!',
    '🚀 Properly stomped! That\'s how it\'s done!',
    '⚡ Super clean execution, you\'re killing it!',
    '🎯 Precision landing - nothing but steeze!'
  ],
  ALMOST: [
    '👊 Almost had it perfect - just watch that toe drag!',
    '💪 So close! Keep that roll-away clean and you\'ve got it!',
    '🎯 Nearly there - just need a bit more pop!',
    '🔄 Almost locked in - you\'re gonna have it next try!',
    '🛹 That was close! Small adjustment and it\'s yours!'
  ],
  INVALID: [
    'Hands helped with the landing - give it another shot! 🤙',
    'Quick tic-tac there - try it with pure pop next time! 💫',
    'Toe drag on the landing - you\'ve almost got it clean! 👟',
    'Didn\'t quite complete the rotation - but you\'re so close! 🔄',
    'Roll-away needed a bit more speed - next one\'s yours! 🚀'
  ]
};

export const LANDING_HYPE = [
  '🔥 YOOO! That was INSANE!',
  '💥 Let\'s GO! You\'re on FIRE!',
  '⚡ BOOM! Absolutely CRUSHED it!',
  '🚀 WHAT?! That was NUTS!',
  '💯 NO WAY! Too clean!'
];

/**
 * Evaluates a trick attempt and provides judging feedback
 */
export function judgeTrick(videoUrl, validationRules = ['NO_TOE_DRAG', 'NO_HANDS_DOWN', 'ROLL_AWAY']) {
  // TODO: In the future, this will use AI vision to analyze the trick
  // For now, it's a placeholder that randomly validates tricks
  
  const randomSuccess = Math.random() > 0.3; // 70% success rate for testing
  
  if (randomSuccess) {
    return {
      isValid: true,
      feedback: JUDGE_FEEDBACK.CLEAN[Math.floor(Math.random() * JUDGE_FEEDBACK.CLEAN.length)],
      hype: LANDING_HYPE[Math.floor(Math.random() * LANDING_HYPE.length)],
      rules: validationRules.map(rule => ({
        rule,
        passed: true,
        description: TRICK_RULES.BASICS[rule]
      }))
    };
  }

  // Randomly pick which rule was broken
  const failedRule = validationRules[Math.floor(Math.random() * validationRules.length)];
  return {
    isValid: false,
    feedback: JUDGE_FEEDBACK.INVALID[Math.floor(Math.random() * JUDGE_FEEDBACK.INVALID.length)],
    rules: validationRules.map(rule => ({
      rule,
      passed: rule !== failedRule,
      description: TRICK_RULES.BASICS[rule]
    }))
  };
}
