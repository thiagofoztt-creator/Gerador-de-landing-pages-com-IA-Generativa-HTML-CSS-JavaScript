document.addEventListener('DOMContentLoaded', () => {
  const botao = document.getElementById('btnGerar');
  const campo = document.getElementById('prompt');
  const status = document.getElementById('status');
  const resultado = document.getElementById('resultado');
  const preview = document.getElementById('preview');
  if (!botao || !campo || !status || !resultado || !preview) {
    console.error('Elementos da interface não encontrados.'); return;
  }
  preview.setAttribute('sandbox', '');
  const editorBtn = document.createElement('button');
  editorBtn.type = 'button'; editorBtn.textContent = '✎ Editar site';
  editorBtn.className = 'btn-gerar'; editorBtn.style.marginTop = '12px';
  editorBtn.hidden = true;
  resultado.appendChild(editorBtn);
  editorBtn.addEventListener('click', () => {
    if (!preview.srcdoc) return;
    try { sessionStorage.setItem('thiagoia-editor-html-v1', preview.srcdoc); }
    catch (_) { status.textContent = 'Armazenamento indisponível. Não foi possível abrir o editor.'; return; }
    window.location.assign('/editor.html');
  });
  botao.addEventListener('click', async () => {
    const descricao = campo.value.trim();
    if (descricao.length < 5 || descricao.length > 500) {
      status.textContent = 'Digite uma descrição entre 5 e 500 caracteres.'; return;
    }
    let turnstileToken = '';
    try { turnstileToken = window.turnstile?.getResponse() || ''; }
    catch (erro) { console.error('Erro no Turnstile:', erro); }
    if (!turnstileToken) { status.textContent = 'Conclua a verificação de segurança.'; return; }
    botao.disabled = true; editorBtn.hidden = true;
    status.textContent = 'Gerando sua página...'; resultado.style.display = 'none';
    try {
      const resposta = await fetch('/gerar', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({descricao,turnstileToken})
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || 'Erro ao gerar página.');
      if (typeof dados.codigo !== 'string' || !dados.codigo.trim()) throw new Error('A IA não retornou código válido.');
      preview.srcdoc = dados.codigo;
      resultado.style.display = 'block'; editorBtn.hidden = false;
      status.textContent = 'Página gerada com sucesso!';
    } catch (erro) {
      status.textContent = erro.message || 'Não foi possível gerar a página.';
      console.error('Erro na geração:', erro);
    } finally {
      botao.disabled = false;
      if (window.turnstile) { try { window.turnstile.reset(); } catch (erro) { console.error('Erro ao reiniciar Turnstile:', erro); } }
    }
  });
});
