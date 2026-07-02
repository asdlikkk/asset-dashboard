const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type'
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  });
}

function getStorage(env) {
  return env && env.ASSET_DASHBOARD_KV;
}

function getKey(request) {
  const url = new URL(request.url);
  const key = (url.searchParams.get('key') || '').trim();
  if (!/^[a-f0-9]{64}$/.test(key)) return null;
  return `dashboard:${key}`;
}

function normalizeDashboard(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('数据格式无效');
  }
  if (!Array.isArray(data.accounts)) {
    throw new Error('数据缺少 accounts');
  }
  return {
    ...data,
    accounts: data.accounts,
    history: Array.isArray(data.history) ? data.history : [],
    assetHistory: Array.isArray(data.assetHistory) ? data.assetHistory : [],
    yearlyReturns: Array.isArray(data.yearlyReturns) ? data.yearlyReturns : [],
    _pushedAt: data._pushedAt || new Date().toISOString()
  };
}

async function handleGet(request, env) {
  const kv = getStorage(env);
  if (!kv) return jsonResponse({ error: 'KV binding ASSET_DASHBOARD_KV 未配置' }, 500);

  const key = getKey(request);
  if (!key) return jsonResponse({ error: '同步密钥无效' }, 400);

  const raw = await kv.get(key);
  if (!raw) return jsonResponse({ error: '云端暂无数据' }, 404);

  try {
    return jsonResponse(JSON.parse(raw));
  } catch (error) {
    return jsonResponse({ error: '云端数据损坏' }, 500);
  }
}

async function handlePost(request, env) {
  const kv = getStorage(env);
  if (!kv) return jsonResponse({ error: 'KV binding ASSET_DASHBOARD_KV 未配置' }, 500);

  const key = getKey(request);
  if (!key) return jsonResponse({ error: '同步密钥无效' }, 400);

  let data;
  try {
    data = normalizeDashboard(await request.json());
  } catch (error) {
    return jsonResponse({ error: error.message || '请求数据无效' }, 400);
  }

  await kv.put(key, JSON.stringify(data));
  return jsonResponse({
    ok: true,
    pushedAt: data._pushedAt,
    accounts: data.accounts.length
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/data') {
      if (request.method === 'GET') return handleGet(request, env);
      if (request.method === 'POST') return handlePost(request, env);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }
    return env.ASSETS.fetch(request);
  }
};
