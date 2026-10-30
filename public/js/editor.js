(() => {
  'use strict';
  const KEY = 'thiagoia-editor-html-v1';
  const code = document.getElementById('code');
  const preview = document.getElementById('preview');
  const status = document.getElementById('status');
  const select = document.getElementById('element-choice');
  const textField = document.getElementById('element-text');
  const visualTags = 'h1,h2,h3,h4,h5,h6,p,button,a,li';
  let entries = [];

  function parse() {
    return new DOMParser().parseFromString(code.value || '<!doctype html><html><head></head><body></body></html>', 'text/html');
  }
  function serialize(doc) {
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  }
  function updateElements() {
    const doc = parse();
    entries = Array.from(doc.body.querySelectorAll(visualTags)).filter(el => el.textContent.trim() && !el.closest('script,style,svg')).slice(0, 150).map((el, index) => ({
      index, label: el.tagName.toLowerCase() + ' — ' + el.textContent.trim().slice(0, 48)
    }));
    const previous = Number(select.value);
    select.replaceChildren();
    if (!entries.length) {
      const option = document.createElement('option'); option.textContent = 'Nenhum texto encontrado'; option.value = ''; select.append(option);
      textField.value = ''; return;
    }
    entries.forEach(entry => {
      const option = document.createElement('option');
      option.value = String(entry.index); option.textContent = entry.label; select.append(option);
    });
    select.value = entries.some(e => e.index === previous) ? String(previous) : '0';
    loadSelected();
  }
  function loadSelected() {
    const index = Number(select.value);
    const elements = Array.from(parse().body.querySelectorAll(visualTags)).filter(el => el.textContent.trim() && !el.closest('script,style,svg')).slice(0, 150);
    textField.value = elements[index]?.textContent || '';
  }
  function render(message = 'Prévia atualizada.') {
    preview.srcdoc = code.value || '<!doctype html><html lang="pt-BR"><body style="font-family:sans-serif;padding:2rem"><h2>Nenhum site carregado</h2></body></html>';
    status.textContent = message;
  }
  let initial = '';
  try { initial = sessionStorage.getItem(KEY) || ''; } catch (_) {}
  if (!initial) { try { initial = localStorage.getItem(KEY) || ''; } catch (_) {} }
  code.value = initial;
  preview.dataset.device = 'desktop';
  updateElements(); render();
  document.getElementById('refresh').addEventListener('click', () => { updateElements(); render(); });
  select.addEventListener('change', loadSelected);
  document.getElementById('apply-text').addEventListener('click', () => {
    if (!entries.length) { status.textContent = 'Nenhum texto disponível.'; return; }
    const doc = parse();
    const elements = Array.from(doc.body.querySelectorAll(visualTags)).filter(el => el.textContent.trim() && !el.closest('script,style,svg')).slice(0, 150);
    const element = elements[Number(select.value)];
    if (!element) return;
    // textContent evita executar HTML digitado. Em elementos compostos, substitui o conteúdo interno.
    element.textContent = textField.value;
    code.value = serialize(doc);
    updateElements(); render('Texto atualizado. Salve para manter as alterações.');
  });
  document.getElementById('apply-colors').addEventListener('click', () => {
    const primary = document.getElementById('color-primary').value;
    const bg = document.getElementById('color-background').value;
    const doc = parse();
    const id = 'thiagoia-v2-custom-colors';
    let style = doc.getElementById(id);
    if (!style) { style = doc.createElement('style'); style.id = id; doc.head.append(style); }
    style.textContent = `:root{--primary-color:${primary};--secondary-color:${primary};--accent-color:${primary};--primary:${primary}} body{background-color:${bg} !important} h1,h2,h3{color:${primary}} button,.btn-primary,.cta-button{background-color:${primary}}`;
    code.value = serialize(doc);
    updateElements(); render('Cores aplicadas. Confira a prévia antes de salvar.');
  });
  document.querySelectorAll('[data-device]').forEach(btn => btn.addEventListener('click', () => {
    const device = btn.dataset.device;
    preview.dataset.device = device;
    document.querySelectorAll('[data-device]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
  }));
  document.getElementById('mode-code').addEventListener('click', (event) => {
    const pane = document.querySelector('.editor-panel');
    const hidden = pane.classList.toggle('is-hidden');
    document.querySelector('.workspace').classList.toggle('code-hidden', hidden);
    event.currentTarget.setAttribute('aria-pressed', String(hidden));
    event.currentTarget.textContent = hidden ? 'Mostrar HTML' : 'Ocultar HTML';
  });
  document.getElementById('save').addEventListener('click', () => {
    try { localStorage.setItem(KEY, code.value); status.textContent = 'Salvo somente neste navegador.'; }
    catch (_) { status.textContent = 'Não foi possível salvar. Use Baixar HTML.'; }
  });
  document.getElementById('download').addEventListener('click', () => {
    if (!code.value.trim()) { status.textContent = 'Não há código para baixar.'; return; }
    const blob = new Blob([code.value], {type:'text/html;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download='meu-site.html'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Download solicitado.';
  });
})();
