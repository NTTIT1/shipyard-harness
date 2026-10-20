# Shipyard từ đầu đến cuối — tạo dự án → giao việc cho AI → chạy

Cập nhật 2026-10-19 · máy `ttit` · thư mục `/home/ttit/IdeaProjects/shipyard`

Tài liệu này đi **theo thứ tự thời gian**: từ lúc chưa có gì đến lúc dự án chạy được và
tính năng đầu tiên đã lên nhánh `development`. Chi tiết từng nút trên dashboard xem
[huong-dan-shipyard.md](huong-dan-shipyard.md), bảng lệnh xem [lenh-shipyard.md](lenh-shipyard.md).

```
 0. Bật máy chủ Shipyard (1 lần mỗi lần bật laptop)
 1. Tạo dự án (wizard "Tạo từ khung")           → có code khung + Git + dự án trên Platform
 2. Thêm thành viên + vai trò                    → ai duyệt bước nào
 3. Viết luật cho AI team (tuỳ chọn)             → .shipyard/rules/*.md
 4. Nối Shipyard với dự án (profile)             → lane biết build/test/chạy dự án thế nào
 5. Tạo lane                                     → "phòng làm việc" riêng cho AI
 6. Giao việc                                    → AI làm PM → BA → Kiến trúc → Thiết kế → Dev → Test
 7. Duyệt từng bước                              → bạn bấm Duyệt / Yêu cầu sửa / Trả về
 8. Merge PR                                     → code vào development, AI kiểm tra lại
 9. Chạy dự án                                   → trên máy bạn, hoặc lên prod
```

---

## 0. Bật máy chủ Shipyard

Lần **đầu tiên** cài trên máy (chỉ làm một lần):

```bash
cd /home/ttit/IdeaProjects/shipyard
cp config/secrets.env.example config/secrets.env   # điền mật khẩu (xem README.md)
bin/db-shared-up.sh                                # Postgres + Redis dùng chung cho các lane
bin/install-claude-assets.sh                       # cài skill + agent vào ~/.claude
```

**Mỗi lần bật laptop:**

```bash
cd /home/ttit/IdeaProjects/shipyard
bin/platform.sh start      # Shipyard Platform: đăng nhập, dự án, quy trình duyệt
bin/dashboard.sh start     # dashboard → http://127.0.0.1:8090
```

Mở http://127.0.0.1:8090 → đăng nhập bằng tài khoản **quản trị (SYS_ADMIN)**.
Chỉ quản trị viên mới thấy nút tạo dự án từ khung.

> Kiểm tra: `bin/platform.sh status` phải báo các service đang chạy. Dashboard báo
> "Không kết nối được Shipyard Platform" → chưa chạy `bin/platform.sh start`.

---

## 1. Tạo dự án mới

Dashboard → menu trái **Dự án** → **Tạo từ khung (chọn ngôn ngữ, framework…)**.

> Đã có sẵn repo (ví dụ HRM-GMS)? Không cần wizard — bấm **Tạo** ở cùng màn hình, nhập
> Tên, Slug, Repo URL rồi nhảy tới **mục 2**.

### 1.1 Các bước của wizard

| Bước | Điền gì | Ghi chú |
|---|---|---|
| **Thông tin** | Tên dự án, Slug, Mô tả | Slug tự sinh từ tên (`Quản lý Kho hàng` → `quan-ly-kho-hang`). Slug = tên thư mục + tên repo, 3–40 ký tự, chữ thường/số/gạch ngang |
| **Ngôn ngữ** | Java · Python · TypeScript | |
| **Framework** | Spring Boot · FastAPI · NestJS · React + Vite | Thẻ ghi **Thiếu công cụ** = máy chưa cài JDK / Node / uv… → cài theo gợi ý trên thẻ rồi mở lại wizard |
| **Database** | PostgreSQL · MySQL · MongoDB · Redis · SQLite · Không dùng | Bước này không có với React + Vite |
| **Tuỳ chọn** | Phiên bản, Docker, xác thực JWT… (tuỳ framework) | Có **Kỹ năng AI cho từng vai trò** — xem 1.3 |
| **Kho Git** | Chỉ trên máy · GitHub · GitLab | Xem 1.2 |
| **Xem lại** | Kiểm tra lần cuối → **Tạo dự án** | |

### 1.2 Chọn kho Git

- **Chỉ trên máy** — chỉ `git init` local. Dùng để thử; **muốn AI mở PR thì phải có GitHub/GitLab**.
- **GitHub** (khuyên dùng) — lần đầu bấm **Đổi token / Kiểm tra & lưu**, dán token:
  - Fine-grained token: quyền **Administration (read & write)** + **Contents (read & write)**; hoặc
  - Classic token: quyền `repo` (thêm `read:org` nếu muốn tạo repo trong tổ chức).
  
  Sau đó chọn **Tài khoản / tổ chức** và **Riêng tư / Công khai**. Token lưu trên máy chủ, không gửi về trình duyệt.
