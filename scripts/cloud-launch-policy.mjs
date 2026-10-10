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
    compatibility_date: base.compatibility_date,
    assets: {
      directory: "./dist",
      binding: "ASSETS",
      not_found_handling: "single-page-application",
      run_worker_first: true,
    },
    workers_dev: true,
    observability: { enabled: false },
  };
}
export function assertDatabaseBinding(config) {
  const db = config.d1_databases?.find((d) => d.binding === "DB");
  if (
    !db ||
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
