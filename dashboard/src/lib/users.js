// Pure helpers for the Users screen (account administration + own password).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;

export function validatePassword(pw, confirm) {
  if ((pw || '').length < MIN_PASSWORD) return `Mật khẩu cần ít nhất ${MIN_PASSWORD} ký tự.`;
  if (confirm !== undefined && pw !== confirm) return 'Mật khẩu nhập lại không khớp.';
  return '';
}

export function validateNewUser({ email, fullName, password }) {
  if (!EMAIL.test((email || '').trim())) return 'Email không hợp lệ.';
  if (!(fullName || '').trim()) return 'Họ tên không được để trống.';
  return validatePassword(password);
}

export function userState(u, now = Date.now()) {
  if (u.status === 'DISABLED') return { tone: 'danger', label: 'Đã khoá' };
  if (u.lockedUntil && Date.parse(u.lockedUntil) > now) return { tone: 'warn', label: 'Tạm khoá (sai mật khẩu)' };
  return { tone: 'ok', label: 'Hoạt động' };
}

export const isAdmin = u => !!u && (u.role === 'SYS_ADMIN' || u.systemRole === 'SYS_ADMIN');

const LOGIN_ERRORS = [
  [/^Invalid email or password/, 'Sai email hoặc mật khẩu.'],
  [/^Account is disabled/, 'Tài khoản đã bị khoá. Liên hệ quản trị viên.'],
  [/^Account is temporarily locked/, 'Sai mật khẩu quá nhiều lần — tài khoản tạm khoá 15 phút.'],
];
export const loginErrorVi = msg => (LOGIN_ERRORS.find(([re]) => re.test(msg || '')) || [null, msg])[1];
