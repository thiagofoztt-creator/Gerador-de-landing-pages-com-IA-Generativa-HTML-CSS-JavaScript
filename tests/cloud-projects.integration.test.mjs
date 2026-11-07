import { afterEach, describe, expect, it, vi } from 'vitest';

class Node {
  constructor(tag='div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.textContent = '';
    this.className = '';
    this.attrs = {};
    this.disabled = false;
    this.hidden = false;
  }
  addEventListener(event, cb) { (this.listeners[event] ||= []).push(cb); }
  async fire(event) { for (const fn of this.listeners[event] || []) await fn(); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(k,v) { this.attrs[k] = v; }
  getAttribute(k) { return k === 'href' ? this.href : this.attrs[k]; }
  querySelector(selector) {
    if (selector === 'a.open') {
      return this.children.find(child => child.tagName === 'A' && child.className === 'open') || null;
    }
    if (selector === '.controls') {
      return this.children.find(child => child.className === 'controls') || null;
    }
    if (selector === '[data-cloud-copy]') {
      return this.children.find(child => child.attrs['data-cloud-copy'] !== undefined) || null;
    }
    return null;
  }
}
function setup(localProjects = []) {
  const ids=['cloud-projects','cloud-status','cloud-refresh','cloud-more','projects'];
  const nodes = new Map(ids.map(id => [id,new Node()]));
  const store = new Map([['thiagoia-projects-v1',JSON.stringify(localProjects)]]);
  const localStorage = { getItem: vi.fn(key => store.get(key) || null),
    setItem: vi.fn((k,v) => store.set(k,String(v))), removeItem: vi.fn(k=>store.delete(k)) };
  const document = { getElementById: id=>nodes.get(id)||null, createElement: tag => new Node(tag) };
  for (const project of localProjects) {
    const card=new Node('article');
    const anchor=new Node('a'); anchor.className='open';
    anchor.href='editor.html?project='+encodeURIComponent(project.id);
    const controls=new Node('div'); controls.className='controls';
    card.append(anchor,controls);
    nodes.get('projects').append(card);
  }
  vi.stubGlobal('document',document);
  vi.stubGlobal('localStorage',localStorage);
  vi.stubGlobal('confirm',vi.fn(()=>true));
  return {nodes,localStorage};
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('Painel remoto opcional sem perda de projetos locais', () => {
  it('nao consulta o servidor nem importa nada sem acao explicita', async () => {
    const fetchSpy=vi.spyOn(globalThis,'fetch');
    const ui=setup([{id:'local-1',name:'Local',html:'<h1>Local</h1>'}]);
    await import('../public/js/cloud-projects.js');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(ui.nodes.get('projects').children).toHaveLength(1);
    expect(ui.localStorage.setItem).not.toHaveBeenCalled();
  });

  it('ao consultar, oferece copia voluntaria e nao altera nem remove projeto local', async () => {
    const original={id:'local-1',name:'Projeto Local',html:'<h1>Local</h1>'};
    const ui=setup([original]);
    const fetchSpy=vi.spyOn(globalThis,'fetch')
      .mockResolvedValueOnce(Response.json({ projects:[],nextCursor:null }))
      .mockResolvedValueOnce(Response.json({ project: {id:'novo-remoto'} },{ status:201 }))
      .mockResolvedValueOnce(Response.json({ projects:[{
        id:'novo-remoto',name:'Projeto Local',updatedAt:'2026-11-07T10:00:00.000Z'
      }],nextCursor:null }));
    await import('../public/js/cloud-projects.js');
    await ui.nodes.get('cloud-refresh').fire('click');
    await vi.waitFor(() => expect(ui.nodes.get('cloud-status').textContent).toContain('carregados'));
    const controls=ui.nodes.get('projects').children[0].children[1];
    const copyButton=controls.querySelector('[data-cloud-copy]');
    expect(copyButton.textContent).toBe('Copiar para nuvem');
    await copyButton.fire('click');
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
    expect(globalThis.confirm).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const request=JSON.parse(fetchSpy.mock.calls[1][1].body);
    expect(request).toEqual({name:original.name,html:original.html});
    expect(ui.localStorage.setItem).not.toHaveBeenCalled();
    expect(JSON.parse(ui.localStorage.getItem('thiagoia-projects-v1'))).toEqual([original]);
    expect(ui.nodes.get('cloud-status').textContent).toContain('Projetos da conta carregados');
    expect(ui.nodes.get('cloud-projects').children[0].children[2].href)
      .toContain('editor.html?cloud=novo-remoto');
  });

  it('se usuario cancelar a copia, nenhum POST e enviado', async () => {
    const project={id:'local-x',name:'Local',html:'<p>Teste</p>'};
    const ui=setup([project]);
    vi.stubGlobal('confirm',vi.fn(()=>false));
    const fetchSpy=vi.spyOn(globalThis,'fetch')
      .mockResolvedValueOnce(Response.json({ projects:[],nextCursor:null }));
    await import('../public/js/cloud-projects.js');
    await ui.nodes.get('cloud-refresh').fire('click');
    await vi.waitFor(() => expect(ui.nodes.get('cloud-status').textContent).toContain('carregados'));
    const copy=ui.nodes.get('projects').children[0].children[1].children[0];
    await copy.fire('click');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(ui.localStorage.setItem).not.toHaveBeenCalled();
  });

  it('erros de servidor e falhas de autenticacao preservam locais', async () => {
    const original={id:'local-x',name:'Local',html:'<p>Privado</p>'};
    const ui=setup([original]);
    vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json(
      {erro:'Projetos na nuvem ainda não disponíveis.'},{status:503}));
    await import('../public/js/cloud-projects.js');
    await ui.nodes.get('cloud-refresh').fire('click');
    await vi.waitFor(() => expect(ui.nodes.get('cloud-status').textContent).toContain('preservados'));
    expect(ui.nodes.get('projects').children).toHaveLength(1);
    expect(ui.localStorage.setItem).not.toHaveBeenCalled();
  });

  it('paginação carrega paginas remotas sem repetir conteudo e sem baixar HTML em lote', async () => {
    const ui=setup();
    const next='2026-11-07T10:00:00.000Z|123e4567-e89b-42d3-a456-426614174000';
    const fetchSpy=vi.spyOn(globalThis,'fetch')
      .mockResolvedValueOnce(Response.json({projects:[{id:'r1',name:'Remoto 1',
        updatedAt:'2026-11-07T10:00:00.000Z'}],nextCursor:next}))
      .mockResolvedValueOnce(Response.json({projects:[{id:'r2',name:'Remoto 2',
        updatedAt:'2026-11-06T10:00:00.000Z'}],nextCursor:null}));
    await import('../public/js/cloud-projects.js');
    await ui.nodes.get('cloud-refresh').fire('click');
    await vi.waitFor(() => expect(ui.nodes.get('cloud-more').hidden).toBe(false));
    await vi.waitFor(() => expect(ui.nodes.get('cloud-more').disabled).toBe(false));
    await ui.nodes.get('cloud-more').fire('click');
    await vi.waitFor(() => expect(ui.nodes.get('cloud-projects').children).toHaveLength(2));
    expect(fetchSpy.mock.calls[1][0]).toContain(encodeURIComponent(next));
    expect(ui.nodes.get('cloud-more').hidden).toBe(true);
    expect(ui.localStorage.setItem).not.toHaveBeenCalled();
  });
});
