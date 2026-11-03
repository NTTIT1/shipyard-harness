# Bộ slide giới thiệu & demo Shipyard cho khách hàng

Tài liệu này là **kịch bản đầy đủ** để dựng file PowerPoint (.pptx): mục đích từng slide, chữ đặt lên
slide, lời thuyết trình, và **chỗ nào cần ảnh giao diện** (đánh dấu `📸 ẢNH`). Phần cuối có danh sách ảnh
cần chụp, kịch bản demo trực tiếp, câu hỏi khách hay hỏi, và checklist trước buổi gặp.

---

## 0. Cách dùng tài liệu này

| Mục | Gợi ý |
|---|---|
| Khách nghe | Chủ doanh nghiệp / CTO / trưởng nhóm sản phẩm muốn làm phần mềm nhanh hơn với AI |
| Thời lượng | 20–25 phút trình bày + 10–15 phút demo trực tiếp + 10 phút hỏi đáp |
| Số slide | 23 slide chính + phụ lục (file `docs/Shipyard-gioi-thieu.pptx` có 27 slide) |
| Tỉ lệ | 16:9 |
| Chữ | Mỗi slide tối đa **1 câu tiêu đề + 3–5 ý ngắn**. Lời giải thích dài để ở **ghi chú người nói** (Notes) |
| Phông | Một phông không chân (Inter, SF Pro, Segoe UI hoặc Be Vietnam Pro — hiển thị tiếng Việt tốt) |
| Màu | Nền trắng hoặc tối giống dashboard; một màu nhấn xanh dương (#4F86F7 — màu chính của dashboard); xanh lá = ổn, vàng = cảnh báo, đỏ = dừng |
| Ảnh | Chụp ở cửa sổ trình duyệt rộng **1440 px**, zoom 100%, chế độ sáng (dễ in). Che tên khách / dữ liệu thật nếu có |

**Quy ước trong tài liệu:**

- **Trên slide:** chữ đặt lên slide.
- **Lời nói:** ghi chú người nói (dán vào phần Notes của PowerPoint).
- `📸 ẢNH Sxx-n — …`: ảnh cần chèn, mã ảnh khớp với **danh sách ảnh ở mục 2**.
- `🎨 HÌNH VẼ`: sơ đồ / biểu tượng vẽ trực tiếp trong PowerPoint, không cần chụp.

---

## 1. Nội dung từng slide

### Slide 1 — Trang bìa

**Trên slide:**

- Tiêu đề lớn: **Shipyard — Xưởng AI làm phần mềm song song**
- Dòng phụ: *Một đội AI làm phần mềm cho bạn — con người duyệt những bước quan trọng*
- Tên người trình bày · công ty · ngày

`📸 ẢNH S01-1 — Ảnh nền mờ màn hình Tổng quan dự án` (đặt mờ ~20% phía sau tiêu đề, hoặc đặt bên phải nửa slide)

**Lời nói:**
> Hôm nay em giới thiệu Shipyard — một hệ thống để một đội AI làm phần mềm cho anh chị: từ ý tưởng tới
> code chạy được, có kiểm thử, có pull request, và con người luôn là người duyệt và merge cuối cùng.

---

### Slide 2 — Vấn đề khách hàng đang gặp

**Trên slide:** *Làm phần mềm hôm nay: chậm, đắt, khó kiểm soát*

- Một tính năng đi qua nhiều người: PM → BA → kiến trúc → thiết kế → code → test
- Chờ đợi giữa các bước chiếm phần lớn thời gian
- Dùng AI rời rạc (chat từng câu) → không có quy trình, không kiểm soát chất lượng, không biết tốn bao nhiêu tiền
- Tài liệu và code lệch nhau theo thời gian

`🎨 HÌNH VẼ` — 6 ô vai trò nối nhau bằng mũi tên, giữa các ô có biểu tượng đồng hồ cát ("chờ").

**Lời nói:**
> Anh chị chắc quen cảnh: một tính năng nhỏ cũng mất vài tuần vì phải chờ qua nhiều người. Còn dùng AI
> kiểu chat thì nhanh nhưng không ai đảm bảo nó làm đúng yêu cầu, đúng thiết kế, và cũng không biết
> tháng này tốn bao nhiêu.

---

### Slide 3 — Shipyard là gì (một câu)

**Trên slide:** *Shipyard = một đội AI đầy đủ vai trò + quy trình có người duyệt + nhiều tính năng chạy song song*

- **Đội AI:** PM, BA, kiến trúc sư, thiết kế UI, lập trình viên, tester
- **Con người duyệt** ở những bước anh chị chọn
- **Song song:** mỗi tính năng một "lane" riêng, không giẫm chân nhau
- **An toàn:** AI chỉ mở pull request — **con người merge**

`📸 ẢNH S03-1 — Sơ đồ tổng thể (docs/so-do-tong-the.png)` — có sẵn trong repo, không cần chụp.

**Lời nói:**
> Hình dung Shipyard như một xưởng: anh chị đưa ý tưởng hoặc repo có sẵn vào, đội AI làm theo đúng quy
> trình anh chị đặt ra, và ở mỗi cổng quan trọng thì có người duyệt. Code không bao giờ tự vào nhánh
> chính — AI chỉ mở pull request.

---

### Slide 4 — Hành trình từ ý tưởng tới phần mềm

**Trên slide:** *Từ ý tưởng tới pull request — 4 chặng*

1. **Ý tưởng** → chat với AI PM, AI kiến trúc sư, AI thiết kế
2. **Dự án** → tài liệu đã duyệt + quy trình riêng + lộ trình tính năng
3. **Lane** → mỗi tính năng: viết spec → code → test → QC trình duyệt
4. **Pull request** → người review và merge

`🎨 HÌNH VẼ` — dòng thời gian ngang 4 chặng, mỗi chặng một biểu tượng (bóng đèn → thư mục → làn đường → dấu tích).

**Lời nói:**
> Đây là toàn bộ hành trình. Các slide sau em đi qua từng chặng, và phần demo em sẽ chạy thật cho anh chị xem.

---

### Slide 4b — Quản lý nhiều dự án *(mới — trong .pptx là slide 5)*

**Trên slide:** *Quản lý nhiều dự án trên một dashboard*

- Danh sách dự án với số lane và tiến độ
- Mỗi dự án có riêng: thành viên & vai trò, quy trình & duyệt, tài liệu & bộ nhớ, lane, hàng chờ tính năng, hạn mức chi phí
- Chuyển dự án ở thanh trên cùng; lane của dự án nào chỉ hiện trong dự án đó

`📸 ẢNH DA-1 — Điều hành → Dự án: danh sách dự án có tiến độ` (chụp khi có 2–3 dự án)

---

### Slide 5 — Ba cách bắt đầu một dự án

**Trên slide:** *Bắt đầu theo cách anh chị có sẵn*

| Từ ý tưởng | Từ khung công nghệ | Từ repo có sẵn |
|---|---|---|
| Mới có ý tưởng: chat với AI, AI viết yêu cầu, tư vấn công nghệ, vẽ mockup | Đã biết muốn dùng gì: chọn backend, frontend, database rồi mới chat | Đã có code trên GitHub/GitLab: AI đọc toàn bộ code + tài liệu anh chị đưa vào |

`📸 ẢNH S05-1 — Hộp thoại "Tạo dự án" với 3 lựa chọn`

**Lời nói:**
> Dù anh chị mới có ý tưởng, đã có định hướng công nghệ, hay đã có dự án đang chạy, Shipyard đều nhận
> được. Với repo có sẵn, AI đọc code trước rồi mới cùng anh chị viết tài liệu, nên không làm lệch hệ
> thống hiện tại.

---

### Slide 6 — Chat dự án: một ô chat cho cả dự án

**Trên slide:** *Một cuộc trò chuyện — cả đội AI cùng tham gia*

- AI PM hỏi những gì còn thiếu → viết **yêu cầu sản phẩm**
- AI kiến trúc sư đề xuất công nghệ + **thiết kế hệ thống**
- AI thiết kế vẽ **mockup giao diện** thật (xem được, bấm được)
- Anh chị **duyệt từng bước ngay trong chat**

`📸 ẢNH S06-1 — Màn hình Chat dự án đang trò chuyện với AI PM` (chụp lúc AI vừa hỏi và có nút Duyệt)
`📸 ẢNH S06-2 — Mockup do AI thiết kế hiện trong chat` (ảnh nhỏ góc phải)

**Lời nói:**
> Anh chị chỉ cần nói chuyện như với một đội sản phẩm thật. AI hỏi lại những chỗ chưa rõ, viết tài liệu,
> rồi chờ anh chị bấm duyệt. Không có gì đi tiếp nếu anh chị chưa đồng ý.

---

### Slide 7 — Thêm tính năng mới bằng chat

**Trên slide:** *Muốn thêm tính năng? Nhắn một câu.*

- Ví dụ: *"Thêm chức năng đăng nhập bằng Google"*
- AI PM → AI kiến trúc sư → AI thiết kế lần lượt xử lý, anh chị duyệt
- Tính năng đã duyệt vào **hàng chờ của dự án**
- **Lane rảnh tự nhận việc** — không cần giao tay

`📸 ẢNH S07-1 — Chat dự án: một luồng "thêm tính năng" đã duyệt xong`
`📸 ẢNH S07-2 — Hàng chờ tính năng của dự án` (danh sách tính năng chờ làm / đang làm)

**Lời nói:**
> Sau khi dự án đã có, việc thêm tính năng cũng đi qua đúng quy trình đó. Duyệt xong là tính năng vào
> hàng chờ, lane nào rảnh sẽ tự nhận — anh chị không phải điều phối tay.

---

### Slide 8 — Tài liệu đã duyệt là "chuẩn"

**Trên slide:** *AI làm đúng cái đã duyệt — không tự ý vẽ lại*

- Yêu cầu sản phẩm, thiết kế hệ thống, hướng dẫn thiết kế, mockup → được đưa cho **mọi bước**
- Code phải **giống mockup**, đúng kiến trúc
- Test và QC so sánh với mockup đã duyệt
- Một nơi xem tất cả: **Bộ nhớ dự án → Tài liệu sản phẩm**

`📸 ẢNH S08-1 — Bộ nhớ dự án, tab "Tài liệu sản phẩm"` (cột trái các phần, bên phải tài liệu đang mở)
`📸 ẢNH S08-2 — Tab "Giao diện": thư viện ảnh các màn hình` (ảnh nhỏ)

**Lời nói:**
> Điểm khác biệt quan trọng: cái anh chị đã duyệt trở thành chuẩn. AI ở bước code không được tự sáng tạo
> lại giao diện, mà phải làm giống mockup. Tester cũng kiểm theo đúng mockup đó.

---

### Slide 9 — Lane: làm nhiều tính năng cùng lúc

**Trên slide:** *Mỗi tính năng một lane — chạy song song, không đụng nhau*

- Lane = một bản sao đầy đủ của dự án: code, database, cổng chạy, phiên AI riêng
- Nhiều lane cùng chạy → nhiều tính năng xong cùng lúc
- Tạo lane mới chỉ một nút; lane gắn với từng dự án
- Theo dõi tiến độ từng lane theo thời gian thực

`📸 ẢNH S09-1 — Màn hình Lanes của một dự án` (có 2–3 lane ở các giai đoạn khác nhau)
`📸 ẢNH S09-2 — Hộp thoại "Thêm lane"` (ảnh nhỏ)

**Lời nói:**
> Thay vì một người làm tuần tự, Shipyard mở nhiều "làn" song song. Mỗi làn có môi trường riêng nên lỗi ở
> làn này không ảnh hưởng làn khác.

---

### Slide 10 — Bên trong một lane: quy trình kỹ thuật

**Trên slide:** *Một tính năng đi qua đủ các cổng chất lượng*

`Spec → Code (TDD) → CI + e2e → Review code → QC trình duyệt → GO/NO-GO → Pull request → Theo dõi tới khi merge`

- Tự kiểm tra trước khi mở PR: build, lint, test, e2e
- AI review code độc lập với AI viết code
- AI QC dùng trình duyệt thật, chụp ảnh làm bằng chứng
- Cổng **GO/NO-GO** cuối cùng trước khi mở PR

`📸 ẢNH S10-1 — Sơ đồ luồng kỹ thuật chi tiết của lane` (màn hình lane → sơ đồ pipeline; có thể chụp bản tiếng Việt hoặc tiếng Anh tuỳ khách)

**Lời nói:**
> Đây là "dây chuyền" trong mỗi lane. AI không chỉ viết code: nó viết test trước, chạy CI, một AI khác
> review, một AI khác nữa mở trình duyệt bấm thử từng màn hình và chụp ảnh làm bằng chứng. Chỉ khi qua cổng
> GO thì PR mới được mở.

---

### Slide 11 — Bằng chứng QC: ảnh chụp thật

**Trên slide:** *Không chỉ "đã test" — có ảnh chứng minh*

- Mỗi luồng người dùng được chạy trên trình duyệt thật
- Ảnh chụp từng bước lưu trong thư viện của tính năng
- Người duyệt xem ảnh trước khi merge

`📸 ẢNH S11-1 — Thư viện ảnh QC của một tính năng (Proof gallery)`

**Lời nói:**
> Người review không cần tự cài và bấm thử: mở thư viện ảnh là thấy tính năng chạy thế nào ở từng bước.

---

### Slide 12 — Con người kiểm soát: duyệt ở đúng chỗ

**Trên slide:** *Anh chị quyết định bước nào cần người duyệt*

- Màn **Chờ tôi duyệt**: spec, BA, kiến trúc, thiết kế, kế hoạch test
- Duyệt · yêu cầu sửa · sửa trực tiếp tài liệu
- Phân quyền theo vai trò: PM duyệt spec, tech lead duyệt kiến trúc, designer duyệt thiết kế…
- Mọi phản hồi của người duyệt được AI **ghi nhớ** cho lần sau

`📸 ẢNH S12-1 — Màn "Chờ tôi duyệt" đang mở một tài liệu` (có các nút Duyệt / Yêu cầu sửa)

**Lời nói:**
> AI làm nhanh, nhưng quyền quyết định vẫn ở con người. Anh chị chọn bước nào cần duyệt và ai duyệt.

---

### Slide 13 — Quy trình riêng cho từng dự án

**Trên slide:** *Mỗi dự án một quy trình — chỉnh bằng kéo thả hoặc bằng lời*

- Mẫu có sẵn: Đầy đủ · Plan → Code → Test · Tự chạy hết · Chỉ Code + Test · Doanh nghiệp
- Mỗi bước: cần duyệt / tự qua khi xanh / bỏ qua
- Mỗi bước chọn **model AI, giới hạn phút, ngân sách, số lần thử lại, khi lỗi thì làm gì**
- Có thể nhắn AI: *"bước Test dùng Haiku, tối đa 30 phút, lỗi thì thử lại 2 lần"*

`📸 ẢNH S13-1 — Màn "Quy trình & duyệt", chế độ Sơ đồ, đang mở cấu hình một bước`

**Lời nói:**
> Dự án nhỏ có thể cho AI tự chạy hết, dự án ngân hàng thì duyệt kỹ từng bước. Cùng một hệ thống, mỗi
> dự án cấu hình khác nhau.

---

### Slide 13b — Đội AI riêng của dự án *(mới — trong .pptx là slide 15)*

**Trên slide:** *Đội AI học luật riêng của từng dự án*

- AI Manager đọc code và tài liệu, quy ước anh chị đưa vào
- Soạn luật cho từng vai trò: PM, kiến trúc, lập trình, review, test
- Tech lead duyệt — luật lưu trong repo, mọi bước AI phải theo
- Bật / tắt kỹ năng AI cho từng vai trò

`📸 ẢNH TEAM-1 — Dự án → Đội AI / Kỹ năng AI & khung`

---

### Slide 14 — Bộ nhớ dự án: AI hiểu dự án ngày càng sâu

**Trên slide:** *Càng làm lâu, AI càng hiểu dự án — mà không tốn thêm token*

- Ghi nhớ: tài liệu đã duyệt, quyết định, bài học, phản hồi của người duyệt
- Mỗi bước chỉ nhận đúng phần ngữ cảnh cần thiết (gói ngữ cảnh gọn)
- Bài học từ con người được ưu tiên
- Xem được tại **Bộ nhớ dự án → Bộ nhớ AI**

`📸 ẢNH S14-1 — Bộ nhớ dự án, tab "Bộ nhớ AI"`
`🎨 HÌNH VẼ` — vòng lặp: Làm → Duyệt → Ghi nhớ → Làm tốt hơn.

**Lời nói:**
> Vấn đề của AI thông thường là quên. Shipyard có bộ nhớ riêng cho từng dự án: lần sau AI tự biết những gì
> đã thống nhất, những lỗi đã từng bị nhắc — và chỉ lấy đúng phần cần, nên chi phí không phình ra theo thời gian.

---

### Slide 14b — Bộ nhớ AI giữ lại những gì *(mới — trong .pptx là slide 17, không cần ảnh)*

**Trên slide:** 6 thẻ — Tài liệu đã duyệt · Quyết định kỹ thuật · Bài học từ người duyệt · Tóm tắt tính năng · Đồ thị thực thể · **Gói ngữ cảnh gọn** (mỗi bước chỉ nhận phần liên quan — chi phí không phình theo thời gian)

---

### Slide 15 — Kiểm soát chi phí & hạn mức

**Trên slide:** *Biết rõ từng đồng — và AI dừng đúng lúc*

- Chi phí theo dự án, tính năng, lane, model, từng ngày
- So sánh **chi phí AI với chi phí người làm** cho từng tính năng
- Đặt hạn mức: chung tháng, theo dự án, theo lane, theo model, theo bước quy trình
- **80%** → cảnh báo trong chat lane · **100%** → lane **dừng hẳn**, chờ quản trị viên cấp thêm
- Cấp thêm / đặt lại / đổi model bằng một nút, lane làm tiếp đúng chỗ đã dừng

`📸 ẢNH S15-1 — Chi phí & hạn mức, tab "Hạn mức"` (các nhóm Chung / Dự án / Lane / Model với thanh %)
`📸 ẢNH S15-2 — Thẻ "Lane đã dừng — hết hạn mức" trong chat của lane` (ảnh nhỏ, có các nút +$5 +$20 +$50)

**Lời nói:**
> Câu hỏi khách hay hỏi nhất là "AI có tiêu quá tiền không". Ở đây anh chị đặt trần cho từng thứ. Gần chạm
> trần thì được báo trước, chạm trần thì lane dừng hẳn chứ không cố chạy tiếp, và chỉ quản trị viên mới
> cấp thêm được.

---

### Slide 16 — Nhiều model AI, chọn theo từng bước

**Trên slide:** *Dùng model mạnh ở chỗ khó, model rẻ ở chỗ dễ*

- Claude (Opus / Sonnet / Haiku) qua tài khoản hoặc API key
- Các nhà cung cấp khác (OpenAI, Gemini, DeepSeek…) qua cổng LiteLLM, chạy trong hộp kín (OpenHands)
- Chọn model + mức suy nghĩ (effort) cho **từng bước**, từng lane, từng tính năng
- API key chỉ lưu trên máy của anh chị

`📸 ẢNH S16-1 — Màn "Nhà cung cấp AI"` (che bớt key — chỉ hiện 4 ký tự cuối là đúng)
`📸 ẢNH S16-2 — Bảng chọn model theo từng bước của một lane` (ảnh nhỏ)

**Lời nói:**
> Không phải bước nào cũng cần model đắt nhất. Ví dụ tạo ticket hay QC thì dùng model nhẹ, thiết kế kiến
> trúc thì dùng model mạnh. Chi phí giảm mà chất lượng giữ nguyên.

---

### Slide 17 — Làm được những loại dự án nào

**Trên slide:** *Web, backend và app mobile Android*

| Backend | Frontend | Mobile |
|---|---|---|
| Spring Boot · FastAPI · NestJS | React + Vite | Flutter (Android) |

- Fullstack: backend + frontend (hoặc app mobile) trong một dự án
- App mobile được AI kiểm thử trên **máy ảo Android** dùng chung, bằng Maestro
- Nhập repo có sẵn với công nghệ khác: khai cách build/chạy/test là dùng được

`📸 ẢNH S17-1 — Bước chọn khung công nghệ khi tạo dự án` (thấy các lựa chọn backend / frontend / Flutter / database)

**Lời nói:**
> Hiện Shipyard sinh sẵn được các khung phổ biến cho web và mobile Android. Với dự án đã có thì không giới
> hạn công nghệ, chỉ cần khai cách chạy và kiểm thử.

---

### Slide 18 — Bảo mật & triển khai

**Trên slide:** *Chạy trên hạ tầng của anh chị — code và key không rời khỏi máy*

- Cài trên máy / server của khách (self-hosted)
- Đăng nhập, phân quyền theo vai trò dự án
- AI chỉ đẩy nhánh và mở pull request — **không merge, không đụng nhánh chính**
- API key lưu cục bộ, trình duyệt chỉ thấy 4 ký tự cuối
- Giao diện tiếng Việt · English · 日本語

`📸 ẢNH S18-1 — Màn đăng nhập` (hoặc màn Thành viên & vai trò của dự án)

**Lời nói:**
> Với khách doanh nghiệp, đây thường là điều kiện tiên quyết: mọi thứ chạy trong hạ tầng của anh chị, và AI
> không có quyền đưa code vào nhánh chính.

---

### Slide 19 — Lợi ích cho khách hàng

**Trên slide:** *Anh chị nhận được gì*

- **Nhanh hơn:** nhiều tính năng chạy song song, không chờ giữa các bước
- **Chất lượng ổn định:** mọi tính năng qua cùng một dây chuyền kiểm tra, có ảnh bằng chứng
- **Kiểm soát:** duyệt ở đúng chỗ, AI không tự merge
- **Minh bạch chi phí:** biết từng tính năng tốn bao nhiêu, có trần chi tiêu
- **Tài liệu luôn khớp code:** tài liệu đã duyệt là chuẩn cho mọi bước

`🎨 HÌNH VẼ` — 5 biểu tượng (tia chớp, khiên, bánh lái, biểu đồ, quyển sách).

> **Chèn số liệu thật nếu có** (ví dụ từ dự án thử nghiệm): `[ví dụ: tính năng X làm trong __ giờ, chi phí AI __ đ so với ước tính người làm __ đ]`. Số này lấy ở **Chi phí & hạn mức → Tính năng** (cột "AI / người làm"). Đừng đưa con số chưa đo.

`📸 ẢNH S19-1 (tuỳ chọn) — Chi phí & hạn mức, tab "Tính năng"` (có cột AI / người làm)

---

### Slide 20 — Bước tiếp theo & liên hệ

**Trên slide:** *Bắt đầu thế nào*

1. Buổi demo trên chính ý tưởng / repo của anh chị
2. Thử nghiệm 2–4 tuần trên một dự án thật
3. Đánh giá chi phí, tốc độ, chất lượng → quyết định triển khai

- Liên hệ: tên · email · số điện thoại

**Lời nói:**
> Cách tốt nhất để đánh giá là thử trên chính dự án của anh chị. Em đề xuất một đợt thử nghiệm ngắn, đo
> bằng số liệu thật trên trang chi phí.

---

### Phụ lục A — Kiến trúc hệ thống (cho khách kỹ thuật)

**Trên slide:**

- Dashboard (web) ↔ Shipyard Platform: dịch vụ đăng nhập, dự án, lane, điều phối quy trình, bộ nhớ dự án
- Postgres, Redis, RabbitMQ · Ollama (bge-m3) cho tìm kiếm ngữ nghĩa trong bộ nhớ
- Lane chạy Claude Code + các agent vai trò; model khác qua cổng LiteLLM

`📸 ẢNH PA-1 — Sơ đồ tổng thể (docs/so-do-tong-the.png)` hoặc vẽ lại từ `docs/so-do-tong-the.mmd`

### Phụ lục B — Một ngày làm việc với Shipyard

**Trên slide:** dòng thời gian: *9:00 nhắn 3 tính năng → 9:30 duyệt spec → 11:00 duyệt thiết kế → chiều: 3 PR có ảnh QC chờ review*

> Giờ giấc chỉ là minh hoạ; nói rõ với khách đây là ví dụ, không phải cam kết.

### Phụ lục C — So sánh với cách dùng AI thông thường

| | Chat AI thông thường | Shipyard |
|---|---|---|
| Quy trình | Không có | Theo quy trình từng dự án, có cổng duyệt |
| Song song | Một cuộc chat | Nhiều lane cùng lúc |
| Kiểm thử | Tự làm | CI + e2e + review + QC trình duyệt có ảnh |
| Ghi nhớ | Quên sau mỗi cuộc chat | Bộ nhớ dự án |
| Chi phí | Không rõ | Theo từng tính năng, có hạn mức dừng |
| Đưa vào code | Copy–paste | Pull request, người merge |

---

## 2. Danh sách ảnh cần chụp

Đặt tên file đúng mã để dễ chèn. Chụp ở trình duyệt rộng 1440 px, zoom 100%, chế độ sáng, ngôn ngữ giao
diện tiếng Việt (trừ khi trình bày cho khách nước ngoài: chuyển EN/JA bằng nút ngôn ngữ trên thanh bên).

| Mã ảnh | Slide | Màn hình | Cách mở / trạng thái cần chuẩn bị |
|---|---|---|---|
| S01-1 | 1 | Tổng quan dự án (có thanh tiến độ) | Điều hành → Dự án → chọn một dự án có vài tính năng đã xong |
| S03-1 | 3 | *(không cần — bản .pptx vẽ sẵn hình đội AI)* | — |
| DA-1 | 4b | Danh sách dự án | Điều hành → Dự án, có 2–3 dự án với tiến độ |
| S05-1 | 5 | Hộp thoại "Tạo dự án" — 3 cách | Điều hành → Dự án → **Tạo dự án** |
| S06-1 | 6 | Chat dự án với AI PM | Tạo dự án "Từ ý tưởng", nhắn một ý tưởng, chờ AI hỏi lại — chụp khi có nút Duyệt |
| S06-2 | 6 | Mockup trong chat | Cùng chat, sau bước AI thiết kế |
| S07-1 | 7 | Luồng "thêm tính năng" trong chat | Trong chat dự án nhắn "Thêm tính năng …", đi hết PM → kiến trúc → thiết kế |
| S07-2 | 7 | Hàng chờ tính năng | Dự án → hàng chờ / danh sách tính năng (có trạng thái chờ / đang làm / xong) |
| S08-1 | 8 | Bộ nhớ dự án → Tài liệu sản phẩm | Mở phần "Yêu cầu sản phẩm" hoặc "Thiết kế hệ thống" |
| S08-2 | 8 | Tài liệu sản phẩm → Giao diện (thư viện màn hình) | Phần "Giao diện", chế độ Màn hình |
| S09-1 | 9 | Lanes của dự án | Có 2–3 lane ở các giai đoạn khác nhau (đang code, đang QC, đã xong) |
| S09-2 | 9 | Hộp thoại "Thêm lane" *(tuỳ chọn, dùng khi demo)* | Lanes → **Thêm lane** |
| S10-1 | 10 | Sơ đồ luồng kỹ thuật của lane | Mở một lane → sơ đồ pipeline |
| S11-1 | 11 | Thư viện ảnh QC | Mở lane đã qua QC → thư viện ảnh (Proof) |
| S12-1 | 12 | Chờ tôi duyệt | Có ít nhất một tài liệu đang chờ duyệt |
| S13-1 | 13 | Quy trình & duyệt — Sơ đồ | Dự án → Quy trình & duyệt → bấm một bước để mở cấu hình |
| TEAM-1 | 13b | Đội AI & kỹ năng của dự án | Dự án → Đội AI / Kỹ năng AI & khung |
| S14-1 | 14 | Bộ nhớ dự án → Bộ nhớ AI | Dự án đã chạy vài tính năng (có ghi nhớ) |
| S15-1 | 15 | Chi phí & hạn mức → Hạn mức | Đặt sẵn vài hạn mức để thanh % có màu (một cái "Sắp chạm") |
| S15-2 | 15 | Thẻ "Lane đã dừng — hết hạn mức" | Xem cách tạo ở **mục 3.3** (dùng lane thử, đặt hạn mức lane thấp) |
| S16-1 | 16 | Nhà cung cấp AI | Biểu tượng cài đặt → Nhà cung cấp AI. Kiểm tra không lộ key |
| S16-2 | 16 | Model theo từng bước | Chi phí & hạn mức → Model AI theo lane → mở một lane |
| S17-1 | 17 | Chọn khung công nghệ | Tạo dự án → **Từ khung** → bước chọn backend / frontend / database |
| S18-1 | 18 | Đăng nhập hoặc Thành viên & vai trò | Đăng xuất để chụp màn đăng nhập, hoặc Dự án → Thành viên |
| S19-1 | 19 | Chi phí theo tính năng | Chi phí & hạn mức → Tính năng |
| PA-1 | Phụ lục A | Sơ đồ kiến trúc | `docs/so-do-tong-the.png` |

**Trước khi chụp, kiểm tra từng ảnh:** không lộ API key, email/số điện thoại thật, tên khách hàng khác, địa
chỉ IP nội bộ, đường dẫn máy (`/home/...`). Làm mờ nếu cần.

---

## 3. Kịch bản demo trực tiếp (10–15 phút)

### 3.1 Chuẩn bị (trước buổi gặp 1 ngày)

1. Bật hệ thống: `bin/platform.sh start` rồi `bin/dashboard.sh start`, đăng nhập bằng tài khoản quản trị.
2. Chuẩn bị **một dự án demo** đã có sẵn tài liệu, vài tính năng đã xong (để có ảnh QC, bộ nhớ, chi phí).
3. Chuẩn bị **một lane rảnh** để giao việc trực tiếp trong buổi demo.
4. Chọn trước **một tính năng nhỏ** để demo (ví dụ: *"Thêm trang Liên hệ có form gửi email"*), đã thử chạy
   một lần ở nhà để biết mất bao lâu.
5. Kiểm tra hạn mức còn đủ (Chi phí & hạn mức → Hạn mức) — đừng để lane bị dừng giữa buổi demo, trừ khi
   cố ý demo tính năng đó.
6. Mở sẵn các tab trình duyệt theo thứ tự demo; tắt thông báo máy tính.

### 3.2 Thứ tự demo

| Phút | Làm gì | Nói gì |
|---|---|---|
| 0–2 | Mở **Dự án** → tổng quan dự án demo | "Đây là một dự án đang chạy: tiến độ, tính năng, lane" |
| 2–5 | Mở **Chat dự án**, nhắn tính năng đã chọn; cho khách thấy AI PM hỏi lại / viết yêu cầu; bấm **Duyệt** | "Mọi tính năng mới bắt đầu bằng một câu chat, và chỉ đi tiếp khi mình duyệt" |
| 5–7 | Mở **Bộ nhớ dự án → Tài liệu sản phẩm** → phần Giao diện, mở một màn hình lớn | "Đây là chuẩn mà AI phải làm theo" |
| 7–10 | Mở **Lanes** → lane vừa nhận việc: chat của lane, sơ đồ luồng kỹ thuật | "Lane đang làm: viết spec, code, test…" |
| 10–12 | Mở lane **đã xong** trước đó → thư viện ảnh QC → link pull request | "Kết quả cuối: PR có ảnh bằng chứng, người merge" |
| 12–14 | Mở **Chi phí & hạn mức** → tab Hạn mức, rồi tab Tính năng | "Tính năng này tốn bao nhiêu, và hệ thống tự dừng khi chạm trần" |
| 14–15 | Quay lại lane đang làm để khách thấy tiến độ đã đi tiếp | Chốt và chuyển sang hỏi đáp |

> Tính năng giao trong buổi demo thường **chưa xong** trong 15 phút — đó là bình thường. Hãy dùng lane đã
> làm xong từ trước để cho khách xem kết quả cuối (PR + ảnh QC).

### 3.3 (Tuỳ chọn) Demo hạn mức dừng lane

Dùng một **lane thử**, không dùng lane đang làm việc thật:

1. Chi phí & hạn mức → **Hạn mức** → nhóm **Lane** → lane thử → **Đặt hạn mức** USD rất thấp (ví dụ `0.5`).
2. Giao cho lane thử một việc nhỏ. Khi chi phí vượt trần, chat của lane hiện thẻ **"Lane đã dừng — hết hạn mức"**.
3. Cho khách thấy: lane ở trạng thái **hết hạn mức** trong danh sách, bấm **+$5** → lane tự làm tiếp.
4. Sau buổi demo: **Bỏ hạn mức riêng** của lane thử.

### 3.4 Phương án dự phòng

- Mạng / AI chậm: chuyển sang **ảnh chụp** trong slide (đó là lý do slide có đủ ảnh).
- Tài khoản Claude hết lượt: dashboard báo giờ tự chạy lại; cho khách xem lane đã làm xong từ trước.
- Lỗi bất ngờ: nói thật, chuyển sang slide tiếp theo, quay lại demo cuối buổi nếu kịp.

---

## 4. Câu hỏi khách hay hỏi — gợi ý trả lời

| Câu hỏi | Gợi ý trả lời |
|---|---|
| AI có tự đưa code vào sản phẩm không? | Không. AI chỉ đẩy nhánh và mở pull request vào nhánh tích hợp; con người review và merge. |
| Code của chúng tôi có bị gửi đi đâu không? | Hệ thống chạy trên hạ tầng của anh chị. Phần gửi đi chỉ là nội dung AI cần đọc để làm việc, tới nhà cung cấp model anh chị chọn (Anthropic hoặc nhà cung cấp khác qua cổng LiteLLM). |
| Chi phí mỗi tháng bao nhiêu? | Phụ thuộc số tính năng và model chọn. Trang Chi phí hiển thị theo từng tính năng; anh chị đặt trần tháng, theo dự án, theo lane, theo model — chạm trần là dừng. Nên chạy thử 2–4 tuần để có số thật. |
| Làm được với dự án đang có không? | Được: nhập repo từ GitHub/GitLab/máy, khai cách build/chạy/test và nơi để tài liệu; AI đọc code trước khi làm. |
| Công nghệ nào được hỗ trợ? | Sinh sẵn: Spring Boot, FastAPI, NestJS, React + Vite, Flutter (Android). Repo có sẵn: bất kỳ công nghệ nào có lệnh build/test. |
| Nếu AI làm sai? | Có nhiều lớp chặn: test tự động, AI review độc lập, QC trình duyệt có ảnh, cổng GO/NO-GO, và người duyệt. Phản hồi của người duyệt được ghi vào bộ nhớ để lần sau không lặp lại. |
| Có cần đội lập trình không? | Vẫn cần người duyệt và merge (tech lead / PM). Shipyard thay phần việc lặp lại, không thay quyết định. |
| Dùng iOS được không? | Hiện app mobile hỗ trợ Flutter trên Android. *(Chỉ hứa thêm nếu đã có kế hoạch thật.)* |

---

## 5. Checklist trước buổi gặp

- [ ] Đủ ảnh ở mục 2 (bảng mã ảnh), đã che thông tin nhạy cảm
- [ ] Slide 19: đã thay ví dụ bằng số liệu thật (hoặc bỏ khung số liệu)
- [ ] Slide 20: đã điền thông tin liên hệ
- [ ] Platform + dashboard chạy, đăng nhập được, dự án demo sẵn sàng
- [ ] Một lane rảnh cho demo, hạn mức còn đủ
- [ ] Đã chạy thử tính năng demo một lần
- [ ] Ngôn ngữ giao diện khớp với khách (VI / EN / JA)
- [ ] File PowerPoint lưu bản dự phòng (USB / cloud) + bản PDF
