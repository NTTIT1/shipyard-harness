# Shipyard hoạt động thế nào — và bộ nhớ dự án / bộ nhớ AI lưu ở đâu

> Tài liệu tổng hợp từ code hiện tại (dashboard, `bin/`, `platform/`). Đọc mục 1–2 để nắm bức tranh chung;
> mục 3–5 trả lời "lưu ở đâu, có trong database không"; mục 6 là bảng tra nhanh mọi nơi lưu dữ liệu.

---

## 1. Bức tranh chung

Shipyard có 3 phần chạy trên máy của bạn:

| Phần | Là gì | Lưu dữ liệu ở đâu |
|---|---|---|
| **Dashboard** (cổng 8090) | Giao diện web + server Node. Điều khiển lane, chat dự án, chi phí, đội AI… | **File** trong thư mục harness: `run/`, `state/`, `config/` |
| **Shipyard Platform** (cổng 9080–9085) | 6 service Java (Spring Boot): đăng nhập, dự án, lane, điều phối quy trình, **bộ nhớ dự án (context-service)**, API gateway | **Database PostgreSQL** (Docker, cổng 5434) — mỗi service một database |
| **Lane** (lane1, lane2…) | Bản clone đầy đủ của repo dự án, nơi AI làm việc (Claude Code + các agent vai trò) | **File trong thư mục lane** (code, `specs/`, ảnh QC…) và **Git** (nhánh, PR) |

Ngoài ra có **Ollama** (model `bge-m3` chạy tại máy) để biến văn bản thành vector cho tìm kiếm theo nghĩa,
và **Docker** chạy Postgres / Redis / RabbitMQ.

### Một tính năng đi qua hệ thống như thế nào

```
Người dùng (chat dự án / Giao việc)
   │
   ▼
Dashboard ──► orchestrator-service: tạo "run" (lần chạy) + quy trình đóng băng
   │                     │
   │                     ├─ bước PM → BA → Kiến trúc → Thiết kế → Code → Test
   │                     │     trước mỗi bước: lane xin "gói ngữ cảnh" từ context-service
   │                     │     sau mỗi bước: tài liệu chờ người duyệt (màn "Chờ tôi duyệt")
   │                     │
   │                     └─ khi người DUYỆT / YÊU CẦU SỬA / tính năng XONG
   │                           → ghi sự kiện vào "outbox" (database của orchestrator)
   │                           → mỗi 5 giây gửi sang context-service → thành BỘ NHỚ DỰ ÁN
   ▼
Lane: code (TDD) → CI → e2e → review → QC trình duyệt → GO/NO-GO → Pull request → người merge
```

---

## 2. Có mấy loại "bộ nhớ"?

Trong Shipyard có **4 thứ** hay được gọi chung là "bộ nhớ". Chúng khác nhau về mục đích và nơi lưu:

| # | Tên | Mục đích | Lưu ở đâu | Database? |
|---|---|---|---|---|
| A | **Tài liệu sản phẩm** (tab đầu của "Bộ nhớ dự án") | Bản tài liệu đã duyệt *hiện tại* của dự án: yêu cầu, kiến trúc, thiết kế, mockup, lộ trình | File `run/projects/<projectId>/docs/` | **Không** — file .md / .html |
| B | **Bộ nhớ AI** (tab thứ hai) — context-service | Kho ghi nhớ lâu dài để AI tìm lại: tài liệu đã duyệt, quyết định, bài học từ người duyệt, tóm tắt tính năng, đồ thị thực thể | PostgreSQL `context_db` (+ vector) | **Có** |
| C | **Luật & kỹ năng của đội AI** | Quy tắc bắt buộc theo vai trò, skill `.md` | Trong **repo dự án**: `.shipyard/rules/*.md`, `.shipyard/team.json`, `.claude/skills/*/SKILL.md` | **Không** — file trong Git |
| D | **Ghi nhớ riêng của agent** (Claude Code) | Mẹo vặt agent tự ghi để lần sau làm nhanh hơn (vd. selector QC hay dùng) | `.claude/agent-memory/<agent>/` trong **thư mục từng lane** | **Không** — file, riêng từng lane |

Ngắn gọn: **chỉ có B nằm trong database**. A, C, D là file.

---

## 3. Tài liệu sản phẩm (A) — file, do dashboard quản lý

**Nơi lưu:** `run/projects/<projectId>/` trong thư mục harness

