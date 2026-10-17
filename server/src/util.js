export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (msg) => new HttpError(400, msg);
export const forbidden = (msg = '没有权限执行该操作') => new HttpError(403, msg);
export const notFound = (msg = '内容不存在') => new HttpError(404, msg);

export function parseJson(text, fallback = null) {
  if (text == null || text === '') return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

/** Read a trimmed string field, enforcing a maximum length (counted in code points). */
export function readString(value, { field, max, min = 0, trim = true, optional = false } = {}) {
  if (value == null) {
    if (optional) return undefined;
    value = '';
  }
  if (typeof value !== 'string') throw badRequest(`${field}格式不正确`);
  const text = trim ? value.trim() : value;
  const length = [...text].length;
  if (length < min) throw badRequest(min === 1 ? `${field}不能为空` : `${field}至少需要${min}个字符`);
  if (max != null && length > max) throw badRequest(`${field}不能超过${max}个字符`);
  return text;
}

export function readId(value, field = 'ID') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest(`${field}不正确`);
  return id;
}

export function readIdList(value, field = '成员') {
  if (!Array.isArray(value)) throw badRequest(`${field}格式不正确`);
  return [...new Set(value.map((v) => readId(v, field)))];
}

/** Only accept references to files we stored ourselves, so clients can't inject arbitrary URLs. */
export function readUploadUrl(value, field = '文件') {
  if (typeof value !== 'string' || !/^\/uploads\/[\w.-]+$/.test(value)) throw badRequest(`${field}地址不正确`);
  return value;
}
