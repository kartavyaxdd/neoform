export function cloudLaunchEnvironment(parent) {
  const env = {};
  for (const key of Object.keys(parent)) {
    if (/^(WRANGLER_|SINGLE_USER_|GEMINI_|AI_|SIDECAR_|LOCAL_|NEOFORM_)/i.test(key) ||
        /^(NODE_OPTIONS|NODE_DEBUG|SSLKEYLOGFILE|CLOUDFLARE_ENV|CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV)$/i.test(key)) continue;
    env[key] = parent[key];
  }
  return { ...env, CI: "1", WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false", WRANGLER_LOG_SANITIZE: "true", WRANGLER_LOG: "log", CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" };
}

export function parseLaunchArguments(args) {
  const options = { dryRun: false, provision: false, accountId: undefined, check: false, login: false };
  const flags = { "--dry-run": "dryRun", "--provision-master": "provision", "--check": "check", "--login": "login" };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag)) throw new Error("Duplicate launch flag.");
    seen.add(flag);
    if (flag === "--account-id") {
      options.accountId = args[++i];
      if (!/^[a-f0-9]{32}$/i.test(options.accountId || "")) throw new Error("Invalid account-id argument.");
    } else if (flags[flag]) options[flags[flag]] = true;
    else throw new Error("Unsupported launch argument; local/proxy/sidecar and Wrangler overrides are forbidden.");
  }
  if (options.check && (options.provision || options.dryRun || options.login))
    throw new Error("Check mode cannot be combined with other modes.");
  return options;
}

export function selectAccount(info, requested) {
  if (!info?.loggedIn)
    throw new Error(
      "Cloudflare login required. Run wrangler login in your own browser.",
    );
  if (
    String(info.authType || "")
      .toLowerCase()
      .includes("temporary")
  )
    throw new Error("Temporary preview accounts are not permanent hosting.");
  const accounts = info.accounts || [];
  const chosen = requested
    ? accounts.find((a) => a.id === requested)
    : accounts.length === 1
      ? accounts[0]
      : null;
  if (!chosen)
    throw new Error(
      "Choose your authorized account with --account-id; no account was selected automatically.",
    );
  if (!/^[a-f0-9]{32}$/i.test(chosen.id))
    throw new Error("Invalid account-id.");
  return chosen.id;
}
export function productionConfig(base, accountId, suffix) {
  if (!/^[a-f0-9]{32}$/i.test(accountId) || !/^[a-f0-9]{10}$/i.test(suffix))
    throw new Error("Invalid production namespace.");
  return {
    name: "neoform-" + suffix,
    account_id: accountId,
    main: "worker/index.ts",
    alias: { "./ai-local": "./worker/ai-disabled.ts" },
    compatibility_date: base.compatibility_date,
    assets: {
      directory: "./dist",
      binding: "ASSETS",
      not_found_handling: "single-page-application",
      run_worker_first: true,
    },
    secrets: { required: ["GEMINI_KEY_MASTER"] },
    workers_dev: true,
    observability: { enabled: false },
  };
}
export function assertAiDeployment(config) {
  const allowed = new Set(["name", "account_id", "main", "alias", "compatibility_date", "assets", "secrets", "workers_dev", "observability", "d1_databases", "$schema"]);
  if (
    Object.keys(config).some((key) => !allowed.has(key)) ||
    !/^neoform-[a-f0-9]{10}$/.test(config.name || "") ||
    !/^[a-f0-9]{32}$/i.test(config.account_id || "") ||
    config.workers_dev !== true ||
    JSON.stringify(config.observability) !== JSON.stringify({ enabled: false }) ||
    JSON.stringify(config.assets) !== JSON.stringify({ directory: "./dist", binding: "ASSETS", not_found_handling: "single-page-application", run_worker_first: true }) ||
    config.main !== "worker/index.ts" ||
    JSON.stringify(config.alias) !== JSON.stringify({ "./ai-local": "./worker/ai-disabled.ts" }) ||
    JSON.stringify(config.secrets) !== JSON.stringify({ required: ["GEMINI_KEY_MASTER"] })
  )
    throw new Error(
      "Production configuration rejects vars, local/proxy/sidecar flags and overrides; requires the safe AI alias and GEMINI_KEY_MASTER secret name (never its value).",
    );
  if (config.d1_databases !== undefined) assertDatabaseBinding(config);
}
export function assertRemoteDatabase(config, records) {
  const db = assertDatabaseBinding(config);
  if (!Array.isArray(records) || records.filter((row) => row.uuid === db.database_id && row.name === db.database_name).length !== 1)
    throw new Error("Remote database ID/name does not match this installation; no migrations permitted.");
  return db;
}

export function assertDatabaseBinding(config) {
  const db = config.d1_databases?.find((d) => d.binding === "DB");
  if (
    !db ||
    config.d1_databases.length !== 1 ||
    !/^neoform-[a-f0-9]{10}$/.test(config.name) ||
    db.database_name !== config.name + "-data" ||
    (db.migrations_dir !== undefined && db.migrations_dir !== "migrations") ||
    Object.keys(db).some((key) => !["binding", "database_id", "database_name", "migrations_dir"].includes(key)) ||
    !/^([a-f0-9]{8}-){1}[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      db.database_id,
    ) ||
    db.database_id.startsWith("00000000-0000-0000-0000-")
  )
    throw new Error(
      "A real cloud database binding is required; placeholder IDs are not deployable.",
    );
  return db;
}
