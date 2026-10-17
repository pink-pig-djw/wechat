const TOKEN_KEY = 'weiliao.token';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

let unauthorizedHandler = () => {};
export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage blocked: the session simply won't survive a reload
  }
}

async function request(method, url, body) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`/api${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError('网络连接失败，请检查网络', 0);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON (e.g. proxy error page)
  }
  if (res.status === 401 && token && !url.startsWith('/auth/')) unauthorizedHandler();
  if (!res.ok) throw new ApiError(data?.error ?? `请求失败（${res.status}）`, res.status);
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
};

/** Upload with progress. `kind` is "image" (validated server-side) or "file". */
export function uploadFile(file, { kind = 'image', onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/upload?kind=${kind}`);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // ignore
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(data?.error ?? '上传失败', xhr.status));
    };
    xhr.onerror = () => reject(new ApiError('网络连接失败，上传未完成', 0));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}
