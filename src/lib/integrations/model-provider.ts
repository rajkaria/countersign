import { z } from "zod";

export const modelProviderSchema = z.enum(["openai", "deepseek"]);
export type ModelProvider = z.infer<typeof modelProviderSchema>;
const modelName = z.string().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
export const modelSelectionSchema = z.object({
  provider: modelProviderSchema.default("openai"),
  model: modelName,
}).strict().refine(
  ({ provider, model }) => provider !== "deepseek" || ["deepseek-flash", "deepseek-v4-pro"].includes(model),
  "Select a currently supported DeepSeek model",
);
export type ModelConfiguration = z.infer<typeof modelSelectionSchema> & { apiKey: string };

/** Provider selection never accepts a model-controlled or environment-supplied base URL. */
export function modelEndpoint(provider: ModelProvider): string {
  return modelProviderSchema.parse(provider) === "deepseek"
    ? "https://api.deepseek.com/responses"
    : "https://api.openai.com/v1/responses";
}

/** Legacy MODEL_API_KEY/MODEL_NAME keep their OpenAI default; provider-specific keys never cross providers. */
export function readModelConfiguration(env: Record<string, string | undefined>): ModelConfiguration | null {
  const provider = modelProviderSchema.safeParse(env.MODEL_PROVIDER || "openai");
  if (!provider.success) throw new Error("Unsupported model provider configuration");
  const selected = env.MODEL_NAME ? modelSelectionSchema.safeParse({ provider: provider.data, model: env.MODEL_NAME }) : null;
  if (selected && !selected.success) throw new Error("Unsupported model selection configuration");
  const key = env.MODEL_API_KEY || (provider.data === "deepseek" ? env.DEEPSEEK_API_KEY : env.OPENAI_API_KEY);
  if (!selected || !selected.success || !key?.trim()) return null;
  return { ...selected.data, apiKey: key };
}

/** Disable DeepSeek thinking so bounded output tokens fund structured suggestions rather than reasoning. */
export function modelRequestOptions(provider: ModelProvider) {
  return provider === "deepseek" ? { reasoning: { effort: "none" as const } } : { store: false };
}
