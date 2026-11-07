import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import worker from "../worker/index.js";
import { createSession } from "../worker/auth/session.js";
import authSchema from "./fixtures/auth_schema.sql?raw";
import projectsSchema from "../migrations/0001_projects_hml.sql?raw";

const BASE = "https://auth-test.example";
const ENABLED = "true";

function request(path, method = "GET", cookie = "", body, headers = {}) {
  const h = { ...headers };
  if (cookie) h.Cookie = cookie;
  if (method !== "GET" && method !== "HEAD") {
    h.Origin ??= BASE;
    if (body !== undefined) h["Content-Type"] ??= "application/json";
  }
  return new Request(BASE + path, {
    method, headers: h,
    ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {})
  });
}
async function call(db, path, method = "GET", cookie = "", body, headers = {}) {
  return worker.fetch(request(path, method, cookie, body, headers), {
    DB: db,
    ENABLE_PROJECTS_D1: ENABLED
  });
}
async function read(response) {
  const body = await response.json();
  return { status: response.status, body };
}
async function apply(db, schema) {
  const commands = schema.split("\n").filter(line => !line.trim().startsWith("--"))
    .join("\n").split(";").map(s => s.trim()).filter(Boolean);
  for (const sql of commands) await db.prepare(sql).run();
}

describe("Projetos privados no D1 isolado", () => {
  it("CRUD real impede leitura, edicao e exclusao entre contas", async () => {
    const db = env.DB;
    await apply(db, authSchema);
    await apply(db, projectsSchema);
    const diagnosticUrl = request("/api/internal/d1-health");
    const disabled = await worker.fetch(diagnosticUrl, { DB: db });
    expect(disabled.status).toBe(404);
    const enabled = await worker.fetch(request("/api/internal/d1-health"), {
      DB: db, ENABLE_D1_HEALTH: "true"
    });
    expect(enabled.status).toBe(200);
    expect(await enabled.json()).toEqual({ status: "ok", schema: "projects" });
    const unavailable = await worker.fetch(request("/api/internal/d1-health"), {
      ENABLE_D1_HEALTH: "true"
    });
    expect(unavailable.status).toBe(503);
    const wrongMethod = await worker.fetch(
      request("/api/internal/d1-health", "POST"), { DB: db, ENABLE_D1_HEALTH: "true" }
    );
    expect(wrongMethod.status).toBe(405);

    // A base isolada deve corresponder ao banco thiagoia-hml e nao criar tabela paralela.
    const columns = (await db.prepare("PRAGMA table_info(projects)").all()).results || [];
    expect(columns.map(column => column.name)).toEqual([
      "id", "user_id", "name", "html", "revision", "created_at", "updated_at"
    ]);
    const relations = (await db.prepare("PRAGMA foreign_key_list(projects)").all()).results || [];
    expect(relations.some(fk => fk.from === "user_id" && fk.table === "users")).toBe(true);
    const indexes = (await db.prepare("PRAGMA index_list(projects)").all()).results || [];
    expect(indexes.some(index => index.name === "idx_projects_user_updated")).toBe(true);
    const duplicate = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='user_projects'"
    ).first();
    expect(duplicate).toBeNull();
    await db.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)")
      .bind("owner-a", "owner-a@example.test", "Usuario A").run();
    await db.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)")
      .bind("owner-b", "owner-b@example.test", "Usuario B").run();
    const cookieA = (await createSession(db, "owner-a")).cookie.split(";")[0];
    const cookieB = (await createSession(db, "owner-b")).cookie.split(";")[0];
    const html = "<!doctype html><html><body><h1>Privado A</h1></body></html>";

    const created = await read(await call(db, "/api/projects", "POST", cookieA, {
      name: "Projeto A", html
    }));
    expect(created.status).toBe(201);
    expect(created.body.project.name).toBe("Projeto A");
    expect(created.body.project.html).toBe(html);
    const idA = created.body.project.id;
    expect(idA).toMatch(/^[0-9a-f-]{36}$/i);

    // O usuario nunca pode escolher proprietario nem atributos persistidos.
    for (const bad of [
      { name: "Invasao", html, user_id: "owner-b" },
      { name: "Invasao", html, id: "123e4567-e89b-42d3-a456-426614174000" }
    ]) {
      const result = await read(await call(db, "/api/projects", "POST", cookieA, bad));
      expect(result.status).toBe(400);
      expect(result.body.erro).toBe("Campos não permitidos.");
    }
    for (const bad of [
      { name: "", html }, { name: "x".repeat(81), html },
      { name: "Valido", html: "" }, { name: "Valido", html: 14 }
    ]) {
      expect((await call(db, "/api/projects", "POST", cookieA, bad)).status).toBe(400);
    }
    expect((await call(db, "/api/projects", "POST", cookieA, "{")).status).toBe(400);
    expect((await call(db, "/api/projects", "POST", cookieA, { name: "X", html },
      { "Content-Type": "text/plain" })).status).toBe(415);
    expect((await call(db, "/api/projects", "POST", cookieA, { name: "Valido", html },
      { "Content-Length": "999999" })).status).toBe(413);
    expect((await call(db, "/api/projects?cursor=indevido", "GET", cookieA)).status).toBe(400);

    const listA = await read(await call(db, "/api/projects", "GET", cookieA));
    expect(listA.status).toBe(200);
    expect(listA.body.projects.map(project => project.id)).toContain(idA);
    expect(listA.body.projects[0]).not.toHaveProperty("html");
    expect(listA.body.nextCursor).toBeNull();

    const listB = await read(await call(db, "/api/projects", "GET", cookieB));
    expect(listB).toEqual({ status: 200, body: { projects: [], nextCursor: null } });

    for (const [method, body] of [
      ["GET", undefined],
      ["PUT", { name: "Alterado por B", html: "<h1>Invasao</h1>", expectedRevision: 1 }],
      ["DELETE", undefined]
    ]) {
      const attempted = await read(await call(db, "/api/projects/" + idA, method, cookieB, body));
      expect(attempted.status).toBe(404);
      expect(attempted.body.erro).toBe("Projeto não encontrado.");
    }

    const stillA = await read(await call(db, "/api/projects/" + idA, "GET", cookieA));
    expect(stillA.status).toBe(200);
    expect(stillA.body.project.html).toBe(html);

    const update = await read(await call(db, "/api/projects/" + idA, "PUT", cookieA, {
      name: "Projeto A editado", html: "<html><body>Atualizado A</body></html>", expectedRevision: 1
    }));
    expect(update.status).toBe(200);
    expect(update.body.project.name).toBe("Projeto A editado");
    expect(update.body.project.revision).toBe(2);
    const stale = await read(await call(db, "/api/projects/" + idA, "PUT", cookieA, {
      name: "Rascunho antigo", html, expectedRevision: 1
    }));
    expect(stale.status).toBe(409);
    const retained = await read(await call(db, "/api/projects/" + idA, "GET", cookieA));
    expect(retained.body.project.name).toBe("Projeto A editado");

    const removed = await read(await call(db, "/api/projects/" + idA, "DELETE", cookieA));
    expect(removed).toEqual({ status: 200, body: { excluido: true } });
    expect((await call(db, "/api/projects/" + idA, "GET", cookieA)).status).toBe(404);
    expect((await call(db, "/api/projects/" + idA, "DELETE", cookieA)).status).toBe(404);

    // Paginacao com cursor: nao repetir nem revelar projetos entre usuarios.
    const entries = Array.from({ length: 51 }, (_, i) => {
      const id = "00000000-0000-4000-8000-" + String(i + 1).padStart(12, "0");
      const updated = new Date(Date.UTC(2026, 0, 1, 0, 0, i + 1)).toISOString();
      return db.prepare(
        "INSERT INTO projects (id,user_id,name,html,updated_at) VALUES (?,?,?,?,?)"
      ).bind(id, "owner-a", "Projeto " + i, "<h1>Teste</h1>", updated);
    });
    await db.batch(entries);
    const firstPage = await read(await call(db, "/api/projects", "GET", cookieA));
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.projects).toHaveLength(50);
    expect(firstPage.body.nextCursor).toMatch(/^2026-01-01T.*\\|[0-9a-f-]{36}$/i);
    const secondPage = await read(await call(
      db, "/api/projects?cursor=" + encodeURIComponent(firstPage.body.nextCursor), "GET", cookieA
    ));
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.projects).toHaveLength(1);
    expect(secondPage.body.nextCursor).toBeNull();
    const ids = [...firstPage.body.projects, ...secondPage.body.projects].map(p => p.id);
    expect(new Set(ids).size).toBe(51);
    expect((await read(await call(db, "/api/projects", "GET", cookieB))).body.projects)
      .toHaveLength(0);

    const noCache = await call(db, "/api/projects", "GET", cookieA);
    expect(noCache.headers.get("Cache-Control")).toBe("no-store");
    expect(noCache.headers.get("X-Content-Type-Options")).toBe("nosniff");

    // Uma sessão revogada ou vencida nunca pode acessar projetos.
    const sessionToken = cookieA.split("=")[1];
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sessionToken));
    const hex = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
    await db.prepare("UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ?")
      .bind(hex).run();
    expect((await call(db, "/api/projects", "GET", cookieA)).status).toBe(401);
    expect((await call(db, "/api/projects", "GET", cookieB)).status).toBe(200);
  });

  it("falha fechado quando o recurso nao foi migrado, o banco falta ou o metodo e invalido", async () => {
    const noFlag = await worker.fetch(request("/api/projects"), { DB: {} });
    expect(noFlag.status).toBe(503);
    expect((await noFlag.json()).erro).toContain("não disponíveis");
    expect((await call(null, "/api/projects")).status).toBe(503);
    expect((await call(null, "/api/projects", "PUT")).status).toBe(405);
    expect((await call(null, "/api/projects/nao-e-uuid")).status).toBe(404);
  });

  it("rejeita acesso anonimo, Origin de terceiros e IDs escolhidos pelo cliente", async () => {
    expect((await call(env.DB, "/api/projects")).status).toBe(401);
    expect((await call(env.DB, "/api/projects", "POST", "", { name: "a", html: "<p>x</p>" },
      { Origin: "https://site-externo.example" })).status).toBe(403);
    // Se o cliente fornecer user_id ou id, o payload deve ser rejeitado.
    // Sessao invalida e rejeitada antes de processar o corpo.
    const forged = await call(env.DB, "/api/projects", "POST",
      "__Host-thiagoia_session=" + "0".repeat(64),
      { name: "Projeto", html: "<p>x</p>", user_id: "owner-b" });
    expect(forged.status).toBe(401);
  });

  it("validacao de cursor rejeita formatos invalidos antes da consulta", async () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect((await call(env.DB, "/api/projects/" + id, "POST")).status).toBe(405);
    expect((await call(env.DB, "/api/projects/" + id, "PUT", "",
      { name: "X", html: "<p>Y</p>" }, { Origin: "https://evil.example" })).status).toBe(403);
  });
});
