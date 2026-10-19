import { authFetch } from './api.js';

// Project wizard client (server: dashboard/server/routes/scaffold.js) + pure helpers for the steps.
async function call(method, url, body) {
  const r = await authFetch(url, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status });
  return j;
}

export const scaffold = {
  catalog: () => call('GET', '/api/scaffold/catalog'),
  start: body => call('POST', '/api/scaffold/jobs', body),
  job: id => call('GET', `/api/scaffold/jobs/${id}`),
  cancel: id => call('POST', `/api/scaffold/jobs/${id}/cancel`),
  retryRegister: id => call('POST', `/api/scaffold/jobs/${id}/register`),
  discard: id => call('DELETE', `/api/scaffold/jobs/${id}`),
};

export const SLUG_RE = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;

/** "Quản lý Kho hàng 2" → "quan-ly-kho-hang-2" (Vietnamese diacritics and đ included). */
export function slugify(name) {
  return (name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^[^a-z]+/, '').replace(/-+$/, '').slice(0, 40).replace(/-+$/, '');
}

export function findStack(catalog, id) {
  for (const l of catalog?.languages || []) {
    const s = l.stacks.find(x => x.id === id);
    if (s) return { ...s, language: l.id, languageLabel: l.label };
  }
  return null;
}

export function defaultOptions(stack) {
  return Object.fromEntries((stack?.options || []).map(o => [o.id, o.default]));
}

/** Wizard steps; the database step disappears for stacks without one (React + Vite). */
export function wizardSteps(stack) {
  return [
    { id: 'info', label: 'Thông tin' },
    { id: 'language', label: 'Ngôn ngữ' },
    { id: 'stack', label: 'Framework' },
    ...(stack?.noDatabase ? [] : [{ id: 'db', label: 'Database' }]),
    { id: 'options', label: 'Tuỳ chọn' },
    { id: 'git', label: 'Kho Git' },
    { id: 'review', label: 'Xem lại' },
  ];
}

/** Why the user cannot leave this step yet ('' = can continue). */
export function stepProblem(step, form, stack) {
  switch (step) {
    case 'info':
      if (!form.name.trim()) return 'Nhập tên dự án';
      if (!SLUG_RE.test(form.slug)) return 'Slug: 3–40 ký tự gồm chữ thường, số, dấu gạch ngang; bắt đầu bằng chữ';
      return '';
    case 'language': return form.language ? '' : 'Chọn ngôn ngữ';
    case 'stack':
      if (!stack) return 'Chọn framework';
      return stack.available ? '' : `Máy chủ thiếu: ${stack.missing.map(m => m.tool).join(', ')}`;
    case 'options':
      for (const o of stack?.options || []) {
        if (o.type === 'text' && !new RegExp(o.pattern).test(String(form.options[o.id] ?? ''))) return `${o.label}: ${o.help || 'không hợp lệ'}`;
      }
      return '';
    default: return '';
  }
}

export function choiceLabel(option, value) {
  if (option.type === 'bool') return value ? 'Có' : 'Không';
  return option.choices?.find(c => c.id === value)?.label ?? String(value ?? '');
}

/** Summary rows for the review step. */
export function summary(form, stack) {
  const rows = [['Tên', form.name], ['Slug', form.slug]];
  if (form.description) rows.push(['Mô tả', form.description]);
  rows.push(['Ngôn ngữ', stack.languageLabel], ['Framework', stack.label]);
  for (const o of stack.options) rows.push([o.label, choiceLabel(o, form.options[o.id])]);
  rows.push(['Kho Git', 'Chỉ trên máy (nhánh main + development)']);
  return rows;
}
