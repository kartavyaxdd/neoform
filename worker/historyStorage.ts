import { z } from "zod";
import { emptyState, stateSchema, MAX_BACKUP } from "../src/domain";
import {
  headerOf,
  storageCommit,
  storageUpload,
  storagePart,
  storageHash,
  validateHistoryRecord,
  textBytes,
  type StateHeader,
  type HistoryPart,
  type StorageCommit,
} from "../src/storageProtocol";

export class HistoryFault extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
type Head = {
  revision: number;
  body: string;
  session_count: number;
  coaching_count: number;
};
type Upload = {
  revision: number;
  session_count: number;
  part_count: number;
  checksum: string;
  hash: string;
  coaching_count: number | null;
};
const json = (value: unknown, status = 200) => Response.json(value, { status });
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new HistoryFault(
      400,
      result.error.issues[0]?.message || "Invalid storage request.",
    );
  return result.data;
}

// All data SQL is scoped to one authenticated owner. The per-invocation attempt
// token is deliberately different from the retryable client operation ID.
export class HistoryStorage {
  readonly owner: string;
  constructor(
    private db: D1Database,
    private user: string | null,
  ) {
    this.owner = user === null ? "public-workspace" : `user:${user}`;
  }
  private query(sql: string, ...args: (string | number | null)[]) {
    return this.db.prepare(sql).bind(...args);
  }
  async upgraded() {
    return !!(await this.query(
      "SELECT 1 AS present FROM storage_heads WHERE owner=?",
      this.owner,
    ).first());
  }
  async ensure() {
    if (await this.upgraded()) return;
    for (let retry = 0; retry < 3; retry++) {
      if (this.user === null)
        await this.query(
          "INSERT INTO public_workspace(id,revision,body,updated_at) VALUES (1,0,?,?) ON CONFLICT(id) DO NOTHING",
          JSON.stringify(emptyState()),
          Date.now(),
        ).run();
      const source =
        this.user === null
          ? "public_workspace WHERE id=1"
          : "account_data WHERE user_id=?";
      const args = this.user === null ? [] : [this.user];
      const row = await this.query(
        `SELECT revision,body FROM ${source}`,
        ...args,
      ).first<{ revision: number; body: string }>();
      if (!row) throw new HistoryFault(404, "Account data not found.");
      // Validate without filling in, guessing or rewriting historical observations.
      const state = parse(stateSchema, JSON.parse(row.body));
      const attempt = crypto.randomUUID();
      await this.db.batch([
        this.query(
          `INSERT INTO storage_heads(owner,private_user,revision,body,session_count,attempt,coaching_count)
          SELECT ?,?,?,?,?,?,? FROM ${source} AND revision=? ON CONFLICT(owner) DO NOTHING`,
          this.owner,
          this.user,
          row.revision,
          JSON.stringify(headerOf(state)),
          state.sessions.length,
          attempt,
          state.coachingEvents?.length ?? 0,
          ...args,
          row.revision,
        ),
        this.query(
          `INSERT INTO storage_history(owner,id,position,body)
          SELECT ?,json_extract(value,'$.id'),CAST(key AS INTEGER),value FROM json_each(?)
          WHERE EXISTS(SELECT 1 FROM storage_heads WHERE owner=? AND attempt=?)`,
          this.owner,
          JSON.stringify(state.sessions),
          this.owner,
          attempt,
        ),
        this.query(
          `INSERT INTO storage_coaching(owner,id,position,body)
          SELECT ?,json_extract(value,'$.id'),CAST(key AS INTEGER),value FROM json_each(?)
          WHERE EXISTS(SELECT 1 FROM storage_heads WHERE owner=? AND attempt=?)`,
          this.owner,
          JSON.stringify(state.coachingEvents ?? []),
          this.owner,
          attempt,
        ),
      ]);
      if (await this.upgraded()) return;
    }
    throw new HistoryFault(
      409,
      "Data changed during migration. Retry with the current version.",
    );
  }
  private async head() {
    const head = await this.query(
      "SELECT revision,body,session_count,coaching_count FROM storage_heads WHERE owner=?",
      this.owner,
    ).first<Head>();
    if (!head) throw new HistoryFault(404, "Storage unavailable.");
    return head;
  }
  private async receipt(id: string, hash?: string) {
    const row = await this.query(
      "SELECT revision,hash FROM storage_receipts WHERE owner=? AND id=?",
      this.owner,
      id,
    ).first<{ revision: number; hash: string }>();
    if (row && hash !== undefined && row.hash !== hash)
      throw new HistoryFault(
        422,
        "This operation ID already belongs to different changes.",
      );
    return row;
  }
  private checkRecords(part: HistoryPart, header: StateHeader) {
    try {
      for (const r of part.upserts) validateHistoryRecord(r.session, header);
    } catch (e) {
      throw new HistoryFault(400, (e as Error).message);
    }
  }
  // A source is either bounded request JSON or rows from one staged upload.
  // Only changed IDs are examined on the normal save path.
  private source(part: HistoryPart | string) {
    if (typeof part === "string")
      return {
        sql: "SELECT id,action,position,body FROM storage_upload_records WHERE owner=? AND upload=?",
        args: [this.owner, part] as (string | number | null)[],
      };
    // Keep nested sessions as JSON, not double-escaped JSON strings. A valid
    // request must not grow past D1's binding limit when notes contain quotes.
    return {
      sql: `SELECT
        CASE root.key WHEN 'upserts' THEN json_extract(r.value,'$.session.id') ELSE r.value END id,
        CASE root.key WHEN 'upserts' THEN 'upsert' ELSE 'delete' END action,
        CASE root.key WHEN 'upserts' THEN json_extract(r.value,'$.position') ELSE NULL END position,
        CASE root.key WHEN 'upserts' THEN json_extract(r.value,'$.session') ELSE NULL END body
        FROM json_each(?) root,json_each(root.value) r WHERE root.key IN ('upserts','deletes')`,
      args: [JSON.stringify(part)],
    };
  }
  private coachingSource(part: HistoryPart | string) {
    if (typeof part === "string")
      return {
        sql: "SELECT id,action,position,body FROM storage_upload_coaching WHERE owner=? AND upload=?",
        args: [this.owner, part] as (string | number | null)[],
      };
    return {
      sql: `SELECT
      CASE root.key WHEN 'coachingUpserts' THEN json_extract(r.value,'$.event.id') ELSE r.value END id,
      CASE root.key WHEN 'coachingUpserts' THEN 'upsert' ELSE 'delete' END action,
      CASE root.key WHEN 'coachingUpserts' THEN json_extract(r.value,'$.position') ELSE NULL END position,
      CASE root.key WHEN 'coachingUpserts' THEN json_extract(r.value,'$.event') ELSE NULL END body
      FROM json_each(?) root,json_each(root.value) r WHERE root.key IN ('coachingUpserts','coachingDeletes')`,
      args: [JSON.stringify(part)],
    };
  }
  private async validateCoaching(
    head: Head,
    count: number | undefined,
    part: HistoryPart | string,
  ) {
    const s = this.coachingSource(part),
      prefix = `WITH changed AS (${s.sql}) `;
    if (count === undefined) {
      if (
        await this.query(`SELECT id FROM (${s.sql}) LIMIT 1`, ...s.args).first()
      )
        throw new HistoryFault(
          400,
          "A coaching mutation requires its final record count",
        );
      return;
    }
    const results = await this.db.batch([
      this.query(
        prefix +
          `SELECT COALESCE(SUM(CASE WHEN c.action='upsert' AND h.id IS NULL THEN 1 WHEN c.action='delete' AND h.id IS NOT NULL THEN -1 ELSE 0 END),0) delta,
        COALESCE(SUM(CASE WHEN c.action='upsert' AND (c.position<0 OR c.position>=?) THEN 1 ELSE 0 END),0) invalid
        FROM changed c LEFT JOIN storage_coaching h ON h.owner=? AND h.id=c.id`,
        ...s.args,
        count,
        this.owner,
      ),
      this.query(
        prefix +
          "SELECT position FROM changed WHERE action='upsert' GROUP BY position HAVING COUNT(*)>1 LIMIT 1",
        ...s.args,
      ),
      this.query(
        prefix +
          `SELECT h.id FROM changed c JOIN storage_coaching h ON h.owner=? AND h.position=c.position
        WHERE c.action='upsert' AND NOT EXISTS(SELECT 1 FROM changed x WHERE x.id=h.id) LIMIT 1`,
        ...s.args,
        this.owner,
      ),
      this.query(
        prefix +
          `SELECT h.id FROM storage_coaching h WHERE h.owner=? AND h.position>=?
        AND NOT EXISTS(SELECT 1 FROM changed c WHERE c.id=h.id) LIMIT 1`,
        ...s.args,
        this.owner,
        count,
      ),
      this.query(
        prefix +
          `SELECT h.id FROM changed c JOIN storage_coaching h ON h.owner=? AND h.id=c.id
        WHERE c.action='upsert' AND h.body<>c.body LIMIT 1`,
        ...s.args,
        this.owner,
      ),
    ]);
    const totals = results[0].results[0] as { delta: number; invalid: number };
    if (
      head.coaching_count + totals.delta !== count ||
      totals.invalid ||
      results.slice(1).some((r) => r.results.length)
    )
      throw new HistoryFault(
        400,
        "Coaching ledger count, ordering or immutable content differs",
      );
  }
  private async validateFinal(
    head: Head,
    header: StateHeader,
    count: number,
    part: HistoryPart | string,
  ) {
    const s = this.source(part),
      prefix = `WITH changed AS (${s.sql}) `;
    const results = await this.db.batch([
      this.query(
        prefix +
          `SELECT
        COALESCE(SUM(CASE WHEN c.action='upsert' AND h.id IS NULL THEN 1 WHEN c.action='delete' AND h.id IS NOT NULL THEN -1 ELSE 0 END),0) delta,
        COALESCE(SUM(CASE WHEN c.action='upsert' AND (c.position<0 OR c.position>=?) THEN 1 ELSE 0 END),0) invalid
        FROM changed c LEFT JOIN storage_history h ON h.owner=? AND h.id=c.id`,
        ...s.args,
        count,
        this.owner,
      ),
      this.query(
        prefix +
          "SELECT position FROM changed WHERE action='upsert' GROUP BY position HAVING COUNT(*)>1 LIMIT 1",
        ...s.args,
      ),
      this.query(
        prefix +
          `SELECT h.id FROM changed c JOIN storage_history h ON h.owner=? AND h.position=c.position
        WHERE c.action='upsert' AND NOT EXISTS(SELECT 1 FROM changed x WHERE x.id=h.id) LIMIT 1`,
        ...s.args,
        this.owner,
      ),
      this.query(
        prefix +
          `SELECT h.id FROM storage_history h WHERE h.owner=? AND h.position>=?
        AND NOT EXISTS(SELECT 1 FROM changed c WHERE c.id=h.id) LIMIT 1`,
        ...s.args,
        this.owner,
        count,
      ),
    ]);
    const totals = results[0].results[0] as { delta: number; invalid: number };
    if (
      head.session_count + totals.delta !== count ||
      totals.invalid ||
      results.slice(1).some((r) => r.results.length)
    )
      throw new HistoryFault(
        400,
        "History count or ordering does not match the proposed changes.",
      );
    const old = JSON.parse(head.body) as StateHeader;
    const remaining = new Set(header.customExercises.map((e) => e.id));
    const removed = old.customExercises
      .filter((e) => !remaining.has(e.id))
      .map((e) => e.id);
    if (removed.length) {
      const dangling = await this.query(
        prefix +
          `SELECT h.id FROM storage_history h,json_each(h.body,'$.exercises') e
        WHERE h.owner=? AND json_extract(e.value,'$.exerciseId') IN (SELECT value FROM json_each(?))
        AND NOT EXISTS(SELECT 1 FROM changed c WHERE c.id=h.id) LIMIT 1`,
        ...s.args,
        this.owner,
        JSON.stringify(removed),
      ).first();
      if (dangling)
        throw new HistoryFault(
          400,
          "An exercise is still referenced by workout history.",
        );
    }
  }
  private async commit(
    id: string,
    revision: number,
    header: StateHeader,
    count: number,
    part: HistoryPart | string,
    hash: string,
    coachingCount?: number,
  ) {
    const prior = await this.receipt(id, hash);
    if (prior) return json({ revision: prior.revision });
    const head = await this.head();
    if (head.revision !== revision) {
      const raced = await this.receipt(id, hash);
      if (raced) return json({ revision: raced.revision });
      throw new HistoryFault(
        409,
        "Another device changed the data. Reload before retrying.",
      );
    }
    await this.validateFinal(head, header, count, part);
    await this.validateCoaching(head, coachingCount, part);
    const attempt = crypto.randomUUID(),
      s = this.source(part),
      events = this.coachingSource(part);
    const guard =
      "EXISTS(SELECT 1 FROM storage_heads WHERE owner=? AND attempt=?)";
    const result = await this.db.batch([
      this.query(
        "UPDATE storage_heads SET revision=revision+1,body=?,session_count=?,attempt=?,coaching_count=COALESCE(?,coaching_count) WHERE owner=? AND revision=?",
        JSON.stringify(header),
        count,
        attempt,
        coachingCount ?? null,
        this.owner,
        revision,
      ),
      this.query(
        `WITH changed AS (${s.sql}) DELETE FROM storage_history WHERE owner=? AND id IN (SELECT id FROM changed WHERE action='delete') AND ${guard}`,
        ...s.args,
        this.owner,
        this.owner,
        attempt,
      ),
      this.query(
        `INSERT INTO storage_history(owner,id,position,body) SELECT ?,id,position,body FROM (${s.sql}) WHERE action='upsert' AND ${guard}
        ON CONFLICT(owner,id) DO UPDATE SET position=excluded.position,body=excluded.body`,
        this.owner,
        ...s.args,
        this.owner,
        attempt,
      ),
      this.query(
        `INSERT INTO storage_receipts(owner,id,revision,hash) SELECT ?,?,?,? WHERE ${guard}`,
        this.owner,
        id,
        revision + 1,
        hash,
        this.owner,
        attempt,
      ),
      this.query(
        `WITH changed AS (${events.sql}) DELETE FROM storage_coaching WHERE owner=? AND id IN (SELECT id FROM changed WHERE action='delete') AND ${guard}`,
        ...events.args,
        this.owner,
        this.owner,
        attempt,
      ),
      this.query(
        `INSERT INTO storage_coaching(owner,id,position,body) SELECT ?,id,position,body FROM (${events.sql}) WHERE action='upsert' AND ${guard}
        ON CONFLICT(owner,id) DO UPDATE SET position=excluded.position`,
        this.owner,
        ...events.args,
        this.owner,
        attempt,
      ),
      ...(typeof part === "string"
        ? [
            this.query(
              `DELETE FROM storage_uploads WHERE owner=? AND id=? AND ${guard}`,
              this.owner,
              part,
              this.owner,
              attempt,
            ),
          ]
        : []),
    ]);
    if (!result[0].meta.changes) {
      const receipt = await this.receipt(id, hash);
      if (receipt) return json({ revision: receipt.revision });
      throw new HistoryFault(
        409,
        "Another device changed the data. Reload before retrying.",
      );
    }
    return json({ revision: revision + 1 });
  }
  async route(req: Request, readBody: (req: Request) => Promise<unknown>) {
    const url = new URL(req.url),
      path = url.pathname.replace("/api/storage", "");
    if (path === "/revision" && req.method === "GET") {
      await this.ensure();
      const row = await this.query(
        "SELECT revision FROM storage_heads WHERE owner=?",
        this.owner,
      ).first<{ revision: number }>();
      return json(row);
    }
    if (path === "/head" && req.method === "GET") {
      await this.ensure();
      const h = await this.head();
      return json({
        revision: h.revision,
        header: JSON.parse(h.body),
        count: h.session_count,
        ...(h.coaching_count ? { coachingCount: h.coaching_count } : {}),
      });
    }
    if ((path === "/history" || path === "/coaching") && req.method === "GET") {
      const table =
        path === "/coaching" ? "storage_coaching" : "storage_history";
      const revision = Number(url.searchParams.get("revision")),
        after = Number(url.searchParams.get("after") ?? -1);
      if (
        !url.searchParams.has("revision") ||
        !Number.isSafeInteger(revision) ||
        revision < 0 ||
        !Number.isSafeInteger(after) ||
        after < -1
      )
        throw new HistoryFault(400, "Invalid history cursor.");
      await this.ensure();
      const metadata = await this.db.batch([
        this.query(
          "SELECT revision FROM storage_heads WHERE owner=?",
          this.owner,
        ),
        this.query(
          `SELECT id,position,length(CAST(body AS BLOB)) bytes FROM ${table} WHERE owner=? AND position>? ORDER BY position,id LIMIT 32`,
          this.owner,
          after,
        ),
      ]);
      if (
        (metadata[0].results[0] as { revision: number })?.revision !== revision
      )
        throw new HistoryFault(
          409,
          "History changed. Restart from the current head.",
        );
      const rows = {
        results: metadata[1].results as {
          id: string;
          position: number;
          bytes: number;
        }[],
      };
      let bytes = 256;
      const selected: typeof rows.results = [];
      for (const r of rows.results) {
        if (selected.length && bytes + r.bytes + 128 > MAX_BACKUP) break;
        selected.push(r);
        bytes += r.bytes + 128;
      }
      const results = await this.db.batch([
        this.query(
          "SELECT revision FROM storage_heads WHERE owner=?",
          this.owner,
        ),
        this.query(
          `SELECT id,position,body FROM ${table} WHERE owner=? AND id IN (SELECT value FROM json_each(?)) ORDER BY position,id`,
          this.owner,
          JSON.stringify(selected.map((r) => r.id)),
        ),
      ]);
      if (
        (results[0].results[0] as { revision: number })?.revision !== revision
      )
        throw new HistoryFault(
          409,
          "History changed. Restart from the current head.",
        );
      const records = (
        results[1].results as { position: number; body: string }[]
      ).map((r) => ({
        position: r.position,
        [path === "/coaching" ? "event" : "session"]: JSON.parse(r.body),
      }));
      return json({
        records,
        next: selected.length ? selected[selected.length - 1].position : null,
      });
    }
    if (path === "/commit" && req.method === "POST") {
      const input: StorageCommit = parse(storageCommit, await readBody(req));
      this.checkRecords(input.changes, input.header);
      await this.ensure();
      return this.commit(
        input.id,
        input.revision,
        input.header,
        input.count,
        input.changes,
        await storageHash(input),
        input.coachingCount,
      );
    }
    if (path === "/uploads" && req.method === "POST") {
      const input = parse(storageUpload, await readBody(req)),
        hash = await storageHash(input);
      await this.ensure();
      const receipt = await this.receipt(input.id, hash);
      if (receipt) return json({ revision: receipt.revision }, 200);
      if ((await this.head()).revision !== input.revision)
        throw new HistoryFault(409, "Data changed before upload.");
      // Expired staging is disposable; visible history and receipts are retained.
      await this.query(
        "DELETE FROM storage_uploads WHERE owner=? AND created_at<?",
        this.owner,
        Date.now() - 86400000,
      ).run();
      const active = await this.query(
        "SELECT COUNT(*) count FROM storage_uploads WHERE owner=?",
        this.owner,
      ).first<{ count: number }>();
      const existing = await this.query(
        "SELECT hash FROM storage_uploads WHERE owner=? AND id=?",
        this.owner,
        input.id,
      ).first<{ hash: string }>();
      if (existing && existing.hash !== hash)
        throw new HistoryFault(422, "Upload ID belongs to a different plan.");
      if (!existing && (active?.count ?? 0) >= 4)
        throw new HistoryFault(
          429,
          "Finish an existing upload before starting another.",
        );
      await this.db.batch([
        this.query(
          "INSERT INTO storage_uploads(owner,id,revision,session_count,part_count,checksum,hash,created_at,coaching_count) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM storage_uploads WHERE owner=?)<4 ON CONFLICT(owner,id) DO NOTHING",
          this.owner,
          input.id,
          input.revision,
          input.count,
          input.parts,
          input.checksum,
          hash,
          Date.now(),
          input.coachingCount ?? null,
          this.owner,
        ),
        this.query(
          "INSERT INTO storage_upload_headers(owner,upload,body) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM storage_uploads WHERE owner=? AND id=? AND hash=?) ON CONFLICT(owner,upload) DO NOTHING",
          this.owner,
          input.id,
          JSON.stringify(input.header),
          this.owner,
          input.id,
          hash,
        ),
      ]);
      const stored = await this.query(
        "SELECT hash FROM storage_uploads WHERE owner=? AND id=?",
        this.owner,
        input.id,
      ).first<{ hash: string }>();
      if (!stored)
        throw new HistoryFault(
          429,
          "Finish an existing upload before starting another.",
        );
      if (stored.hash !== hash)
        throw new HistoryFault(422, "Upload ID belongs to a different plan.");
      return json({ id: input.id }, 201);
    }
    const deletion = path.match(/^\/uploads\/([a-f0-9-]{36})$/);
    if (deletion && req.method === "DELETE") {
      const id = parse(z.uuid(), deletion[1]);
      await this.query(
        "DELETE FROM storage_uploads WHERE owner=? AND id=?",
        this.owner,
        id,
      ).run();
      return json({ ok: true });
    }
    const match = path.match(
      /^\/uploads\/([a-f0-9-]{36})\/(parts\/(\d+)|commit)$/,
    );
    if (match) {
      const id = parse(z.uuid(), match[1]);
      if (match[2] === "commit" && req.method === "POST") {
        const prior = await this.receipt(id);
        if (prior) return json({ revision: prior.revision });
      }
      const upload = await this.query(
        "SELECT revision,session_count,part_count,checksum,hash,coaching_count FROM storage_uploads WHERE owner=? AND id=?",
        this.owner,
        id,
      ).first<Upload>();
      if (!upload) throw new HistoryFault(404, "Upload not found or expired.");
      const stored = await this.query(
        "SELECT body FROM storage_upload_headers WHERE owner=? AND upload=?",
        this.owner,
        id,
      ).first<{ body: string }>();
      if (!stored)
        throw new HistoryFault(409, "Upload metadata is incomplete.");
      const header = JSON.parse(stored.body) as StateHeader;
      if (match[3] !== undefined && req.method === "PUT") {
        const index = Number(match[3]);
        if (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index >= upload.part_count
        )
          throw new HistoryFault(400, "Invalid upload part.");
        const input = parse(storagePart, await readBody(req)),
          hash = await storageHash(input);
        this.checkRecords(input, header);
        const prior = await this.query(
          "SELECT hash FROM storage_upload_parts WHERE owner=? AND upload=? AND part=?",
          this.owner,
          id,
          index,
        ).first<{ hash: string }>();
        if (prior) {
          if (prior.hash !== hash)
            throw new HistoryFault(
              422,
              "Part already contains different records.",
            );
          return json({ ok: true });
        }
        const source = this.source(input),
          eventSource = this.coachingSource(input);
        try {
          await this.db.batch([
            this.query(
              "INSERT INTO storage_upload_parts(owner,upload,part,hash,bytes,records) VALUES(?,?,?,?,?,?)",
              this.owner,
              id,
              index,
              hash,
              textBytes(input),
              input.upserts.length +
                input.deletes.length +
                (input.coachingUpserts?.length ?? 0) +
                (input.coachingDeletes?.length ?? 0),
            ),
            this.query(
              `INSERT INTO storage_upload_records(owner,upload,id,action,position,body) SELECT ?,?,id,action,position,body FROM (${source.sql})`,
              this.owner,
              id,
              ...source.args,
            ),
            this.query(
              `INSERT INTO storage_upload_coaching(owner,upload,id,action,position,body) SELECT ?,?,id,action,position,body FROM (${eventSource.sql})`,
              this.owner,
              id,
              ...eventSource.args,
            ),
          ]);
        } catch (e) {
          const raced = await this.query(
            "SELECT hash FROM storage_upload_parts WHERE owner=? AND upload=? AND part=?",
            this.owner,
            id,
            index,
          ).first<{ hash: string }>();
          if (raced?.hash === hash) return json({ ok: true });
          if (!raced) {
            if (String(e).includes("neoform_staging_quota"))
              throw new HistoryFault(
                413,
                "Pending uploads exceed the 100 MB or 100000 record staging budget. Finish or cancel an existing upload.",
              );
          }
          throw new HistoryFault(
            422,
            "Duplicate records or conflicting upload part. Restart this upload.",
          );
        }
        return json({ ok: true });
      }
      if (match[2] === "commit" && req.method === "POST") {
        const parts = await this.query(
          "SELECT part,hash FROM storage_upload_parts WHERE owner=? AND upload=? ORDER BY part",
          this.owner,
          id,
        ).all<{ part: number; hash: string }>();
        if (
          parts.results.length !== upload.part_count ||
          (await storageHash(parts.results.map((p) => p.hash))) !==
            upload.checksum
        )
          throw new HistoryFault(
            409,
            "Upload is incomplete or its checksum differs. Current data is unchanged.",
          );
        return this.commit(
          id,
          upload.revision,
          header,
          upload.session_count,
          id,
          upload.hash,
          upload.coaching_count ?? undefined,
        );
      }
    }
    throw new HistoryFault(404, "Storage route not found.");
  }
}
