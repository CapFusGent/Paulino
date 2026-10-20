// Paulino's lines, grouped by emotional state and context.
// Short, readable on a phone, never shaming someone for protecting their body.

export const STATES = ['motivational', 'focused', 'happy', 'disappointed', 'concerned'];

export const LINES = {
  motivational: {
    home: [
      'COME ON, CHAMP!',
      'Bar is loaded. Ego is not.',
      'Today we lift. Tomorrow we brag.',
      "Paul planned it. You crush it.",
      'Strong is a habit. Show up!',
      'Chalk up, champ!',
      'One session at a time.',
      'Nice to see you again!',
    ],
    rest_day: [
      'Rest day! Muscles grow while you chill.',
      'Recovery is training too.',
      'Sleep, eat, repeat. Then lift.',
    ],
    no_program: [
      'Paul is cooking up your plan!',
      'No program yet. Warm up your patience!',
    ],
    workout: [
      'Warm-up first: empty bar for 10!',
      'Perfect reps beat heavy reps.',
      "Let's get this one done!",
    ],
  },
  focused: {
    generic: [
      'Brace before you lift!',
      'Control that descent!',
      'No ego lifting today!',
      'Leave one or two reps in the tank.',
      'Breathe, brace, go.',
      'Same groove every rep.',
    ],
    rest: [
      'Rest up. 1:30 to 3:00.',
      'Shake it out. Next set soon.',
      'Breathe. Hydrate. Focus.',
    ],
  },
  happy: {
    set: ['Clean rep!', 'Smooth!', 'That one flew!', 'Textbook!'],
    exercise: ['Exercise done!', 'Next one!', 'Look at you go!'],
    finish: [
      'Nice work. Paul approves!',
      'BOOM! Session done!',
      'That was beautiful, champ!',
      'Another one in the books!',
    ],
    pr: ['NEW PR! Who even are you?!', 'PERSONAL RECORD!', 'The bar got lighter. Or you got stronger!'],
    restored: ['Thank you! Paul will be so proud.', 'The plan lives! Good call.', 'Back to the plan, champ!'],
  },
  disappointed: {
    deviate: [
      "WHAT?! You changed Paul's program?!",
      'NOOO! Paul spent hours planning this!',
      'Are you really changing it?',
      "Paul's spreadsheet is crying right now.",
    ],
    after: [
      "I'm disappointed... but I still believe in you!",
      'Fine. But Paul will hear about this.',
      "OK... your call. I'll be here, sulking.",
    ],
  },
  concerned: {
    pain: [
      'Sharp pain? Stop that exercise now.',
      'Your body comes first. Always.',
      "No set is worth an injury.",
    ],
    fatigue: [
      'Feeling run down? Smart to adjust.',
      'Listen to your body today.',
      "Easy days count. Truly.",
    ],
    heavy: [
      "Heavier than Paul's plan. Is that wise?",
      'Easy, tiger. Stick to the plan.',
    ],
    skip: [
      'Rest up and get well soon!',
      "Skipping when sick is smart, not lazy.",
    ],
    offline: ["You're offline. I'll save everything here."],
  },
};

// Proper safety copy, used verbatim in dialogs (not in jokey bubbles).
export const SAFETY = {
  painStop:
    'If you feel strong or sharp pain, stop the exercise straight away and don’t do any more reps or sets of it. Rest for 48 hours and see how you feel.',
  painContact:
    'Tell Paul what happened. If pain is severe, gets worse, or comes with swelling, numbness or tingling, get it checked by a doctor or physiotherapist.',
  soreness: 'General muscle soreness up to about 2–3 out of 10 is usually not a problem.',
  disclaimer: "Paulino's tips are general coaching cues. They don't replace Paul's feedback or a medical opinion.",
};
