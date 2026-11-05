# Rà soát bảo mật — <tiêu đề tính năng>

Kết quả: **<ĐẠT | CHƯA ĐẠT>** · Critical <n> · High <n> · Medium <n> · Low <n>
Nhánh: `<feat/...>` so với `<origin/development>` · Spec: [spec.md](spec.md) · Kế hoạch: [plan.md](plan.md)

## Công cụ đã chạy
| Công cụ | Đã chạy? | Phát hiện | Ghi chú |
|---|---|---|---|
| Mẫu bí mật (có sẵn) | có | <n> | |
| gitleaks | <có/không> | <n/—> | <chưa cài…> |
| semgrep (OWASP Top 10) | <có/không> | <n/—> | |
| Kiểm tra thư viện (npm audit / pip-audit) | <có/không/không áp dụng> | <n/—> | |
| Rà soát diff thủ công (AI) | có | <n> | |

## Phát hiện
| ID | Mức | Vị trí | Vấn đề — kẻ tấn công làm được gì | Cách sửa |
|---|---|---|---|---|
| SEC-1 | High | `src/.../ReportController.java:42` | <id báo cáo lấy từ URL, không kiểm tra thuộc phòng ban của người gọi → xem báo cáo của phòng khác (IDOR)> | <kiểm tra quyền ở service; trả 404> |

## Đã loại (dương tính giả)
- <công cụ · file:dòng> — <vì sao không phải lỗ hổng>

## Đã kiểm, không thấy vấn đề
- Phân quyền endpoint mới · Injection · Bí mật trong code/log · Phiên đăng nhập & cookie · Cấu hình (CORS, debug) · Thư viện · Upload & giới hạn đầu vào

## Rủi ro còn lại / cần người quyết
- <điều không tự kiểm được, ví dụ cần môi trường thật>
