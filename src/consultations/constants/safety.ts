export const EMERGENCY_PHRASES = [
  'chest pain',
  'chest tightness',
  'crushing chest',
  'cannot breathe',
  "can't breathe",
  'difficulty breathing',
  'gasping for air',
  'loss of consciousness',
  'passed out',
  'fainted',
  'unconscious',
  'sudden weakness',
  'one side of my body',
  'face drooping',
  'slurred speech',
  'severe bleeding',
  "bleeding won't stop",
  'coughing blood',
  'vomiting blood',
  'suicidal',
  'want to end my life',
  'kill myself',
  'end it all',
  'severe allergic reaction',
  'throat closing',
  'anaphylaxis',
];

// Here the LLM still runs, but we nudge it toward urgency.
export const HEIGHTENED_PHRASES = [
  'sharp pain',
  'worst headache',
  'high fever',
  'vision loss',
  'seizure',
];

export const EMERGENCY_ADVISORY = `This may be a medical emergency. Please seek immediate medical attention:

1. Call 112 (Nigeria emergency number) or your local emergency line.
2. Go to the nearest hospital emergency department immediately.
3. If you are alone, alert a family member, neighbour, or bystander.

I will not attempt a preliminary assessment for symptoms like these because they require urgent professional care.`;

export const DISCLAIMER =
  'This information is for general guidance only. It is not a medical diagnosis. Please consult a qualified healthcare professional for medical advice.';

export const VALIDATOR_FALLBACK = `I want to be careful here. For guidance on specific medications or a possible diagnosis, please speak with a qualified healthcare professional or pharmacist who can properly assess you. I can still help you understand your symptoms in general terms and figure out when to seek care — would you like that?`;