```
run/projects/proj_4e3e960856ae/
├── docs/
│   ├── product-brief.md      ← Yêu cầu sản phẩm (AI PM viết, người duyệt)
│   ├── architecture.md       ← Thiết kế hệ thống + "Lộ trình tính năng" (AI kiến trúc sư)
│   ├── design.md             ← Hướng dẫn thiết kế (AI thiết kế)
│   └── mockups/*.html        ← Mockup các màn hình
├── queue.json                ← Hàng chờ tính năng của dự án (chờ lane rảnh nhận)
├── features.json             ← Tính năng thêm qua chat + trạng thái (đã có / đang làm / chờ…)
└── meta.json                 ← Thông tin phụ (loại app web/mobile…)
```

**Ai ghi:** chat dự án (`run/studio/stu_*.json` là lịch sử từng cuộc chat). Khi bạn **duyệt** một bước trong
chat, dashboard:
1. ghi/ cập nhật file trong `docs/`, và
2. **đồng thời gửi một sự kiện `STEP_APPROVED`** sang context-service → tài liệu đó cũng vào Bộ nhớ AI (B).

**Lane đọc thế nào:** trước khi lane nhận việc, dashboard chép bản hiện tại sang
`<lane>/.shipyard-docs/` (thư mục bị git bỏ qua, không lọt vào commit) và trỏ profile của lane tới đó.
Mọi bước AI trên lane được dặn: tài liệu đã duyệt là chuẩn, code phải giống mockup.

> Đây là **ảnh chụp hiện tại** của dự án — sửa là ghi đè. Lịch sử các phiên bản nằm trong Bộ nhớ AI (B).

---

## 4. Bộ nhớ AI (B) — context-service, có database

### 4.1 Lưu ở đâu

- Service: **context-service** (Java, cổng **9085**), thuộc Shipyard Platform.
- Database: **PostgreSQL**, database **`context_db`**, container Docker `shipyard-postgres`, cổng **5434**,
  có extension **pgvector** để lưu vector.
- Vector được tạo bởi **Ollama + model `bge-m3`** chạy **ngay trên máy** (1024 chiều) — văn bản không
  gửi ra ngoài để nhúng vector.

### 4.2 Các bảng (schema thật, `V1__memory.sql`)

| Bảng | Chứa gì |
|---|---|
| `memory_items` | Mỗi dòng là **một mục nhớ**: `project_id`, `kind` (loại), `run_id`, `step`, `title`, `content` (toàn văn), `source_ref`, `superseded_by` (bị bản mới thay), `disabled` (người tắt), `revision_no`, `created_at` |
| `memory_chunks` | Mục nhớ được **cắt thành đoạn** để tìm kiếm: `text`, `tsv` (chỉ mục từ khoá, tự sinh), `embedding` VECTOR(1024), `embed_status` (PENDING / DONE…), số lần thử, lỗi gần nhất |
| `memory_entities` | **Thực thể** của phần mềm (bảng, API, màn hình…) lấy từ `entities.json` mà AI kiến trúc sư viết |
| `memory_edges` | **Quan hệ** giữa thực thể (vd. `User → Order → Payment`), kèm mục nhớ là nguồn |
| `processed_events` | Mã sự kiện đã xử lý — để một sự kiện gửi lặp lại cũng chỉ được ghi **một lần** |

Chỉ mục: HNSW trên vector (tìm theo nghĩa), GIN trên `tsv` (tìm theo từ khoá).

### 4.3 Các loại mục nhớ (`kind`)

| Loại | Sinh ra khi nào | Nội dung |
|---|---|---|
| `ARTIFACT` | Người **duyệt** một bước (lane hoặc chat dự án) | Toàn văn từng tài liệu đã duyệt: `spec.md`, `ba.md`, `plan.md`, `design.md`, `product-brief.md`, `architecture.md`… |
| `DECISION` | Tài liệu `plan.md` / `architecture.md` được duyệt và có mục **"## Quyết định"** | Riêng phần quyết định kỹ thuật (chọn DB, thư viện, bảo mật…) |
| `FEEDBACK` | Người **yêu cầu sửa / từ chối** kèm góp ý | Lời góp ý của người duyệt, bước nào, bản thứ mấy |
| `HUMAN_EDIT` | Người **tự tay sửa** tài liệu AI viết trước khi duyệt | Tóm tắt khác biệt giữa bản AI và bản người sửa |
| `FEATURE_SUMMARY` | Tính năng **xong** (đã merge) | Tóm tắt tính năng |
| Đồ thị thực thể | Bước **Kiến trúc** được duyệt kèm `entities.json` | Thực thể + quan hệ (bảng `memory_entities`, `memory_edges`) |

`FEEDBACK` và `HUMAN_EDIT` được gọi là **bài học** — loại quý nhất, vì giúp AI không lặp lại lỗi cũ.

