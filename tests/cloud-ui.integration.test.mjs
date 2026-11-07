import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cloudRequest, createCloudProject, getCloudProject, updateCloudProject
} from '../public/js/cloud-api.js';

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.listeners = {};
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.value = '';
    this.textContent = '';
    this.classList = { toggle: vi.fn(() => true) };
  }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  async fire(name) {
    for (const fn of this.listeners[name] || []) await fn({ currentTarget: this });
  }
  setAttribute(key, value) { (this.attrs ||= {})[key] = value; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  getAttribute(key) { return this.attrs?.[key] ?? null; }
}
function fakeEditor(search, local = {}) {
  const ids = ['code','preview','status','element-choice','element-text','save',
    'refresh','apply-text','apply-colors','color-primary','color-background','download'];
  const nodes = new Map(ids.map(id => [id, new Element()]));
  const storage = new Map(Object.entries(local));
  const localStorage = {
    getItem: vi.fn(k => storage.get(k) ?? null),
    setItem: vi.fn((k,v) => storage.set(k,String(v)))
  };
  const document = {
    getElementById: id => nodes.get(id) || null,
    createElement: tag => new Element(tag),
    querySelectorAll: () => [],
    querySelector: () => null
  };
  const location = { search };
  vi.stubGlobal('window', { location });
  vi.stubGlobal('document', document);
  vi.stubGlobal('localStorage', localStorage);
  vi.stubGlobal('sessionStorage', { getItem: vi.fn(() => null), removeItem: vi.fn() });
  class Parser {
    parseFromString(html) {
      return {
        body: { querySelectorAll: () => [] },
        documentElement: { outerHTML: html },
        getElementById: () => null,
        createElement: tag => new Element(tag),
        head: { append: () => {} }
      };
    }
  }
  vi.stubGlobal('DOMParser', Parser);
  return { nodes, localStorage };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('Cliente de projetos D1 na mesma origem', () => {
  it('envia credencial da mesma origem, nunca envia user_id e valida resposta', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ project: { id: 'abc', name: 'Exemplo' } })
    );
    await createCloudProject('Exemplo', '<h1>Seguro</h1>');
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/projects');
    expect(init.credentials).toBe('same-origin');
    expect(init.cache).toBe('no-store');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'Exemplo', html: '<h1>Seguro</h1>' });
    expect(init.body).not.toContain('user_id');
    await expect(cloudRequest('https://outro-site.example/api/projects')).rejects.toThrow('Rota');
  });

  it.each([
    [401, { erro: 'Sessão não autenticada.' }, 'Faça login'],
    [503, { erro: 'Banco indisponível.' }, 'locais estão preservados'],
    [409, { erro: 'Revisão desatualizada.' }, 'Revisão desatualizada.']
  ])('transforma erro HTTP %s em mensagem segura', async (status, body, expected) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(body, { status }));
    await expect(getCloudProject('id-ficticio')).rejects.toThrow(expected);
  });

  it('bloqueia resposta HTML, JSON inválido e falha de rede sem modificar projetos locais', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    spy.mockResolvedValueOnce(new Response('<html>', { headers: { 'content-type': 'text/html' } }));
    await expect(cloudRequest('/api/projects')).rejects.toThrow('inesperada');
    spy.mockResolvedValueOnce(new Response('{', { headers: { 'content-type': 'application/json' } }));
    await expect(cloudRequest('/api/projects')).rejects.toThrow('inválida');
    spy.mockRejectedValueOnce(new Error('falha simulada'));
    await expect(cloudRequest('/api/projects')).rejects.toThrow('Sem conexão');
  });

  it('salvamento remoto envia revisao esperada para evitar sobrescritas', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
      project: { id: 'id', revision: 3 }
    }));
    await updateCloudProject('id', 'Nome', '<h1>Conteúdo</h1>', 2);
    const req = JSON.parse(spy.mock.calls[0][1].body);
    expect(req).toEqual({ name: 'Nome', html: '<h1>Conteúdo</h1>', expectedRevision: 2 });
    expect(spy.mock.calls[0][1].method).toBe('PUT');
  });
});

