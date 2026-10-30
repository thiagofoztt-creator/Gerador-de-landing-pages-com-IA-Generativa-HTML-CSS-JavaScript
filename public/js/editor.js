(() => {
  'use strict';
  const KEY = 'thiagoia-editor-html-v1';
  const code = document.getElementById('code');
  const preview = document.getElementById('preview');
  const status = document.getElementById('status');
  function render() {
    preview.srcdoc = code.value || '<!doctype html><html lang="pt-BR"><body style="font-family:sans-serif;padding:2rem"><h2>Nenhum site carregado</h2><p>Volte ao gerador para criar seu primeiro site.</p></body></html>';
    status.textContent = 'Prévia atualizada.';
  }
  let initial = '';
  try { initial = sessionStorage.getItem(KEY) || ''; } catch (_) {}
  if (!initial) { try { initial = localStorage.getItem(KEY) || ''; } catch (_) {} }
  code.value = initial;
  render();
  document.getElementById('refresh').addEventListener('click', render);
  document.getElementById('save').addEventListener('click', () => {
    try { localStorage.setItem(KEY, code.value); status.textContent = 'Salvo apenas neste navegador.'; }
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
