// Live UI flow for account administration: admin creates a user, locks/unlocks, resets the password;
// the user signs in, sees only "Tài khoản", changes their own password and signs in again.
// Needs: bin/platform.sh start; a dashboard (DASH, default :8099); Chrome at CHROME_BIN or /usr/bin/google-chrome.
// Leaves the created account DISABLED.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const DASH = process.env.DASH || 'http://127.0.0.1:8099';
const ADMIN_PW = process.env.ADMIN_PASSWORD || 'admin123';
const OUT = process.env.SHOTS || path.resolve('e2e/shots');
fs.mkdirSync(OUT, { recursive: true });
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok -', m); };

const EMAIL = `ui-e2e-${Date.now()}@test.local`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome' });

async function signIn(page, email, pw) {
  await page.goto(DASH);
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', pw);
  await page.click('button[type=submit]');
}

// --- admin ---
const admin = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
admin.on('dialog', d => d.accept());
await signIn(admin, 'admin@shipyard.local', ADMIN_PW);
await admin.waitForSelector('.sb-user');
await admin.getByRole('button', { name: 'Người dùng' }).click();
await admin.getByRole('heading', { name: 'Người dùng' }).waitFor();

await admin.fill('input[aria-label="Email"]', EMAIL);
await admin.fill('input[aria-label="Họ tên"]', 'Kiểm Thử UI');
await admin.fill('input[aria-label="Mật khẩu ban đầu"]', 'short');
await admin.getByRole('button', { name: 'Tạo tài khoản' }).click();
ok(await admin.getByText(/ít nhất 8 ký tự/).isVisible(), 'short password rejected client-side');
await admin.fill('input[aria-label="Mật khẩu ban đầu"]', 'first-pass1');
await admin.getByRole('button', { name: 'Tạo tài khoản' }).click();
const row = admin.locator('tr', { hasText: EMAIL });
await row.waitFor();
ok(await row.getByText('Hoạt động').isVisible(), 'new user listed as active');
await admin.screenshot({ path: `${OUT}/u1-users.png`, fullPage: true });

await row.getByRole('button', { name: 'Khoá' }).click();
await row.getByText('Đã khoá').waitFor();
ok(true, 'lock shows "Đã khoá"');
await row.getByRole('button', { name: 'Mở khoá' }).click();
await row.getByText('Hoạt động').waitFor();
ok(true, 'unlock restores "Hoạt động"');

await row.getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
await admin.fill('.modal-panel input[aria-label="Mật khẩu mới"]', 'reset-pass1');
await admin.fill('.modal-panel input[aria-label="Nhập lại mật khẩu"]', 'reset-pass1');
await admin.screenshot({ path: `${OUT}/u2-reset.png` });
await admin.locator('.modal-panel').getByRole('button', { name: 'Đặt lại' }).click();
await admin.getByText(`Đã đặt lại mật khẩu cho ${EMAIL}.`).waitFor();
ok(true, 'admin reset the password');
ok(await admin.locator('tr', { hasText: '(bạn)' }).getByRole('button', { name: 'Khoá' }).count() === 0, 'admin has no lock button on own row');

// --- the new user ---
const user = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await signIn(user, EMAIL, 'first-pass1');
ok(await user.getByRole('alert').waitFor({ timeout: 8000 }).then(() => true, () => false), 'old password no longer works');
await signIn(user, EMAIL, 'reset-pass1');
await user.waitForSelector('.topbar, .sb-user', { state: 'attached' });
const menu = user.getByRole('button', { name: 'Mở danh sách lane' });
if (await menu.count()) await menu.first().click();
await user.getByRole('button', { name: 'Tài khoản' }).click();
await user.getByRole('heading', { name: 'Tài khoản' }).waitFor();
ok(await user.getByText('Tạo tài khoản').count() === 0, 'plain user sees no admin section');
await user.fill('input[aria-label="Mật khẩu hiện tại"]', 'reset-pass1');
await user.fill('input[aria-label="Mật khẩu mới"]', 'mine-pass99');
await user.fill('input[aria-label="Nhập lại mật khẩu mới"]', 'mine-pass99');
await user.screenshot({ path: `${OUT}/u3-account-mobile.png`, fullPage: true });
await user.getByRole('button', { name: 'Đổi mật khẩu' }).click();
await user.waitForSelector('input[type=email]', { timeout: 10000 });
ok(true, 'own password change signs the user out');
await signIn(user, EMAIL, 'mine-pass99');
await user.waitForSelector('.sb-user', { state: 'attached' });
ok(true, 'user signs in with the new password');

// --- cleanup ---
await admin.reload();
await admin.getByRole('button', { name: 'Người dùng' }).click();
await admin.locator('tr', { hasText: EMAIL }).getByRole('button', { name: 'Khoá' }).click();
await admin.locator('tr', { hasText: EMAIL }).getByText('Đã khoá').waitFor();
ok(true, 'test account left disabled');
await browser.close();