describe('Editor D1 nao substitui nem herda projetos locais', () => {
  it('carrega projeto remoto e salva somente com revisao do servidor', async () => {
    const localHtml = '<html><body><h1>LOCAL</h1></body></html>';
    const project = { id:'01234567-89ab-4cde-8abc-0123456789ab',
      name:'Remoto', html:'<html><body><h1>REMOTO</h1></body></html>', revision:1 };
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ project }))
      .mockResolvedValueOnce(Response.json({ project: { ...project, revision: 2,
        html:'<html><body><h1>EDITADO</h1></body></html>' } }));
    const ui = fakeEditor('?cloud=' + project.id, { 'thiagoia-editor-html-v1':localHtml });
    await import('../public/js/editor.js');
    expect(ui.nodes.get('save').disabled).toBe(true);
    await vi.waitFor(() => expect(ui.nodes.get('save').disabled).toBe(false));
    expect(ui.nodes.get('code').value).toContain('REMOTO');
    ui.nodes.get('code').value = '<html><body><h1>EDITADO</h1></body></html>';
    await ui.nodes.get('save').fire('click');
    await vi.waitFor(() => expect(ui.nodes.get('status').textContent).toContain('Salvo na nuvem'));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(spy.mock.calls[1][1].body).expectedRevision).toBe(1);
    expect(ui.nodes.get('status').textContent).toContain('Salvo na nuvem');
    expect(ui.localStorage.setItem).not.toHaveBeenCalled();
    expect(ui.localStorage.getItem('thiagoia-editor-html-v1')).toBe(localHtml);
  });

  it('falha remota nunca carrega rascunho local nem habilita salvamento', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(
      { erro:'Projetos na nuvem ainda não disponíveis.' }, { status:503 }));
    const ui = fakeEditor('?cloud=id-remoto', { 'thiagoia-editor-html-v1':'HTML PRIVADO' });
    await import('../public/js/editor.js');
    await vi.waitFor(() => expect(ui.nodes.get('status').textContent).toContain('preservados'));
    expect(ui.nodes.get('save').disabled).toBe(true);
    expect(ui.nodes.get('code').value).toBe('');
    expect(ui.localStorage.setItem).not.toHaveBeenCalled();
  });

  it('rejeita URLs ambiguas contendo projeto local e remoto', async () => {
    const ui = fakeEditor('?cloud=remoto&project=local', { 'thiagoia-editor-html-v1':'HTML PRIVADO' });
    await import('../public/js/editor.js');
    await vi.waitFor(() => expect(ui.nodes.get('status').textContent).toContain('apenas um projeto'));
    expect(ui.nodes.get('save').disabled).toBe(true);
    expect(ui.localStorage.setItem).not.toHaveBeenCalled();
  });

  it('conflito HTTP 409 preserva o HTML nao salvo no editor', async () => {
    const project = { id:'01234567-89ab-4cde-8abc-0123456789ab',
      name:'Projeto', html:'<html><h1>Original</h1></html>', revision:2 };
    vi.spyOn(globalThis,'fetch')
      .mockResolvedValueOnce(Response.json({ project }))
      .mockResolvedValueOnce(Response.json({ erro:'Revisão desatualizada.' }, { status:409 }));
    const ui = fakeEditor('?cloud=' + project.id);
    await import('../public/js/editor.js');
    await vi.waitFor(() => expect(ui.nodes.get('save').disabled).toBe(false));
    ui.nodes.get('code').value = '<html><h1>RASCUNHO</h1></html>';
    await ui.nodes.get('save').fire('click');
    await vi.waitFor(() => expect(ui.nodes.get('status').textContent).toContain('Revisão desatualizada.'));
    expect(ui.nodes.get('code').value).toContain('RASCUNHO');
    expect(ui.nodes.get('status').textContent).toContain('Revisão desatualizada.');
    expect(ui.localStorage.setItem).not.toHaveBeenCalled();
  });
});