### 4.4 Luồng GHI vào bộ nhớ

```
Người duyệt / sửa / từ chối trên "Chờ tôi duyệt"
   │
   ▼
orchestrator-service ghi sự kiện vào bảng outbox_events (orchestrator_db)
   │   (duyệt không bao giờ phải chờ bộ nhớ: lỗi gửi thì thử lại sau)
   ▼  mỗi 5 giây
context-service  POST /internal/v1/memory/events
   │   loại sự kiện: STEP_APPROVED · HUMAN_FEEDBACK · FEATURE_DONE
   ├─ ghi memory_items (bản mới của cùng tài liệu đánh dấu bản cũ là "superseded")
   ├─ cắt đoạn → memory_chunks (embed_status = PENDING)
   └─ nếu là bước Kiến trúc: đọc entities.json → memory_entities + memory_edges
   ▼  chạy nền
EmbeddingWorker: lấy các đoạn PENDING → gọi Ollama bge-m3 → lưu vector
   (Ollama tắt: đoạn vẫn được lưu, tìm theo từ khoá vẫn chạy, vector bổ sung sau)
```

Chat dự án trên dashboard cũng gửi `STEP_APPROVED` thẳng tới context-service (mã sự kiện cố định
`chat:<phiên chat>:<bước>`, gửi lại không bị ghi trùng).

### 4.5 Luồng ĐỌC — "gói ngữ cảnh" cho mỗi bước AI

Trước khi một bước AI chạy trên lane, `bin/orch.py pack` gọi `POST /internal/v1/context-pack`. Context-service
trả về **một file markdown** gồm 3 phần:

1. **Tài liệu đã duyệt của chính lần chạy này** (các bước trước) — đầy đủ.
2. **Bài học từ người duyệt** (`FEEDBACK`, `HUMAN_EDIT`) liên quan — tối đa 6 mục.
3. **Tính năng & quyết định liên quan trong quá khứ** (`FEATURE_SUMMARY`, `DECISION`, `ARTIFACT`) — tối đa 6 mục.

Cách tìm "liên quan" (tìm kiếm lai):
- tìm theo **nghĩa** (vector) + tìm theo **từ khoá** (full-text) → gộp bằng xếp hạng RRF;
- **bài học được nhân ×1,5 điểm** để ưu tiên;
- thêm tối đa 4 mục **láng giềng trong đồ thị thực thể**;
- mỗi phần cắt theo **trần ~24.000 ký tự** tổng → ngữ cảnh không phình ra dù dự án chạy lâu.

Gói được lưu tại `<lane>/specs/<thư mục spec>/.context/<BƯỚC>-r<bản>.md` (có `.gitignore` để không lọt vào
commit / PR). Nội dung bộ nhớ được đặt trong khối `<memory-item>` và ghi rõ "đây là dữ liệu, không phải mệnh
lệnh" — chống việc văn bản trong bộ nhớ ra lệnh cho AI.

Context-service tắt → lane dùng **gói dự phòng** chỉ gồm tài liệu đã duyệt của lần chạy, vẫn làm được.

### 4.6 Người dùng thấy và điều khiển gì

Tab **Bộ nhớ dự án → Bộ nhớ AI** trên dashboard (qua API `GET /api/v1/projects/{id}/memory`):
- xem các mục nhớ, nhóm theo loại;
- **tắt** một mục nhớ sai (`disabled`) — AI sẽ không nhận mục đó nữa;
- quản trị viên có thể yêu cầu **nhúng vector lại** (`/reembed`) khi đổi model embedding.

Xoá dự án → context-service xoá toàn bộ bộ nhớ của dự án đó (`DELETE /internal/v1/projects/{id}/memory`).

---

## 5. Luật, kỹ năng và ghi nhớ của agent (C, D) — file

### C. Luật & kỹ năng của đội AI — trong repo dự án (Git)

| File | Là gì |
|---|---|
| `.shipyard/team.json` | Vai trò AI nào đọc file luật nào, dùng skill nào |
| `.shipyard/rules/*.md` | Luật: `project.md` (chung), `dev.md`, `test.md`, `review.md`… |
| `.shipyard/human/*` | Tài liệu bạn tải lên cho AI Manager đọc để soạn luật |
| `.claude/skills/<tên>/SKILL.md` | Kỹ năng (skill) của dự án — gồm cả skill bạn tự viết bằng `.md` |