- **GitLab** — token có quyền `api` + `write_repository`; đổi "Địa chỉ GitLab" nếu tự host.

### 1.3 Kỹ năng AI cho từng vai trò (tuỳ chọn)

Ở bước Tuỳ chọn có bảng cấu hình cho từng AI: **PM, BA, Kiến trúc, Thiết kế, Dev, Review, Tester, DevOps, Manager**.

- Tích các **skill có sẵn** (đã chọn sẵn theo framework, ví dụ Spring Boot → "Layered & DTO", "An toàn Transaction").
- Ô **Chỉ dẫn riêng**: viết luật của bạn, ví dụ *"Mọi API phải bọc trong `ApiResponse<T>`, kiểm tra quyền `@PreAuthorize`"*.

Shipyard ghi các luật này vào `.shipyard/rules/<vai trò>.md` và `.claude/skills/` trong repo dự án.
Không chắc thì để mặc định — sửa được sau (mục 3).

### 1.4 Shipyard tự làm gì khi bấm "Tạo dự án"

Màn hình hiện tiến độ 6 bước:

| Bước | Việc |
|---|---|
| Sinh khung dự án | Chạy công cụ chuẩn của framework (Spring Initializr, `nest new`, `uv`…) |
| Thêm cấu hình chung | `README.md`, `.env.example`, `.gitignore`, `docker-compose.yml`, CI, `CLAUDE.md`, `.shipyard/` |
| Build & chạy test | Đảm bảo khung **build được và test xanh** ngay từ đầu |
| Khởi tạo Git | Commit đầu trên `main`, tách nhánh tích hợp **`development`** |
| Tạo repo & push | (chỉ khi chọn GitHub/GitLab) tạo repo, push `main` + `development` |
| Đăng ký dự án | Tạo dự án trên Platform, **bạn là OWNER** |

Kết quả:

- Code nằm ở **`~/shipyard-workspaces/<slug>/`**
- Repo trên GitHub/GitLab (nếu chọn) với 2 nhánh `main` và `development`
- Dự án hiện trong **Dự án**, có mã `proj_…` (cần cho mục 4)

**Nếu lỗi:**

| Nút | Khi nào |
|---|---|
| **Thử lại** | Lỗi ở bước *Tạo repo* hoặc *Đăng ký* (hết phiên đăng nhập, mạng, tên repo đã có…) — chạy tiếp từ chỗ hỏng |
| **Xoá thư mục & sửa lựa chọn** | Lỗi ở bước sinh khung / build — xoá thư mục rồi chọn lại. Repo đã tạo trên GitHub **không bị xoá** |
| **Huỷ** | Đang chạy mà muốn dừng |

Xong → **Mở dự án**.

---

## 2. Thêm thành viên và vai trò

Trong trang dự án → bảng **Thành viên** → nhập email → **Thêm thành viên** → tích vai trò:

| Vai trò | Duyệt bước |
|---|---|
| PM | PM — spec.md (làm gì, tiêu chí nghiệm thu) |
| BA | BA — ba.md (luồng nghiệp vụ, quy tắc, dữ liệu) |
| Tech Lead | Kiến trúc — plan.md, tasks.md |
| Designer | Thiết kế — mockup giao diện |
| Developer | Dev — code + test |
| Tester | Test — qc-plan.md + ảnh QC |

- Tài khoản phải được tạo trước ở **Người dùng** (không tự đăng ký được).
- Làm một mình? Không cần thêm ai — **Owner duyệt thay** mọi bước (hiện nhãn "duyệt thay (Owner)").

---

## 3. Luật cho AI team (sửa sau khi tạo)

Trong trang dự án có phần cấu hình **Skill & Chỉ dẫn riêng cho từng AI Role** — sửa giống mục 1.3 rồi **Lưu**.

Cần nhớ:

- AI đọc luật từ nhánh **`development`** (không phải nhánh tính năng) — để AI không tự sửa luật của chính nó.
  Sửa tay file trong `.shipyard/rules/` thì phải **commit + push lên `development`** mới có hiệu lực.
- `.shipyard/human/` là tài liệu tham khảo cho AI Manager, **không** phải luật.
- Muốn có luật chung kiểu MUST/SHOULD cho review + senior gate: sau khi có lane, chạy `/spec-constitution` (xem [huong-dan-shipyard.md](huong-dan-shipyard.md) mục 5).

---

## 4. Nối Shipyard với dự án (profile)

