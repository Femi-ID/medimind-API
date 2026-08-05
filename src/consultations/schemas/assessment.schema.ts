import z from 'zod';

export const assessmentSchema = z.object({
  assessment: z
    .string()
    .describe(
      'The full guidance message shown to the user, in plain prose. No JSON, no markdown headers.',
    ),
  severity: z
    .enum(['low', 'moderate', 'high'])
    .describe(
      'Overall urgency: low = self-care, moderate = see a clinic soon, high = seek care promptly.',
    ),
  referralSuggested: z
    .boolean()
    .describe('True if the user should be shown nearby hospitals or clinics.'),
});

export type AssessmentResult = z.infer<typeof assessmentSchema>;
