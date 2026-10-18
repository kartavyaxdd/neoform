import { z } from "zod";
// Live-qualified single Gemini model; never an automatic fallback list.
export const GEMINI_MODEL = "gemini-3.5-flash-lite" as const;
export const geminiProofSchema = z
  .object({
    provider: z.literal("gemini"),
    model: z.literal(GEMINI_MODEL),
    inputTokens: z.number().int().min(1),
    outputTokens: z.number().int().min(1),
    toolCalls: z.literal(0),
    toolsProvided: z.literal(0),
    agentLoop: z.literal(false),
  })
  .strict();
export type GeminiProof = z.infer<typeof geminiProofSchema>;