Wizard tạo **dự án**, nhưng lane cần biết **cách cài / build / chạy / test** nó — đó là **profile**
(`profiles/<tên>/`). Làm một lần cho mỗi dự án.

> ⚠️ **Một bộ Shipyard chỉ chạy một profile một lúc** (đặt trong `config/local.env`).
> Đổi sang dự án mới thì mọi lane sẽ theo dự án mới. Trước khi đổi: cho các lane của dự án
> cũ làm xong (thẻ ✅ done) rồi **🗑 remove** chúng.

**4.1 Trỏ Shipyard vào dự án** — sửa `config/local.env`:

```bash
PROFILE="${PROFILE:-quan_ly_kho}"                                   # tên profile (thư mục trong profiles/)
SOURCE_REPO="${SOURCE_REPO:-/home/ttit/shipyard-workspaces/quan-ly-kho}"  # thư mục wizard vừa tạo
LANES_ROOT="${LANES_ROOT:-/home/ttit/IdeaProjects}"                 # nơi tạo lane1/, lane2/…
DB_PREFIX="${DB_PREFIX:-quan_ly_kho_l}"                             # DB lane N = quan_ly_kho_lN
```

(Dòng `COMPOSE_FILE` đang trỏ vào `profiles/hrm_gms/` — xoá hoặc đổi cho dự án mới.)

**4.2 Sinh profile** — mở Claude trong `shipyard/`:

```bash
cd /home/ttit/IdeaProjects/shipyard && claude
```
```
/harness-adapt /home/ttit/shipyard-workspaces/quan-ly-kho
```

Nó tự đọc code, tạo `profiles/quan_ly_kho/` (profile.env + 7 hook), hỏi những gì không đoán được, rồi kiểm tra.
Dự án tạo từ wizard dùng nhánh **`development`** — đúng mặc định, không cần đổi.

**4.3 Bật quy trình duyệt theo vai trò** — trong `profiles/quan_ly_kho/integrations.env`:

```bash
PLATFORM_PROJECT_ID="proj_xxxxxxxxxxxx"     # mã dự án ở mục 1.4 (xem trên trang dự án)
```

Để trống = chế độ cổ điển (`/ship-feature` tự làm hết, chỉ dừng 1 lần cho bạn duyệt spec).

**4.4 Kiểm tra + khởi động lại:**

```bash
bin/harness-doctor.sh quan_ly_kho     # mục tiêu: 0 error
bin/dashboard.sh restart
```

---

## 5. Tạo lane

Dashboard → **＋ Add lane** (hoặc `bin/lane-bootstrap.sh 1` trong terminal) → đợi clone + cài + tạo DB xong → **▶ up**.

Lane N chạy API ở `:800N`, giao diện ở `:300N`, DB riêng `<DB_PREFIX>N`. Code gốc
ở `~/shipyard-workspaces/<slug>` **không bị đụng tới**.

Laptop 18 GB + máy ảo → nên tối đa **2 lane** cùng lúc.

---

## 6. Giao việc

Menu trái → **Giao việc**:

1. **Lane** — chọn lane đang rảnh.
2. **Yêu cầu mới** (gõ mô tả) hoặc **chọn spec có sẵn** trong `specs/`.
   Mô tả càng cụ thể càng tốt: trang nào, nút gì, dữ liệu gì, ai được dùng.
3. **Model cho từng bước** — để mặc định là được; tick lưu làm mặc định của lane nếu muốn.
4. **Duyệt cho tính năng này** — từng bước chọn **Bắt buộc duyệt** hoặc **Tự động**
   (Tự động = không dừng chờ người nhưng vẫn lưu lịch sử).
5. Bấm giao → dashboard tự bật lane (nếu đang tắt) và mở phiên Claude chạy `/ship-feature` trong lane.
   Theo dõi và trả lời AI ngay trên thẻ lane (tab chat) — không cần mở terminal.

Cách cũ vẫn dùng được:
```bash
cd /home/ttit/IdeaProjects/lane1 && claude
# /ship-feature Trang Kho: thêm nút "Xuất Excel" danh sách phiếu nhập đang lọc
```

---

## 7. Duyệt từng bước

AI chạy lần lượt, **mỗi bước xong là dừng chờ người có vai trò đó duyệt**:

```
PM → BA → Kiến trúc → Thiết kế (chỉ khi có giao diện) → Dev → Test → Phát hành
spec.md  ba.md  plan.md+tasks.md   mockup PNG        code+test  qc-plan+ảnh QC   PR
```

Khi có bước chờ: menu **Chờ tôi duyệt** hiện số → bấm vào → **Mở màn hình duyệt**. Đọc tài liệu
(sửa trực tiếp được), rồi chọn:

