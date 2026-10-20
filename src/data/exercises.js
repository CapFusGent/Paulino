// Approved exercise library.
//
// The authoritative exercise list comes from Paul's own program spreadsheet
// (squat, bench, barbell row, overhead press, deadlift, pull-up). Paul can add
// more exercises from the coach editor; nothing else is introduced here.
//
// Cue sources:
//   "paul"    – paraphrased from Paul's written training guidelines.
//   "general" – widely taught, conservative barbell cues. Paul's own notes on a
//               prescription always take priority over these.

export const CATEGORIES = {
  squat: 'Squat',
  bench: 'Bench press',
  deadlift: 'Deadlift',
  accessory: 'Accessory',
};

export const EXERCISES = [
  {
    id: 'squat',
    name: 'Back squat',
    aliases: ['squat'],
    category: 'squat',
    description:
      'Barbell on the upper back, sit down between your hips and stand back up with the bar travelling straight over the middle of the foot.',
    tips: {
      setup: [
        'Bar on your upper back, hands as close as your shoulders allow.',
        'Walk it out in three steps: back, back, set.',
        'Feet about shoulder width, toes turned out a little.',
      ],
      execution: [
        'Control the descent.',
        'Keep the bar balanced over your midfoot.',
        'Knees track in the direction of your toes.',
        'Drive up and keep your chest with the bar.',
      ],
      mistakes: [
        'Knees caving in on the way up.',
        'Hips shooting up first and folding forward.',
        'Diving down fast and bouncing out of the hole.',
      ],
      bracing: [
        'Big breath into your belly, then brace before descending.',
        'Hold the brace until you are standing again.',
      ],
      safety: [
        'Use a depth you can control.',
        'Set the safety pins or straps just below your bottom position.',
      ],
    },
  },
  {
    id: 'bench-press',
    name: 'Bench press',
    aliases: ['bench', 'bench press'],
    category: 'bench',
    description:
      'Lying on the bench with a stable arch and feet on the floor, lower the bar to the chest and press it back up over the shoulders.',
    tips: {
      setup: [
        'Eyes under the bar, squeeze your shoulder blades together and down.',
        'Feet planted, glutes stay on the bench.',
        'Grip evenly, thumbs around the bar.',
      ],
      execution: [
        'Lower the bar under control to your lower chest.',
        'Keep your wrists stacked over your elbows.',
        'Press up and slightly back towards your face.',
      ],
      mistakes: [
        'Bouncing the bar off the chest.',
        'Elbows flaring straight out to the sides.',
        'Butt lifting off the bench.',
      ],
      bracing: [
        'Breathe in at the top, stay tight through the whole rep.',
        'Maintain a stable setup: upper back pinned to the bench.',
      ],
      safety: [
        'Use a spotter or safety arms for heavy attempts.',
        'Never use a thumbless grip.',
      ],
    },
  },
  {
    id: 'deadlift',
    name: 'Deadlift',
    aliases: ['deadlift'],
    category: 'deadlift',
    description:
      'Pull the barbell from the floor to standing with a neutral spine, keeping the bar close to the legs the whole way.',
    tips: {
      setup: [
        'Bar over the middle of your foot, shins close to the bar.',
        'Grip just outside your legs, arms straight.',
        'Chest up, hips at a height where your shins touch the bar.',
      ],
      execution: [
        'Build tension before the bar leaves the floor.',
        'Keep the bar close: drag it up your legs.',
        'Push the floor away, then lock out with your hips.',
        'Lower it under control the same way it came up.',
      ],
      mistakes: [
        'Jerking the weight from the floor.',
        'Bar drifting away from the shins.',
        'Leaning back excessively at lockout.',
      ],
      bracing: [
        'Set your brace before pulling.',
        'Re-brace between reps instead of rushing.',
      ],
      safety: [
        'If your back rounds more than your setup, the weight is too heavy today.',
        'Avoid jerking the weight from the floor.',
      ],
    },
  },
  {
    id: 'overhead-press',
    name: 'Overhead press',
    aliases: ['overhead press', 'ohp', 'press'],
    category: 'accessory',
    description:
      'Standing barbell press from the front of the shoulders to locked out overhead, with legs and trunk staying still.',
    tips: {
      setup: [
        'Bar on the front of your shoulders, grip just outside shoulder width.',
        'Feet hip width, squeeze glutes and quads.',
      ],
      execution: [
        'Move your head back, press the bar in a straight line.',
        'Push your head through once the bar passes your forehead.',
        'Finish with the bar over your midfoot, arms locked.',
      ],
      mistakes: [
        'Leaning back to turn it into an incline press.',
        'Pressing the bar forward around your face.',
        'Using a knee dip to cheat it up.',
      ],
      bracing: [
        'Ribs down, abs tight: no banana back.',
      ],
      safety: [
        'Stop if you feel pinching in the shoulder.',
      ],
    },
  },
  {
    id: 'barbell-row',
    name: 'Barbell row',
    aliases: ['barbell row', 'row'],
    category: 'accessory',
    description:
      'Hinged over with a flat back, row the barbell from hanging arms to your lower chest or upper belly.',
    tips: {
      setup: [
        'Hinge at the hips until your torso is close to parallel.',
        'Slight bend in the knees, bar under your shoulders.',
      ],
      execution: [
        'Pull the bar to your belly, elbows going back.',
        'Squeeze your shoulder blades at the top.',
        'Lower it under control: no dropping.',
      ],
      mistakes: [
        'Standing up more with every rep.',
        'Yanking the weight with the lower back.',
      ],
      bracing: [
        'Keep a neutral spine and a tight trunk the whole set.',
      ],
      safety: [
        'If you cannot keep your back flat, lower the weight.',
      ],
    },
  },
  {
    id: 'pull-up',
    name: 'Pull-up',
    aliases: ['pull-up', 'pullup', 'pull up'],
    category: 'accessory',
    description:
      'Hang from a bar with an overhand grip and pull until your chin clears the bar. Bodyweight, or with added weight when Paul says so.',
    tips: {
      setup: [
        'Hands a bit wider than shoulders, full grip.',
        'Start from a dead hang with straight arms.',
      ],
      execution: [
        'Pull your elbows down towards your ribs.',
        'Chin over the bar, then lower all the way under control.',
      ],
      mistakes: [
        'Kipping or swinging for momentum.',
        'Half reps that never reach straight arms.',
      ],
      bracing: [
        'Squeeze glutes and abs so your legs stay still.',
      ],
      safety: [
        'Step down instead of dropping from the bar.',
      ],
    },
  },
];

