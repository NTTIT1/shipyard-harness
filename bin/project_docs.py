#!/usr/bin/env python3
"""The project's approved documents, as a prompt section for one pipeline step.

Projects made in the product studio (or given docs by hand) carry what humans approved before any
code: docs/product-brief.md (requirements), docs/architecture.md (system design) and docs/design/
(design.md + mockups/*.html). Every feature must stay true to them, so each step is told which of
them it must follow and how.

Where they live: those default paths, overridden by the repo's own `.shipyard/docs.json` and then by
the lane profile's `project-docs.json` (written when an existing repo is imported, from what the person
declared). Shape: {"brief": "...", "architecture": "...", "design": "...", "mockups": "<dir>", "other": [...]}.

  project_docs.py <lane_dir> <step> [profile_dir]   prints the section (nothing when there are no docs)

step: pm | ba | arch | design | dev | test | qc  (sub-steps map to these; unknown -> nothing)
"""
import html
import json
import os
import re
import sys

STEP_ALIAS = {"plan-critic": "arch", "ux-design": "design", "ui-design": "design", "design-qa": "design",
              "impl-worker": "dev", "code-review": "dev", "backend-dev": "dev", "frontend-dev": "dev",
              "qc-local": "qc", "senior-gate": "qc"}
MAX_MOCKUPS = 30
MAX_OTHER = 20
DEFAULTS = {"brief": "docs/product-brief.md", "architecture": "docs/architecture.md",
            "design": "docs/design/design.md", "mockups": "docs/design/mockups", "other": []}
LABEL = {"brief": "yêu cầu sản phẩm", "architecture": "kiến trúc", "design": "hướng dẫn thiết kế giao diện"}


def _read_json(p):
    try:
        with open(p, encoding="utf-8") as fh:
            d = json.load(fh)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _inside(lane_dir, rel):
    """A repo-relative path that stays inside the lane checkout ('' otherwise)."""
    if not isinstance(rel, str) or not rel.strip() or rel.startswith("/") or ".." in rel.split("/"):
        return ""
    root = os.path.realpath(lane_dir)
    full = os.path.realpath(os.path.join(root, rel.strip()))
    return rel.strip().rstrip("/") if full == root or full.startswith(root + os.sep) else ""


def locations(lane_dir, profile_dir=""):
    """Where this project's approved documents are (defaults < repo .shipyard/docs.json < profile)."""
    loc = dict(DEFAULTS)
    for src in (os.path.join(lane_dir, ".shipyard", "docs.json"),
                os.path.join(profile_dir, "project-docs.json") if profile_dir else ""):
        if src:
            for k, v in _read_json(src).items():
                if k in loc and v not in (None, ""):
                    loc[k] = v
    out = {k: _inside(lane_dir, loc[k]) for k in ("brief", "architecture", "design", "mockups")}
    other = loc.get("other") if isinstance(loc.get("other"), list) else []
    out["other"] = [p for p in (_inside(lane_dir, x) for x in other[:MAX_OTHER]) if p]
    return out

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


def mockups(lane_dir, rel):
    """Approved screens: HTML mockups (with their <title>) and images, in the mockups folder."""
    d = os.path.join(lane_dir, rel) if rel else ""
    if not d or not os.path.isdir(d):
        return []
    out = []
    for f in sorted(os.listdir(d)):
        if not re.search(r"\.(html?|png|jpe?g|webp|svg|pdf)$", f, re.I):
            continue
        title = ""
        if re.search(r"\.html?$", f, re.I):
            try:
                with open(os.path.join(d, f), encoding="utf-8", errors="replace") as fh:
                    m = re.search(r"<title>(.*?)</title>", fh.read(20000), re.I | re.S)
                title = html.unescape(m.group(1)).strip()[:80] if m else ""
            except OSError:
                pass
        out.append((f, title))
        if len(out) >= MAX_MOCKUPS:
            break
    return out


def section(lane_dir, step, profile_dir=""):
    step = STEP_ALIAS.get(step, step)
    if step not in HOW:
        return ""
    loc = locations(lane_dir, profile_dir)
    exists = lambda p: p and os.path.exists(os.path.join(lane_dir, p))
    have = [(k, loc[k]) for k in ("brief", "architecture", "design") if exists(loc[k]) and os.path.isfile(os.path.join(lane_dir, loc[k]))]
    other = [p for p in loc["other"] if exists(p)]
    shots = mockups(lane_dir, loc["mockups"])
    if not have and not shots and not other:
        return ""
    # The rules name the default paths; point them at where THIS project keeps its documents.
    names = {"docs/product-brief.md": loc["brief"], "docs/architecture.md": loc["architecture"],
             "docs/design/design.md": loc["design"], "docs/design/mockups/": (loc["mockups"] or "") + "/"}
    how = HOW[step]
    if not shots:  # no approved UI: drop the mockup-specific rules
        how = [h for h in how if "mockup" not in h and "THIẾT KẾ" not in h]
    fix = lambda h: re.sub("|".join(re.escape(k) for k in names), lambda m: names[m.group(0)] or m.group(0), h)
    lines = ["", "", "## Tài liệu dự án đã được duyệt (chuẩn phải theo)",
             "Người đã duyệt các tài liệu này; tính năng phải đúng với chúng (đọc phần liên quan tới tính năng):"]
    lines += [f"- `{p}` — {LABEL[k]}" for k, p in have]
    lines += [f"- `{p}` — tài liệu khác của dự án" for p in other]
    if shots:
        lines.append(f"- Màn hình giao diện đã duyệt (`{loc['mockups']}/`):")
        lines += [f"  - `{f}`{f' — {t}' if t else ''}" for f, t in shots]
    lines.append("")
    lines += [f"- {fix(h)}" for h in how]
    return "\n".join(lines) + "\n"


def main(argv):
    if len(argv) not in (3, 4):
        sys.stderr.write(__doc__)
        return 64
    sys.stdout.write(section(argv[1], argv[2], argv[3] if len(argv) == 4 else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
