# QC Plan — Ca kiểm thử — <tiêu đề tính năng>

Spec: [spec.md](spec.md) · Nghiệp vụ: [ba.md](ba.md) · Thiết kế: [design.md](design.md)

## Phạm vi
- Trong phạm vi: <màn hình, API, luồng>
- Ngoài phạm vi: <không kiểm, vì sao>
- Dữ liệu & tài khoản cần có: <vai trò, dữ liệu mẫu>

## Ca kiểm thử
Mỗi ca có mã `TC-<n>` (giữ nguyên mã khi sửa — kết quả, bằng chứng và bug đều gắn vào mã này).
Loại: `UI` (chạy trên trình duyệt/app), `API`, `Unit` (test tự động). Ưu tiên: `P1` (bắt buộc đạt) · `P2` · `P3`.

| Mã | Ca kiểm thử | Loại | Ưu tiên | AC/BR | Điều kiện trước | Các bước | Kết quả mong đợi |
|---|---|---|---|---|---|---|---|
| TC-1 | <đăng nhập đúng mật khẩu> | UI | P1 | AC-1 | <tài khoản nhân viên đã có> | 1. <mở /login> 2. <nhập…> 3. <bấm Đăng nhập> | <vào trang chủ, thấy tên người dùng> |
| TC-2 | <sai mật khẩu — ca âm> | UI | P1 | AC-1 | | | <báo lỗi, không đăng nhập> |

## Hồi quy (smoke)
- <luồng cũ phải còn chạy: đăng nhập, menu chính, ≥3 màn hình không liên quan>

## Độ phủ
| AC/BR | Ca kiểm thử |
|---|---|
| AC-1 | TC-1, TC-2 |