// Guidance that applies to every lift. Paraphrased from Paul's guidelines.
export const GENERAL_TIPS = [
  { source: 'paul', text: 'Warm up first: empty bar for 10, then a couple of lighter sets. No rest between warm-ups.' },
  { source: 'paul', text: 'Perfect form first. Finish each set feeling you had one or two reps left.' },
  { source: 'paul', text: 'We never train to failure. That is where injuries happen.' },
  { source: 'paul', text: 'Rest 1:30 to 3:00 between sets, depending on how you feel.' },
  { source: 'paul', text: 'Muscle soreness up to about 2–3/10 is usually fine. Sharp pain means stop.' },
  { source: 'paul', text: 'Supersets work: bench + row, overhead press + deadlift.' },
];

export function exerciseById(id, extra = []) {
  return EXERCISES.find((e) => e.id === id) || extra.find((e) => e.id === id) || null;
}

/** Flatten an exercise's tips into a list of { kind, text } cues. */
export function cuesFor(exercise) {
  if (!exercise || !exercise.tips) return [];
  const out = [];
  for (const kind of ['setup', 'execution', 'bracing', 'mistakes', 'safety']) {
    for (const text of exercise.tips[kind] || []) {
      out.push({ kind, text: kind === 'mistakes' ? `Avoid: ${text.charAt(0).toLowerCase()}${text.slice(1)}` : text });
    }
  }
  return out;
}
