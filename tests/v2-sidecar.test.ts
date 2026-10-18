import { it, expect } from "vitest";
import {
  generationArgs,
  acceptEvents,
  reservation,
  restrictedModelCatalog,
  disabledFeatures,
  verifyFeatureListing,
} from "../scripts/cli-policy.mjs";
it("omits shell, file editing, search and experimental tools from the actual serialized model catalog", () => {
  const catalog = JSON.parse(JSON.stringify(restrictedModelCatalog()));
  expect(catalog.models).toHaveLength(1);
  const model = catalog.models[0];
  expect(model.slug).toBe("gpt-6.1-sol");
  expect(model.shell_type).toBe("disabled");
  expect(model.apply_patch_tool_type).toBeNull();
  expect(model.experimental_supported_tools).toEqual([]);
  expect(model.supports_search_tool).toBe(false);
  expect(model.tool_mode).toBe("direct");
  expect(model.node_repl_disabled).toBe(true);
});
it("remembers cancellation while the isolated job directory is being created", () => {
  const job = reservation("synthetic-account");
  job.cancel();
  expect(job.cancelled).toBe(true);
  expect(job.account).toBe("synthetic-account");
});
it("constructs an isolated schema-only CLI with execution gates disabled and no user integrations", () => {
  const args = generationArgs(
    "C:/qa/isolated",
    "C:/qa/schema.json",
    "C:/qa/catalog.json",
  );
  for (const flag of [
    "--ignore-user-config",
    "--ignore-rules",
    "--ephemeral",
    "--json",
    "--output-schema",
    "--sandbox",
  ])
    expect(args).toContain(flag);
  expect(args).toContain("read-only");
  expect(args).toContain("gpt-6.1-sol");
  for (const feature of [
    "shell_tool",
    "unified_exec",
    "apps",
    "hooks",
    "plugins",
    "remote_plugin",
    "browser_use",
    "browser_use_external",
    "browser_use_full_cdp_access",
    "computer_use",
    "multi_agent",
    "multi_agent_v2",
    "skill_search",
    "skill_mcp_dependency_install",
    "view_image",
    "image_generation",
    "sleep_tool",
    "code_mode_host",
  ])
    expect(args.join(" ")).toContain(`--disable ${feature}`);
  expect(args.join(" ")).toContain("features.skip_host_skill_discovery=true");
  expect(args.join(" ")).toContain("model_catalog_json=");
  expect(args.join(" ")).not.toContain("danger-full-access");
});
it("accepts only the source-verified unified-exec normalization and fails closed on any enabled execution gate", () => {
  const listing = disabledFeatures
    .map(
      (feature) =>
        `${feature} stable ${feature === "unified_exec" ? "true" : "false"}`,
    )
    .join("\n");
  expect(verifyFeatureListing(listing).forcedFeatures).toEqual([
    "unified_exec",
  ]);
  for (const feature of [
    "shell_tool",
    "apps",
    "hooks",
    "browser_use",
    "multi_agent",
    "token_budget",
  ])
    expect(() =>
      verifyFeatureListing(
        listing.replace(`${feature} stable false`, `${feature} stable true`),
      ),
    ).toThrow();
  expect(() =>
    verifyFeatureListing(listing.replace("shell_tool stable false", "")),
  ).toThrow();
});
it("rejects provider event streams with execution, tools, failure, missing completion or unknown item kinds", () => {
  const valid = [
    { type: "thread.started", thread_id: "proof" },
    { type: "item.completed", item: { type: "agent_message", text: "{}" } },
    {
      type: "turn.completed",
      usage: { input_tokens: 5, output_tokens: 10, cached_input_tokens: 0 },
    },
  ];
  expect(acceptEvents(valid)).toBe(true);
  for (const item of [
    "command_execution",
    "mcp_tool_call",
    "web_search",
    "file_change",
    "unknown",
  ])
    expect(() =>
      acceptEvents([
        ...valid,
        { type: "item.completed", item: { type: item } },
      ]),
    ).toThrow();
  expect(() => acceptEvents([])).toThrow();
  expect(() => acceptEvents([{ type: "turn.failed" }])).toThrow();
});
