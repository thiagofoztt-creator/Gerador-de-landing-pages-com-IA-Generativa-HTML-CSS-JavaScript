import { describe, it, expect } from 'vitest';
import worker from '../worker/index.js';

const ORIGIN = 'https://auth-test.example';
const FAIL_CLOSED = {
  DB: {},
  AUTH_RATE_LIMIT: {
    limit: async () => ({ success: true })
  },
  TURNSTILE_SECRET_KEY: 'apenas-testes'
};

function requisicao(path, options = {}) {
  return new Request(ORIGIN + path, options);
}

describe('Rotas de autenticacao - respostas de seguranca', () => {
  it('rejeita metodo GET de login e de logout', async () => {
    expect((await worker.fetch(requisicao('/api/auth/login'), FAIL_CLOSED)).status).toBe(405);
    expect((await worker.fetch(requisicao('/api/auth/logout'), FAIL_CLOSED)).status).toBe(405);
  });

  it('recusa chamadas de login sem Origin ou com origem externa', async () => {
    for (const headers of [{}, { Origin: 'https://atacante.example' }]) {
      const resposta = await worker.fetch(requisicao('/api/auth/login', {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}'
      }), FAIL_CLOSED);
      expect(resposta.status).toBe(403);
    }
  });

  it('recusa tipos de conteúdo incorretos e JSON malformado', async () => {
    const errTipo = await worker.fetch(requisicao('/api/auth/login', {
      method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'text/plain', 'CF-Connecting-IP': '192.0.2.2' }, body: '{}'
    }), FAIL_CLOSED);
    expect(errTipo.status).toBe(415);

    const errJson = await worker.fetch(requisicao('/api/auth/login', {
      method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.2' }, body: '{"email":'
    }), FAIL_CLOSED);
    expect(errJson.status).toBe(400);
  });

  it('rejeita login sem Turnstile e mantém headers anti-cache', async () => {
    const resposta = await worker.fetch(requisicao('/api/auth/login', {
      method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.2' }, body: '{}'
    }), FAIL_CLOSED);
    expect(resposta.status).toBe(403);
    expect(resposta.headers.get('Cache-Control')).toBe('no-store');
    expect(resposta.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('exige cookie de sessão para /api/auth/me', async () => {
    const semCookie = await worker.fetch(requisicao('/api/auth/me'), FAIL_CLOSED);
    expect(semCookie.status).toBe(401);
    expect((await semCookie.json()).autenticado).not.toBe(true);
  });

  it('impede CSRF no logout e mantém cookie em logout sem sessão', async () => {
    const origemExterna = await worker.fetch(requisicao('/api/auth/logout', {
      method: 'POST', headers: { Origin: 'https://atacante.example' }
    }), FAIL_CLOSED);
    expect(origemExterna.status).toBe(403);

    const semSessao = await worker.fetch(requisicao('/api/auth/logout', {
      method: 'POST', headers: { Origin: ORIGIN }
    }), FAIL_CLOSED);
    expect(semSessao.status).toBe(401);
    expect(semSessao.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });

  it('nega cadastro quando o recurso está desabilitado', async () => {
    const resposta = await worker.fetch(requisicao('/api/auth/register', {
      method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: '{}'
    }), { ...FAIL_CLOSED, ENABLE_AUTH_REGISTRATION: 'false' });
    expect(resposta.status).toBe(503);
  });
});