Mọi thay đổi đi qua **"Gửi duyệt"** → duyệt xong mới được **commit vào nhánh tích hợp** (vd. `development`).
Lane đọc luật từ nhánh đó (`bin/team_rules.py`) và ghép vào lời dặn của từng vai trò.
Kỹ năng **"Cài sẵn"** (vd. Hallmark, Apple Design) nằm trên máy chạy lane, dùng chung cho mọi dự án, không chép vào repo.

Cấu hình đội AI khi tạo dự án bằng wizard được nhớ thêm ở `config/project-ai-teams.json`.

### D. Ghi nhớ riêng của agent Claude Code

Một số agent (vd. `qc-local`, `qc-mobile`, `senior-gate-reviewer`) có `memory: project` → Claude Code cho
chúng một thư mục ghi chú riêng: `<lane>/.claude/agent-memory/<tên agent>/`. Đây là **mẹo làm việc** (selector
hay dùng, bước đăng nhập…), **riêng từng lane**, không đi vào context-service và không chia sẻ giữa các lane.

---

## 6. Bảng tra nhanh — dữ liệu nào nằm ở đâu

### Database (PostgreSQL trong Docker, cổng 5434)

| Database | Service | Nội dung chính |
|---|---|---|
| `auth_db` | auth-service (9081) | Người dùng, đăng nhập, vai trò hệ thống |
| `project_db` | project-service (9082) | Dự án, thành viên & vai trò, cấu hình quy trình |
| `lane_db` | lane-service (9083) | Lane đăng ký với dự án |
| `orchestrator_db` | orchestrator-service (9084) | Các lần chạy (run), bước, tài liệu từng bản, phê duyệt, **outbox** sự kiện bộ nhớ |
| `context_db` | context-service (9085) | **Bộ nhớ AI**: mục nhớ, đoạn + vector, thực thể, quan hệ |

Redis (6380) và RabbitMQ chỉ là hạ tầng phụ (bộ đệm, hàng đợi), không giữ dữ liệu cần đọc.

### File trong thư mục harness (do dashboard và script `bin/` quản lý)

| Đường dẫn | Nội dung |
|---|---|
| `run/projects/<pid>/docs/` | **Tài liệu sản phẩm** đã duyệt (A) |
| `run/projects/<pid>/queue.json`, `features.json`, `meta.json` | Hàng chờ & trạng thái tính năng của dự án |
| `run/studio/stu_*.json` | Lịch sử các cuộc chat dự án / chat ý tưởng |
| `state/lane<N>/<tính năng>.json` | Trạng thái lane: giai đoạn, nhánh, PR, model từng bước, quy trình đóng băng… |
| `run/lane<N>/chat.jsonl` | Lịch sử chat phiên AI của lane (đã che key) |
| `run/lane<N>/usage.jsonl` | Token và chi phí từng lượt AI (màn "Chi phí & hạn mức") |
| `run/lane<N>/session.json`, `limit-wake.json`, `quota-hold.json` | Phiên Claude để chạy tiếp; hẹn giờ hồi lượt; lane bị dừng vì hạn mức |
| `config/costs.json` | Hạn mức, tỷ giá, lương giờ… |
| `config/models.json`, `config/providers.json` | Model mặc định từng bước; key nhà cung cấp AI (quyền 600) |
| `config/project-ai-teams.json` | Cấu hình đội AI chọn lúc tạo dự án |

### File trong thư mục lane (bản clone của repo dự án)

| Đường dẫn | Nội dung | Vào Git? |
|---|---|---|
| Code dự án | Code AI viết trên nhánh tính năng | Có — qua PR |
| `specs/<ngày>-<tên>/` | `spec.md`, `ba.md`, `plan.md`, `tasks.md`, `design/`, `qc-plan.md` của tính năng | Có |
| `specs/.../.context/` | Gói ngữ cảnh từng bước (trích bộ nhớ) | **Không** (gitignore) |
| `.shipyard-docs/` | Bản sao Tài liệu sản phẩm cho lane đọc | **Không** |
| `.shipyard/`, `.claude/skills/` | Luật & kỹ năng của đội AI | Có (sau khi duyệt) |
| `.claude/agent-memory/` | Ghi nhớ riêng của agent | Riêng lane |
| `.playwright-mcp/proof/` | Ảnh bằng chứng QC | Không |

---

## 7. Câu hỏi hay gặp

**Bộ nhớ AI có lưu toàn bộ lịch sử chat không?**
Không. Chỉ lưu những gì đã qua tay người: tài liệu được duyệt, góp ý, chỗ người sửa, tóm tắt tính năng.
Lịch sử chat nằm ở file (`run/studio/`, `run/lane<N>/chat.jsonl`), không đưa vào bộ nhớ.

