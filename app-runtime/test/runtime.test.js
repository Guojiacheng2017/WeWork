import assert from "node:assert/strict";
import test from "node:test";
import { buildModel, buildWorkPrompt, finalText } from "../src/runtime.js";

test("buildModel supports a deployed OpenAI-compatible model", () => {
  const model = buildModel({
    provider: "local-vllm", modelId: "Qwen/Qwen3-Coder", api: "openai-completions",
    baseUrl: "http://model-gateway:8000/v1", apiKeyEnv: "LOCAL_MODEL_API_KEY",
    contextWindow: 131072, maxTokens: 8192,
  });
  assert.equal(model.provider, "local-vllm");
  assert.equal(model.api, "openai-completions");
  assert.equal(model.baseUrl, "http://model-gateway:8000/v1");
  assert.equal(model.contextWindow, 131072);
});

test("portable messages produce final text and task prompt", () => {
  assert.equal(finalText([{ role: "assistant", content: [{ type: "text", text: "done" }] }]), "done");
  assert.match(buildWorkPrompt({ work: { title: "Evaluate", goal: "Summarize", constraints: "No fabrication" } }), /No fabrication/);
});
