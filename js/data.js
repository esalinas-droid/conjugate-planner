/* Conjugate Planner — exercise library, presets and session metadata.
   Extracted from the original conjugate_session_planner.html so records stay comparable. */
(function () {
  'use strict';

  const sessionMeta = {
    'ME Lower': {
      short: 'ME Lower',
      description: 'Build maximal strength through one special core lift, then target the weak links that limit the squat and deadlift.',
      mainRole: 'meLower'
    },
    'ME Upper': {
      short: 'ME Upper',
      description: 'Raise maximal pressing strength through one special press variation, then prioritize triceps, lats, upper back and delts.',
      mainRole: 'meUpper'
    },
    'DE Lower': {
      short: 'DE Lower',
      description: 'Develop speed-strength in the squat and deadlift while accumulating high-quality technical volume.',
      mainRole: 'deLower'
    },
    'DE Upper': {
      short: 'DE Upper',
      description: 'Develop rapid force production and repeatable bench technique, then build the triceps and upper back.',
      mainRole: 'deUpper'
    },
    'GPP / Extra Workout': {
      short: 'GPP',
      description: 'Build work capacity, restore tissues or address a weak point without compromising the next major session.',
      mainRole: 'gpp'
    },
    'Recovery / Restoration': {
      short: 'Recovery',
      description: 'Use low-fatigue work to improve readiness for the next major session. You should not need to recover from recovery.',
      mainRole: 'recovery'
    },
    'Deload': {
      short: 'Deload',
      description: 'Reduce accumulated fatigue while preserving useful movement, technique and circulation.',
      mainRole: 'deload'
    }
  };

  const exerciseDB = {
    warmupLower: [
      'Easy Bike','Incline Treadmill Walk','Backward Sled Drag','Forward Sled Drag','Belt Squat March','Bodyweight Squat','Goblet Squat','Hip Airplane','Supported Hip Shift','Hamstring Floss','Adductor Rockback','90/90 Breathing','Standing Breathing Drill','Dead Bug','Bird Dog','Glute Bridge','Band Leg Curl','Reverse Hyper — Light','Standing Cable Abs — Light','Ankle Rocker','Calf Raise','Pogo Jump — Low Level','Box Jump — Low Volume'
    ],
    warmupUpper: [
      'Easy Bike','Treadmill Walk','Band Pull-Apart','Face Pull','Band External Rotation','Cable External Rotation','Scapular Push-Up','Push-Up','Band Pushdown','Light Lat Pulldown','Chest-Supported Row — Light','Rear-Delt Raise — Light','Wall Slide','Shoulder CAR','Medicine-Ball Chest Pass — Low Volume','Explosive Push-Up — Low Volume','90/90 Breathing','Standing Cable Abs — Light'
    ],
    meLower: [
      'Box Squat','Safety Squat Bar Squat','Safety Squat Bar Low Box Squat','Safety Squat Bar High Box Squat','Cambered-Bar Squat','Front Squat','Harness Front Squat','Belt Squat — Heavy','Good Morning','Arched-Back Good Morning','Bent-Over Good Morning','Wide-Stance Good Morning','Seated Good Morning','Suspended Good Morning','Cambered-Bar Good Morning','Safety-Bar Good Morning','Rack Pull','Deficit Deadlift','Platform Deadlift','Reverse-Band Deadlift','Deadlift Against Bands','Deadlift Against Chains','Conventional Deadlift','Sumo Deadlift','Opposite-Stance Deadlift','Snatch-Grip Deadlift','Concentric Deadlift from Pins','Zercher Squat','Zercher Pull'
    ],
    meUpper: [
      'Floor Press','Close-Grip Floor Press','Floor Press with Chains','Floor Press with Bands','Board Press','1-Board Press','2-Board Press','3-Board Press','4-Board Press','5-Board Press','Rack Lockout','Pin Press','Close-Grip Bench Press','Wide-Grip Bench Press','Incline Press','Decline Press','Reverse-Band Bench Press','Bench Press Against Bands','Bench Press Against Chains','Special-Bar Bench Press','Football-Bar Bench Press','Cambered-Bar Bench Press','Buffalo-Bar Bench Press','Fat-Bar Bench Press','Concentric Bench Press from Pins','Paused Bench Press','Dumbbell Press — Repetition Method'
    ],
    deLower: [
      'Box Squat','Safety Squat Bar Box Squat','Cambered-Bar Box Squat','Straight-Bar Box Squat','Front Squat to Box','Concentric Box Squat from Pins','Speed Deadlift — Conventional','Speed Deadlift — Sumo','Speed Deadlift Against Bands','Speed Deadlift Against Chains','Deficit Speed Deadlift'
    ],
    deUpper: [
      'Speed Bench Press','Speed Bench Press with Mini-Bands','Speed Bench Press with Chains','Speed Floor Press','Speed Pin Press','Speed Football-Bar Bench','Speed Cambered-Bar Bench','Heavy-Light Speed Bench'
    ],
    explosiveLower: [
      'Box Jump','Paused Box Jump','Seated Box Jump','Kneeling Jump','Vertical Jump','Broad Jump','Repeated Broad Jump','Hurdle Jump','Lateral Box Jump','Pogo Jump','Ankle Hop','Jump Rope','Split-Squat Jump','Bound','Depth Landing','Altitude Drop','Depth Jump','Reactive Box Jump','Repeated Hurdle Hop','Weighted Box Jump','Band-Resisted Jump'
    ],
    explosiveUpper: [
      'Medicine-Ball Chest Pass','Medicine-Ball Overhead Throw','Medicine-Ball Scoop Toss','Medicine-Ball Slam','Explosive Push-Up','Band-Assisted Explosive Push-Up','Smith-Machine Ballistic Press','Barbell Ballistic Bench Press'
    ],
    posterior: [
      'Reverse Hyper','Glute-Ham Raise','45-Degree Back Raise','Pull-Through','Dimel Deadlift','Band Leg Curl','Seated Leg Curl','Lying Leg Curl','Nordic Hamstring Curl','Romanian Deadlift','Stiff-Leg Deadlift','Single-Leg Romanian Deadlift','Hip Thrust','Glute Bridge','Belt Squat','Walking Lunge','Reverse Lunge','Step-Up','Wide-Stance Box Squat — Repetition','Good Morning — Repetition','Cable Pull-Through'
    ],
    upperBack: [
      'Chest-Supported Row','One-Arm Dumbbell Row','Barbell Row','T-Bar Row','Cable Row','Seal Row','Inverted Row','Lat Pulldown','Close-Grip Lat Pulldown','Wide-Grip Lat Pulldown','Chin-Up','Pull-Up','Straight-Arm Pulldown','Shrug','Dumbbell Power Clean','Face Pull','Rear-Delt Row','Band Pull-Apart','High Row'
    ],
    triceps: [
      'JM Press','Dumbbell Triceps Extension','Rolling Dumbbell Extension','Flared-Arm Dumbbell Extension','Barbell Extension','Incline Triceps Extension','Decline Triceps Extension','Floor Dumbbell Extension','Tate Press','Band Pushdown','Cable Pushdown','Rope Pushdown','Close-Grip Bench Press — Supplemental','Board Press — Supplemental','Dip — Triceps Emphasis'
    ],
    delts: [
      'Front Raise','Side Raise','Lateral Raise','Rear-Delt Raise','Reverse Fly','Reverse Pec Deck','Seated Overhead Press','Dumbbell Shoulder Press','Bradford Press','Face Pull','Band Pull-Apart','Cable Y-Raise','Scaption Raise'
    ],
    biceps: [
      'Hammer Curl','Dumbbell Curl','Cable Curl','Barbell Curl','EZ-Bar Curl','Reverse Curl','Band Curl','Preacher Curl'
    ],
    rotatorCuff: [
      'Band External Rotation','Cable External Rotation','Side-Lying External Rotation','Face Pull to External Rotation','Scapular Push-Up','Wall Slide','Serratus Press','Band Pull-Apart'
    ],
    abs: [
      'Standing Cable Abdominal','Standing Band Abdominal','Side Bend','Hanging Leg Raise','Lying Leg Raise','Spread-Eagle Sit-Up','Weighted Sit-Up','Russian Twist','Landmine Rotation','Side Deadlift','Suitcase Lift','Static Bracing Against Belt','Pallof Press','Dead Bug','Side Plank','Front Plank','Ab Wheel'
    ],
    gpp: [
      'Forward Sled Drag from Belt','Backward Sled Drag','Bent-Over Sled Drag','Ankle-Strap Sled Walk','Upper-Body Sled Press','Upper-Body Sled Row','Upper-Body Sled Triceps Extension','Upper-Body Sled Raise','Wheelbarrow Carry / Push','Walking Lunge','Belt Squat March','Air Bike','Stationary Bike','Incline Treadmill Walk','StepMill','Indoor Track Walk','Reverse Hyper — Light','Band Circuit','Cable Circuit','Bodyweight Circuit','Farmer Carry — Light','Rowing Ergometer — Easy'
    ],
    recovery: [
      'Easy Bike','Easy Treadmill Walk','Indoor Track Walk','Incline Treadmill Walk — Easy','Belt Squat March — Easy','Reverse Hyper — Light','Band Leg Curl — Light','Band Pushdown — Light','Face Pull — Light','Band Pull-Apart','Cable Row — Light','Lat Pulldown — Light','Standing Abs — Light','Mobility Circuit','Breathing Drill','Easy StepMill','Backward Sled Drag — Light','Forward Sled Drag — Light'
    ]
  };

  function row(exercise = '', sets = '', reps = '', duration = '', weight = '', rest = '', notes = '') {
    return { exercise, sets, reps, weight, rpe: '', rest, duration, distance: '', contacts: '', result: '', notes, weakPoint: '' };
  }

  const presets = {
    gpp: {
      'Lower Restoration': [
        row('Easy Bike','','','10 min','','','RPE 3–4'), row('Reverse Hyper — Light','3','20–30','','Light','',''), row('Standing Cable Abdominal','3','15–20','','','',''), row('Mobility Circuit','','','5 min','','','')
      ],
      'Belt Squat GPP': [
        row('Belt Squat March','4','','2 min','','60 sec',''), row('Band Leg Curl','3','20–30','','','',''), row('Standing Cable Abdominal','3','15–20','','','',''), row('Reverse Hyper','3','15–20','','Light','','')
      ],
      'Posterior Chain GPP': [
        row('Reverse Hyper','3','15–20','','','',''), row('Cable Pull-Through','3','15–20','','','',''), row('Good Morning — Repetition','3','20','','Band','',''), row('Standing Cable Abdominal','3','15–20','','','','')
      ],
      'Quad / Knee Indoor GPP': [
        row('Belt Squat March','3','','2 min','','60 sec',''), row('Step-Up','3','10 / leg','','','',''), row('Stationary Bike','','','5–10 min','','',''), row('Standing Cable Abdominal','3','15','','','','')
      ],
      'Upper-Body Circuit': [
        row('Cable Row','4','20','','Light','','Circuit'), row('Push-Up','4','15–20','','','','Circuit'), row('Band Pushdown','4','25','','','','Circuit'), row('Face Pull','4','20','','','','Circuit'), row('Standing Band Abdominal','4','15','','','','Circuit')
      ],
      'Minimal Equipment': [
        row('Band Good Morning','4','20','','','',''), row('Band Row','4','20','','','',''), row('Push-Up','4','10–20','','','',''), row('Band Curl','4','20','','','',''), row('Band Pushdown','4','25','','','',''), row('Standing Band Abdominal','4','15','','','','')
      ],
      'Upper Back Weak Point': [
        row('Chest-Supported Row','4','12–15','','','',''), row('Lat Pulldown','3','15','','','',''), row('Rear-Delt Raise','3','20','','','',''), row('Band Pushdown','3','25','','','',''), row('Standing Cable Abdominal','3','15','','','','')
      ],
      'Hamstring / Glute Weak Point': [
        row('Glute-Ham Raise','4','8–12','','','',''), row('Cable Pull-Through','3','15','','','',''), row('Band Leg Curl','3','20–30','','','',''), row('Belt Squat March','3','','60–90 sec','','',''), row('Standing Cable Abdominal','3','15','','','','')
      ],
      '10-Minute Micro Session': [
        row('Easy Bike','','','5 min','','',''), row('Band Leg Curl','','50 total','','','',''), row('Standing Band Abdominal','','50 total','','','','')
      ]
    },
    recovery: {
      'Post-ME Lower': [
        row('Easy Bike','','','10–15 min','','','RPE 2–4'), row('Reverse Hyper — Light','3','20','','','',''), row('Standing Cable Abdominal','3','15','','','',''), row('Mobility Circuit','','','3–5 min','','','')
      ],
      'Post-DE Lower': [
        row('Belt Squat March — Easy','3','','2 min','','',''), row('Band Leg Curl — Light','3','20–25','','','',''), row('Reverse Hyper — Light','2–3','20','','','',''), row('Easy Bike','','','5 min','','','')
      ],
      'Post-ME Upper': [
        row('Easy Bike','','','8–10 min','','',''), row('Band Pushdown — Light','3','30','','','',''), row('Face Pull — Light','3','20','','','',''), row('Cable Row — Light','3','20','','','',''), row('Standing Abs — Light','3','15','','','','')
      ],
      'Whole-Body Restoration': [
        row('Easy Bike','3','','3 min','','','Circuit'), row('Belt Squat March — Easy','3','','60 sec','','','Circuit'), row('Band Row','3','20','','','','Circuit'), row('Band Pushdown — Light','3','25','','','','Circuit'), row('Standing Band Abdominal','3','15','','','','Circuit')
      ],
      'No Equipment / Travel': [
        row('Indoor Track Walk','','','10 min','','',''), row('Bodyweight Squat','2','15','','','',''), row('Bodyweight Hip Hinge','2','15','','','',''), row('Push-Up','2','10–15','','','','Stop shy of failure'), row('Side Plank','2','','30 sec / side','','','')
      ],
      'Deload Indoor': [
        row('Easy Bike','','','15–20 min','','',''), row('Reverse Hyper — Light','2','15–20','','','',''), row('Cable Row — Light','2','15','','','',''), row('Standing Abs — Light','2','15','','','',''), row('Mobility Circuit','','','5 min','','','')
      ],
      '10-Minute Minimum': [
        row('Easy Bike','','','6 min','','',''), row('Band Pushdown — Light','2','25','','','',''), row('Standing Band Abdominal','2','15','','','','')
      ],
      'Low-Back / Posterior Restoration': [
        row('Easy Bike','','','5–8 min','','',''), row('Reverse Hyper — Light','3','20','','','',''), row('Band Leg Curl — Light','2–3','25','','','',''), row('Standing Abs — Light','3','15','','','','')
      ]
    }
  };

  const categoryLabels = {
    warmupLower: 'Warm-Up', warmupUpper: 'Warm-Up', meLower: 'ME Lower', meUpper: 'ME Upper',
    deLower: 'DE Lower', deUpper: 'DE Upper', explosiveLower: 'Plyometric', explosiveUpper: 'Ballistic',
    posterior: 'Posterior Chain', upperBack: 'Upper Back / Lats', triceps: 'Triceps', delts: 'Delts',
    biceps: 'Biceps', rotatorCuff: 'Rotator Cuff', abs: 'Abs / Trunk', gpp: 'GPP', recovery: 'Recovery'
  };

  window.ConjugateData = { sessionMeta, exerciseDB, presets, categoryLabels, row };
})();
