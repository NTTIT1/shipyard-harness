import { describe, it, expect } from 'vitest';
import { validateNewUser, validatePassword, userState, isAdmin } from '../src/lib/users.js';

describe('validateNewUser', () => {
  it('needs a valid email, a name and an 8+ char password', () => {
    expect(validateNewUser({ email: 'a@b.vn', fullName: 'A', password: '12345678' })).toBe('');
    expect(validateNewUser({ email: 'nope', fullName: 'A', password: '12345678' })).toMatch(/Email/);
    expect(validateNewUser({ email: 'a@b.vn', fullName: '  ', password: '12345678' })).toMatch(/Họ tên/);
    expect(validateNewUser({ email: 'a@b.vn', fullName: 'A', password: '1234567' })).toMatch(/8 ký tự/);
  });
});

describe('validatePassword', () => {
  it('enforces length and the confirmation match', () => {
    expect(validatePassword('abcdefgh', 'abcdefgh')).toBe('');
    expect(validatePassword('abc', 'abc')).toMatch(/8 ký tự/);
    expect(validatePassword('abcdefgh', 'abcdefgX')).toMatch(/không khớp/);
  });
});

describe('userState', () => {
  const now = Date.parse('2026-10-16T10:00:00Z');
  it('labels disabled, temporarily locked and active accounts', () => {
    expect(userState({ status: 'DISABLED' }, now)).toEqual({ tone: 'danger', label: 'Đã khoá' });
    expect(userState({ status: 'ACTIVE', lockedUntil: '2026-10-16T10:05:00Z' }, now).label).toMatch(/Tạm khoá/);
    expect(userState({ status: 'ACTIVE', lockedUntil: '2026-10-16T09:00:00Z' }, now)).toEqual({ tone: 'ok', label: 'Hoạt động' });
  });
});

describe('isAdmin', () => {
  it('is true only for SYS_ADMIN (session role or systemRole)', () => {
    expect(isAdmin({ role: 'SYS_ADMIN' })).toBe(true);
    expect(isAdmin({ systemRole: 'SYS_ADMIN' })).toBe(true);
    expect(isAdmin({ role: 'USER' })).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});

describe('loginErrorVi', () => {
  it('translates the platform login errors and passes others through', async () => {
    const { loginErrorVi } = await import('../src/lib/users.js');
    expect(loginErrorVi('Invalid email or password')).toBe('Sai email hoặc mật khẩu.');
    expect(loginErrorVi('Account is disabled. Contact an administrator.')).toMatch(/đã bị khoá/);
    expect(loginErrorVi('Account is temporarily locked due to too many failed attempts. Try again later.')).toMatch(/15 phút/);
    expect(loginErrorVi('Something else')).toBe('Something else');
  });
});
