import test from 'node:test';
import assert from 'node:assert/strict';

import { loginUser } from './login.js';
import { checkAuthRateLimit } from './rate-limit.js';
import { validateAuthTurnstile } from './turnstile.js';
import { readSessionCookie, clearSessionCookie } from './session.js';

const ORIGIN = 'https://app.example';

function request(path = '/api/auth/login', headers = {}) {
  return new Request(ORIGIN + path, { headers });
}

test('login recusa senhas vazias e com mais de 256 bytes UTF-8 antes do banco', async () => {
  let chamadasBanco = 0;
  const db = { prepare() { chamadasBanco++; throw new Error('Não deveria acessar D1'); } };

  for (const password of ['', '🔐'.repeat(65), 123, null]) {
    const resultado = await loginUser(db, { email: 'teste@example.com', password });
    assert.equal(resultado.status, 400);
    assert.equal(resultado.error, 'Dados de acesso inválidos.');
  }
  assert.equal(chamadasBanco, 0);
});

test('rate limit de autenticação falha fechado sem binding ou sem IP confiável', async () => {
  const req = request('/api/auth/login');
  assert.equal((await checkAuthRateLimit(req, {}, 'login')).status, 503);
  const env = { AUTH_RATE_LIMIT: { async limit() { return { success: true }; } } };
  assert.equal((await checkAuthRateLimit(req, env, 'login')).status, 503);
  assert.equal((await checkAuthRateLimit(req, env, 'rota-inexistente')).status, 400);
});

test('rate limit separa ações e IPs e bloqueia quando recebe success=false', async () => {
  const keys = [];
  const env = {
    AUTH_RATE_LIMIT: {
      async limit({ key }) {
        keys.push(key);
        return { success: keys.length < 2 };
      }
    }
  };
  const req = request('/api/auth/login', { 'CF-Connecting-IP': '192.0.2.2' });
  assert.equal((await checkAuthRateLimit(req, env, 'login')).allowed, true);
  assert.equal((await checkAuthRateLimit(req, env, 'register')).status, 429);
  assert.deepEqual(keys, ['auth:login:192.0.2.2', 'auth:register:192.0.2.2']);
});

test('Turnstile nega token ausente ou secret ausente sem acessar rede', async () => {
  const req = request();
  assert.equal(await validateAuthTurnstile(req, {}, 'token', 'login'), false);
  assert.equal(await validateAuthTurnstile(req, { TURNSTILE_SECRET_KEY: 'fake' }, '', 'login'), false);
  assert.equal(await validateAuthTurnstile(req, { TURNSTILE_SECRET_KEY: 'fake' }, 'x'.repeat(2049), 'login'), false);
});

test('Turnstile exige hostname e action corretos e nunca aceita erro HTTP', async () => {
  const originalFetch = globalThis.fetch;
  const env = { TURNSTILE_SECRET_KEY: 'secret-test-only' };
  const req = request('/api/auth/login', { 'CF-Connecting-IP': '192.0.2.20' });
  const responses = [
    { success: true, hostname: 'app.example', action: 'login' },
    { success: true, hostname: 'atacante.example', action: 'login' },
    { success: true, hostname: 'app.example', action: 'register' },
    { success: false, hostname: 'app.example', action: 'login' }
  ];
  const chamadas = [];
  try {
    globalThis.fetch = async (url, options) => {
      chamadas.push({ url, body: JSON.parse(options.body) });
      return Response.json(responses.shift());
    };
    assert.equal(await validateAuthTurnstile(req, env, 'token-valido', 'login'), true);
    for (let i = 0; i < 3; i++) {
      assert.equal(await validateAuthTurnstile(req, env, 'token-valido', 'login'), false);
    }
    assert.equal(chamadas.length, 4);
    assert.ok(chamadas.every(c => c.url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify'));
    assert.ok(chamadas.every(c => c.body.secret === 'secret-test-only' && c.body.remoteip === '192.0.2.20'));
    globalThis.fetch = async () => new Response('erro', { status: 503 });
    assert.equal(await validateAuthTurnstile(req, env, 'token', 'login'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('cookie da sessão exige nome exato e remoção mantém atributos de segurança', () => {
  const cookie = '__Host-thiagoia_session=token-de-teste';
  const req = request('/api/auth/me', { Cookie: `outro=valor; ${cookie}; x=y` });
  assert.equal(readSessionCookie(req), 'token-de-teste');
  assert.equal(readSessionCookie(request('/api/auth/me', { Cookie: '__Host-thiagoia_session2=malicioso' })), null);
  assert.match(clearSessionCookie(), /Max-Age=0/);
  assert.match(clearSessionCookie(), /Secure/);
  assert.match(clearSessionCookie(), /HttpOnly/);
  assert.match(clearSessionCookie(), /SameSite=Lax/);
  assert.doesNotMatch(clearSessionCookie(), /Domain=/);
});
