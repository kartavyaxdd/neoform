export const disabledFeatures = [
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
  "code_mode",
  "goals",
  "memories",
  "shell_snapshot",
  "workspace_dependencies",
  "tool_suggest",
  "realtime_conversation",
  "in_app_browser",
  "in_app_chat",
  "in_app_local_automation",
  "standalone_web_search",
  "default_mode_request_user_input",
  "request_permissions_tool",
  "deferred_executor",
  "current_time_reminder",
  "token_budget",
  "send_message_to_user_async",
  "auth_elicitation",
  "tool_call_mcp_elicitation",
];
// Source pinned to rust-v0.160.0: protocol/src/openai_models.rs and
// core/src/tools/spec_plan.rs. The registry checks Disabled for shell and
// is_some() for apply_patch; direct mode cannot synthesize code-mode tools.
export function restrictedModelCatalog() {
  return {
    models: [
      {
        slug: "gpt-6.1-sol",
        display_name: "NEOFORM structured generation",
        description: "Tool-free structured training plan",
        default_reasoning_level: "high",
        supported_reasoning_levels: [{ effort: "high", description: "High" }],
        shell_type: "disabled",
        visibility: "list",
        supported_in_api: true,
        priority: 1,
        support_verbosity: true,
        default_verbosity: "low",
        apply_patch_tool_type: null,
        truncation_policy: { mode: "tokens", limit: 6000 },
        context_window: 32000,
        experimental_supported_tools: [],
        input_modalities: ["text"],
        supports_search_tool: false,
        include_skills_usage_instructions: false,
        include_plugin_usage_instructions: false,
        include_apps_usage_instructions: false,
        tool_mode: "direct",
        multi_agent_version: null,
        use_responses_lite: true,
        node_repl_disabled: true,
        supports_reasoning_effort_updates: true,
        model_messages: {
          instructions_template:
            "You produce bounded exercise program JSON. Use only the supplied known exercise catalog. You have no tools. Return only the requested schema. Never diagnose or prescribe around pain. Use conservative training targets.",
        },
      },
    ],
  };
}
export function verifyFeatureListing(listing) {
  const states = new Map(
    listing
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        return [parts[0], parts.at(-1)];
      }),
  );
  const forcedFeatures = [];
  for (const feature of disabledFeatures) {
    // 0.160.0 core/src/config/managed_features.rs normalizes UnifiedExec to
    // true. That implementation registers NO shell tools when ShellTool is
    // false OR model.shell_type is Disabled (tools/spec_plan.rs).
    if (
      feature === "unified_exec" &&
      states.get(feature) === "true" &&
      states.get("shell_tool") === "false" &&
      restrictedModelCatalog().models[0].shell_type === "disabled"
    ) {
      forcedFeatures.push(feature);
      continue;
    }
    if (states.get(feature) !== "false")
      throw new Error(
        "Execution feature remains enabled or unavailable: " + feature,
      );
  }
  return {
    forcedFeatures,
    disabledFeatures: disabledFeatures.filter(
      (feature) => !forcedFeatures.includes(feature),
    ),
  };
}
export function reservation(account) {
  return {
    account,
    cancelled: false,
    cancel() {
      this.cancelled = true;
    },
  };
}
export function generationArgs(dir, schema, catalog) {
  return [
    "exec",
    "--strict-config",
    "--model",
    "gpt-6.1-sol",
    "--ignore-user-config",
    "--ignore-rules",
    "--ephemeral",
    "--json",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--cd",
    dir,
    "--output-schema",
    schema,
    "--color",
    "never",
    ...disabledFeatures.flatMap((f) => ["--disable", f]),
    "-c",
    'model_reasoning_effort="high"',
    "-c",
    "suppress_unstable_features_warning=true",
    "-c",
    'web_search="disabled"',
    "-c",
    "mcp_servers={}",
    "-c",
    "plugins={}",
    "-c",
    "skills.bundled.enabled=false",
    "-c",
    "skills.include_instructions=false",
    "-c",
    "cloud.skills.enabled=false",
    "-c",
    "features.skip_host_skill_discovery=true",
    "-c",
    "tools.update_plan.enabled=false",
    "-c",
    "tools.experimental_request_user_input.enabled=false",
    "-c",
    "project_doc_max_bytes=0",
    "-c",
    'project_root_markers=[".git"]',
    "-c",
    'model_provider="openai"',
    "-c",
    'openai_base_url="https://api.openai.com/v1"',
    "-c",
    'chatgpt_base_url="https://chatgpt.com/backend-api/"',
    "-c",
    "notify=[]",
    "-c",
    'developer_instructions=""',
    "-c",
    "model_instructions_file=" +
      JSON.stringify(dir.replace(/\\/g, "/") + "/instructions.txt"),
    "-c",
    "skills.config=[]",
    "-c",
    "include_environment_context=false",
    "-c",
    "model_catalog_json=" + JSON.stringify(catalog),
    "-",
  ];
}
export function acceptEvents(events) {
  let completion = false,
    final = false;
  for (const event of events) {
    if (
      ![
        "thread.started",
        "turn.started",
        "item.started",
        "item.updated",
        "item.completed",
        "turn.completed",
      ].includes(event.type)
    )
      throw new Error("Provider returned a failure or unknown event.");
    if (event.item) {
      if (!["reasoning", "agent_message"].includes(event.item.type))
        throw new Error("Provider attempted a tool call.");
      if (
        event.type === "item.completed" &&
        event.item.type === "agent_message"
      )
        final = true;
    }
    if (event.type === "turn.completed") {
      if (!event.usage || event.usage.output_tokens <= 0)
        throw new Error("Missing provider usage.");
      completion = true;
    }
  }
  if (!completion || !final) throw new Error("Incomplete provider response.");
  return true;
}
