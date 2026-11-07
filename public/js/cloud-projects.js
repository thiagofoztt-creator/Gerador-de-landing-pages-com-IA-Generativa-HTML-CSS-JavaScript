import { listCloudProjects, createCloudProject } from './cloud-api.js';

const area = document.getElementById('cloud-projects');
const status = document.getElementById('cloud-status');
const refresh = document.getElementById('cloud-refresh');
const localArea = document.getElementById('projects');

if (area && status && refresh && localArea) {
  let loading = false;
  let nextCursor = null;

  function message(text) { status.textContent = text; }
  function makeButton(label, action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.addEventListener('click', action);
    return btn;
  }

  async function importCopy(project, button) {
    // Nunca mover, apagar ou alterar o registro local apos criar a copia.
    if (typeof project.html !== 'string' || !project.html.trim()) {
      message('Este projeto não contém HTML para enviar.');
      return;
    }
    const confirmation = confirm(
      'Enviar uma cópia de “' + project.name + '” à sua conta? O original continuará neste navegador.'
    );
    if (!confirmation) return;
    button.disabled = true;
    try {
      const created = await createCloudProject(project.name || 'Projeto sem nome', project.html);
      if (!created.project?.id) throw new Error('O servidor não confirmou a cópia.');
      message('Cópia enviada à nuvem. O projeto local foi preservado.');
      await load(false);
    } catch (error) {
      message('Falha ao copiar: ' + error.message + ' O original local foi preservado.');
    } finally {
      button.disabled = false;
    }
  }

  function addImportActions() {
    // A lista local e reconstruida por projetos.js. Cada card recebe
    // sua propria acao, sem tocar nos controles de exclusao/edicao local.
    let saved = [];
    try {
      const parsed = JSON.parse(localStorage.getItem('thiagoia-projects-v1') || '[]');
      if (Array.isArray(parsed)) saved = parsed;
    } catch {
      message('Lista local inválida. Faça um backup antes de tentar importar.');
      return;
    }
    const cards = Array.from(localArea.children || []);
    for (const card of cards) {
      const link = card.querySelector?.('a.open');
      const controls = card.querySelector?.('.controls');
      if (!link || !controls || controls.querySelector?.('[data-cloud-copy]')) continue;
      const matching = saved.find(p => p && link.getAttribute('href') ===
        'editor.html?project=' + encodeURIComponent(p.id));
      if (!matching) continue;
      const action = makeButton('Copiar para nuvem', () => importCopy(matching, action));
      action.dataset.cloudCopy = 'true';
      action.setAttribute('data-cloud-copy', '');
      controls.append(action);
    }
  }

  function render(projects, append) {
    if (!append) area.replaceChildren();
    for (const project of projects) {
      const card = document.createElement('article');
      card.className = 'card';
      const name = document.createElement('h3');
      name.textContent = project.name || 'Projeto sem nome';
      const link = document.createElement('a');
      link.textContent = 'Abrir editor na nuvem';
      link.href = 'editor.html?cloud=' + encodeURIComponent(project.id);
      link.className = 'open';
      const date = document.createElement('p');
      date.className = 'date';
      const timestamp = Date.parse(project.updatedAt);
      date.textContent = Number.isFinite(timestamp)
        ? 'Atualizado em ' + new Date(timestamp).toLocaleString('pt-BR')
        : 'Data não disponível';
      card.append(name, date, link);
      area.append(card);
    }
    if (!area.children.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'Nenhum projeto na nuvem.';
      area.append(empty);
    }
  }

  async function load(more = false) {
    if (loading) return;
    loading = true;
    refresh.disabled = true;
    message('Consultando projetos da sua conta...');
    try {
      const result = await listCloudProjects(more ? nextCursor : null);
      if (!Array.isArray(result.projects)) throw new Error('Lista inválida do servidor.');
      render(result.projects, more);
      nextCursor = result.nextCursor || null;
      message('Projetos da conta carregados.' +
        (nextCursor ? ' Há mais projetos para carregar.' : ''));
      const moreButton = document.getElementById('cloud-more');
      if (moreButton) {
        moreButton.hidden = !nextCursor;
        moreButton.disabled = !nextCursor;
      }
      addImportActions();
    } catch (error) {
      // Falhas da nuvem nao escondem nem apagam os projetos locais.
      message(error.message);
    } finally {
      loading = false;
      refresh.disabled = false;
    }
  }

  refresh.addEventListener('click', () => load(false));
  document.getElementById('cloud-more')?.addEventListener('click', () => load(true));
  // Apenas sob comando do usuario, nunca buscar nem importar automaticamente.
  // A funcionalidade pode estar desabilitada ate a migracao autorizada no D1.
}
