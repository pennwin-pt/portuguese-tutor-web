# 葡语陪练 · 前端（AGENTS.md）

语音进-语音出的欧洲葡萄牙语（pt-PT）陪练 APP 的前端。后端是另一个 FastAPI 项目，**本仓库只改前端**；涉及接口字段时，只提醒我后端要跟着改，不要自己猜后端实现。

## 硬规矩
- 纯静态：原生 JS + CSS，**无构建工具、无框架、无 npm 依赖**，不要引入。
- 所有文件是 **CRLF** 换行，改完保持 CRLF；用精确替换，不要整文件重排格式。
- 注释、UI 文案用简体中文；"用户名"在界面上叫**智能体**，代码里变量仍叫 `username`。
- 没被要求的文件不要动，不要顺手重构、不要顺手"修复"下面「别顺手改」里列的东西。

## 文件
```
index.html  css/index.css  css/touch-protection.css  js/index.js     聊天页
words.html  css/words.css  js/words.js                              单词任务页（复用 index.css）
css/scene.css  js/scene.js                                           预习用的场景演练（words.html 里先于 words.js 引入）
sounds/success.wav, fail.wav                                         答对/答错音效（缺文件静默不播）
```
- `words.css` 只补单词页独有样式；单词页标题栏放大等覆盖写在 `words.css` 里（`#app > header`），**不要为单词页改 `index.css`**（聊天页共用）。

## 聊天页（index.*）
- 顶部栏：左 `#st` 连接圆点（文字仅供读屏和 title）｜中 标题（智能体名 + 当前音色）｜右 `#mode`（🇵🇹 葡语 / 🇨🇳 中文求助）+ `#more`（⋯）。
- `#more` 打开右上角下拉 `#menu`：`#words`（单词任务）、`#user`（绑定智能体，小字 `#userCur` 显示当前身份）、`#theme`（背景与主题）。这三个 id 的点击绑定在 `index.js` 里，**改菜单样式时 id 不要变**。菜单开关逻辑 `setMenu()`：点外部、点菜单项、Esc 都会收起。
- 长按教练语音条 → `#sheet` 菜单：原文 / 翻译中文 / 语法解析 / 拆解单词 / 重新生成语音 / 删除这一轮。
- 长按标题 `h1` = 清空对话。
- 面板（绑定智能体 `#umask`、背景与主题 `#tmask`、拆解单词 `#wmask`）都是 `.mask` 底部弹层，由统一的点击遮罩/`data-close` 关闭。
- 绑定智能体面板含：绑定/恢复、音源三选一（piper 本地 / google / edge）、音色（只有 edge 有多音色）、角色人设（模板按钮 + ≤300 字，游客禁用）。
- 历史分页：`GET /api/history?session_id=&limit=30&before_id=` 返回 `{messages,has_more}`，用 `row_id` 做游标，上滑到顶加载更早的（`HIST_PAGE=30`）。
- toast 一次只显示一条，内部用 `textContent`，**不要改成 `innerHTML`**。`/chat/*` 响应的 `used_words` 非空时弹「✅ 用到了：xxx」，与 `tts_fallback` 提示合并成一条。

## 身份与本地存储（index.js 与 words.js 必须一致）
- `username` 就是 `session_id`；没绑定时用本机随机 `guestSid`（`localStorage.sid`）。
- localStorage 键：`sid`、`username`、`theme`、`tts_<sid>`（每个智能体各自的音源+音色）。**改键名要两个 JS 同时改，并提醒后端是否受影响。**
- 名称校验正则 `NAME_RE = /^[A-Za-z0-9_\u4e00-\u9fa5]{2,20}$/`，index.js 和 words.js **各有一份**，且必须与后端一致；改正则 = 三处同改（两个 JS + 后端），要提醒我。
- `VOICE_OPTIONS`（音色白名单）、`PERSONA_MAX=300` 与后端各有一份，改一边要提醒我改另一边。
- 主题是 CSS 变量，key `--[\w-]{1,30}`、value `#hex`；`DEFAULT_BLUE=#3d9be9`。绑定后主题/背景/音色/人设会同步到服务器。

