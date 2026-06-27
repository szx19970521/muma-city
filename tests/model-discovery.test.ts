import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import http from "http";
import { mockHttpRequest, type MockHttpRequestInfo } from "./http-request-mock";

let testHome: string;
const baseUrl = "http://127.0.0.1:18642/v1";

async function loadDiscovery(): Promise<
  typeof import("../src/main/model-discovery")
> {
  vi.resetModules();
  vi.stubEnv("HERMES_HOME", testHome);
  const mod = await import("../src/main/model-discovery");
  mod._clearCache();
  return mod;
}

function mockModelsEndpoint(
  handler: (req: MockHttpRequestInfo) => {
    statusCode?: number;
    body?: string;
  } | Error,
): void {
  mockHttpRequest(http, handler);
}

function json(data: unknown, statusCode = 200): { statusCode: number; body: string } {
  return { statusCode, body: JSON.stringify(data) };
}

describe("model-discovery", () => {
  beforeEach(() => {
    testHome = mkdtempSync(join(tmpdir(), "hermes-discovery-"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(testHome, { recursive: true, force: true });
  });

  it("returns the parsed list when /models returns the standard OpenAI shape", async () => {
    mockModelsEndpoint((req) =>
      req.path === "/v1/models" && req.method === "GET"
        ? json({ data: [{ id: "gamma" }, { id: "alpha" }, { id: "beta" }] })
        : json({}, 404),
    );
    writeFileSync(join(testHome, ".env"), "DEEPSEEK_API_KEY=sk-test\n");

    const { discoverProviderModels } = await loadDiscovery();
    const result = await discoverProviderModels(
      "custom",
      baseUrl,
      "sk-explicit",
      undefined,
    );

    expect(result.status).toBe("ok");
    expect(result.cached).toBe(false);
    expect(result.models).toEqual(["alpha", "beta", "gamma"]);
  });

  it("returns status=no-key for public custom endpoints when no apiKey is provided or in .env", async () => {
    mockModelsEndpoint(() => {
      throw new Error("must not be called when there is no key");
    });
    writeFileSync(join(testHome, ".env"), "");

    const { discoverProviderModels } = await loadDiscovery();
    const result = await discoverProviderModels(
      "custom",
      "https://example.com/v1",
      undefined,
      undefined,
    );
    expect(result.status).toBe("no-key");
    expect(result.models).toEqual([]);
  });

  it("discovers loopback custom models without an API key", async () => {
    let receivedAuth = "not-called";
    mockModelsEndpoint((req) => {
      receivedAuth = req.headers.authorization || "";
      return json({ data: [{ id: "llama3.2:latest" }] });
    });
    writeFileSync(join(testHome, ".env"), "");

    const { discoverProviderModels } = await loadDiscovery();
    const result = await discoverProviderModels(
      "custom",
      baseUrl,
      undefined,
      undefined,
    );

    expect(result.status).toBe("ok");
    expect(result.models).toEqual(["llama3.2:latest"]);
    expect(receivedAuth).toBe("");
  });

  it("discovers named local-provider models without an API key", async () => {
    let receivedAuth = "not-called";
    mockModelsEndpoint((req) => {
      receivedAuth = req.headers.authorization || "";
      return json({ data: [{ id: "qwen2.5-coder:7b" }] });
    });
    writeFileSync(join(testHome, ".env"), "");

    const { discoverProviderModels } = await loadDiscovery();
    const result = await discoverProviderModels(
      "atomicchat",
      baseUrl,
      undefined,
      undefined,
    );

    expect(result.status).toBe("ok");
    expect(result.models).toEqual(["qwen2.5-coder:7b"]);
    expect(receivedAuth).toBe("");
  });

  it("uses the Xiaomi MiMo env key for first-class xiaomi discovery", async () => {
    let receivedAuth = "";
    mockModelsEndpoint((req) => {
      receivedAuth = req.headers.authorization || "";
      return json({ data: [{ id: "mimo-v2.5-pro" }] });
    });
    writeFileSync(join(testHome, ".env"), "XIAOMI_API_KEY=sk-mimo-test\n");

    const { discoverProviderModels } = await loadDiscovery();
    const result = await discoverProviderModels(
      "xiaomi",
      baseUrl,
      undefined,
      undefined,
    );

    expect(receivedAuth).toBe("Bearer sk-mimo-test");
    expect(result.status).toBe("ok");
    expect(result.models).toEqual(["mimo-v2.5-pro"]);
  });

  it("returns status=unsupported for known no-discovery providers", async () => {
    const { discoverProviderModels } = await loadDiscovery();
    for (const provider of ["google", "xai"]) {
      const result = await discoverProviderModels(
        provider,
        undefined,
        "sk-x",
        undefined,
      );
      expect(result.status).toBe("unsupported");
      expect(result.models).toEqual([]);
    }
  });

  it("forwards Bearer auth on the request", async () => {
    let receivedAuth = "";
    mockModelsEndpoint((req) => {
      receivedAuth = req.headers.authorization || "";
      return json({ data: [{ id: "m1" }] });
    });
    writeFileSync(join(testHome, ".env"), "");

    const { discoverProviderModels } = await loadDiscovery();
    await discoverProviderModels("custom", baseUrl, "sk-actual-key", undefined);
    expect(receivedAuth).toBe("Bearer sk-actual-key");
  });

  it("uses x-api-key + anthropic-version headers for anthropic", async () => {
    let receivedApiKey = "";
    let receivedVersion = "";
    mockModelsEndpoint((req) => {
      receivedApiKey = req.headers["x-api-key"] || "";
      receivedVersion = req.headers["anthropic-version"] || "";
      return json({ data: [{ id: "claude-3-5-sonnet" }] });
    });
    writeFileSync(join(testHome, ".env"), "");

    const { discoverProviderModels } = await loadDiscovery();
    const result = await discoverProviderModels(
      "anthropic",
      baseUrl,
      "sk-ant-test",
      undefined,
    );
    expect(receivedApiKey).toBe("sk-ant-test");
    expect(receivedVersion).toBe("2023-06-01");
    expect(result.models).toEqual(["claude-3-5-sonnet"]);
  });

  it("returns status=ok with empty list when upstream returns malformed JSON", async () => {
    mockModelsEndpoint(() => ({ statusCode: 200, body: "not-json-at-all" }));

    const { discoverProviderModels } = await loadDiscovery();
    const result = await discoverProviderModels(
      "custom",
      baseUrl,
      "sk-test",
      undefined,
    );
    expect(result.status).toBe("ok");
    expect(result.models).toEqual([]);
  });

  it("returns status=ok with empty list when upstream returns 4xx/5xx", async () => {
    mockModelsEndpoint(() => json({ error: "unauthorized" }, 401));

    const { discoverProviderModels } = await loadDiscovery();
    const result = await discoverProviderModels(
      "custom",
      baseUrl,
      "sk-bad",
      undefined,
    );
    expect(result.status).toBe("ok");
    expect(result.models).toEqual([]);
  });

  it("returns status=error when the local provider cannot be reached", async () => {
    mockModelsEndpoint(() => new Error("offline"));

    const { discoverProviderModels } = await loadDiscovery();
    const result = await discoverProviderModels(
      "lmstudio",
      baseUrl,
      undefined,
      undefined,
    );
    expect(result.status).toBe("error");
    expect(result.models).toEqual([]);
  });

  it("dedupes model ids that appear twice in the response", async () => {
    mockModelsEndpoint(() => json({ data: [{ id: "x" }, { id: "x" }, { id: "y" }] }));

    const { discoverProviderModels } = await loadDiscovery();
    const result = await discoverProviderModels(
      "custom",
      baseUrl,
      "sk-test",
      undefined,
    );
    expect(result.models).toEqual(["x", "y"]);
  });

  it("caches results within the TTL; second call hits cache without re-fetching", async () => {
    let calls = 0;
    mockModelsEndpoint(() => {
      calls++;
      return json({ data: [{ id: `m${calls}` }] });
    });
    const { discoverProviderModels } = await loadDiscovery();

    const first = await discoverProviderModels(
      "custom",
      baseUrl,
      "sk-test",
      undefined,
    );
    const second = await discoverProviderModels(
      "custom",
      baseUrl,
      "sk-test",
      undefined,
    );

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.models).toEqual(first.models);
    expect(calls).toBe(1);
  });

  it("returns status=unknown-host for non-custom provider without a mapping", async () => {
    const { discoverProviderModels } = await loadDiscovery();
    const result = await discoverProviderModels(
      "fictional-provider-x",
      undefined,
      "sk-test",
      undefined,
    );
    expect(result.status).toBe("unknown-host");
  });

  it("uses .env API key when caller does not pass one explicitly", async () => {
    let receivedAuth = "";
    mockModelsEndpoint((req) => {
      receivedAuth = req.headers.authorization || "";
      return json({ data: [{ id: "m" }] });
    });
    writeFileSync(join(testHome, ".env"), "DEEPSEEK_API_KEY=sk-from-dotenv\n");

    const { discoverProviderModels } = await loadDiscovery();
    const result = await discoverProviderModels(
      "deepseek",
      baseUrl,
      undefined,
      undefined,
    );

    expect(result.status).toBe("ok");
    expect(receivedAuth).toBe("Bearer sk-from-dotenv");
  });

  it("nous discovery flags free models from the live /v1/models pricing data (#367)", async () => {
    let receivedAuth = "";
    mockModelsEndpoint((req) => {
      receivedAuth = req.headers.authorization || "";
      return json({
        data: [
          {
            id: "deepseek/deepseek-v4-flash:free",
            pricing: { prompt: "0", completion: "0" },
          },
          {
            id: "openrouter/owl-alpha",
            pricing: { prompt: "0.0", completion: "0.0" },
          },
          {
            id: "anthropic/claude-opus-4.7",
            pricing: { prompt: "0.000003", completion: "0.000015" },
          },
          { id: "missing-pricing" },
        ],
      });
    });

    writeFileSync(
      join(testHome, "auth.json"),
      JSON.stringify({
        providers: {
          nous: {
            access_token: "tok-nous-test",
            inference_base_url: baseUrl,
          },
        },
      }),
    );

    const { discoverProviderModels } = await loadDiscovery();
    const result = await discoverProviderModels(
      "nous",
      undefined,
      undefined,
      undefined,
    );

    expect(receivedAuth).toBe("Bearer tok-nous-test");
    expect(result.freeModels?.sort()).toEqual([
      "deepseek/deepseek-v4-flash:free",
      "openrouter/owl-alpha",
    ]);
    expect(result.status).toBe("ok");
  });

  it("nous discovery returns empty freeModels when auth.json is missing", async () => {
    const { discoverProviderModels } = await loadDiscovery();
    const result = await discoverProviderModels(
      "nous",
      undefined,
      undefined,
      undefined,
    );
    expect(result.freeModels).toEqual([]);
    expect(result.status).toBe("ok");
  });

  it("getModelContextWindow resolves context_length after the model cache is already warm", async () => {
    let calls = 0;
    mockModelsEndpoint(() => {
      calls++;
      return json({ data: [{ id: "big-model", context_length: 128000 }] });
    });

    const { discoverProviderModels, getModelContextWindow } =
      await loadDiscovery();

    const disc = await discoverProviderModels(
      "custom",
      baseUrl,
      "sk-test",
      undefined,
    );
    expect(disc.models).toEqual(["big-model"]);

    const ctx = await getModelContextWindow(
      "custom",
      "big-model",
      baseUrl,
      "sk-test",
      undefined,
    );
    expect(ctx).toBe(128000);
    expect(calls).toBe(1);
  });

  it("getModelContextWindow treats an empty ctx map as authoritative (no re-fetch)", async () => {
    let calls = 0;
    mockModelsEndpoint(() => {
      calls++;
      return json({ data: [{ id: "m" }] });
    });

    const mod = await loadDiscovery();
    await mod.discoverProviderModels("custom", baseUrl, "sk-test", undefined);
    const ctx = await mod.getModelContextWindow(
      "custom",
      "m",
      baseUrl,
      "sk-test",
      undefined,
    );
    expect(ctx).toBeNull();
    expect(calls).toBe(1);
  });

  it("getModelContextWindow returns null for providers without a /models endpoint", async () => {
    const { getModelContextWindow } = await loadDiscovery();
    const ctx = await getModelContextWindow(
      "openai-codex",
      "gpt-5.5",
      undefined,
      "sk-x",
      undefined,
    );
    expect(ctx).toBeNull();
  });
});
