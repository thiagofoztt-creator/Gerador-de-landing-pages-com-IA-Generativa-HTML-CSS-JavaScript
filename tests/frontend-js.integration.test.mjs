
import { afterEach, describe, expect, it, vi } from "vitest";

class FakeElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.style = {};
    this.value = "";
    this.textContent = "";
    this.srcdoc = "";
    this.classList = { toggle: vi.fn(() => true) };
  }
  addEventListener(event, handler) {
    (this.listeners[event] ??= []).push(handler);
  }
  async fire(event) {
    for (const handler of this.listeners[event] ?? []) {
      await handler({ currentTarget: this });
    }
  }
  click() { return this.fire("click"); }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(key, value) { (this.attrs ??= {})[key] = value; }
  remove() { this.removed = true; }
  closest() { return null; }
}

function store(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    values,
    getItem: vi.fn(key => values.has(key) ? values.get(key) : null),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
    removeItem: vi.fn(key => values.delete(key))
  };
}

function setup(ids, opts = {}) {
  const nodes = new Map(ids.map(id => [id, new FakeElement()]));
  const body = new FakeElement("body");
  const devices = [new FakeElement("button"), new FakeElement("button")];
  devices[0].dataset.device = "desktop";
  devices[1].dataset.device = "mobile";
  const panel = new FakeElement();
  const workspace = new FakeElement();
  const document = {
    body,
    getElementById: id => nodes.get(id) ?? null,
    createElement: tag => new FakeElement(tag),
    addEventListener: vi.fn(),
    querySelectorAll: selector => selector === "[data-device]" ? devices : [],
    querySelector: selector =>
      selector === ".editor-panel" ? panel : selector === ".workspace" ? workspace : null
  };
  const local = store(opts.local);
  const session = store(opts.session);
  const location = { search: opts.search ?? "", assign: vi.fn() };
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", { location, turnstile: opts.turnstile });
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
  vi.stubGlobal("prompt", vi.fn());
  vi.stubGlobal("setTimeout", vi.fn());
  class FakeDOMParser {
    parseFromString(html) {
      const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? "";
      const tags = Array.from(html.matchAll(/<(h1|h2|p|a|button|li)[^>]*>([^<]*)<\/\1>/gi))
        .map(m => {
          const el = new FakeElement(m[1]);
          el.textContent = m[2];
          return el;
        });
      const styles = [];
      return {
        title,
        body: { querySelectorAll: () => tags },
        head: { append: style => styles.push(style) },
        getElementById: id => styles.find(s => s.id === id),
        createElement: tag => new FakeElement(tag),
        documentElement: {
          get outerHTML() {
            let value = html;
            tags.forEach((tag, i) => {
              const matches = Array.from(value.matchAll(new RegExp("<" + tag.tagName + "[^>]*>[^<]*<\\/" + tag.tagName + ">", "gi")));
              if (matches[i]) value = value.replace(matches[i][0], "<" + tag.tagName.toLowerCase() + ">" + tag.textContent + "</" + tag.tagName.toLowerCase() + ">");
            });
            if (styles.length) value = value.replace("</head>", "<style>" + styles.map(s => s.textContent).join("") + "</style></head>");
            return value;
          }
        }
      };
    }
  }
  vi.stubGlobal("DOMParser", FakeDOMParser);
  return { nodes, document, local, session, location, devices, panel, workspace };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("JavaScript da interface: comportamento real com DOM isolado", () => {
  it("gerador exige captcha, valida descricao, processa sucesso e abre editor", async () => {
    const ui = setup(["btnGerar", "prompt", "status", "resultado", "preview"], {
      turnstile: { getResponse: vi.fn(() => "captcha-valido"), reset: vi.fn() }
    });
    ui.nodes.get("prompt").value = "curto";
    await import("../public/js/script.js");
    const callback = ui.document.addEventListener.mock.calls.find(([name]) => name === "DOMContentLoaded")?.[1];
    expect(callback).toBeTypeOf("function");
    callback();
    await ui.nodes.get("btnGerar").fire("click");
    expect(ui.nodes.get("status").textContent).toContain("entre 5 e 500");
    ui.nodes.get("prompt").value = "Criar landing page premium de software";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ codigo: "<html><body>Gerado</body></html>" })));
    await ui.nodes.get("btnGerar").fire("click");
    expect(ui.nodes.get("preview").srcdoc).toContain("Gerado");
    expect(ui.nodes.get("status").textContent).toBe("Página gerada com sucesso!");
    const edit = ui.nodes.get("resultado").children[0];
    expect(edit.hidden).toBe(false);
    await edit.fire("click");
    expect(ui.session.getItem("thiagoia-editor-html-v1")).toContain("Gerado");
    expect(ui.location.assign).toHaveBeenCalledWith("/editor.html");
  });

  it("gerador bloqueia captcha ausente, falhas JSON, falhas HTTP e HTML vazio", async () => {
    const captcha = { getResponse: vi.fn(() => ""), reset: vi.fn() };
    const ui = setup(["btnGerar", "prompt", "status", "resultado", "preview"], { turnstile: captcha });
    ui.nodes.get("prompt").value = "Uma landing page de exemplos";
    await import("../public/js/script.js");
    ui.document.addEventListener.mock.calls.find(([name]) => name === "DOMContentLoaded")[1]();
    await ui.nodes.get("btnGerar").fire("click");
    expect(ui.nodes.get("status").textContent).toContain("verificação de segurança");
    captcha.getResponse.mockReturnValue("valido");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("<html>", { status: 200, headers: { "Content-Type": "text/html" } }))
      .mockResolvedValueOnce(new Response("{", { headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(Response.json({ erro: "Limite atingido" }, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ codigo: "" }))
      .mockRejectedValueOnce(new Error("Indisponível"));
    vi.stubGlobal("fetch", fetcher);
    for (const expected of ["resposta inesperada", "JSON inválido", "Limite atingido",
      "não retornou código", "Indisponível"]) {
      await ui.nodes.get("btnGerar").fire("click");
      expect(ui.nodes.get("status").textContent).toContain(expected);
      expect(ui.nodes.get("btnGerar").disabled).toBe(false);
    }
    expect(captcha.reset).toHaveBeenCalledTimes(5);
  });

  it("listagem migra projeto legado, duplica, renomeia e protege exclusao", async () => {
    const projectHtml = "<html><head><title>Legado</title></head><body><h1>Site</h1></body></html>";
    const ui = setup(["projects", "message"], { local: {
      "thiagoia-editor-html-v1": projectHtml
    }});
    await import("../public/js/projetos.js");
    const projectsKey = "thiagoia-projects-v1";
    expect(JSON.parse(ui.local.getItem(projectsKey))).toHaveLength(1);
    const projectArea = ui.nodes.get("projects");
    let buttons = projectArea.children[0].children[3].children;
    expect(buttons.map(x => x.textContent)).toContain("Duplicar");
    await buttons[2].fire("click");
    expect(JSON.parse(ui.local.getItem(projectsKey))).toHaveLength(2);
    buttons = projectArea.children[0].children[3].children;
    vi.stubGlobal("prompt", vi.fn(() => "Nome Atualizado"));
    await buttons[1].fire("click");
    expect(JSON.parse(ui.local.getItem(projectsKey)).some(p => p.name === "Nome Atualizado")).toBe(true);
    buttons = projectArea.children[0].children[3].children;
    vi.stubGlobal("prompt", vi.fn(() => "nome incorreto"));
    await buttons[4].fire("click");
    expect(JSON.parse(ui.local.getItem(projectsKey))).toHaveLength(2);
  });

  it("lista vazia e dados locais corrompidos nao geram codigo perigoso", async () => {
    const ui = setup(["projects", "message"], { local: {
      "thiagoia-projects-v1": "{nao-json"
    }});
    await import("../public/js/projetos.js");
    expect(ui.nodes.get("projects").children[0].textContent).toContain("Nenhum projeto salvo");
  });

  it("editor sem projeto usa rascunho e salva somente o rascunho", async () => {
    const html = "<html><head></head><body><h1>Bem-vindo</h1><p>Conteudo</p></body></html>";
    const ui = setup([
      "code", "preview", "status", "element-choice", "element-text", "save",
      "refresh", "apply-text", "apply-colors", "color-primary", "color-background",
      "mode-code", "download"
    ], { session: { "thiagoia-editor-html-v1": html } });
    await import("../public/js/editor.js");
    expect(ui.nodes.get("code").value).toBe(html);
    expect(ui.session.getItem("thiagoia-editor-html-v1")).toBeNull();
    expect(ui.nodes.get("preview").attrs.sandbox).toBe("");
    expect(ui.nodes.get("element-choice").children).toHaveLength(2);
    ui.nodes.get("code").value = html;
    await ui.nodes.get("save").fire("click");
    expect(ui.local.getItem("thiagoia-editor-html-v1")).toBe(html);
    ui.nodes.get("color-primary").value = "#123456";
    ui.nodes.get("color-background").value = "#abcdef";
    await ui.nodes.get("apply-colors").fire("click");
    expect(ui.nodes.get("status").textContent).toContain("Cores aplicadas");
    await ui.nodes.get("apply-text").fire("click");
    expect(ui.nodes.get("status").textContent).toContain("Texto atualizado");
    await ui.devices[1].fire("click");
    expect(ui.nodes.get("preview").dataset.device).toBe("mobile");
    await ui.nodes.get("mode-code").fire("click");
    expect(ui.nodes.get("mode-code").textContent).toContain("Mostrar HTML");
  });

  it("editor nunca sobrescreve projeto ausente e bloqueia salvamento", async () => {
    const ui = setup(["code", "preview", "status", "element-choice", "element-text", "save"], {
      search: "?project=nao-existe", local: { "thiagoia-projects-v1": "[]" }
    });
    await import("../public/js/editor.js");
    expect(ui.nodes.get("save").disabled).toBe(true);
    expect(ui.nodes.get("code").readOnly).toBe(true);
    expect(ui.nodes.get("status").textContent).toContain("Projeto não encontrado");
    expect(ui.local.setItem).not.toHaveBeenCalled();
  });

  it("editor carrega e salva apenas o projeto selecionado", async () => {
    const html = "<html><head></head><body><h1>Projeto principal</h1></body></html>";
    const project = { id: "id-projeto", name: "Projeto principal", html };
    const another = { id: "outro", name: "Outro", html: "<html>Outro</html>" };
    const ui = setup(["code", "preview", "status", "element-choice", "element-text", "save"], {
      search: "?project=id-projeto", local: {
        "thiagoia-projects-v1": JSON.stringify([project, another])
      }
    });
    await import("../public/js/editor.js");
    expect(ui.nodes.get("code").value).toBe(html);
    ui.nodes.get("code").value = "<html><head></head><body><h1>Alterado</h1></body></html>";
    await ui.nodes.get("save").fire("click");
    const projects = JSON.parse(ui.local.getItem("thiagoia-projects-v1"));
    expect(projects[0].html).toContain("Alterado");
    expect(projects[1].html).toBe(another.html);
    expect(ui.nodes.get("status").textContent).toContain("somente neste projeto");
  });
});
