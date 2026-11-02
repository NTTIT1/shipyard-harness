import { tr } from './i18n.js';
// Pure helpers for the Users screen (account administration + own password).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;

export function validatePassword(pw, confirm) {
  if ((pw || '').length < MIN_PASSWORD) return tr('Mật khẩu cần ít nhất {0} ký tự.', [MIN_PASSWORD]);
  if (confirm !== undefined && pw !== confirm) return tr('Mật khẩu nhập lại không khớp.');
  return '';
}

export function validateNewUser({ email, fullName, password }) {
  if (!EMAIL.test((email || '').trim())) return tr('Email không hợp lệ.');
  if (!(fullName || '').trim()) return tr('Họ tên không được để trống.');
  return validatePassword(password);
}

export function userState(u, now = Date.now()) {
  if (u.status === 'DISABLED') return { tone: 'danger', label: tr('Đã khoá') };
  if (u.lockedUntil && Date.parse(u.lockedUntil) > now) return { tone: 'warn', label: tr('Tạm khoá (sai mật khẩu)') };
  return { tone: 'ok', label: tr('Hoạt động') };
}

export const isAdmin = u => !!u && (u.role === 'SYS_ADMIN' || u.systemRole === 'SYS_ADMIN');

const LOGIN_ERRORS = [
  [/^Invalid email or password/, tr('Sai email hoặc mật khẩu.')],
  [/^Account is disabled/, tr('Tài khoản đã bị khoá. Liên hệ quản trị viên.')],
  [/^Account is temporarily locked/, tr('Sai mật khẩu quá nhiều lần — tài khoản tạm khoá 15 phút.')],
];
export const loginErrorVi = msg => (LOGIN_ERRORS.find(([re]) => re.test(msg || '')) || [null, msg])[1];