## 单词任务页（words.*）
- 纯前端状态机：`loading → idle → test ⇄ judging → result → …`，另有 `preview`（只看不评分）、`done`（今日已完成，可重新学习）。
- 题型 `mode`：1 看葡语说中文｜2 看中文说葡语｜3 句子填空（`viewCloze`，不自动朗读、无喇叭，否则泄露答案）｜4 造句。`fetchToday` 的 mode 白名单是 `[1,2,3]`。重测方向翻转：`1→2, 2→1, 3→1, 4→2`。
- 逐词练：答错/公布答案后停在同一个词同一方向，按钮变"🔁 再试一次"，答对才"下一个"。**只有一次就答对的词才进 `passed`**，出过错的进 `failedList`（每词每轮一次）；本轮测完后 `failedList` 用 `{...w, mode}` 拷贝翻转成下一轮，不要改 `today.words`；`failedList` 为空才 `finish()`。
- `outcomes` 只记第 1 轮（`round===1`）：good 一次答对｜hard 答错后重试才对｜again 点了公布答案或被 AI 判错 ≥2 次｜skipped 点了跳过。`finish()` 时 `POST /words/complete`，服务器的 `total` 以计划为准，不信前端。
- 公布答案 `#reveal`：纯前端，按答错处理（进 `failedList`）并调 `record_error`，不计入 `attempts`、不播失败音效、自动朗读，结果记 `again`。
- 跳过 `#skip`：同一个词本轮被 AI 判错 ≥ `SKIP_AFTER=2` 次才出现；跳过 = 记 `skipped` + 从 `failedList` 移除，不计入 `firstPass`。
- 没听清/ASR 空结果（422）和公布答案都**不算 AI 判错**，不计入 `aiWrong`。
- 周日只预习（`previewOnly()`）；周日以测代看 `sunMode` 不碰进度、不放"我已掌握"、不带 `run_id`、不加分。
- `KIND_LABEL`：🆕新词 / 🔁复习 / 📅本周回顾 / 💪周六加练。进度只在内存，中途退出弹确认且不保留。
- 顶部 `#points` 读 `GET /api/admin/points`（累计 / 今日 / 余额 / 本轮得分）。
- words.js 里有一小段从 index.js 精简拷贝的 `NAME_RE` / guestSid / 主题 / `ttsCfg()`，改这些要两个 JS 一起改。

## 场景演练（预习，scene.*）
- 预习有两种展示：`scene`（场景，默认）和 `preview`（列表）。入口统一走 `enterPreview()`：学完当天任务后的"预习明天的词"先进场景；列表页顶部有「🎬 用场景练习这些词」；场景页底部「📋 看列表」随时切回列表。**周日首页的"只看列表"仍直接进列表。**
- 结束统一走 `previewDone()`（场景走完 / 列表点"看完了"），去向和原来一致。场景只算预习：**不评分、不写进度、不调 `/words/*` 的任何写接口**。
- `scene.js` 独立：对外只有 `Scene.canPlay(w)`、`Scene.play(w, ctx)`（返回 `{root, done, cancel}`）、`Scene.emojiOf(w)`；不依赖 words.js 的全局，朗读、来源按钮都由 `ctx` 传入。
- 场景模板由 `scene.js` 的 `TEMPLATES` 数据驱动：商店购物、餐厅点单、帮朋友找东西；只对确认且 `scene_ok` 的名词启用。管理端可通过 `scene_template` 指定 `shop` / `restaurant` / `find`，未指定时自动轮换；旧接口缺少场景字段时保留商店模板。台词经 `{pt}`、`{zh}`、`{art}`、`{emoji}` 占位符填充；固定台词通过 `ctx.speakText(text, btn)` 请求 `/api/tts`，只在用户点击时触发，合成失败静默保留文字。
- 场景词字段由后端随 `/api/words/today` 的 `words` / `preview` 返回：`emoji`（单个 emoji）、`pos`（`noun` / `verb` / `adjective` / `other`；目前只支持名词场景）、`gender`（`m` / `f`）、`number`（`singular` / `plural`，可选）、`scene_ok`（布尔值）、`scene_confirmed`（布尔值）、`scene_template`（`shop` / `restaurant` / `find` 或 null）。只在 `scene_confirmed === true` 时使用这些字段；这时仅 `pos === "noun"` 且 `scene_ok === true` 的词进入场景，其他词留在列表。旧接口完全不带这些字段时保持旧行为。
- 台词：只有场景字段已确认且 `gender` 为 `m` / `f` 时才加不定冠词；`number` 为 `singular` / `plural`，缺省按单数，分别使用 `um/uma/uns/umas`。字段未确认或缺少性别时保留旧台词。
- 动画只用 CSS `transform/opacity`，并支持 `prefers-reduced-motion`；SVG 人物里只拼颜色常量，词和中文一律 `textContent`。

