import z from 'zod';

export const insightSchema = z.object({
  insights: z
    .array(
      z.object({
        parameter: z
          .string()
          .describe('The vital parameter, e.g. "systolic_bp", "heart_rate".'),
        severity: z
          .enum(['normal', 'watch', 'alert'])
          .describe(
            'normal = within healthy range, watch = borderline/trending, alert = clinically concerning.',
          ),
        direction: z
          .enum(['up', 'down', 'flat', 'mixed'])
          .describe('Trend direction over the window.'),
        message: z
          .string()
          .describe(
            'A 1–2 sentence plain-language observation about this parameter. ' +
              'Be specific (cite the actual numbers). Never diagnose.',
          ),
      }),
    )
    .describe(
      'One entry per vital parameter that has data. Omit parameters with no readings. ' +
        'Reason across parameters together — e.g. rising BP with elevated heart rate is different ' +
        'from rising BP alone. Keep each message concise.',
    ),
  summary: z
    .string()
    .describe(
      'A single overall sentence synthesizing the insights across all parameters. ' +
        'Never diagnose. End with whether the user should consider consulting a professional.',
    ),
});

export type InsightsResult = z.infer<typeof insightSchema>;
