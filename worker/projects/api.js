import { getSession, readSessionCookie } from "../auth/session.js";

const MAX_BODY_BYTES = 262144;
const MAX_HTML_CHARS = 200000;
const PAGE_SIZE = 50;
const ID_RE = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const CURSOR_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\|([0-9a-f-]{36})$/i;
const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

// Leitura incremental evita carregar corpos arbitrariamente grandes na memoria.
async function readPayload(request) {
  if (!/\bapplication\/json\b/i.test(request.headers.get("content-type") || "")) {
    return { error: json({ erro: "JSON obrigatório." }, 415) };
  }
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
    return { error: json({ erro: "Projeto muito grande." }, 413) };
  }
  let size = 0;
  let text = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    if (!request.body) return { error: json({ erro: "JSON inválido." }, 400) };
    const reader = request.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return { error: json({ erro: "Projeto muito grande." }, 413) };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { error: json({ erro: "Dados do projeto inválidos." }, 400) };
    }
    if (Object.keys(data).some(key => key !== "name" && key !== "html" && key !== "expectedRevision")) {
      return { error: json({ erro: "Campos não permitidos." }, 400) };
    }
    if (typeof data.name !== "string" || !data.name.trim() || data.name.trim().length > 80 ||
        typeof data.html !== "string" || !data.html.trim() || data.html.length > MAX_HTML_CHARS) {
      return { error: json({ erro: "Nome ou HTML inválido." }, 400) };
    }
    return { data: { name: data.name.trim(), html: data.html, expectedRevision: data.expectedRevision } };
  } catch {
    return { error: json({ erro: "JSON inválido." }, 400) };
  }
}

function projectRows(db, userId, cursor) {
  const fields = "SELECT id, name, created_at AS createdAt, updated_at AS updatedAt FROM projects WHERE user_id = ?";
  if (!cursor) {
    return db.prepare(fields + " ORDER BY updated_at DESC, id DESC LIMIT 51").bind(userId).all();
  }
  return db.prepare(fields +
    " AND (updated_at < ? OR (updated_at = ? AND id < ?))" +
    " ORDER BY updated_at DESC, id DESC LIMIT 51"
  ).bind(userId, cursor[1], cursor[1], cursor[2]).all();
}

async function selectOwned(db, userId, id) {
  return db.prepare(
    "SELECT id, name, html, revision, created_at AS createdAt, updated_at AS updatedAt" +
    " FROM projects WHERE user_id = ? AND id = ? LIMIT 1"
  ).bind(userId, id).first();
}

// Feature flag fechada ate migracao D1 homologada; user_id sempre vem da sessao.
export async function handleProjects(request, env) {
  const url = new URL(request.url);
  const isCollection = url.pathname === "/api/projects";
  const match = /^\/api\/projects\/([^/]+)$/.exec(url.pathname);
  if (!isCollection && !match) return json({ erro: "Rota não encontrada." }, 404);
  const id = match?.[1] || null;
  const method = request.method;
  if ((isCollection && !["GET", "POST"].includes(method)) ||
      (!isCollection && !["GET", "PUT", "DELETE"].includes(method))) {
    return json({ erro: "Método não permitido." }, 405);
  }
  if (id && !ID_RE.test(id)) {
    return json({ erro: "Projeto não encontrado." }, 404);
  }
  if (env.ENABLE_PROJECTS_D1 !== "true") {
    return json({ erro: "Projetos na nuvem ainda não disponíveis." }, 503);
  }
  if (!env.DB) return json({ erro: "Banco indisponível." }, 503);
  if (["POST", "PUT", "DELETE"].includes(method) &&
      request.headers.get("Origin") !== url.origin) {
    return json({ erro: "Origem não autorizada." }, 403);
  }

  try {
    const token = readSessionCookie(request);
    if (!token) return json({ erro: "Sessão não autenticada." }, 401);
    const session = await getSession(env.DB, token);
    if (!session) return json({ erro: "Sessão inválida ou expirada." }, 401);
    const userId = session.user_id;

    if (isCollection && method === "GET") {
      const rawCursor = url.searchParams.get("cursor");
      const cursor = rawCursor === null ? null : CURSOR_RE.exec(rawCursor);
      if (rawCursor !== null && (!cursor || !ID_RE.test(cursor[2]))) {
        return json({ erro: "Cursor inválido." }, 400);
      }
      const result = await projectRows(env.DB, userId, cursor);
      const rows = result.results || [];
      const projects = rows.slice(0, PAGE_SIZE);
      const last = projects[projects.length - 1];
      return json({
        projects,
        nextCursor: rows.length > PAGE_SIZE && last
          ? last.updatedAt + "|" + last.id
          : null
      });
    }

    if (!isCollection && method === "GET") {
      const project = await selectOwned(env.DB, userId, id);
      return project
        ? json({ project })
        : json({ erro: "Projeto não encontrado." }, 404);
    }

    if (!isCollection && method === "DELETE") {
      const result = await env.DB.prepare(
        "DELETE FROM projects WHERE id = ? AND user_id = ?"
      ).bind(id, userId).run();
      return result.meta?.changes > 0
        ? json({ excluido: true })
        : json({ erro: "Projeto não encontrado." }, 404);
    }

    const payload = await readPayload(request);
    if (payload.error) return payload.error;
    const { name, html, expectedRevision } = payload.data;
    if (isCollection && expectedRevision !== undefined) {
      return json({ erro: "Revisão não permitida na criação." }, 400);
    }
    if (!isCollection && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)) {
      return json({ erro: "Revisão obrigatória para atualização." }, 400);
    }

    if (isCollection) {
      const newId = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO projects (id, user_id, name, html) VALUES (?, ?, ?, ?)"
      ).bind(newId, userId, name, html).run();
      const project = await selectOwned(env.DB, userId, newId);
      return json({ project }, 201);
    }

    const result = await env.DB.prepare(
      "UPDATE projects SET name = ?, html = ?, revision = revision + 1," +
      " updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')" +
      " WHERE id = ? AND user_id = ? AND revision = ?"
    ).bind(name, html, id, userId, expectedRevision).run();
    if (!(result.meta?.changes > 0)) {
      const existing = await selectOwned(env.DB, userId, id);
      return existing
        ? json({ erro: "Este projeto foi atualizado em outra sessão. Recarregue antes de salvar." }, 409)
        : json({ erro: "Projeto não encontrado." }, 404);
    }
    const project = await selectOwned(env.DB, userId, id);
    return json({ project });
  } catch {
    console.error("Falha interna ao acessar projetos D1.");
    return json({ erro: "Projetos temporariamente indisponíveis." }, 503);
  }
}
