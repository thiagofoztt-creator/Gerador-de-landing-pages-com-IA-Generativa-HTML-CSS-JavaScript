import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/js/script.js', import.meta.url), 'utf8');

function setup({ token = 'turnstile-teste', response } = {}) {
  const listeners = new Map();
  const elements = new Map();
  let assigned = null;
  let stored = null;
  let resets = 0;

  function element(id = '') {
    return {
      id, textContent: '', value: '', disabled: false, hidden: false,
      style: {}, srcdoc: '', attributes: {}, children: [],
      setAttribute(k, v) { this.attributes[k] = v; },
      appendChild(child) { this.children.push(child); },
      addEventListener(type, handler) { listeners.set(id + ':' + type, handler); }
    };
  }
  for (const id of ['btnGerar', 'prompt', 'status', 'resultado', 'preview']) {
    elements.set(id, element(id));
  }
  const context = {
    document: {
      getElementById: id => elements.get(id),
      createElement: () => element('editor'),
      addEventListener: (type, listener) => listener()
    },
    sessionStorage: { setItem: (k, v) => { stored = { k, v }; } },
    window: {
      turnstile: { getResponse: () => token, reset: () => { resets++; } },
      location: { assign: url => { assigned = url; } }
    },
    fetch: response || (async () => Response.json({ codigo: '<html>ok</html>' })),
    console: { error() {} }
  };
  runInNewContext(source, context);
  const click = async () => listeners.get('btnGerar:click')();
  return { elements, listeners, click, assigned: () => assigned, stored: () => stored, resets: () => resets };
}

test('bloqueia prompt curto antes da chamada de rede', async () => {
  const c = setup({ response: async () => { throw new Error('Não deveria chamar rede'); } });
  c.elements.get('prompt').value = 'abc';
  await c.click();
  assert.match(c.elements.get('status').textContent, /entre 5 e 500/);
});

test('não envia sem token do Turnstile', async () => {
  const c = setup({ token: '', response: async () => { throw new Error('Chamada não esperada'); } });
  c.elements.get('prompt').value = 'Uma página sobre tecnologia';
  await c.click();
  assert.match(c.elements.get('status').textContent, /verificação de segurança/);
});

test('gera HTML com sandbox e permite abrir editor', async () => {
  let chamada;
  const c = setup({ response: async (url, opts) => {
    chamada = { url, opts };
    return Response.json({ codigo: '<html>ok</html>' });
  } });
  c.elements.get('prompt').value = 'Landing page de tecnologia';
  await c.click();
  assert.equal(chamada.url, '/gerar');
  assert.equal(chamada.opts.method, 'POST');
  assert.equal(JSON.parse(chamada.opts.body).turnstileToken, 'turnstile-teste');
  assert.equal(c.elements.get('preview').attributes.sandbox, '');
  assert.equal(c.elements.get('preview').srcdoc, '<html>ok</html>');
  assert.equal(c.elements.get('resultado').style.display, 'block');
  assert.equal(c.elements.get('btnGerar').disabled, false);
  await c.listeners.get('editor:click')();
  assert.equal(c.assigned(), '/editor.html');
  assert.deepEqual(c.stored(), { k: 'thiagoia-editor-html-v1', v: '<html>ok</html>' });
  assert.equal(c.resets(), 1);
});

test('mostra erro de API JSON e restaura botão', async () => {
  const c = setup({ response: async () => Response.json({ erro: 'Limite diário de 50 gerações atingido.' }, { status: 429 }) });
  c.elements.get('prompt').value = 'Landing page de tecnologia';
  await c.click();
  assert.equal(c.elements.get('status').textContent, 'Limite diário de 50 gerações atingido.');
  assert.equal(c.elements.get('btnGerar').disabled, false);
  assert.equal(c.elements.get('resultado').style.display, 'none');
});

test('trata resposta HTML inesperada sem lançar erro ao usuário', async () => {
  const c = setup({ response: async () => new Response('<html>erro</html>', { status: 502, headers: { 'content-type': 'text/html' } }) });
  c.elements.get('prompt').value = 'Landing page de tecnologia';
  await c.click();
  assert.match(c.elements.get('status').textContent, /resposta inesperada.*502/);
  assert.equal(c.elements.get('btnGerar').disabled, false);
});
