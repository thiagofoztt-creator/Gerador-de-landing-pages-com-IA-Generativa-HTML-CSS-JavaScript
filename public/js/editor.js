(() => {
  'use strict';

  const LEGACY_KEY = 'thiagoia-editor-html-v1';
  const PROJECTS_KEY = 'thiagoia-projects-v1';
  const projectId = new URLSearchParams(window.location.search).get('project');

  const code = document.getElementById('code');
  const preview = document.getElementById('preview');
  const status = document.getElementById('status');
  const select = document.getElementById('element-choice');
  const textField = document.getElementById('element-text');
  const saveButton = document.getElementById('save');
  const visualTags = 'h1,h2,h3,h4,h5,h6,p,button,a,li';

  if (![code, preview, status, select, textField, saveButton].every(Boolean)) {
    console.error('Editor incompleto: elementos obrigatórios não encontrados.');
    return;
  }

  let entries = [];
  let canSave = true;

  function readProjects() {
    const raw = localStorage.getItem(PROJECTS_KEY);
    const result = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(result)) throw new Error('Lista de projetos inválida.');
    return result;
  }

  function parse() {
    return new DOMParser().parseFromString(
      code.value || '<!doctype html><html><head></head><body></body></html>',
      'text/html'
    );
  }

  function serialize(doc) {
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  }

  function editableElements(doc) {
    return Array.from(doc.body.querySelectorAll(visualTags))
      .filter(el => el.textContent.trim() && !el.closest('script,style,svg'))
      .slice(0, 150);
  }

  function updateElements() {
    const elements = editableElements(parse());
    entries = elements.map((el, index) => ({
      index,
      label: el.tagName.toLowerCase() + ' — ' + el.textContent.trim().slice(0, 48)
    }));
    const previous = Number(select.value);
    select.replaceChildren();
    if (!entries.length) {
      const option = document.createElement('option');
      option.textContent = 'Nenhum texto encontrado';
      option.value = '';
      select.append(option);
      textField.value = '';
      return;
    }
    entries.forEach(entry => {
      const option = document.createElement('option');
      option.value = String(entry.index);
      option.textContent = entry.label;
      select.append(option);
    });
    select.value = entries.some(e => e.index === previous) ? String(previous) : '0';
    loadSelected();
  }

  function loadSelected() {
    const index = Number(select.value);
    textField.value = editableElements(parse())[index]?.textContent || '';
  }

  function render(message = 'Prévia atualizada.') {
    preview.srcdoc = code.value || '<!doctype html><html lang="pt-BR"><body style="font-family:sans-serif;padding:2rem"><h2>Nenhum site carregado</h2></body></html>';
    status.textContent = message;
  }

  function notifyChanges() {
    saveButton.textContent = 'Salvar neste navegador';
  }

  let initial = '';
  let openingMessage = 'Prévia atualizada.';

  if (projectId !== null) {
    // Uma URL com ?project= jamais deve cair no armazenamento legado.
    try {
      const project = readProjects().find(item => item && item.id === projectId);
      if (!project || typeof project.html !== 'string') {
        throw new Error('Projeto não encontrado. Volte a Meus Projetos e abra-o novamente.');
      }
      initial = project.html;
      openingMessage = 'Projeto carregado: ' + (project.name || 'Sem nome') + '.';
    } catch (error) {
      canSave = false;
      openingMessage = error.message || 'Não foi possível carregar este projeto.';
      console.error('Falha ao abrir projeto:', error);
    }
  } else {
    // Compatibilidade com o gerador: sessão transfere um novo HTML sem alterar projetos existentes.
    try {
      initial = sessionStorage.getItem(LEGACY_KEY) || '';
      if (initial) sessionStorage.removeItem(LEGACY_KEY);
    } catch (error) {
      console.warn('Não foi possível ler o projeto temporário:', error);
    }
    if (!initial) {
      try { initial = localStorage.getItem(LEGACY_KEY) || ''; }
      catch (error) { console.warn('Não foi possível recuperar o rascunho:', error); }
    }
    openingMessage = 'Rascunho local. Use Meus Projetos para salvar projetos independentes.';
  }

  code.value = initial;
  preview.setAttribute('sandbox', '');
  preview.dataset.device = 'desktop';
  updateElements();
  render(openingMessage);
  if (!canSave) {
    saveButton.disabled = true;
    code.readOnly = true;
  }

  document.getElementById('refresh')?.addEventListener('click', () => {
    updateElements();
    render();
  });
  select.addEventListener('change', loadSelected);

  document.getElementById('apply-text')?.addEventListener('click', () => {
    if (!canSave) return;
    if (!entries.length) { status.textContent = 'Nenhum texto disponível.'; return; }
    const doc = parse();
    const element = editableElements(doc)[Number(select.value)];
    if (!element) return;
    element.textContent = textField.value;
    code.value = serialize(doc);
    updateElements();
    notifyChanges();
    render('Texto atualizado. Salve para manter as alterações.');
  });

  document.getElementById('apply-colors')?.addEventListener('click', () => {
    if (!canSave) return;
    const primary = document.getElementById('color-primary')?.value;
    const bg = document.getElementById('color-background')?.value;
    if (!/^#[0-9a-f]{6}$/i.test(primary || '') || !/^#[0-9a-f]{6}$/i.test(bg || '')) {
      status.textContent = 'Escolha cores válidas.';
      return;
    }
    const doc = parse();
    const id = 'thiagoia-v2-custom-colors';
    let style = doc.getElementById(id);
    if (!style) {
      style = doc.createElement('style');
      style.id = id;
      doc.head.append(style);
    }
    style.textContent = `:root{--primary-color:${primary};--secondary-color:${primary};--accent-color:${primary};--primary:${primary}} body{background-color:${bg} !important} h1,h2,h3{color:${primary}} button,.btn-primary,.cta-button{background-color:${primary}}`;
    code.value = serialize(doc);
    updateElements();
    notifyChanges();
    render('Cores aplicadas. Confira a prévia antes de salvar.');
  });

  document.querySelectorAll('[data-device]').forEach(btn => btn.addEventListener('click', () => {
    preview.dataset.device = btn.dataset.device;
    document.querySelectorAll('[data-device]').forEach(b => {
      b.setAttribute('aria-pressed', String(b === btn));
    });
  }));

  document.getElementById('mode-code')?.addEventListener('click', event => {
    const pane = document.querySelector('.editor-panel');
    const workspace = document.querySelector('.workspace');
    if (!pane || !workspace) return;
    const hidden = pane.classList.toggle('is-hidden');
    workspace.classList.toggle('code-hidden', hidden);
    event.currentTarget.setAttribute('aria-pressed', String(hidden));
    event.currentTarget.textContent = hidden ? 'Mostrar HTML' : 'Ocultar HTML';
  });

  code.addEventListener('input', notifyChanges);

  saveButton.addEventListener('click', () => {
    if (!canSave) return;
    if (!code.value.trim()) {
      status.textContent = 'Não há um site para salvar.';
      return;
    }
    try {
      if (projectId !== null) {
        const projects = readProjects();
        const index = projects.findIndex(item => item && item.id === projectId);
        if (index < 0) throw new Error('Projeto não encontrado. Nada foi sobrescrito.');
        projects[index] = {
          ...projects[index],
          html: code.value,
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
      } else {
        // Mantém compatibilidade com o rascunho legado, sem editar nenhum projeto salvo.
        localStorage.setItem(LEGACY_KEY, code.value);
      }
      saveButton.textContent = '✓ Salvo neste navegador';
      status.textContent = projectId !== null
        ? 'Alterações salvas somente neste projeto.'
        : 'Rascunho salvo neste navegador. Para vários projetos, use Meus Projetos.';
    } catch (error) {
      console.error('Erro ao salvar projeto:', error);
      saveButton.textContent = 'Erro ao salvar';
      status.textContent = 'Não foi possível salvar: ' + error.message;
    }
  });

  document.getElementById('download')?.addEventListener('click', () => {
    if (!code.value.trim()) { status.textContent = 'Não há código para baixar.'; return; }
    const blob = new Blob([code.value], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'meu-site.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Download solicitado.';
  });
})();
