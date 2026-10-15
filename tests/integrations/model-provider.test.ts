import { expect, it } from "vitest";
import { readModelConfiguration, modelEndpoint } from "../../src/lib/integrations/model-provider";

it("keeps the existing OpenAI configuration and isolates provider-specific credentials", () => {
  expect(readModelConfiguration({ MODEL_API_KEY: "legacy-key", MODEL_NAME: "fixture-model" })).toEqual({ provider: "openai", model: "fixture-model", apiKey: "legacy-key" });
  expect(readModelConfiguration({ MODEL_PROVIDER: "deepseek", MODEL_NAME: "deepseek-flash", DEEPSEEK_API_KEY: "ds-key", OPENAI_API_KEY: "wrong-key" })).toEqual({ provider: "deepseek", model: "deepseek-flash", apiKey: "ds-key" });
  expect(readModelConfiguration({ MODEL_PROVIDER: "deepseek", MODEL_NAME: "deepseek-flash", OPENAI_API_KEY: "wrong-key" })).toBeNull();
});

it("fails closed for unrecognized providers and invalid models rather than redirecting data", () => {
  for (const env of [
    { MODEL_PROVIDER: "https://attacker.example", MODEL_NAME: "deepseek-flash", MODEL_API_KEY: "key" },
    { MODEL_PROVIDER: "deepseek", MODEL_NAME: "unknown-model", MODEL_API_KEY: "key" },
    { MODEL_PROVIDER: "deepseek", MODEL_NAME: "deepseek-flash\n", MODEL_API_KEY: "key" },
  ]) expect(() => readModelConfiguration(env)).toThrow();
  expect(modelEndpoint("deepseek")).toBe("https://api.deepseek.com/responses");
  expect(modelEndpoint("openai")).toBe("https://api.openai.com/v1/responses");
});
