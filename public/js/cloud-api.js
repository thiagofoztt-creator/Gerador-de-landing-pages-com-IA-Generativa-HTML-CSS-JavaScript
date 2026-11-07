// Cliente de projetos na nuvem: somente chamadas na mesma origem.
// A identidade do proprietario e determinada no servidor pela sessao HttpOnly.
export async function cloudRequest(path, { method = 'GET', data } = {}) {
  if (!/^\/api\/projects(?:\/|\?|$)/.test(path)) {
    throw new Error('Rota de projetos inválida.');
  }

  const options = {
    method,
    credentials: 'same-origin',
    cache: 'no-store'
  };
  if (data !== undefined) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(data);
  }

  let response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new Error('Sem conexão com o servidor. Os projetos locais continuam disponíveis.');
  }

  const type = response.headers?.get('content-type') || '';
  if (!type.toLowerCase().includes('application/json')) {
    throw new Error('O servidor retornou uma resposta inesperada.');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Resposta inválida do servidor.');
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Faça login para acessar seus projetos na nuvem.');
    }
    if (response.status === 503) {
      throw new Error('Projetos na nuvem ainda indisponíveis. Seus projetos locais estão preservados.');
    }
    throw new Error(typeof payload?.erro === 'string'
      ? payload.erro
      : 'Não foi possível acessar o projeto na nuvem.');
  }
  return payload;
}

export const listCloudProjects = cursor => cloudRequest(
  '/api/projects' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : '')
);
export const getCloudProject = id => cloudRequest(
  '/api/projects/' + encodeURIComponent(id)
);
export const createCloudProject = (name, html) => cloudRequest('/api/projects', {
  method: 'POST',
  data: { name, html }
});
export const updateCloudProject = (id, name, html, expectedRevision) => cloudRequest(
  '/api/projects/' + encodeURIComponent(id),
  { method: 'PUT', data: { name, html, expectedRevision } }
);
