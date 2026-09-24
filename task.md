# Task: 实现“用户名恢复会话”及“个性化背景/主题”功能（基于方案 A）

请严格按照以下设计规格，为本项目实现“用户名恢复会话”与“自定义背景/主题”功能。
原则：采用方案 A（`username` 即 `session_id`），复用现有项目的风格（如 `session_manager.py` 的建表/迁移模式、`/api/audio/{name}` 的防穿越与文件落盘方式）。

---

## 1. 核心变更概览
- **身份逻辑**：`localStorage.username` 存在时直接替代随机 `sid` 作为 `session_id`，天然复用 `messages` 表，无需修改 `messages` 表结构。
- **配置扩展 (`config.py`)**：新增 `BACKGROUND_DIR = DATA_DIR / "backgrounds"`（自动创建），以及限制 `MAX_BG_SIZE = 5 * 1024 * 1024`，允许后缀 `{"jpg", "jpeg", "png", "webp"}`。

---

## 2. 后端实现 specs

### 2.1 新建 `memory/user_manager.py`
仿照 `session_manager.py` 的 SQLite 自动迁移写法：
- **表结构 `users`**：
    - `username` (TEXT PRIMARY KEY) - 正则校验 `^[A-Za-z0-9_\u4e00-\u9fa5]{2,20}$`
    - `pin_hash` (TEXT, OPTIONAL) - 预留轻量密码/PIN，可为空
    - `background_file` (TEXT, OPTIONAL) - 存储服务端生成的 UUID 文件名（非原始名）
    - `theme` (TEXT, OPTIONAL) - 存储 JSON 字符串（如色值配置）
    - `created_at`, `updated_at` (TIMESTAMP)
- **核心方法**：
    - `init_db()`
    - `get_or_create_user(username, pin=None)`
    - `update_background(username, filename)`
    - `update_theme(username, theme_data)`

### 2.2 API 路由新增 (`api/routes.py` 或 `api/user_routes.py`)
1. **`POST /api/user/bind`**
    - Body: `{ "username": "xxx", "pin": "optional" }`
    - 校验：用户名字符集与长度。
    - 逻辑：获取或创建 user，返回 user profile（含 `background_url` 和 `theme`）。
2. **`GET /api/user/{username}`**
    - 返回指定用户的 profile（背景 URL、主题配置）。
3. **`POST /api/user/{username}/background`**
    - 接受 `multipart/form-data` (file)
    - 安全校验：文件大小 ≤ 5MB；后缀白名单；校验魔数/文件头（确认是真实图片）；拒绝路径穿越。
    - 存储：生成 `bg_{uuid}.{ext}` 保存至 `BACKGROUND_DIR`，更新 DB，返回 `{ "background_url": "/api/background/bg_{uuid}.{ext}" }`。
4. **`POST /api/user/{username}/theme`**
    - Body: `{ "theme": { "--blue": "#xxx", ... } }`
    - 保存主题 JSON 并返回成功。
5. **`GET /api/background/{name}`**
    - 参考现有 `/api/audio/{name}` 路由，必须用严格正则校验 `name`（仅允许数字字母下划线点，严防 `..` 路径穿越），通过 `FileResponse` 返回图片。

---

## 3. 前端实现 specs (`index.html` + `index.js`)

### 3.1 UI / HTML
- Header 增加两个图标按钮：
    - `👤`：打开“绑定/恢复用户名”弹层（内含输入框，以及显式隐私提示：“用户名即身份标识，重名可查看历史”）。
    - `🎨`：打开“背景与主题”设置面板（含图片文件上传控件、几个预设色块、`<input type="color">` 自定义颜色拾取器）。

### 3.2 逻辑 / JS
1. **`sid` 替代**：
    - 页面加载时判断：若 `localStorage.getItem('username')` 存在，则 `sid = username`，否则维持默认随机 `sid`（游客模式）。
2. **首次/刷新加载**：
    - 若存在 `username`，先 `GET /api/user/{username}` 拿到背景 URL 和主题 JSON，注入到 DOM：
        - 主题：遍历设置 `document.documentElement.style.setProperty(key, val)`
        - 背景：将 `background-image` 应用至背景容器（带半透明遮罩层保证文本可读性）。
    - 随后正常触发现有 `fetchHistory(sid)` 恢复历史记录。
3. **绑定用户名流程**：
    - 用户提交用户名 -> 调用 `POST /api/user/bind` -> 成功后存入 `localStorage.username` -> 更新当前 `sid` -> 重新加载历史记录并应用用户背景/主题。
4. **背景/主题更新**：
    - 背景：选择图片后直接上传，成功后本地立即更新背景预览。
    - 主题：颜色改变时前端**乐观更新** CSS 变量，同时异步 `POST /api/user/{username}/theme`。

---

## 4. 安全与质量要求（Checklist）
- [ ] **用户名防注入**：必须经过 `^[A-Za-z0-9_\u4e00-\u9fa5]{2,20}$` 校验，不得作为路径拼接直接暴露。
- [ ] **文件安全**：背景图文件名落盘一律使用 UUID 重命名；`/api/background/{name}` 必须防范目录穿越（Path Traversal）。
- [ ] **文件头校验**：不单信 `Content-Type`，需读取前几个 byte 确认文件格式（JPG/PNG/WebP）。
- [ ] **向后兼容**：不传用户名的“游客”不影响原有的随机 `sid` 聊天功能。

请按照上述规格，分步编写/修改代码，并确保代码风格与项目现有风格一致。