**Sửa Tài liệu sản phẩm thì bộ nhớ AI có cập nhật không?**
Có, khi bản sửa được duyệt: bản mới vào bộ nhớ, bản cũ bị đánh dấu "đã thay" và không còn được tìm thấy.

**AI có "học" thêm theo thời gian không?**

Có, nhưng **không phải bằng cách huấn luyện lại model**. Model AI giữ nguyên; thứ thay đổi là *đề bài* đưa
cho nó mỗi lần ngày càng đầy đủ hơn.

| | Huấn luyện lại model (Shipyard **không** làm) | Nhắc lại qua gói ngữ cảnh (Shipyard **làm**) |
|---|---|---|
| Cách làm | Đem dữ liệu dự án dạy lại model, kiến thức "ngấm" vào model | Model giữ nguyên; trước mỗi bước, Shipyard tìm trong bộ nhớ những gì liên quan và đưa kèm vào lời dặn |
| Ví von | Nhân viên đi học khoá đào tạo, nhớ luôn trong đầu | Nhân viên mới mỗi ngày, nhưng sáng nào cũng được đưa sổ tay "những điều cần nhớ" của dự án |
| Tốn kém | Rất đắt, cần GPU, mất thời gian | Gần như không tốn thêm — vài nghìn chữ trong lời dặn |

*Ví dụ:*

1. **Tuần 1** — tính năng "Đăng ký tài khoản". AI viết spec, bạn bấm **Yêu cầu sửa** với góp ý:
   *"Số điện thoại phải kiểm tra đúng định dạng Việt Nam, không được để trống."*
   → Shipyard lưu câu này vào bộ nhớ dưới dạng **bài học** (`FEEDBACK`).
2. **Tuần 3** — tính năng mới "Cập nhật hồ sơ". Trước khi AI PM viết spec, Shipyard tìm trong bộ nhớ những gì
   liên quan tới "hồ sơ, người dùng, thông tin…" và thấy bài học tuần 1, đưa nó vào **gói ngữ cảnh**:

   ```
   ## Bài học từ người duyệt
   - Góp ý của PM — bước PM — Đăng ký tài khoản:
     "Số điện thoại phải kiểm tra đúng định dạng Việt Nam, không được để trống."
   ```
3. AI đọc gói này trước khi làm → lần này **tự thêm** kiểm tra số điện thoại vào spec, bạn không phải nhắc lại.

Nhìn từ ngoài thì AI "nhớ" và "rút kinh nghiệm"; thực chất Shipyard **nhắc lại đúng lúc**.

*"Bài học từ người duyệt được ưu tiên" nghĩa là:* mỗi gói ngữ cảnh chỉ chứa được có hạn (~24.000 ký tự), nên
phải chọn lọc. Khi xếp hạng kết quả tìm kiếm, **góp ý và chỗ người tự sửa được nhân 1,5 điểm** → dễ được chọn
hơn tài liệu cũ hay tóm tắt tính năng — vì đó là những chỗ AI từng làm sai và người đã phải sửa, đáng nhắc nhất.

*Vài hệ quả nên biết:*

- AI chỉ "nhớ" những gì **được tìm thấy là liên quan** tới việc đang làm — bài học về thanh toán sẽ không được
  nhắc khi làm tính năng đăng nhập.
- Góp ý càng **cụ thể, rõ ràng** thì lần sau càng dễ được tìm lại và áp dụng đúng.
- Bài học sai hoặc không còn đúng: vào **Bộ nhớ dự án → Bộ nhớ AI** và **tắt** mục đó — AI sẽ không được nhắc nữa.
- Điều gì **lúc nào cũng phải tuân theo** (kể cả khi không liên quan rõ ràng) thì nên viết thành **luật** trong
  "Kỹ năng AI & khung": luật được đọc mọi lần, còn bộ nhớ chỉ được nhắc khi liên quan.

**Muốn sao lưu bộ nhớ thì sao lưu gì?**
Database `context_db` (và các database Platform khác) trong Postgres Docker cổng 5434, cộng thư mục `run/`,
`state/`, `config/` của harness. Luật và skill đã nằm trong Git của dự án.

**Ollama tắt thì sao?**
Bộ nhớ vẫn ghi và vẫn tìm theo từ khoá; gói ngữ cảnh ghi rõ "tìm theo nghĩa đang không có". Khi Ollama bật lại,
các đoạn chưa có vector được nhúng bổ sung.

**Hai dự án có thấy bộ nhớ của nhau không?**
Không. Mọi bảng đều lọc theo `project_id`; lane chỉ xin gói ngữ cảnh của dự án mình.
