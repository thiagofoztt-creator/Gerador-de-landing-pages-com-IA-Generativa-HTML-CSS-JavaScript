(() => {
  'use strict';

  const KEY = 'thiagoia-projects-v1';
  const LEGACY = 'thiagoia-editor-html-v1';
  const area = document.getElementById('projects');
  const message = document.getElementById('message');
  if (!area || !message) return;

  const read = () => {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  };
  const write = projects => localStorage.setItem(KEY, JSON.stringify(projects));
  const uuid = () => (typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  const notify = text => { message.textContent = text; };

  // Migração única do HTML usado antes da implementação de múltiplos projetos.
  try {
    if (localStorage.getItem('thiagoia-legacy-imported-v1') !== 'yes') {
      const previous = localStorage.getItem(LEGACY);
      const projects = read();
      if (previous && !projects.some(p => p.html === previous)) {
        const title = new DOMParser().parseFromString(previous, 'text/html').title || 'Projeto recuperado';
        const now = new Date().toISOString();
        projects.push({ id: uuid(), name: title.slice(0, 80), html: previous, createdAt: now, updatedAt: now });
        write(projects);
      }
      localStorage.setItem('thiagoia-legacy-imported-v1', 'yes');
    }
  } catch { notify('O armazenamento do navegador não está disponível.'); }

  function button(label, className, onClick) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.className = className;
    element.addEventListener('click', onClick);
    return element;
  }

  function backup(project) {
    if (typeof project.html !== 'string' || !project.html.trim()) {
      notify('Este projeto não contém HTML para exportar.');
      return;
    }
    const blob = new Blob([project.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = (project.name || 'projeto').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 55) + '.html';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    notify(`Download solicitado para “${project.name}”.`);
  }

  function rename(project) {
    const answer = prompt('Novo nome do projeto (até 80 caracteres):', project.name);
    if (answer === null) return;
    const newName = answer.trim();
    if (!newName || newName.length > 80) {
      notify('Informe um nome de 1 a 80 caracteres.');
      return;
    }
    try {
      const projects = read();
      const index = projects.findIndex(p => p.id === project.id);
      if (index === -1) { notify('Projeto não encontrado.'); return; }
      projects[index] = { ...projects[index], name: newName, updatedAt: new Date().toISOString() };
      write(projects);
      notify('Projeto renomeado. O HTML e o identificador foram preservados.');
      render();
    } catch { notify('Não foi possível renomear.'); }
  }

  function remove(project) {
    const confirmation = prompt(
      `Esta exclusão é permanente neste navegador. Faça um backup antes, se necessário.\n\nPara excluir “${project.name}”, digite exatamente o nome do projeto:`,
      ''
    );
    if (confirmation === null) return;
    if (confirmation !== project.name) {
      notify('Nome diferente: exclusão cancelada.');
      return;
    }
    try {
      const projects = read();
      if (!projects.some(p => p.id === project.id)) { notify('Projeto não encontrado.'); return; }
      write(projects.filter(p => p.id !== project.id));
      notify(`Projeto “${project.name}” excluído somente deste navegador.`);
      render();
    } catch { notify('Não foi possível excluir.'); }
  }

  function render() {
    area.replaceChildren();
    const projects = read().slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    if (!projects.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'Nenhum projeto salvo. Gere um site e clique em Salvar neste navegador no editor.';
      area.append(empty);
      return;
    }

    for (const project of projects) {
      const card = document.createElement('article');
      card.className = 'card';
      const icon = document.createElement('div');
      icon.className = 'icon';
      icon.textContent = '✦';
      const name = document.createElement('h2');
      name.textContent = project.name || 'Projeto sem nome';
      const date = document.createElement('p');
      date.className = 'date';
      date.textContent = 'Atualizado em ' + new Date(project.updatedAt || project.createdAt).toLocaleString('pt-BR');
      const controls = document.createElement('div');
      controls.className = 'controls';
      const open = document.createElement('a');
      open.className = 'open';
      open.textContent = 'Abrir editor';
      open.href = 'editor.html?project=' + encodeURIComponent(project.id);
      controls.append(open);
      controls.append(button('Renomear', 'secondary', () => rename(project)));
      controls.append(button('Duplicar', 'secondary', () => {
        try {
          const all = read();
          const source = all.find(p => p.id === project.id);
          if (!source) { notify('Projeto não encontrado.'); return; }
          const now = new Date().toISOString();
          all.push({ ...source, id: uuid(), name: (source.name + ' (cópia)').slice(0, 80), createdAt: now, updatedAt: now });
          write(all);
          notify('Cópia criada com identificador independente.');
          render();
        } catch { notify('Não foi possível duplicar o projeto.'); }
      }));
      controls.append(button('Baixar backup', 'secondary', () => backup(project)));
      controls.append(button('Excluir', 'danger', () => remove(project)));
      card.append(icon, name, date, controls);
      area.append(card);
    }
  }

  render();
})();
