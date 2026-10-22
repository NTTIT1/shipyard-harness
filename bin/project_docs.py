#!/usr/bin/env python3
"""The project's approved documents, as a prompt section for one pipeline step.

Projects made in the product studio (or given docs by hand) carry what humans approved before any
code: docs/product-brief.md (requirements), docs/architecture.md (system design) and docs/design/
(design.md + mockups/*.html). Every feature must stay true to them, so each step is told which of
them it must follow and how.

  project_docs.py <lane_dir> <step>     prints the section (nothing when the repo has no such docs)

step: pm | ba | arch | design | dev | test | qc  (sub-steps map to these; unknown -> nothing)
"""
import html
import os
import re
import sys

STEP_ALIAS = {"plan-critic": "arch", "ux-design": "design", "ui-design": "design", "design-qa": "design",
              "impl-worker": "dev", "code-review": "dev", "backend-dev": "dev", "frontend-dev": "dev",
              "qc-local": "qc", "senior-gate": "qc"}
MAX_MOCKUPS = 30

HOW = {
    "pm": [
        "Spec của tính năng phải nằm trong phạm vi và đúng với `docs/product-brief.md`: dùng đúng thuật ngữ, vai trò người dùng, quy tắc đã ghi.",
        "Tiêu chí nghiệm thu về giao diện bám theo mockup tương ứng trong `docs/design/mockups/` (nêu tên file).",
        "Điều gì mâu thuẫn với tài liệu đã duyệt: ghi vào `## Câu hỏi mở`, không tự đổi.",
    ],
    "ba": [
        "Luồng, quy tắc nghiệp vụ và trường dữ liệu phải khớp `docs/product-brief.md` và mô hình dữ liệu trong `docs/architecture.md`.",
        "Màn hình và trạng thái trong ba.md lấy theo mockup đã duyệt trong `docs/design/mockups/`.",
    ],
    "arch": [
        "Kế hoạch theo đúng module, mô hình dữ liệu, API và cấu trúc thư mục của `docs/architecture.md`.",
        "Task giao diện trong tasks.md ghi rõ mockup nào (file trong `docs/design/mockups/`) mà task đó phải làm giống.",
    ],
    "design": [
        "ĐÃ CÓ THIẾT KẾ ĐƯỢC DUYỆT: không vẽ lại từ đầu. Màn hình nào của tính năng đã có trong `docs/design/mockups/` thì lấy file đó làm bản gốc "
        "(chép sang `$SPEC_DIR/design/src/` rồi chỉ bổ sung phần tính năng này cần: trạng thái rỗng/lỗi/đang tải, chi tiết còn thiếu).",
        "Giữ nguyên màu, font, khoảng cách, bố cục và cách đặt tên trong `docs/design/design.md`; màn hình mới phải cùng phong cách.",
        "Mọi chỗ khác bản đã duyệt: liệt kê trong design.md mục `## Khác với thiết kế đã duyệt` kèm lý do.",
    ],
    "dev": [
        "Giao diện phải làm GIỐNG mockup đã duyệt: mở file HTML tương ứng trong `docs/design/mockups/` (và mockup của tính năng trong `$SPEC_DIR/design/` nếu có) "
        "— bố cục, chữ, màu, khoảng cách, trạng thái, nhãn tiếng Việt; lấy token màu/font từ `docs/design/design.md`.",
        "Code theo module, mô hình dữ liệu, API và cấu trúc thư mục trong `docs/architecture.md`; hành vi theo `docs/product-brief.md`.",
        "Không tự đổi thiết kế hay phạm vi; chỗ buộc phải khác thì ghi lý do trong mô tả PR.",
    ],
    "test": [
        "Ca kiểm thử bao gồm: hành vi đúng `docs/product-brief.md`, và giao diện khớp mockup đã duyệt trong `docs/design/mockups/` (bố cục, nhãn, trạng thái).",
    ],
    "qc": [
        "Khi kiểm tra trên trình duyệt, so từng màn hình với mockup đã duyệt trong `docs/design/mockups/` (mở file HTML để đối chiếu); lệch bố cục, nhãn, màu hay thiếu trạng thái là lỗi cần báo.",
    ],
}


def mockups(lane_dir):
    d = os.path.join(lane_dir, "docs", "design", "mockups")
    if not os.path.isdir(d):
        return []
    out = []
    for f in sorted(os.listdir(d))[:MAX_MOCKUPS]:
        if not f.endswith(".html"):
            continue
        title = ""
        try:
            with open(os.path.join(d, f), encoding="utf-8", errors="replace") as fh:
                m = re.search(r"<title>(.*?)</title>", fh.read(20000), re.I | re.S)
            title = html.unescape(m.group(1)).strip()[:80] if m else ""
        except OSError:
            pass
        out.append((f, title))
    return out


def section(lane_dir, step):
    step = STEP_ALIAS.get(step, step)
    if step not in HOW:
        return ""
    have = [p for p in ("docs/product-brief.md", "docs/architecture.md", "docs/design/design.md")
            if os.path.isfile(os.path.join(lane_dir, p))]
    shots = mockups(lane_dir)
    if not have and not shots:
        return ""
    how = HOW[step]
    if not shots:  # no approved UI: drop the mockup-specific rules
        how = [h for h in how if "mockup" not in h and "THIẾT KẾ" not in h]
    lines = ["", "", "## Tài liệu dự án đã được duyệt (chuẩn phải theo)",
             "Người đã duyệt các tài liệu này trước khi có code; tính năng phải đúng với chúng:"]
    lines += [f"- `{p}`" for p in have]
    if shots:
        lines.append("- Mockup giao diện đã duyệt (`docs/design/mockups/`):")
        lines += [f"  - `{f}`{f' — {t}' if t else ''}" for f, t in shots]
    lines.append("")
    lines += [f"- {h}" for h in how]
    return "\n".join(lines) + "\n"


def main(argv):
    if len(argv) != 3:
        sys.stderr.write(__doc__)
        return 64
    sys.stdout.write(section(argv[1], argv[2]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
