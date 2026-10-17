# 葡语陪练 · 前端（AGENTS.md）

语音进-语音出的欧洲葡萄牙语（pt-PT）陪练 APP 的前端。后端是另一个 FastAPI 项目，**本仓库只改前端**；涉及接口字段时，只提醒我后端要跟着改，不要自己猜后端实现。

## 硬规矩
- 纯静态：原生 JS + CSS，**无构建工具、无框架、无 npm 依赖**，不要引入。
- 所有文件是 **CRLF** 换行，改完保持 CRLF；用精确替换，不要整文件重排格式。
- 注释、UI 文案用简体中文；"用户名"在界面上叫**智能体**，代码里变量仍叫 `username`。
- 没被要求的文件不要动，不要顺手重构、不要顺手"修复"下面「别顺手改」里列的东西。

## 文件
```
index.html  css/index.css  css/touch-protection.css  js/index.js      聊天页
words.html  css/words.css  js/words.js                               单词任务页（复用 index.css）；words.html 里 scene.js 先于 words.js 引入
css/scene.css  js/scene.js                                           场景演练的 DOM 层（台词气泡、热点按钮、人物点击区、选词面板）
js/stage3d.js  js/stage3d-layouts.js  js/vendor/three-bundle.js     3D 舞台（Three.js）与各模板的布局 LAYOUTS；现在只有点选模板 verb_persuade 在用
js/roam/{index,arena,physics,input,effects}.js  css/roam.css          走路版场景：自由走动的 3D 场地 + 形容词变形效果引擎；tpl.roam 时由 scene.js 动态加载（样式自动插入，不用改 HTML）
scene-lab.html  js/scene-lab.js                                      场景模板调试页（复用已发布模板，测验预览不提交判分）
models/<路径>.glb  models/MODELS*.md  models/*.bat|*.js|*.ps1       3D 模型与模型清单 / 下载与修复脚本；缺文件时用兜底几何体，不会报错
sounds/success.wav, fail.wav                                         答对/答错音效（缺文件静默不播）
sounds/roam/{jump,land,bounce,grab,wrong,deliver,respawn,bump}.wav   走路版音效（缺文件静默不播）
sounds/roam/fx_*.wav, machine.wav, sounds/gen_fx_sounds.py             变形工坊效果音（M6，共 15 个，程序合成；换成自己的同名 wav 即可；缺文件静默不播）
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

## 场景演练（预习与正式测验，scene.* / roam/*）
- **只支持 3D，没有 2D 回退，也不用录音判分**：场景全部是点选 / 走路抓取，不再有 `/api/scene/check`、`/api/tts`、`TEMPLATES` 内置模板、`?stage=2d`、SVG 人物。WebGL 不可用或模板加载失败时只显示错误卡 + 退出按钮。**不要加回 2D 或跟读 / 录音作答。**
- **数据驱动**：模板只从 `GET /api/scene/templates`（带 ETag，304）加载，前端没有内置副本；节点图（`dialogue` / `feedback` / `hotspot_choice` / `word_choice` / `actor_tap` / `roam_choice` / `roam_deliver` / `roam_match` / `complete`）的字段说明在 `scene.js` 文件头注释。固定台词经 `/api/scene/line-audio`（只传模板 id + 节点 id + variant，不传文本）；跟读句经 `/api/scene/sentence-audio`。
- **对外接口**：`window.Scene = { canPlay, play, emojiOf, whyNot, chooseTemplate }`；`Scene.play(w, ctx)` 返回 `{root, done, cancel}`，`ctx` 的字段见 `scene.js` 文件头注释（`mode`、`speak`、`speakLine`、`speakSceneSentence`、`pool`、`evaluateChoice`、`onExit`、`cancelAudio`…）。`scene.js` 不依赖 words.js 的全局，朗读和来源按钮都由 `ctx` 传入。`chooseTemplate` 只读导出，给自动化测试用。
- **预习**：预习页默认是单词列表，每个 `Scene.canPlay(w)` 的词有「🎬 预习场景」按钮（`startPreviewScene`）；场景里「📋 看单词列表」退回列表；走完回到列表。预习不评分、不写进度。**周日首页的“只看列表”仍直接进列表。**
- **正式测验**：仅第 1 轮、`kind` 为 `new` / `review`、`canUseAssessmentScene(w)`（`scene_confirmed === true`、`scene_ok === true`、`pos` 是名词 / 形容词 / 动词、`Scene.canPlay`）的词，在原题前多一次场景（`sceneSeen` 保证每词一次；`weekly`、`extra` 不加；错词重测不再来）。场景走完或点“跳过场景”都回到**当前词的原测试**，不调用 `next()`。不带场景字段的旧词一律跳过正式测验场景。
- **场景判分**：`evaluateSceneChoice` 提交 `POST /api/words/scene/evaluate`（只认 `selected_word_id`）：`attempts++`、答错 `markMissed(w)`（影响原题答对后的 `hard` 结果）、答对按 `earned` / `round_score` 更新积分栏；**提交失败（抛错）不计错、可重试**；场景不单独结算进度，答对也不代替原题。只有 `word_choice` 和走路版的“抓取答案 / 性数配对整局”会提交；点人物、点错地点不发请求。
- **选模板**（`chooseTemplate`）：词里 `scene_template` 有值就照办（模板不存在 / 词性不符 / 变形工坊没有这个词的效果 / 性数配对四词形有重复，都抛错页，**不静默降级**）；没设就按词性在 `manualOnly` 以外的已发布模板里选。形容词走 `chooseAdjectiveTemplate`：`scene_noun` 是人物名词 → 人物系，否则物体系；效果表里有这个词 → 变形工坊，没有 → 贴词牌 `describe_*`；没配 `scene_noun` 且只有人物系有效果的词（feliz、rápido…）→ 人物系变形工坊。
- **走路版（roam）**：一次抓取 = 一次 `evaluateChoice`；自动抓取默认开（`localStorage.roam_autograb='0'` 关）；`localStorage.roam_dpr` 记住自适应画质（一次变慢会被记住，可清掉）。URL 带 `?debug` 时暴露 `window.__roam`，`scene-lab` 出现「效果调试面板」。
- **形容词三种玩法**：`describe_*` 贴词牌；`adj_workshop_*` 变形工坊（`scene.js` 的 `buildOptions` 在原选项上加“反义词 1 + 不同维度 2、排除 conflicts”，每个选项带 `fx`；抓对 / 抓错的词牌都飞到展台并按词义变化；效果引擎在 `roam/effects.js`，变体摆件要克隆材质，粒子同屏 ≤ 30）；`adj_agree_*` 性数配对（`roam_match`，4 张词形牌送到 4 个展台，整局只判一次：错误 ≤ `pass_max_errors` 传 `w.id`，否则传 `-1`；每送对一张读一句整句，带 `variant`）。形容词词牌读音：`speak(w, 'word', btn, form)` 的 `form` 是 `adjective_*` 字段名，读牌上显示的那个词形。`GENERIC_ADJ` 是干扰项兜底词表（[阳单, 阴单, 阳复, 阴复]；M6 起含效果表里的全部词，新增效果词时这里要补，否则它的反义词在预习收尾没有词形可显示）。变形工坊的 `effects.js` 有 9 种 `kind`（M6 加了 `tag` 价签）、`emote` 的 `jitter` 动作、`tint` 的 `shine`；`createEffects` 可传 `hooks`（`sfx` / `sfxDelay` / `onStart` / `onEnd`），`roam/index.js` 用它播效果音并驱动场地里的变形机（`arena.machineRun`；`ARENAS.adj_plaza` / `adj_stage` 的 `machine` 字段，只在模板带 `effects` 时才建）。
- **词字段**：由 `/api/words/today` 的 `words` / `preview` 返回：`emoji`、`pos`、`gender` / `number`（名词）、`scene_ok`、`scene_confirmed`、`scene_template`、`scene_noun`（形容词的形容对象）、`scene_zone`（shop 的货架区），形容词另有 `adjective_m_singular` / `adjective_f_singular` / `adjective_m_plural` / `adjective_f_plural`。不规则变化必须逐项人工审核；不变化的形式可以重复（但不能玩性数配对）；抽象形容词不应启用场景。
- **台词与泄露保护**：任何要显示 / 朗读的固定葡语，若整词命中目标词（含形容词四个词形）→ 换成 ______ 并不朗读；热点标签撞词只留图标。只有场景字段已确认且 `gender` 为 `m` / `f` 时才加不定冠词。
- **改场景的同步点**：模板 JSON（服务端）↔ `roam/arena.js` 的 `ARENAS`（模板的 `arena` 字段 = 它的键）↔ `effects.js` 的 `EFFECT_KINDS` / `sfxOf`（服务端 `EFFECT_PARAMS` 一一对应；新增 `kind` 还要补一个效果音名）。部署顺序：先前端，再后端校验器 / 接口，最后模板 JSON 并重启后端；反了旧前端会在 `roam_choice` / `roam_match` 卡住。要新增 3D 模型时给**清单**（相对 `models/` 的文件名、新增还是复用、外观 / 高度 / 朝向要求、单个 `.glb`、贴图内嵌、不需要骨骼动画、低多边形风格）。
- 动画只用 CSS `transform/opacity` 并支持 `prefers-reduced-motion`（DOM 层）；词和中文一律 `textContent`。

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
| `GET /api/words/today?session_id=` | `{words,preview,meta,completed}`；词带 `kind`，mode 3 带 `cloze`，可能带 `ex`；可选场景字段 `emoji,pos,gender,number,scene_ok,scene_confirmed,scene_template,scene_noun,scene_zone` 与形容词四词形 `adjective_*`，其约定见上文 |
| `POST /api/words/run` | JSON `{session_id,restart?}` → `{run_id,batch_number,round_score}` |
| `POST /api/words/evaluate` | FormData：audio, word_id, mode(1-4), session_id?, run_id? → `{passed,recognized_text,comment}`；mode 4 另带 `corrected`；422 没听清 |
| `GET /api/scene/templates` | 已发布场景模板；带 `ETag`，前端 `If-None-Match` / 304；失败就显示错误卡，没有内置副本 |
| `POST /api/words/scene/evaluate` | FormData：`selected_word_id`、`word_id`、`session_id`、`run_id` → `{word_id,passed,recognized_text,comment,earned,round_score?}`；**不再接受 `audio`**；仅正式场景测验使用，答对时申请本 run 单词积分，不单独写日结进度 |
| `GET /api/scene/line-audio?scene_id=&node_id=&variant=&tts_provider=&tts_voice=` | 固定台词朗读，只传模板 id + 节点 id；`variant` 仅台词里带 `{art}` / `{noun}` 的节点才传（名词语境序号），其余传了会 422 |
| `GET /api/scene/sentence-audio?word_id=&scene_template=&tts_provider=&tts_voice=&variant=` | 为已确认场景词按受支持模板合成跟读句；词和模板由服务端校验；`variant`（可选）= 形容词名词语境序号，性数配对每送对一张牌读一句，越界 422，不传 = 本词自己的语境；请求的模板必须等于词里设置的 `scene_template` |
| `POST /api/words/complete` · `record_error` · `mark_mastered` | 均为 **JSON** |
| `GET /api/words/{id}/audio?kind=word\|sentence&ex=&form=` | 朗读，`ex` 仅 sentence 有效，前端只在 `w.ex` 为真时才带；`form`（可选，仅 word）= `adjective_*` 字段名，读牌上显示的词形 |
| `GET /api/admin/points` | 单词页积分栏专用 |
| `GET /api/admin/words/{id}` | 只有 `scene-lab` 按 `?word=` 取词时用 |

错误格式：`detail`（字符串或 `[{msg}]`）或 `message`，前端 `errMsg()` 读取；`req()` 用 `j.data || j` 兼容两种返回包装。**改响应字段时同步检查 `audioUrl()` / `fillMe()` / `addAI()`。**

## 别顺手改（有意的取舍）
- 单词库没有浏览/删除/去重界面。
- 单词页进度只在前端内存，刷新或中途退出会丢，计划不变、可重新领取。
- 前端没有 PIN 界面；没有鉴权 token，身份靠 username 明文。
- 填空只做精确匹配，模糊匹配是未做的后续项。
- 聊天页录音每次重新申请麦克风，不要顺手改成复用（只有单词页复用）。
- 场景演练没有 2D 回退、没有录音跟读，别加回来（见「场景演练」）。
- 形容词的 6 个模板的 `noun_contexts` 与 `context_pick` 是服务端和前端 / arena 序号对应的依据，别在前端假设它们可以改。
- 不要引入构建链/框架/第三方库（`js/vendor/three-bundle.js` 是唯一的第三方文件，只导出约 30 个名字，要用别的类先查 bundle 导出）。

## 交付
- 默认只改涉及的文件，正文用几句话说明改了什么、为什么、后端哪一侧要跟着改。
- 改完告诉我怎么验证（哪个页面、哪个操作；场景相关可用 `scene-lab.html?template=<id>&word=<id>`，加 `&debug` 有效果调试面板）；手机和平板的布局差异要特别说明。