| Nút | Kết quả |
|---|---|
| **Duyệt** / **Duyệt kèm bản đã sửa** | Bước tiếp theo bắt đầu. Bản bạn sửa là bản AI dùng tiếp |
| **Yêu cầu sửa** | Ghi góp ý → AI làm lại **đúng bước này** theo góp ý |
| **Trả về** | Quay về một bước trước; mọi bước sau làm lại |
| Huỷ tính năng | Dừng hẳn |

Ở bước **Kiến trúc** bạn xác nhận tính năng **có giao diện hay không** — không có thì bỏ qua bước Thiết kế.
AI **không viết code giao diện** trước khi bản thiết kế được duyệt.

Xem lại toàn bộ tài liệu đã duyệt và ai duyệt: menu **Tài liệu**. Xem token và tiền đã tốn: **Chi phí**.

---

## 8. PR, merge, kiểm tra sau merge

Sau khi bước Test được duyệt, lane tự: senior gate (GO/NO-GO) → push nhánh `feat/<tên>` → mở **PR vào `development`** → tạo ticket.

Bạn:

1. Mở link PR trên thẻ lane → GitHub → **Files changed**.
2. Muốn sửa gì → **comment trên PR**, lane tự sửa + đẩy bản mới.
3. Ổn → **Merge pull request**. Shipyard **không bao giờ tự merge**.

Sau merge, lane đợi deploy (nếu có) rồi kiểm tra lại trên môi trường dev:
- ổn → ✅ **done**;
- có lỗi → lane mở lại quy trình, sửa trên nhánh `feat/<tên>-fix1`, mở PR mới → bạn merge tiếp.

Xong tính năng: trên thẻ lane bấm **🧹 clear** → **⟳ reset** → giao việc tiếp (mục 6).

---

## 9. Chạy dự án

### Trên máy bạn

```bash
cd /home/ttit/shipyard-workspaces/<slug>
git checkout development && git pull     # lấy code AI đã merge
cp .env.example .env                     # lần đầu: sửa các giá trị change-me
docker compose up -d db                  # nếu dự án có database
# rồi lệnh cài + chạy — có sẵn trong README.md của dự án, ví dụ NestJS:
npm install && npm run start:dev
```

Có chọn Docker ở wizard thì chạy cả cụm bằng một lệnh:
```bash
docker compose up --build
```

Lệnh test / build cũng nằm trong `README.md` của dự án (mục "Kiểm thử và build").

### Xem bản AI đang làm (trước khi merge)

Lane đang ▶ up → mở `http://localhost:300N` (lane 1 = `:3001`).

### Lên production

Khi `development` đã ổn: GitHub → **New pull request** → base **`main`** ← compare **`development`** → **Merge**.
Nếu đã cấu hình máy chủ tự deploy theo nhánh `main` (như HRM: máy prod `192.168.56.11`) thì nó tự lên.
Dự án mới tạo chưa có máy chủ deploy — CI do wizard tạo chỉ build + test.

---

## Lỗi hay gặp

| Triệu chứng | Cách xử lý |
|---|---|
| Không thấy nút **Tạo từ khung** | Tài khoản không phải quản trị (SYS_ADMIN) |
| Framework báo **Thiếu công cụ** | Cài theo gợi ý trên thẻ (JDK, Node 20+, `uv`, `unzip`…), mở lại wizard |
| "Thư mục … đã tồn tại" | Slug đã dùng — đổi slug, hoặc xoá `~/shipyard-workspaces/<slug>` nếu là bản hỏng |
| Lỗi ở **Tạo repo & push** | Token sai quyền, hoặc tên repo đã có trên GitHub → sửa rồi **Thử lại** |
| "Phiên đăng nhập đã hết hạn" ở **Đăng ký** | Đăng nhập lại dashboard → **Thử lại** |
| Giao việc nhưng AI không dừng chờ duyệt | `PLATFORM_PROJECT_ID` trống trong `integrations.env` (mục 4.3), hoặc bạn chọn **Tự động** cho bước đó |
| Thẻ lane báo **platform unreachable** | `bin/platform.sh start` rồi gõ `tiếp tục` trong lane |
| Thẻ lane **bị chặn** "… đổi model trên dashboard" | Model của bước đó lỗi → đổi model cho lane, gõ `tiếp tục` |
| Lane không theo luật mới trong `.shipyard/rules/` | Luật chưa lên nhánh `development` (mục 3) |
| Sửa skill/agent trong `shipyard/claude/` không có tác dụng | `bin/install-claude-assets.sh` → ♻ agents trên lane → `/exit` và mở lại Claude |

Log: `logs/laneN/{api,fe}.log`, `logs/dashboard-actions.log`.