## 录音与音频（iOS/安卓踩过的坑）
- 录音手势：按住录、松开发、上滑取消；iOS 优先 `audio/mp4`。
- **按住说话的手势里不要 `unlock()`**（只 `player.pause()`）：往 `#player` 塞静音 wav 并 play，会和 `getUserMedia` / `rec.start()` 同时切换 iOS 音频会话，录音会没录上。其它手势里用 `unlock()` / `primeSfx()` 解锁自动播放。
- **不要给 `#hold` 设 `touch-action: manipulation`**（`touch-protection.css` 里尤其不能）：会覆盖 `index.css` 的 `none`，iOS 上手指稍动就 `pointercancel`，录音被悄悄丢掉。
- 单词页 `getMic()` 在整个测试期间复用同一个 MediaStream（`begin()` 预热；`finish()` / 切后台 / `pagehide` 时 `releaseMic()`；`onstop` 里**不要 stop 轨道**）。按下时流被系统静音要 `waitMicLive` 等 1.5s，不行就丢弃重新申请。聊天页仍是每次申请，没改。
- 答错先播失败音效，播完（≤1.5s）再朗读单词。

## 前端用到的接口（字段别随意改）
| 接口 | 要点 |
|---|---|
| `GET /api/health` | 连接圆点每 15 秒探测 |
| `POST /api/chat/audio` | FormData：audio, session_id, mode(pt/zh), tts_provider, tts_voice?；响应带 `audio_url`、`used_words:[{word_id,pt_word,boosted}]`（总存在）、`tts_provider_used`/`tts_fallback` |
| `POST /api/chat/text` | FormData：session_id, text, mode, tts_provider, tts_voice?；响应同上 |
| `GET /api/history` | 见上，含缓存的 translation / explanation |
| `POST /api/translate` `/api/explain` | FormData：text, message_id?, session_id |
| `POST /api/breakdown` | FormData：text, message_id?, session_id → `{words:[{word,meaning,sentence,sentence_zh}]}` |
| `POST /api/vocab` | **JSON**（不是 FormData）：`{session_id, items:[{language,word,example_sentence,chinese_meaning,example_chinese}]}` |
| `POST /api/regenerate_audio` | FormData：message_id, tts_provider, tts_voice? |
| `DELETE /api/message/{row_id}?session_id=` | 删一轮（配对的两条） |
| `DELETE /api/session/{session_id}` | 清空历史 |
| `POST /api/user/bind` | JSON `{username}`（前端没有 PIN 界面） → profile |
| `GET /api/user/{u}` · `POST …/theme` · `…/background`(FormData file ≤5MB) · `…/tts` · `…/persona` | 主题/背景/音色/人设同步 |
| `GET /api/words/today?session_id=` | `{words,preview,meta,completed}`；词带 `kind`，mode 3 带 `cloze`，可能带 `ex`；可选场景字段 `emoji,pos,gender,number,scene_ok,scene_confirmed,scene_template`，其约定见上文 |
| `POST /api/words/run` | JSON `{session_id,restart?}` → `{run_id,batch_number,round_score}` |
| `POST /api/words/evaluate` | FormData：audio, word_id, mode(1-4), session_id?, run_id? → `{passed,recognized_text,comment}`；mode 4 另带 `corrected`；422 没听清 |
| `POST /api/words/complete` · `record_error` · `mark_mastered` | 均为 **JSON** |
| `GET /api/words/{id}/audio?kind=word\|sentence&ex=` | 朗读，`ex` 仅 sentence 有效，前端只在 `w.ex` 为真时才带 |
| `GET /api/tts?text=&tts_provider=&tts_voice=` | 仅支持场景模板中的固定台词；长度、句子白名单、音源/音色白名单和频率限制由后端校验；按文本 + 音源 + 音色缓存 |
| `GET /api/admin/points` | 单词页积分栏专用 |

错误格式：`detail`（字符串或 `[{msg}]`）或 `message`，前端 `errMsg()` 读取；`req()` 用 `j.data || j` 兼容两种返回包装。**改响应字段时同步检查 `audioUrl()` / `fillMe()` / `addAI()`。**

## 别顺手改（有意的取舍）
- 单词库没有浏览/删除/去重界面。
- 单词页进度只在前端内存，刷新或中途退出会丢，计划不变、可重新领取。
- 前端没有 PIN 界面；没有鉴权 token，身份靠 username 明文。
- 填空只做精确匹配，模糊匹配是未做的后续项。
- 聊天页录音每次重新申请麦克风，不要顺手改成复用（只有单词页复用）。
- 不要引入构建链/框架/第三方库。

## 交付
- 默认只改涉及的文件，正文用几句话说明改了什么、为什么、后端哪一侧要跟着改。
- 改完告诉我怎么验证（哪个页面、哪个操作）；手机和平板的布局差异要特别说明。
