---
name: pt-tutor-app
description: 帮 Peng Wang 开发/修改「葡语陪练」全栈项目(前端:index.html/index.css/touch-protection.css/index.js + 单词任务页 words.html/words.css/words.js,原生JS无构建;后端:FastAPI+SQLite+Faster-Whisper+Piper/Google/Edge TTS+Gemini/Groq/Ollama;配套的 WordMemorizer C# WinForms 管理端经 /api/admin/* 读写同一个 sessions.db)时必须使用此skill。只要用户提到"葡语陪练"、"WordMemorizer"、管理端、周计划/生词本/积分/Admin API/数据库合并、本周准备/备课/配图/图库同步/word-pic-audio、粘贴这个项目任意一端的代码(含 C# 的 AdminApiClient/FormMain/FormNewWords/FormWeekPrepProgress/FormSceneMetadata 等),或要求修改语音对话/ASR/TTS音色/LLM切换/智能体绑定/角色人设/主题背景/历史记录/单词拆解/单词库/单词任务/预习/复习调度/周六加练/掌握规则/单词配图/场景演练(scene.js、roam 走路版、stage3d.js 3D 舞台、scenes/*.json 场景模板、奖励关、变形工坊、3D 布局与模型清单)等任何功能,先读本skill再动手,不要让用户重新粘贴源文件或重新解释项目背景与接口约定。前后端经常一起改,改动涉及接口字段时两端都要检查。
---

# 葡语陪练(Portuguese Tutor)项目手册

> 本文件按**最新代码**重写(服务端 / 前端 / C# 管理端 / sessions.db 全部核对过)。代码与本文冲突时**以代码为准**,并提醒用户更新本文。
> 项目内几份旧文档**已过时**,不要当依据,见文末「文档与代码不一致清单」。

## 0. 工作方式(先看这里)
- 用户一般是直接贴改动需求或报 bug。默认**只改涉及的文件**,以**完整文件**交付(`/mnt/user-data/outputs/<原相对路径>`,再 `present_files`),正文几句话说清:改了什么、为什么、哪一侧要跟着改、怎么验证。
- 用户明确说过:**不用替他做大量测试**,写好代码交给他测;但改完要自己做必要的静态核对(语法、CRLF、与对端字段一致)。能在容器里复现的问题(如用 sessions.db 副本跑调度函数)值得复现一次再下结论。
- **换行符**:前端文件、服务端 `.py` 多数是 **CRLF**。改完必须保持 CRLF,用精确替换(Python 按 bytes/`\r\n` 替换),不要整文件重排。写新文件前先 `file` 或统计 `\r\n` 确认原文件风格。本 SKILL.md 本身是 LF。
- 注释、UI 文案、报错信息用**简体中文**;界面上的"用户名"叫**智能体**,代码里仍叫 `username` / `session_id`。
- 没被要求的文件不要动,不要顺手重构、不要顺手"修复"文末「有意的取舍」里列的东西。
- **看用户上传的 `sessions.db`**:它开了 WAL,单独拷来的 `.db` 可能缺最近写入(以备份 `tools/backup_db.py` 为准);只读打开 / 先拷贝再查。查"为什么某天没有某计划"这类问题:先查 `word_daily_plan` / `word_task_done` / `word_outcomes` / `word_progress`,再对照代码里的时间戳(zip 里文件修改时间能说明"服务当时跑的是不是新代码")。
- ⚠️ **`config.py` 里有真实的 API Key / 令牌**(Gemini、Groq、Cloudflare、word-pic-audio)。**永远不要在回复里复述密钥原文**;用户上传/分享代码前提醒他清空;如果看到密钥被贴进对话,建议他轮换。

## 1. 项目结构(三个工程,共用 `sessions.db`)
```
portuguese-tutor-server/   FastAPI 后端(Windows 本机跑,nginx 反代,start_server.bat 一键启动)
  main.py run.py config.py start_server.bat gen_week_examples.bat pack.bat
  api/      routes.py(聊天/历史/翻译/拆词/vocab/场景接口)  user_routes.py(绑定/背景/主题/音色/人设)
            word_routes.py(单词任务 /api/words/*)  admin_routes.py(WordMemorizer 管理接口 /api/admin/* + 本周准备流水线)
  core/     asr_engine(Faster-Whisper)  llm_engine(Gemini/Groq/Ollama+降级)  tts_engine(Piper/Google/Edge)
            image_engine(Cloudflare FLUX / Pollinations)  image_caption(Pillow 给配图贴字)
  memory/   session_manager user_manager vocab_manager newword_manager chat_words pt_text
            word_source(词源,只读)  word_planner(调度纯函数)  word_progress_manager(进度/计划/结算)
            word_task_manager(完成记录)  word_error_manager  word_example_manager(多例句)  shadow_judge(跟读判分,纯函数)
            word_image_manager(配图表+磁盘)  word_image_gen(配图流水线)
            word_pic_audio_uploader(同步到公网图库 word-pic-audio)  lychee_uploader(旧,已无生产调用,仅测试在用)
            wm_manager(WordMemorizer 6 张表的全部 SQL)  wm_calendar(周/周序号,等价 .NET)  scene_registry(场景模板注册+校验)
  prompts/  tutor_prompt helper_prompts word_prompts image_prompts
  scenes/   *.json 场景模板(32 个,见 §14)
  tools/    gen_examples gen_images caption_images backup_db reset_week diag_week find_word_id adjective_enable_report
            merge_wordmemorizer sync_word_pic_audio regenerate_gallery_audio gen_customized_picture validate_scenes
            test_*.py(各阶段/模块测试,不调真实 LLM/TTS/ASR;跟读相关:test_shadow_judge / test_shadow_plan)  scene_registry.py(⚠ 与 memory/ 里那份有 4 行差异的旧拷贝,以 memory/ 为准)
  docs/word-scheduling-algorithm.md(调度算法文档,部分过时)  deploy.md  README.md(过时)  每周日操作清单.md(部分过时)
portuguese-tutor-web/      纯静态前端(无构建、无框架)
  index.html css/index.css css/touch-protection.css js/index.js                    聊天页
  words.html css/words.css js/words.js                                              单词任务页(复用 index.css)
  css/scene.css js/scene.js  js/stage3d.js js/stage3d-layouts.js js/vendor/three-bundle.js   场景 DOM 层 + 3D 舞台(现仅点选模板 verb_persuade 用)
  js/roam/{index,arena,physics,input,effects}.js css/roam.css                       走路版场景(31/32 个模板用)+ 效果引擎
  scene-lab.html js/scene-lab.js   场景模板调试页(?template=<id>&word=<id>&debug)
  models/<路径>.glb + MODELS*.md   3D 模型与清单(缺文件用兜底几何体);sounds/ 音效(缺文件静默不播;上传的 zip 里没带 sounds)
  AGENTS.md(前端自己的约定,与本文互补)  README.md  penn.txt(用户给 Claude 的开场提示)  词库启用清单.csv(adjective_enable_report 的输出)
WordMemorizer.Core/        C# WinForms 管理端(.NET,Newtonsoft.Json)
  AdminApiClient.cs(HTTP 客户端,snake_case,Client 15s / LongRunningClient 120s)  DB/Repositories/*、DB/WordImporter.cs(都只是 AdminApiClient 的薄封装)
  FormMain(周计划/考试入口/场景字段入口) FormNewWords(生词本+"录入本周") FormWeekPrepProgress(录入与后台准备进度,轮询+重试)
  FormSceneMetadata(场景字段确认,含待确认/已确认、生成候选、试玩链接) FormExam FormAddWeek FormPicture FormPronunciation FormSpeakingTutor 等
  Constants.cs(AUDIO_RECOGNIZING_SERVER_URL=http://127.0.0.1:8000/api;ADMIN_API_URL_KEY;WORDS_COUNT_PER_DAY=6)
```
- **所有可调参数(含密钥)直接写在 `config.py`,项目不再使用 `.env`**。仍读环境变量的只有:`PT_SQLITE_PATH`、`PT_SQLITE_WAL`、`PT_WORD_DB_PATH`、`PT_WORD_SOURCE_IMAGE_DIR`、`PT_CAPTION_FONT`、`WEEK_PREP_AUTO`(=0 关闭录入后的自动备课,测试用)。老文档里的 `WORD_PT_USE_LLM=0` / `CHAT_WORD_LINK=0` 现在都是**改 `config.py` 里的布尔值**。
- 改 `config.py` 后:`start_server.bat` 用 `uvicorn --reload` 自动重启;`run.py` 启动需手动重启。

## 2. 身份与会话模型
- **方案 A:`username` 即 `session_id`**。前端没绑定时用本机随机 `guestSid`(`localStorage.sid`)作游客。游客没有 profile/人设。
- 名称正则 `^[A-Za-z0-9_\u4e00-\u9fa5]{2,20}$`,**三处各一份必须一致**:`index.js`、`words.js`、`user_manager.validate_username`。改正则 = 三处同改并提醒用户。
- PIN:后端支持(`has_pin`),**前端没有 PIN 界面**;没有鉴权 token,身份靠 username 明文(局域网/家用,有意的取舍)。
- localStorage 键:`sid`、`username`、`theme`、`tts_<sid>`(每个智能体各自的音源+音色)。旧版的 `ttsProvider` / `ttsVoice_edge` / `ttsVoice_streamelements` 在 `index.js` 里一次性迁移并清掉。改键名 = 两个 JS 同改。
- 积分账号白名单 `config.WORD_QUIZ_POINT_USERS`(集合),**新增智能体要加积分就编辑它**,且该智能体要已在 `users` 表。

## 3. 聊天流水线
`语音/文字 →(zh 模式先 LLM 译成葡语)→ 历史+人设+聊天联动目标词 → LLM → TTS → 落库 → JSON`。
- 入口:`POST /api/chat/audio`(FormData: audio,session_id,mode pt|zh,tts_provider,tts_voice?)、`POST /api/chat/text`(无 audio)。核心 `routes._run_turn`。
- zh 模式:用户语音也合成一条"用户语音条"(与教练 LLM **并行**,失败只记日志不影响主线);用户消息也分配自己的 `msg_uid`(翻译/解析/拆词缓存、重新生成语音靠它)。
- 一轮对话原子写入(`session_manager.add_turn`),返回两条的行 id(`user_row_id`/`ai_row_id`),前端删除某一轮靠它。
- 响应字段:`session_id,message_id,user_text,user_pt,ai_text,audio_url,audio_format,user_row_id,ai_row_id,user_message_id,user_audio_url,user_audio_format,tts_provider_used,tts_fallback,used_words`。`used_words` 总存在,没有就是 `[]`。
- **TTS 音源只有三种:`piper`(本地)| `google` | `edge`**。**StreamElements 已下线**(前端迁移代码会把残留键清掉;不在白名单的 provider 一律回退 piper)。`synthesize_any` 内部在线音源失败会自动回退 Piper,`tts_fallback=true` 时前端提示。Edge 音色白名单 `tts_engine.EDGE_VOICES`(Raquel 女声默认 / Duarte 男声),前端 `VOICE_OPTIONS` 与后端各一份,改一边提醒另一边;只有 edge 有多音色。`CACHED_PROVIDERS={google,edge}`:这两个的文件在各自缓存目录里,路由层**必须 `copy` 不能 `move`**。
- 音频文件:`data/replies/msg_<12hex>.(wav|mp3)`,`GET /api/audio/{name}` 白名单正则 `^msg_[0-9a-f]{12}\.(wav|mp3)$`。
- WordMemorizer 兼容接口:`POST /api/transcribe_pt` / `/api/transcribe_zh`(字段 `audio_file`,返回 `{status,text,message}`)——C# 桌面端发音评分用,**不要改**。
- `WS /ws/chat/{session_id}`:**简化骨架**,整段收发,不落库 orig/msg_uid/audio_file,与 `/chat/*` 不对齐;有意的过渡状态,不要顺手统一。

### LLM(`core/llm_engine.py`)
- `BaseLLMEngine.generate(messages, json_output=False, max_output_tokens=None)`;`GeminiEngine` / `GroqEngine`(OpenAI 兼容)/ `OllamaEngine`;`config.LLM_PROVIDER` 选主引擎。
- 云端主引擎会被 `FallbackEngine` 包一层,降级链 **gemini → groq → ollama**(`_CLOUD_CHAIN_ORDER`,主 provider 排最前,最后固定兜底本地 Ollama)。额度用完(429)冷却 30 分钟(`QUOTA_COOLDOWN`),其他故障冷却 60 秒(`ERROR_COOLDOWN`)。Gemini 内置模型级降级与每模型重试 `ATTEMPTS_PER_MODEL=2`。具体模型名以 `config.py` 为准。
- 批量/结构化调用(场景候选、例句、配图画面设计)用 `json_output=True` + `max_output_tokens`,并自己做 JSON 容错(去 ``` 围栏、拆批重试)。

### ASR(`core/asr_engine.py`)
Faster-Whisper 懒加载单例 + `asyncio.Lock` 双检锁;`startup` 预加载。`config`:`ASR_MODEL_SIZE`(large-v3)、`ASR_DEVICE`(cuda)、`ASR_COMPUTE_TYPE`、`ASR_LANGUAGE=pt`、`ASR_PROMPT_PT`(聊天/造句用的欧葡风格提示,不放具体词)、`ASR_PROMPT_WORD`(单词 mode 2/3 用,同样**绝不放目标词**,否则等于放水)、`ASR_SUPPRESS_EN`(压制短音频常见幻觉 Thank/you)。zh 求助模式显式 `language="zh"`。

## 4. 聊天页(前端 index.*)要点
- 顶栏:左 `#st` 连接圆点(每 15 秒探测 `/api/health`)|中 标题(智能体名+当前音色)|右 `#mode`(🇵🇹 葡语 / 🇨🇳 中文求助)+ `#more`(⋯)。`#more` 菜单 `#menu` 里 `#words` / `#user` / `#theme` 三个 id 的点击绑定在 `index.js`,**改样式时 id 不要变**。
- 长按教练语音条 → `#sheet`:原文 / 翻译 / 语法解析 / 拆解单词 / 重新生成语音 / 删除这一轮。长按标题 `h1` = 清空对话。
- 面板(绑定智能体 `#umask`、背景与主题 `#tmask`、拆词 `#wmask`)是 `.mask` 底部弹层。绑定面板含:绑定/恢复、音源三选一、音色、角色人设(模板按钮 + ≤300 字,游客禁用)。`PERSONA_MAX=300`(前端)↔ 后端清洗后 >300 字 422。
- 历史分页 `GET /api/history?session_id=&limit=30&before_id=` → `{messages,has_more}`,`row_id` 做游标,`HIST_PAGE=30`。
- toast 一次一条、用 `textContent`,**不要改 `innerHTML`**。`used_words` 非空弹「✅ 用到了:xxx」,与 `tts_fallback` 提示合并。
- 主题是 CSS 变量:key `--[\w-]{1,30}`、value `#hex`(3~8 位),≤32 项,双重正则白名单;`DEFAULT_BLUE=#3d9be9`。背景图 ≤5MB,后缀+魔数双重校验,服务端生成 `bg_{uuid32}.{ext}`。
- **录音/音频(iOS/安卓踩过的坑)**:按住录、松开发、上滑取消,iOS 优先 `audio/mp4`;**按住说话的手势里不要 `unlock()`**(只 `player.pause()`),否则和 `getUserMedia` 抢 iOS 音频会话;**不要给 `#hold` 设 `touch-action: manipulation`**(会覆盖 `none`,`pointercancel` 丢录音);聊天页每次重新申请麦克风(**不要改成复用**,只有单词页复用);答错先播失败音效再朗读单词。
- 单词库(`POST/GET /api/vocab`,**JSON body**)没有浏览/删除/去重界面——有意。

### 聊天联动(P2,`memory/chat_words.py` + `word_planner.pick_chat_focus`)
- `config.CHAT_WORD_LINK`(总开关)、`CHAT_WORD_N=5`:每轮给教练自然带入最弱的几个词(最多 `CHAT_FOCUS_NEW=2` 个"本周还没进进度表的新词"名额),`build_system_prompt(persona, focus_words)`。
- 用户(**仅 pt 模式**)在对话里用到该词 → `credit_chat_use`:每词每天最多 +1 box,**只有 box ≤ 2 才加,封顶 3,聊天绝不让词毕业**;`due_date/lapses/streak/last_outcome/mode2_ok/mastered` 一律不动。`chat_words` 内部吞掉所有异常,不影响聊天。
- 聊天里加生词直接写 WordMemorizer 生词本(`newword_manager`,`Source=2` 口语陪练,`Remark` 带对话上下文),去重沿用 `_clean_word`/`_key`。
- 单词拆解 `POST /api/breakdown` → `{words:[{word,meaning,sentence,sentence_zh}]}`(结果带 "Correção:" 前缀时兜底清洗)。翻译/解析按 `message_id` 缓存在 `messages.translation/explanation`。

## 5. 单词任务:数据来源与一周节奏
- **词源**:`word_source` 只读 `sessions.db` 里 WordMemorizer 的表。本周词 = `WeeklyPlans` 里覆盖当天的那一周(StartDate 周日~EndDate 周六)的 `WeeklyPlanWords` → `Words` 正文。`WordItem` 字段:`id,pt_word,cn_meaning,pt_sentence,cn_sentence,mode,source,remark,reference_image_number` + 场景字段 `emoji,pos,gender,number,scene_ok,scene_confirmed,scene_template,scene_noun,scene_zone` + 形容词四词形 `adjective_{m,f}_{singular,plural}`。**前端 words.js 的单词对象与此一致,改一边改另一边。**
- **周从周日起算**,新一周的计划在周日首次请求时生成,之后整周固定。`word_week`(每人每周词表)= 往周没学完的顺延词 + 本周计划全部新词,**不设上限**(顺延多少就比 30 多多少);顺延词里与本周计划同名的丢掉(防重复)。
- **"今天"**由 `word_task_manager.today_str()` 定(服务器本地日期)。周末不安排新词;工作日=周一~周五。
- **一周节奏**(这是回答"为什么看不到某天预习/某天为什么这样"的核心,务必按这个核对):

| 日 | 任务(items) | 预习(preview) |
|---|---|---|
| 周日 | 无测验(前端 `previewOnly`) | **整周词表,只看不测**(前端另有"周日以测代看" `sunMode`,不碰进度) |
| 周一~周四 | 到期复习 + 新词(数量由 `calc_new_quota` 定) | **明天的新词**。**预习是承诺**:当天落库的预习词,明天**直接取它们当新词**(`word_progress_manager.load_pinned_new`,取本周周一起、今天之前、最近一个有预习的周一~周四),不再重新算;已学/已掌握的会被 `build_today_plan` 过滤,其余按配额补 |
| 周五 | 到期复习 + **本周回顾**(`weekly`)+ 新词(若还剩) | **= 周六要练的计划**。周六计划在**周五点"完成"结算后**由 `/words/complete` 里的 `_plan_saturday` 生成并落库;周五预习直接读这份落库计划 |
| 周六 | **周六加练**(`extra`,见 §7)+ 少量到期复习,总上限 `SATURDAY_MAX=10` | 无;**周六没有新词** |

- **周五预习"空"的两种正常情形**:① 周五还没点"完成"(计划尚未生成);② 周六确实没有弱词/到期词(计划为空不落库)。⚠️ 历史坑:若周五完成时服务还是**没有 `_plan_saturday` 的旧版本**,周六计划永远不会生成。现在 `GET /words/today` 在"周五 + 今天已完成 + 周六计划不存在"时会**自动补生成一次**(`words_today` 里调用 `_plan_saturday`,异常 `logger.exception` 吞掉);周六本身请求 `/today` 时也会按当天进度现算同样的计划。若周六计划本来就为空,每次周五 `/today` 都会重算(开销很小)。
- **预习里点"我已掌握"**(`POST /words/mark_mastered`)会调 `drop_from_future_plans`,把该词从**今天之后已落库**的计划里删掉(目前只有周五生成的周六计划)。今天及以前的计划不动。
- 前端周五文案:"明天(周六)练的是:到期要复习的词,加上这周还没掌握牢固的词。"周五第一次完成时 `waitPreview`:`/complete` 返回后重新 `GET /today` 取预习。
- 计划**当天第一次请求时生成并固定**(`word_daily_plan`,刷新/重新学习都不变),主键 `(session_id, plan_date, word_id)`,`kind` 含 `preview`。**空计划不落库**。
- 单词配额 `calc_new_quota(review_count, yesterday_rate, remaining_new, days_left)`:进度基准 `ceil(remaining_new/days_left)`,再按昨天一次通过率(`RATE_LOW=0.6`/`RATE_HIGH=0.9`)与复习负担微调,夹在 `[NEW_MIN=3, NEW_MAX=10]`,且总量不超 `WORKLOAD=25`。今天少学的会通过明天的基准自动补回;周五学不完的顺延下周。**`PREVIEW_MAX` 已删除**(旧文档里还有),预习数量 = 对明天配额的估算(上限 `NEW_MAX`)。
- 前端 `KIND_LABEL`:🆕新词 / 🔁复习 / 📅本周回顾 / 💪周六加练 / 👀先看后测(preview)。

## 6. 调度算法(`memory/word_planner.py`,纯函数,不碰数据库)
Leitner 盒子 + **工作日**间隔。每词一行进度 `row`(box 0-5、due_date、streak、lapses、hard_streak、introduced_on、last_mode、last_outcome、mode2_ok、mastered、mastery_review_on)。

**参数(集中在文件顶部,改参数只改这里)**:`WEEK_SIZE=30`(仅参考) `WORKLOAD=25` `NEW_MIN/MAX=3/10` `REVIEW_MAX=15` `WEEKEND_REVIEW_MAX=8` `INTERVALS={1:1,2:2,3:4,4:7,5:14}`(box→下次间隔,工作日) `MASTER_BOX=4` `MASTER_REVIEW_DAYS=30` `RATE_LOW/HIGH=0.6/0.9` `STUBBORN_LAPSES=3` `WEAK_LAPSES=2` `WEAK_HARD_STREAK=2` `LAPSE_DECAY_STREAK=2` `SATURDAY_MAX=10` `CLOZE_BLANK="____"` `CLOZE_MAX=6` `CLOZE_ENABLED=True` `SENTENCE_ENABLED=True` `SENTENCE_MAX=3` `SENTENCE_BOX_MIN=3` `SENTENCE_LOW_RATE=0.5` `CHAT_FOCUS_NEW=2`;跟读(§10):`SHADOW_ENABLED=False`(**开关在 word_planner 顶部,不在 config**)`SHADOW_MAX=3` `SHADOW_BOX_MIN/MAX=1/2` `SHADOW_MIN_WORDS/MAX_WORDS=3/14`。

**outcome**:`good` 一次答对 | `hard` 答错后重试才对 | `again` 公布答案或被判错 ≥2 次 | `skipped` 跳过。`apply_outcome`:
- good:box+1(≤5),streak+1,hard_streak 清零;每连续答对 `LAPSE_DECAY_STREAK` 次 lapses−1(最低 0);mode 2/3/4 答对置 `mode2_ok=1`(**mode 5 跟读不置位**,故意的)。
- hard:box=max(1,box),streak 清零,hard_streak+1。
- again:box=max(1,box−2),lapses+1,streak/hard_streak 清零;mode 2 的 again 令 `mode2_ok=0`;`due=下一个工作日`。
- skipped:当天算通过但不升级(box=max(1,box),streak/hard_streak 不动)。
- 其余 `due = add_workdays(today, INTERVALS[box])`;`mastered = box≥MASTER_BOX 且 mode2_ok`。
- **每词每天只结算一次**:`word_outcomes` 主键 `(session_id, task_date, word_id)`,`INSERT OR IGNORE`,rowcount=0 就不更新进度(重新学习再提交会被忽略)。`settle` **只认今天计划里的词**(不信前端传的 id),`outcome`/`mode` 过枚举校验。已 `mastered` 的词不结算(**例外**:手动掌握且已到回顾日的词放行)。
- `yesterday_rate` = 最近一个学习日 good 占比。

**手动"我已掌握"**(`master_row`):box 拉满、`mode2_ok=1`、`mastered=1`、`hard_streak=0`;`MASTER_REVIEW_DAYS>0` 时写 `mastery_review_on = due_date = review_date(today, 30)`(自然日,落周末顺延到工作日)。到期回顾:`build_today_plan` 的到期复习里,`mastered` 且 `mastery_review_on<=today` 的词也进 `kind=review`(不出造句);回顾结算:仍掌握(good/skipped)→ 再隔 30 天,hard → 15 天,again 掉出掌握 → 清空 `mastery_review_on` 回到普通复习。**只有手动点"我已掌握"的词会回顾**,自然毕业(box≥4)的词 `mastery_review_on` 永远为空;功能上线前就手动掌握的旧词不会补排;`MASTER_REVIEW_DAYS=0` 回退旧行为。聊天联动/预习/周五回顾/周六加练仍排除 mastered 词。

**mode 选择**(`choose_mode`):新词第一遍 `choose_new_mode`(短词偏 mode1、长词/短语偏 mode2,按 id 稳定抖动;≥4 个词全同向时隔一个翻转);`lapses≥3` 或上次 again → 1;`CLOZE_ENABLED` 且 `box==3 且 last_outcome=="good"` → 3;`box≥2` → `last_outcome=="good"` 则 2 否则 1;其余按新词规则。mode 4 造句、mode 5 跟读都不由本函数产生,由 `build_today_plan` 后处理改写(§10)。

**排序**`priority = overdue天数 + 2*lapses + (5-box)`;到期复习里顽固词(lapses≥3)排最前。

## 7. 周六加练的选词规则(`build_today_plan`,`today.weekday()==5`)
候选 = 未掌握、且不在今天到期复习里的词,满足**任一**:`lapses ≥ 2` | `last_outcome == "again"` | `hard_streak ≥ 2`。排序:顽固词(lapses≥3)优先 → 上次 again 优先 → lapses 多优先 → hard_streak 多优先 → box 低优先 → word_id。取前 `SATURDAY_MAX − 已有条数` 个。
注意:周五结算后的词 due 基本都在周一以后,所以**周六的 review 通常是空的,加练才是主体**;进度只在点"完成"时结算,周五中途退出的结果周六看不到。

## 8. 表与迁移
- `word_progress(session_id, word_id, box, due_date, streak, lapses, hard_streak, introduced_on, last_mode, last_outcome, mode2_ok, mastered, mastery_review_on, used_count, last_used_on)`,主键 `(session_id, word_id)`。**`used_count`/`last_used_on` 不在 `_COLS` 里**(`new_row`/`_upsert`/`get_progress` 看不到),只被 `credit_chat_use` 读写。`mastery_review_on` 在 `_COLS` 里,`_upsert` 用 `_DEFAULTS` 兜底老 row。
- **给表加列的模式**:`init_db()` 用 `PRAGMA table_info` 检测缺列 → `ALTER TABLE ... ADD COLUMN ... DEFAULT ...`(幂等,旧库不用删)。**以后加列照这个来**;`apply_outcome` 对没有新键的旧 row 用 `setdefault`。
- `word_week(session_id, week_start, seq, word_id)` 主键 `(session_id, week_start, word_id)`;`word_daily_plan` 见 §5;`word_outcomes(session_id, task_date, word_id, outcome, mode, box_before, box_after)`。`word_task_done` 由 `word_task_manager` 管(含 `round_score` 自动迁移列);`word_errors` 由 `word_error_manager` 管(每次答错一行,`pt_word`/`cn_meaning` 是快照,**目前只记录不参与调度**)。
- `word_examples` / `word_example_use`(§11)、`word_images`(§12)、`lychee_word_image_uploads`(旧 Lychee 上传记录,现无生产使用)、`WordQuizRun/WordQuizAward`(§16)、WordMemorizer 6 表 + 扩展列(§15)。

## 9. 单词任务前端(words.*)
- 纯前端状态机:`loading → idle → test ⇄ judging → result → …`,另有 `preview`(只看不评分)、`done`(今日已完成,可重新学习)。进度只在内存,中途退出弹确认且不保留;计划不变、可重新领取。
- 题型 `mode`:1 看葡语说中文|2 看中文说葡语|3 句子填空(`viewCloze`,**不自动朗读、无喇叭**,否则泄露答案)|4 造句|5 跟读(§10)。**`fetchToday` / `resumeDay` 的 mode 白名单是 `[1,2,3,4,5]`**(前端 AGENTS.md 里写的 `[1,2,3]` 已过时)。重测方向翻转:`1→2, 2→1, 3→1, 4→2, 5→1`。
- 逐词练:答错/公布答案后停在同一词同一方向,按钮变"🔁 再试一次",答对才"下一个"。**只有一次就答对的词才进 `passed`**,出过错的进 `failedList`(每词每轮一次);本轮测完后 `failedList` 用 `{...w, mode}` 拷贝翻转成下一轮,**不要改 `today.words`**;`failedList` 为空才 `finish()`。
- `outcomes` 只记第 1 轮:good/hard/again/skipped;`finish()` 时 `POST /words/complete`,服务器 `total` 以计划为准。公布答案 `#reveal`:纯前端,按答错处理(进 `failedList`)、调 `record_error`、不计 `attempts`、不播失败音效、自动朗读、记 `again`。跳过 `#skip`:同词本轮被 AI 判错 ≥ `SKIP_AFTER=2` 次才出现,记 `skipped`、从 `failedList` 移除、不计 `firstPass`。**没听清/ASR 空结果(422)和公布答案都不算 AI 判错**,不计入 `aiWrong`。
- 用户在结果页点"✅ 我已掌握"(`POST /words/mark_mastered`):前端同时把该词从本轮 `outcomes`/`failedList` 移除;**周日以测代看不放此按钮**。
- 周日 `sunMode`:不碰进度、不调 `/complete`、不记 outcomes/errors、不带 `run_id`、不加分;第 1 轮看+测,第 2 轮起全部词直接考(方向翻成 mode 1),连错 2 次记"待巩固"(weak);断点存 `localStorage` 键 `sunquiz|<sid>|<本周起始日>`(`SUN_VER=1`,词表变了作废,往周自动清掉)。
- 顶部 `#points` 读 `GET /api/admin/points`(累计 / 今日 / 余额 / 本轮得分)。
- words.js 里有一小段从 index.js 精简拷贝的 `NAME_RE` / guestSid / 主题 / `ttsCfg()`,改这些要两个 JS 一起改。`words.html` 里 `scene.js` 先于 `words.js` 引入。`words.css` 只补单词页独有样式,**不要为单词页改 `index.css`**(聊天页共用)。
- 单词页麦克风 `getMic()` 整个测试期间复用同一个 MediaStream(`begin()` 预热;`finish()`/切后台/`pagehide` 时 `releaseMic()`;`onstop` 里**不要 stop 轨道**;按下时流被系统静音要 `waitMicLive` 等 1.5s)。
- 来源按钮:`GET /api/words/source-image/{n}` 读 WordMemorizer 来源图 `N.jpg`(`config.WORD_SOURCE_IMAGE_DIR`,编号只能映射为固定目录里的 `N.jpg`)。

## 10. 句子填空(mode 3)、造句(mode 4)与跟读(mode 5)
**填空**
- 显示挖空例句(`____`)+ 中文翻译 + 提示,用户只说缺的词。仅 `kind=review`;`choose_mode` 在"顽固/上次 again → 1"之后、"box≥2"之前,`box==3 且 last_outcome=="good"` → 3;一天最多 `CLOZE_MAX`;非 review 的 mode 3 一律降为 2(`build_today_plan` 末尾后处理)。
- 挖空 `make_cloze`:整词精确匹配、忽略大小写(重音敏感)、去掉 `pt_word` 括号备注、只换第一处;`_load_words` 里对 mode 3 构造 `cloze`,**找不到就把该词降为 mode 2 且不带 `cloze`**(不回写计划表)。
- 评判 `_judge_pt_cloze` = 规则 → 逐词规则 → `_judge_pt_llm`;ASR 用葡语。回退:`CLOZE_ENABLED=False` 重启即可。
- 已知取舍:"掌握前必过填空"是概率保证;动词变位/复数的词会降级回 mode 2;模糊匹配未做。

**造句(mode 4)**
- 看目标词说一整句。`_judge_sentence`:少于 2 个词直接判错(不调 LLM)→ 规则(整词匹配目标词)→ LLM(词义/用法/改正),返回 `corrected`(**只有 mode 4 的 evaluate 响应带**);`WORD_PT_USE_LLM=False` 或 LLM 出错退回规则,LLM 返回解析失败 502。
- 出题(`build_today_plan` 后处理改写):只给 box ≥ `SENTENCE_BOX_MIN`(3)且未掌握的复习词和周六加练词;box 3 的词在填空/造句之间按 `SENTENCE_LOW_RATE` 稳定分流(词 id+日期);一天最多 `SENTENCE_MAX`;`SENTENCE_ENABLED` 总开关。

**跟读(mode 5,`word_planner.SHADOW_ENABLED`,默认 False)**
- **玩法**:进题自动播整句(`GET /words/{id}/audio?kind=sentence&ex=N`),喇叭可重听;用户按住说话(录音**只转文字**,填进可编辑文本框,不判分)或直接打字;点「提交」后服务端用**自己取的原句**与文本做词级比对。失败时**不显示答案**,只标出写错的词(缺词只显示 `＿`);通过 / 公布答案 / 连错 `SKIP_AFTER` 次才露出原句。
- **出题**(`build_today_plan` 末尾后处理,仅开关打开时):`kind=review`、当前 mode 为 1/2、未掌握、box 1~2;**顽固词(lapses≥3)/ 上次 again 的词也有资格且优先抽中**(跟读比回忆容易,适合巩固它们),其余按 `_mix01(词id,'shadow'+日期)` 稳定顺序补满;一天 ≤ `SHADOW_MAX`=3。新词 / 周五回顾 / 周六加练这一版不出。计划在当天第一次 `/today` 生成并落库(周六计划在周五完成时生成),所以**改开关后当天已落库的计划不变**。
- **句子**(`word_routes._load_words` 的 mode 5 分支):候选 = 原例句(idx 0)+ 启用的生成例句,只留 `SHADOW_MIN_WORDS`~`SHADOW_MAX_WORDS`(3~14)词的,**不要求能挖空**;`pick_example` 轮换并写 `word_example_use`(与 mode 3 共用);池空 → 降级 mode 2(不带 `ex`)。mode 5 的词**不带 `cloze`**,所以公布答案后的补测实际总是 mode 2。
- **接口**:`POST /words/shadow/transcribe`(FormData `audio,word_id` → `{text}`;ASR 用 `ASR_PROMPT_PT`,**绝不放原句**)、`POST /words/shadow/evaluate`(FormData `word_id,ex,text≤300,session_id?,run_id?` → `{word_id,mode:5,passed,recognized_text,comment,tokens:[{w,s}],earned?,round_score?}`,`s`∈ok|wrong|extra|missing|accent)。判分 `memory/shadow_judge.judge_shadow`:纯规则(`pt_text.norm_pt` 归一 → difflib 词级对齐,不调 LLM);只差重音默认通过并标黄(`config.SHADOW_ACCENT_STRICT=False`);允许错词数 `config.SHADOW_MAX_WORD_ERRORS=0`。积分走模块级 `_award_if_passed`(与 `/words/evaluate` 共用)。`settle` / `OutcomeItem.mode` / `RecordErrorBody.mode` 已放开到 5;`apply_outcome` **不改**:mode 5 答对不置位 `mode2_ok`。
- **前端(`words.js` / `words.css`)**:`viewShadow`(页面上**不渲染** pt_sentence / pt_word / cloze)、`transcribeShadow`、`submitShadow`、`applyJudged`(从 `evaluate` 抽出的共用结果处理);状态 `shadowText`(文本框值必须存模块变量:`render()` 每次重建 DOM,输入事件里不能 render)、`shadowZh`、`shadowBusy`;mode 5 测试态 `#act` 显示「✅ 提交」,`footer.sh` 微调三按钮排版;失败后不 `speakAfterSfx`(不泄露答案);失败重测方向 5→1;`canUseAssessmentScene` 对 mode 5 返回 false;`rec.onstop` 里 `cur.mode===5` 才分支到 `transcribeShadow`,录音逻辑本身不动。
- **上线顺序**:先发前端(旧前端会过滤掉 mode 5 的词,服务器仍计入总数,任务完不成)→ 再发后端(开关仍 False)→ 最后把 `SHADOW_ENABLED` 改 True 并重启。回退只改回 False 重启,**不要先回退前端**。安卓 apk 的 WebView 缓存旧 `words.js` 时清缓存,或给脚本地址加 `?v=`;软键盘遮挡文本框要在 Activity 加 `android:windowSoftInputMode="adjustResize"`。
- **排查**:`SELECT plan_date, word_id, kind, mode FROM word_daily_plan WHERE session_id='…' AND mode=5;`。

## 11. 多例句轮换(P4)
- **为什么**:词库每词只有 1 条例句,约 22% 因变位/复数挖不出空;且总用同一句会背句子。P4 用 LLM 生成 pt-PT 例句缓存起来,mode 3 轮换,同时救回挖不出空的词。
- **生成**:`录入本周` 后服务自动在后台跑(`_prep_examples`,等同 `python tools/gen_examples.py --week`,**跑两遍,第二遍补第一遍失败的批次**,每词 2 条、每批 10 词);也可手动 `gen_week_examples.bat`。`gen_examples.run(args, progress_callback)` 可在进程内调用。参数:`--week`(只处理当天所在周计划词)/`--active`(正在学未掌握的老词)/`--ids`/`--report`(只看覆盖率,统计的是**整个词库**,不是成功指标)/`--dry-run`/`--only-failing`/`--limit`/`--per-word`(默认 2,最大 3)/`--batch`/`--sleep`。`--ids/--week/--active` 取并集,都不给 = 全库(不推荐);计划为空时**不会退化成处理全库**。只读词库、只写 `word_examples`,可断点续跑。
- **提示词与校验**:`WORD_EXAMPLES_PROMPT`——pt-PT、A1~A2、5~12 词、**必须原样含目标词**(不变位不变复数;`-se` 反身动词写成 `lembrar-se`)、简体中文翻译。`validate_example` 必须全过才入库:能 `make_cloze` 挖空、有汉字、词数 3~16、≤120 字符、`norm_sentence` 后不与已有例句重复。U+2010/2011/2012 连字符先归一;`parse_examples_json` 容错;解析失败原文落盘 `data/gen_examples_failed.txt`。**不要为通过校验而放宽 `validate_example`。**
- **表**(`word_example_manager`):`word_examples(word_id, idx, pt_sentence, cn_sentence, enabled, source, created_on)`——idx≥1,**idx 0 = 词库原例句,不入表**;`enabled=0` 停用;新 idx 在已有最大 idx(含已停用)后顺延。`word_example_use(session_id, word_id, last_idx, last_used_on)` 用于轮换。无外键。
- **选择**(主要发生在 mode 3,mode 5 跟读也用同一套轮换,见 §10;`word_routes._load_words(entries, session_id=None)`):有 `session_id` 时批量取一次 `get_examples`/`get_uses`(无 N+1);候选池 = 原例句(idx 0)+ 启用的生成例句,**读取时重新 `make_cloze` 校验**、只留能挖空的;`pick_example(pool, last_idx, used_today)` 轮换(`last_idx` 之后的下一个,回绕;`last_used_on==今天` 且 `last_idx` 仍在池里则沿用,同一天刷新不变);池空才降级 mode 2。没有生成例句的词 / 没传 `session_id`(预习) / 例句表异常:退回只用原例句(不带 `ex`、不写 `word_example_use`);`get_examples/get_uses/record_use` 异常一律 `logger.exception` 吞掉,**绝不让 `/today` 失败**。
- **词对象**:选中例句时 `pt_sentence`/`cn_sentence` 换成该例句并带 `ex`(整数,原例句 0);没有 `ex` = 没走轮换。mode 1/2/4、预习条目不带 `ex`。mode≠3 但原例句能挖空时也可带 `cloze`(仅供"公布答案后隔一词补测")。
- **朗读**:`GET /words/{id}/audio?kind=sentence&ex=N`;`ex` 缺省 0,`ex<0` 422,`ex>0` 取不到 404,`kind=word` 忽略 `ex`。前端 `speak` 只在 `kind==='sentence' && w.ex` 时带 `ex`。
- **回退**:`UPDATE word_examples SET enabled = 0;`;单条:`... WHERE word_id=… AND idx=…;`。
- 已知取舍:生成例句无人工审核;老词没有生成例句;mode 1/2 不轮换;挖空仍是精确匹配。

## 12. 评判规则(`POST /words/evaluate`,FormData: audio,word_id,mode,session_id?,run_id?)
- 录音 ≤ `WORD_MAX_AUDIO_SIZE`(10MB)否则 413;mode 非 1-4 → 422;词不存在 404。
- **mode=1**(看葡语说中文):ASR zh → 义项精确匹配快速通道(`cn_meaning` 按 `;;,,、/|` 拆,括号备注不参与)→ 不中交 LLM(`WORD_MEANING_JUDGE_PROMPT`)。
- **mode=2**(看中文说葡语):ASR pt(`ASR_PROMPT_WORD`)。规则:`_norm_pt`(NFC+小写+连字符当空格+去标点,**保留重音**)完全一致;含空格短语相似度 ≥ `WORD_PT_MATCH_THRESHOLD`(0.85);单个 ≥7 字母长词允许"同词干近似"(`_near_single_word`:相似度 ≥ `WORD_PT_SINGLE_THRESHOLD` 0.80 且共享前缀 ≥ max(5,len−3))。规则没放行再交 LLM(`WORD_PT_JUDGE_PROMPT`);LLM 调用失败退回规则;`config.WORD_PT_USE_LLM=False` 关闭 LLM;LLM 返回解析失败 → 502(不算答错)。
- **mode=3**:`_judge_pt_cloze`;**mode=4**:`_judge_sentence`(见 §10)。
- 没听清/空结果 → 422(`bad_audio` 同)。通过且带 `run_id`、该词在今天计划里、账号在积分白名单 → 响应并入 `earned`/`round_score`。
- 场景判分 `POST /words/scene/evaluate`:FormData `word_id,session_id,run_id,selected_word_id`(**四项必填**),`passed = selected_word_id == word_id`;词未启用场景 400;形容词四词形不全 400;只给答对的、在今天计划里的目标词发分;**不再接受 `audio`**。
- `POST /words/record_error`(**JSON**:session_id,word_id,mode 1-5,user_text≤200)写 `word_errors`。
- `POST /words/complete`(**JSON**:session_id,run_id?,rounds,first_pass,attempts,outcomes[{word_id,outcome,mode}]):`settle` 结算 + `mark_done`(重新学习后再完成:成绩覆盖、`times+1`,进度不重复结算);**周五额外调 `_plan_saturday`**;今天没计划 422。
- `POST /words/mark_mastered`(**JSON**)见 §6、§5。
- 跟读(mode 5)不走 `/words/evaluate`(它仍只收 mode 1-4),走 `/words/shadow/transcribe` 与 `/words/shadow/evaluate`,见 §10。

## 13. 积分(陪练与管理端共用 `ScoreRecord`)
- 单词页正式测验答对 +1 分,写入共用 `ScoreRecord`:管理端 `FormMain` 的"累计得分"就是 `/admin/points.correct_count`。
- 表(在 `wm_manager.SCHEMA`):`WordQuizRun(RunId,SessionId,TaskDate,BatchNumber,Completed,CreatedTime)`、`WordQuizAward(RunId,WordId,ScoreRecordId)`,主键 `(RunId,WordId)` ⇒ **同一批次同一词最多 1 分**。批次号 14 位 `yyyyMMddHHmmss`(同秒冲突 +1),与管理端考试批次同格式,会出现在管理端批次列表(`Notes="葡语站单词学习"`,`IsPortuguese = (mode != 1)`)。
- `POST /api/words/run` JSON `{session_id,restart}` → `{run_id,batch_number,round_score}`:取当天未完成批次,`restart=true` 新建(今天没计划 422);`/words/complete` 的 `run_id` 把批次置 `Completed`,`round_score` 由服务器数,写 `word_task_done.round_score`;`today.completed` 带 `round_score`。
- 不在 `WORD_QUIZ_POINT_USERS` 或不在 users 表 → 不加分不报错;`wm_manager` 出错 → HTTP 503。

## 14. 单词配图(AI 插画)
- **用途**:学习页公布答案 / 预习列表 / 场景里显示配图。`/words/today` 给有图的词带 `image_url`(如 `/api/words/12/image?v=ab12cd34`,`v`=文件名随机段,重画后变化,所以图可 `immutable` 长缓存);**没有该字段 = 没图,前端什么都不显示**。
- **流水线**(`memory/word_image_gen.py`,服务内"本周准备"与 `tools/gen_images.py` 共用,`_lock` 串行):词 → LLM 设计英文画面(`IMAGE_SCENE_PROMPT`,JSON `{imageable,scene,confidence}`;名词画物体、动词画动作瞬间、形容词画对比/夸张;**画面里不能有任何文字**,下方 1/4 留白)→ 拼固定画风 `STYLE_SUFFIX` → `core/image_engine`(Cloudflare Workers AI FLUX.1 schnell 为主,Pollinations 为可选兜底)出图 → `core/image_caption` 用 Pillow 在图下方贴"葡语单词+中文释义"(图模型写不好汉字/重音,所以由程序贴)→ 存盘 + 记 `word_images`。装不到 Pillow/字体时原样保存、`captioned=0`,可用 `tools/caption_images.py` 补贴(本地处理,不花额度)。逐词串行,每词写完即提交,断点续跑。
- **异常三类**(`image_engine`):`ImageConfigError`(没配账号/鉴权失败)整批停;`ImageQuotaError`(额度用完/限流)整批停、明天再跑;`ImageError` 只跳过这一张。
- **表 `word_images`**(`word_image_manager`):`word_id PK, status, file, scene, prompt, provider, tries, created_on, updated_on, captioned`。`status`:`ok` 可显示 | `rejected` 旧版状态(不显示,等重画)| `skip`(LLM 判断无法成画,不配图)。`MAX_TRIES=5`(含重画)。**图按词,不按智能体**:家里谁点"图不对"对所有人生效。
- **文件**:`data/word_images/YYYYMMDD/wimg_{词id}_{8位随机}.{jpg|png|webp}`(YYYYMMDD=本周周日);旧图可在根目录。读/删文件一律过 `FILE_RE` 白名单(`fullmatch`),**不接受前端传文件名**。
- **接口**:`GET /api/words/{id}/image`(只按 word_id 查表,没图 404);`POST /api/words/{id}/image/reject`:返回 `{rejected,regenerating,preserved,reason?}`,`reason` ∈ `max_tries` / `disabled`;后台任务 `regenerate_after_reject`——**新图成功保存后才替换旧图,失败继续用旧图**;同一词同时只允许一个重画任务(`_regen_word_ids`);成功后才同步图库并替换图库里的旧图和音频。
- **config**:`IMAGE_ENABLED`、`CF_ACCOUNT_ID`/`CF_API_TOKEN`、`CF_IMAGE_MODEL`、`CF_IMAGE_STEPS`、`IMAGE_FALLBACK_POLLINATIONS`(开启意味着画面描述会发给第三方)、`IMAGE_MAX_SIDE`(768,压成 webp)、`WORD_IMAGE_DIR`、可选 `CAPTION_FONT`(或环境变量 `PT_CAPTION_FONT`)。`is_enabled() = IMAGE_ENABLED 且(Cloudflare 已配 或 允许 Pollinations)`。
- **前端**:`words.js` 的 `openImage`/`rejectImage`/`sceneImage(w)`;预习场景里图卡常驻画面左侧,测验里点"💡 提示"才出现;点图放大;"🚫 图不对,换一张"后继续显示旧图直到新图替换。

## 15. 本周准备流水线 + 图库同步(录入本周后自动备课)
- **触发**:C# 管理端 `生词本 → 录入本周`(要求未录入的生词 ≥ `WORDS_COUNT_PER_DAY*5`=30)→ `FormWeekPrepProgress` 弹窗(先显示已选词,确认后才 `PUT /admin/weeks/current/from_newwords`,已有周计划会问是否覆盖)→ 服务端 `replace_from_newwords` 成功后,若 `WEEK_PREP_AUTO != "0"`,在后台启动 `_start_week_prep`。**文本导入**(`POST/PUT /weeks/current/words`)**不会**自动触发,需手动 `POST /admin/weeks/current/prepare`。
- **4 个顺序步骤**(`_WEEK_PREP_STEP_RUNNERS`,每步各自成败,不互相影响,也不影响录入):
  1. `scene` 场景候选:本周计划词里还没有场景字段的,每 40 个一批调 `words_scene_metadata_generate`(内部再按 8 个一批,JSON 无效自动拆批/补问)。**只生成候选(`SceneConfirmed=0`),仍须在管理端逐条确认**。
  2. `examples` 例句生成:见 §11(两轮)。
  3. `images` 配图生成:`word_image_gen.run(week=True)`;未配置/未启用 → `skipped`。
  4. `gallery` 同步图库:`word_pic_audio_uploader.upload_current_week`——把本周有效配图、单词音频、例句、例句音频和词条元数据上传到公网图库 **word-pic-audio**(HTTPS API,令牌保护;`config.WORD_PIC_AUDIO_API_URL`(必须 https)/`_TOKEN`/`_TIMEOUT`;未配置则跳过)。音频用服务自己的 TTS(`_word_audio_path`/`_example_audio_path`)生成,缺音频给 `warning`。重画后的新图通过 `replace_regenerated_image` 替换图库旧图。
- **状态**:内存字典 `_week_prep` + 落盘 `data/week_prep_status.json`(与 sqlite 同目录,原子写)。`state`:`idle|running|done`;每步 `status`:`pending|running|succeeded|warning|failed|skipped`,带 `message`/`error` 和逐批/逐词 `items`(树状,`FormWeekPrepProgress` 用 TreeView 显示)。**服务重启时**:上次 `running` 的步骤被标 `failed("服务端重启时任务中断")`,整体置 `done`,可单独重试。
- **接口**:`POST /admin/weeks/current/prepare` 重跑全部(没有本周计划或正在跑 → 409);`GET /admin/weeks/current/prepare/status`;`POST /admin/weeks/current/prepare/{step_id}/retry` 只重试 `failed`/`warning` 的步骤(正在运行 409、未知步骤 404、无需重试 409、属于另一份周计划 409)。**准备运行期间 `from_newwords` 返回 409**。
- **旧文档偏差**:`每周日操作清单.md` 里的 Lychee(`LYCHEE_BASE_URL/TOKEN`)已被 word-pic-audio 取代;`config.py` 里已没有 `LYCHEE_*`,`lychee_uploader.py` 现在只有 `tools/test_lychee_uploader.py` 在用。
- 管理端人工步骤仍是:**场景字段逐条"确认"**(`FormSceneMetadata`)。

## 16. WordMemorizer 管理端与 Admin API
**背景**:WordMemorizer 的 6 张表(`Words / WeeklyPlans / WeeklyPlanWords / ScoreRecord / ConsumeLog / NewWords`)已合并进 `sessions.db`;C# 端**不再直连数据库**,全部走 `/api/admin/*`(`api/admin_routes.py` 薄路由 + `memory/wm_manager.py` 全部 SQL)。局域网自用,不加鉴权;字段 **snake_case**(C# 用 Newtonsoft `SnakeCaseNamingStrategy`,模型类不用改);错误 404 不存在 / 422 请求不合法 / 503 库不可用(`WMDBError`),消息中文。C# `AdminApiClient.ShowError(ApiException)` 统一弹窗。

| 接口(前缀 `/api/admin`) | 说明 |
|---|---|
| `GET /weeks` | 全部周计划(Id 升序) |
| `GET /weeks/current` | `{exists,id,week_number,start_date,end_date}`;没有时 `exists=false,id=-1` |
| `GET /weeks/recent?n=3` | 本周之前最近 n 份计划(按日期,不依赖 Id 连续),每份带 `words`;`n ≤ wm.MAX_RECENT_WEEKS` |
| `GET /weeks/{plan_id}/words` | 该计划的词;不存在返回 `[]` |
| `POST /weeks/current/words` | 追加(没有本周计划就创建);联动:续号追加进已固定的 `word_week` |
| `PUT /weeks/current/words` | 覆盖(删旧建新);联动:重置本周 `word_week` + 今天起的 `word_daily_plan` |
| `PUT /weeks/current/from_newwords` | `{new_word_ids:[…](1~200)}` 生词本 → 本周计划(单事务,标记已录入);联动同覆盖;**成功后自动启动备课(见 §15)**;准备运行中 409 |
| `POST /weeks/current/prepare` · `GET …/prepare/status` · `POST …/prepare/{step_id}/retry` | 本周准备流水线,见 §15 |
| `DELETE /weeks/current` | 删除本周计划;联动同覆盖 |
| `GET /words/{word_id}` | 单个词(含场景字段) |
| `GET /scenes` | 已发布场景模板元数据 `{id,title,status,applies_to}`;带名词语境的模板另有 `noun_contexts`;`shop` 另有 `zones`;带 `effects` 的另有 `effect_keys`;性数配对另有 `needs_distinct_forms:true` |
| `GET /words/scene-metadata/pending?limit=100&current_week=` | 等待人工确认的场景字段(含形容词四词形) |
| `GET /words/scene-metadata/confirmed?limit=500&current_week=` | 已确认的(最多 5000) |
| `POST /words/scene-metadata/generate` | `{word_ids:[…](1~40)}` 批量生成名词/形容词/动词场景候选(**不确认**);返回 `{generated_ids,skipped_ids,pending_confirmation}`;C# 用 `PostLongRunning`(120s) |
| `PUT /words/{word_id}/scene-metadata` | 人工确认/修正:`emoji,pos,gender,number,scene_ok,scene_confirmed,scene_template,scene_noun,scene_zone,adjective_*`;校验见下 |
| `POST /scores` | `{batch_number,word_id,record_time?,is_correct,audio_path?,notes?,is_portuguese}` → `{id}` |
| `GET /scores/batches?week=current` | 本周批次号(倒序) |
| `GET /scores/batches/{batch}` | 该批次记录(每条内嵌 `word`) |
| `PUT /scores/{id}/result` | `{is_correct,notes?}` 改对/改错 |
| `GET /points` | `{correct_count,today_count,consumed_total,balance}` |
| `POST /consume` · `GET /consume` | `{score:1~1,000,000}` → `{id}` / 消耗记录(时间倒序) |
| `GET /newwords?filter=&only_unrecorded=&descending=` | 生词本列表(`filter` 匹配 word/meaning,已转义 LIKE 通配符) |
| `GET /newwords/by_word?word=` · `GET /newwords/stats` | 归一化精确查找(没有 404)/ `{total,unrecorded}` |
| `POST /newwords` | `{word,meaning?,example?,example_chinese?,reference_image_number?,is_recorded?,source?(1图片关联/2口语陪练),remark?}`;已存在不插入 → `{id,existed}`;`source` 不传按 `reference_image_number` 推断 |
| `PUT /newwords/{id}` · `DELETE /newwords/{id}` · `PUT /newwords/{id}/recorded` | 改全部字段(`source`/`remark` 不传=保持原值,`remark:""`=清空)/ 删除 / `{recorded}` |

**`PUT scene-metadata` 的校验(`admin_routes.words_scene_metadata_update`)**
- 旧版 C# 不带的字段(`adjective_*`、`scene_noun`、`scene_zone`)**保留已存值**,不要清掉。`pos` 非 noun/adjective/verb → `scene_ok` 强制 false;`scene_ok=false` → `scene_template` 清空。
- 启用形容词场景必须**四词形填全**(422)。`scene_noun` 只对"启用的形容词"有效:模板指定了 → 必须在该模板的 `noun_contexts` 里;**模板选"自动"时**允许任何已发布形容词模板(`CONTEXT_SCENES`)的名词(自动选择里人物系要用)。
- 指定 `scene_template` 必须已发布且适用该词性;形容词还要 `_check_template_fits_word`:变形工坊模板的效果表里必须有这个词(按词典原形 `adjective_m_singular` 去重音比较);性数配对要求四词形**互不相同**——否则 422,**不静默降级**。
- `scene_zone` 只对名词;模板指定则只能是该模板的分区,自动则所有支持分区的模板并集;不支持的清掉。

**服务端规则(改 wm_manager / admin_routes / C# 时必须保持)**
- 写操作都在 `BEGIN IMMEDIATE` 事务里,失败整体回滚。异常 `WMNotFound→404`、`WMInvalid→422`、`WMDBError→503`。
- **周从周日起算**(`wm_calendar.week_range`);`WeekNumber` 等价 .NET `GetWeekOfYear(FirstDay, Sunday)`;`StartDate/EndDate` 存文本 `YYYY-MM-DD 00:00:00`;同一 StartDate 可能多份计划(跨年旧数据),按日期匹配并全部处理。
- **与单词任务联动**:追加 → 新词续号追加进已固定的 `word_week`;覆盖 / 生词转计划 / 删除 → 重置所有智能体本周 `word_week` + 今天起到本周六的 `word_daily_plan`。**不碰** `word_progress` / `word_outcomes`。所以管理端改了词表,单词页立即看到,不用跑 `reset_week.py`。
- **"重新学习"保留旧进度**:`replace_from_newwords` 按归一化词(同 `newword_manager._key`)在 `Words` 里找同名记录,有就**复用**、不再 `INSERT`(多条同名时优先选有 `word_progress` 的 → `SceneConfirmed=1` 的 → Id 大的);释义/例句/来源/备注用生词本最新值(非空才覆盖);选中的记录场景未确认而同名的另一条已确认时,把 `Scene*` 列抄过去;同批同名只进一次。原因:场景数据和学习进度都挂在 `Words.Id` 上,旧版每次新建一行会让预习里同一个词出现两条、进度分叉。复用后的词有进度 ⇒ 不再当新词,按到期日走复习,周日预习照常显示。`POST/PUT /weeks/current/words`(文本导入)仍是新建行,没做同名复用。
- **时间**:`record_time` 接受 `YYYY-MM-DD HH:MM:SS[.fff…]`、T 分隔、`Z`/`±HH:MM` 后缀,归一成服务器本地无时区格式;`CreatedTime/AddedDate` 保持 `DEFAULT CURRENT_TIMESTAMP`(UTC),不显式写入。
- 请求体多余字段被忽略(C# 可直接序列化模型对象)。生词去重沿用聊天加生词那套。
- **改字段 = 三处同步**:`admin_routes.py` 的 pydantic 模型、`wm_manager._word/_plan/_newword` 返回字典、C# 模型类与 `AdminApiClient.cs` 里的 DTO。`Words` 表扩展列:`Source, Remark, SceneEmoji, ScenePos, SceneGender, SceneNumber, SceneOk, SceneConfirmed, SceneTemplate, SceneAdjMS/FS/MP/FP, SceneNoun, SceneZone`(C# 对应 `scene_adj_*`)。
- C# 端特点:`GetSceneLabUrl` 拼出 `https://<host>:443/portuguese-tutor-web/scene-lab.html?template=&word=&zone=`(回环地址换成 localhost),依赖 nginx;`AdminApiClient` 的 base url 来自 `config.ini` 的 `AdminApiUrl`,缺省 `AUDIO_RECOGNIZING_SERVER_URL + "/admin"`;主窗体启动时探测 `/health` 并拉起 `Tools.RunAudioReconizeAPIAsync`。

## 17. 备份与 WAL
- `SQLITE_WAL` 默认开(`PT_SQLITE_WAL=0` 可临时关),聊天、管理接口、`gen_examples.py` 同时访问同一个库;`wm_manager.init_db` 建表并切 WAL。开启后 `data\` 下多 `sessions.db-wal/-shm`。
- **备份只用 `tools/backup_db.py`**(SQLite backup API;直接复制 `.db` 会漏 `-wal` 里的最新数据)。`start_server.bat` 每次启动自动跑:每天一份 `data\backups\sessions-YYYYMMDD.db`,保留最近 14 份;手动:`python tools\backup_db.py --src <库> --to <文件> [--force]`。`tools/reset_week.py` 删前也会备份。
- `WORD_DB_PATH` 留空 = 跟随 `SQLITE_PATH`,只在测试里临时覆盖。没有"退回旧库"的路径(旧客户端写的是旧库),出问题用 `data\backups` 恢复。
- 常用运维脚本:`python tools/reset_week.py <智能体> [日期]`(只删 `word_week` 与指定日 `word_daily_plan`,不碰进度/结算/完成记录)、`tools/diag_week.py`(只读诊断"本周 30 词对不上")、`tools/find_word_id.py`、`tools/adjective_enable_report.py [--db <库>] [--csv 启用清单.csv]`、`tools/sync_word_pic_audio.py`(首次部署/补传图库)、`tools/regenerate_gallery_audio.py`(强制重生成指定日期文件夹的音频并同步)、`tools/validate_scenes.py`(校验全部模板,当前 32 个 0 error)。

## 18. API 契约(新增功能优先复用,不要重新设计)
| 接口 | 说明 |
|---|---|
| `GET /api/health` | 健康检查 |
| `POST /api/chat/audio` · `/chat/text` | 见 §3;`used_words` 总存在 |
| `POST /api/transcribe_pt` · `/transcribe_zh` | WordMemorizer 兼容(`audio_file`) |
| `GET /api/history?session_id=&limit=30&before_id=` | `{messages,has_more}`,含缓存 translation/explanation;游标分页 |
| `POST /api/translate` · `/explain` | FormData: text,message_id?,session_id(占位);有缓存不再调 LLM |
| `POST /api/breakdown` | FormData: text,message_id?,session_id → `{words:[…]}` |
| `POST /api/regenerate_audio` | FormData: message_id,tts_provider,tts_voice? → 新 audio_url(文件名每次随机) |
| `GET /api/audio/{name}` | 白名单 `^msg_[0-9a-f]{12}\.(wav\|mp3)$` |
| `DELETE /api/session/{session_id}` · `DELETE /api/message/{row_id}?session_id=` | 清空历史+音频 / 删一轮(配对两条)+音频 |
| `POST /api/user/bind` | body {username,pin?} → profile `{username,background_url,theme,tts,persona,has_pin}` |
| `GET /api/user/{u}` · `POST …/theme` · `…/background`(FormData file ≤5MB) · `…/tts`(body {provider,voices:{edge?}},非法 422) · `…/persona`(清洗后 >300 字 422,空串清除) | 个性化同步 |
| `GET /api/background/{name}` | 白名单正则,`Cache-Control: immutable` |
| `POST /api/vocab` · `GET /api/vocab?session_id=&limit=500` | **JSON body** `{session_id,items:[{language,word,example_sentence,chinese_meaning,example_chinese}]}` / 倒序列表 |
| `GET /api/words/today?session_id=` | `{date,words:[WordItem+kind(+cloze,+ex,+image_url)],preview:[WordItem(+image_url)],meta:{new,review,weekly,extra,preview},completed}`;场景字段与形容词词形见 §9;`completed` 非空 = 今天已完成 `{rounds,total,first_pass,attempts,round_score,times,completed_at}`。**周五这里会补生成周六计划**(§5) |
| `POST /api/words/run` | JSON `{session_id,restart?}` → `{run_id,batch_number,round_score}` |
| `POST /api/words/evaluate` | FormData: audio,word_id,mode(1-4),session_id?,run_id? → `{word_id,mode,passed,recognized_text,comment[,corrected][,earned,round_score]}`;422 没听清 |
| `POST /api/words/shadow/transcribe` · `/shadow/evaluate` | 跟读(mode 5):录音只转文字 `{text}` / 提交文本与服务端原句比对,返回 `tokens`;见 §10 |
| `POST /api/words/scene/evaluate` | FormData: `word_id,session_id,run_id,selected_word_id`(必填)→ `{word_id,passed,recognized_text,comment,earned,round_score?}` |
| `POST /api/words/complete` · `record_error` · `mark_mastered` | 均 **JSON** |
| `GET /api/words/{id}/audio?kind=word\|sentence&tts_provider=&tts_voice=&ex=&form=` | 朗读(只按 word_id 取服务端文本,**不接受任意文本**,防当免费 TTS 代理);`tts_provider` ∈ piper/google/edge,默认 piper;`ex`(≥0)仅 sentence;`form`(可选,仅 word)= `adjective_*` 字段名(形容词词牌读音,该词形没填回退原形) |
| `GET /api/words/{id}/image` · `POST /api/words/{id}/image/reject` | 配图文件 / 重画请求,见 §14 |
| `GET /api/words/source-image/{n}` | WordMemorizer 来源图 |
| `GET /api/scene/templates` | 已发布模板;`ETag`/`If-None-Match`/304,`Cache-Control: max-age=0, must-revalidate` |
| `GET /api/scene/line-audio?scene_id=&node_id=&variant=&tts_provider=&tts_voice=` | 只合成已发布模板里 `speech=auto/on_tap` 的节点台词;含 `{blank}` 不提供;`variant`(0–3)仅台词带 `{art}`/`{noun}` 的节点才传,否则 422;只接受这几个查询参数 |
| `GET /api/scene/sentence-audio?word_id=&scene_template=&tts_provider=&tts_voice=&variant=` | 服务端按已确认场景词+已注册模板组装跟读句并合成(**不接受任意文本**);`variant`(路由层 0–7,真正范围由模板 `noun_contexts` 数决定,越界 422)= 指定名词语境序号(性数配对每送对一张牌读一句),不传 = 本词自己的语境;请求的模板必须等于词里的 `scene_template`(词里没设则不限);动词模板有固定句式表 `verb_sentences` |
| `/api/admin/*` | 见 §16;单词页只用 `GET /admin/points`,`scene-lab` 只用 `GET /admin/words/{id}` |
| `WS /ws/chat/{session_id}` | 骨架,见 §3 |

场景语音限速:同一 IP 每 60 秒 ≤ 30 次(429);缓存 `data/word_audio/scene_<sha256>.(wav|mp3)`。TTS 的 provider 参数:`Literal["piper","google","edge"]`(场景接口)/ 路由内白名单(单词接口)。
统一错误格式:`HTTPException(status, "中文错误信息")`,前端 `errMsg()` 读 `detail`(string 或 `[{msg}]`)或 `message`;响应体用 `{status,data}` 或扁平对象均可,前端 `req()` 用 `j.data || j` 兼容。**新增接口遵循这套约定;改响应字段时同步检查前端 `audioUrl()/fillMe()/addAI()`。**
场景点选流程**不使用录音判分**;旧 `POST /api/scene/check`、`GET /api/tts` 已删除;前端场景模板只从 `/api/scene/templates` 加载,不含内置副本或回退,失败显示错误并允许退出。

## 19. 场景演练(前端 scene.* / roam/*;只支持 3D,没有 2D 回退,没有录音判分)
- **分工**:`scene.js` 只建 DOM 层(台词气泡 `.sc-dialogue-bubble`、热点按钮 `.sc-shelf.proj .sc-item`、人物点击锚点 `.sc-person`、篮子 `.sc-basket`、选词面板——`word_choice` 用的非 `.proj` 的 `.sc-shelf`,flex 排布);**画面全部由 `stage3d.js`(点选模板)或 `roam/*`(走路版)渲染进 canvas**。`scene.css` 只剩这些 DOM 样式。对外 `window.Scene = {canPlay, play, emojiOf, whyNot, chooseTemplate, maskPtInZh}`,`Scene.play(w, ctx)` 返回 `{root,done,cancel}`;`ctx` 字段(`mode` preview|assessment、`speak`、`speakLine`、`speakSceneSentence`、`pool`、`evaluateChoice`、`image:{src,open}`、`extra`、`onExit`、`cancelAudio`…)见 `scene.js` 文件头注释。`scene.js` 不依赖 words.js 全局。
- **3D 必须成功**:`loadStage3D` 失败 / `create()` 返回 null / 渲染上下文丢失 ⇒ `showStageError` 错误卡 + 退出按钮,`alive=false` 让主循环以 CANCEL 退出。**用户已明确不要 2D,别加回 `?stage=2d`、localStorage `stage3d` 开关、SVG 人物、街道/商店背景、`.template-*` 样式、`walk_me`/`stop_walk` 特效,也别加回跟读/录音作答。**
- **预习**:预习页默认是词列表,每个 `Scene.canPlay(w)` 的词有「🎬 预习场景」按钮;场景里「📋 看单词列表」退回;预习不评分不写进度。**周日首页的"只看列表"仍直接进列表。**
- **正式测验**:仅第 1 轮、`kind` 为 `new`/`review`、`canUseAssessmentScene(w)`(`scene_confirmed===true`、`scene_ok===true`、`pos` 是名词/形容词/动词、`Scene.canPlay`)的词,在原题前多一次场景(`sceneSeen` 保证每词一次;`weekly`/`extra` 不加;错词重测不再来)。场景走完或"跳过场景"都回到**当前词原测试**,不调用 `next()`。不带场景字段的旧词一律跳过。
- **场景判分**:`evaluateSceneChoice` → `POST /words/scene/evaluate`:`attempts++`、答错 `markMissed(w)`(影响原题答对后的 `hard`)、答对按 `earned/round_score` 更新积分栏;**提交失败(抛错)不计错、可重试**;场景不单独结算进度,也不代替原题。只有 `word_choice` 与走路版"抓取答案 / 性数配对整局"才提交;点人物、点错地点不发请求。
- **台词与泄露保护**:任何要显示/朗读的固定葡语,若整词命中目标词(含形容词四词形)→ 换成 `______` 并不朗读;热点标签撞词只留图标;含 `{blank}` 的台词不朗读;测验里中文释义含葡语词形(如 `casa(casas)`)用 `maskPtInZh` 换成 `***`(预习/结果卡不用藏);只有场景字段已确认且 `gender` 为 m/f 时才加不定冠词。
- **词字段**:`emoji,pos,gender,number,scene_ok,scene_confirmed,scene_template,scene_noun,scene_zone` + 形容词四词形。不规则变化必须逐项人工审核;不变化的形式可重复(但不能玩性数配对);抽象形容词不应启用场景。`SCENE_FIELDS` 判断"有没有场景数据"。
- **布局(点选模板用,`stage3d-layouts.js`)**:`LAYOUTS[模板id]={sky,blocks,props,hotspots:{热点id:hot(x,y,z)},cameras:{street?,place?},actors:{me,friend?,helper?},people?}`。**每个点选模板都要有布局,热点 id 与模板 JSON 一一对应**,否则错误卡。**现在只有 `verb_persuade` 还走点选**,其余老布局(`LAYOUTS.find` 等)已无人用,可删。手机竖屏约只看得到镜头中心 ±3.5 米,热点间留 ≥2.3 米;调位置用 `?debug=1` 拖视角抄读数。
- **模型**:`models/<路径>.glb`(路径不带扩展名),按包围盒高度 `h`/宽度 `w` 自动缩放、居中、底部贴地;默认 `rotY=0`(正面朝镜头);没文件用 `fb`(`PARTS.*` 兜底几何体),控制台 `console.info` 列缺失。分类目录:`characters/ people/ street/ shop/ room/ park/ beach/ magic/ roam/`。**要新增 3D 模型时回复里给清单**:相对 `models/` 的文件名、新增还是复用、外观/高度/朝向、面数建议、通用要求(单个 `.glb`、贴图内嵌、不需要骨骼动画、风格与现有低多边形一致)。
- **改场景/新增热点三处同步**:模板 JSON ↔ `LAYOUTS`(点选)或 `ARENAS`(走路版) ↔ 必要时 `PARTS` 兜底。动画只用 CSS `transform/opacity` 并支持 `prefers-reduced-motion`;词和中文一律 `textContent`。
- **bundle 限制**:`js/vendor/three-bundle.js` 只导出约 30 个名字,**没有** `TorusGeometry/CircleGeometry/RingGeometry/Vector2/DoubleSide`;圆环用 `arena.js` 的 `makeRing()`。用别的类先查 bundle 导出。
- **选模板**(`chooseTemplate`):词里 `scene_template` 有值**就照办**(模板不存在 / 词性不符 / 变形工坊没有这个词的效果 / 性数配对四词形有重复 → 抛错页,**不静默降级**)。没设:按词性在**非 `manualOnly`** 的已发布模板里选——名词/动词用 `templateCursor` 轮换(`foodOnly` 模板只给食物;非单词形不定式的动词只进 `verbForms:'any'` 的模板);没有场景数据的词退回 `shop`;形容词走 `chooseAdjectiveTemplate`(§21)。
- `scene-lab.html?template=<id>&word=<id>[&zone=][&debug]`:场景模板调试页(复用已发布模板,测验预览不提交判分;`?debug` 有「效果调试面板」并暴露 `window.__roam`)。
- 本地存储:`roam_autograb`('0' 关自动抓取)、`roam_dpr`(自适应画质:帧时间 >20/28ms 把 DPR 降到 1.5/1,**一次变慢会被记住**,可清)。

### 走路版(roam,`tpl.roam === true`;31/32 个模板)
- **玩法**:全屏横屏,浮动摇杆+跳+抓,小人在 3D 场地里找答案;**一次抓取 = 一次 `ctx.evaluateChoice`**(与 `word_choice` 判分一致);已答对(`pad.scored`)的物件掉下去后再抓不再请求;抓错只给气泡反馈。自动抓取**默认开**(速度 <0.5 m/s、物件在面前 60° 内、站满 0.8 秒,读条可反悔,暂停菜单可切)。
- **节点**:`roam_choice`(`options` 必须 correct=1/distractors=3、`grab_range` 0.8–3、`hints{preview_glow_s,arrow_after_wrong,fast_track_s}`、`wrong_feedback{pt,zh}`、`on_correct`→`roam_deliver`)和 `roam_deliver`;性数配对模板改用一个 `roam_match` 节点。校验在 `scene_registry.py`:`ROAM_NODE_TYPES={roam_choice,roam_deliver,roam_match}`;roam 模板不允许 `hotspot_choice`/`actor_tap`/`word_choice`;模板要 `roam:true` + `arena`(= `js/roam/arena.js` 的 `ARENAS` 键);`applies_to.pos` 只能是 `["noun"]`/`["verb"]`/`["adjective"]` 之一。
- **接口**:`roam/index.js` 的 `create()` 返回与 stage3d 兼容的对象(`follow/enter/talk/cheer/cameraTo/dispose/fail`)+ `run(opts)`(答对时 resolve)+ `deliver()`,新增 `stage.showReward(emoji)`/`stage.playFx(fx, {dur,hold})`;复用 `stage3d.js` 导出的 `shared3d`(渲染器单例、`loadModel`、`normalize`、`blobShadow`…)和 `claimActive/releaseActive`(WebGL 上下文丢失走 `fail()` → 错误卡)。
- **文件**:`arena.js`(场地数据 `ARENAS` + 构建;缺模型用兜底几何体)、`physics.js`(固定步长 1/60;球 vs AABB、弹跳垫、旋转杆击退;手感参数都在 `PHYS`)、`input.js`(Pointer Events 摇杆/按钮/视角拖动 + 键盘 WASD、空格、E 调试)、`index.js`(渲染循环、程序动画、跟随镜头、物件与标签、HUD、抓取/搬运/交付状态机)、`effects.js`(形容词变形/奖励效果引擎)。
- **`ARENAS` 现有 15 个场地**:`roam_party`(跑酷岛)、`treasure_island`、`street_find`、`shop_inside`、`restaurant_inside`(`restaurant`/`verb_restaurant` 共用)、`park`、`magic_room`、`home_house`、`classroom`(`verb_school`/`verb_note` 共用)、`study_room`、`schoolyard`(带 `people`)、`adj_plaza`/`adj_stage`(形容词物体系/人物系,`variants` 4 组摆件,**只显示本词名词语境那组**,`setVariant(i)`;`adj_stage` 摆件是人物,复数 3 人)、`adj_agree_hall`/`adj_agree_stage`(`stalls` 4 个展台同时可见,各带 `ring`)。一个场地可被多个模板共用;`deliverProp` 指交付成功时弹一下的道具 id(如 `chest`、`cauldron`)。
- **场地通用字段**:`tiles`(地面,`flat:true` 纯色盒子,`rp` 重生点)、`decor`(路/草坪;`solid:true` 才有碰撞;**墙用 `wall:true`**:单面平面,只从屋内看得见,镜头在墙外不会被挡,碰撞靠 `collide` 盒,不要用实心长方体当墙)、`props`(`solid` 碰撞盒,`fb` 可写 PARTS 键或 fallbackProp 参数)、`slots`(正好 4 个,`randomTarget:false` 表示正确答案不会被随机放到这里)、`seaY:null`(无海面)、`slotPedestal:false`、`seaColor`;室内用 `roomShell()`。新场地流程:加 `ARENAS` 项 + 模板 JSON(`roam:true`、`arena`)+ 必要时补 `PARTS`。
- **跑酷岛 v1**:出生台 → 中枢(交付环+朋友)→ N(三个弹跳垫上 2m 高台)、E(2.6m 宽桥+旋转杆)两个障碍岛,S、A 两个平地岛;四个底座按 `word.id*1000+YYYYMMDD` 种子洗牌。掉下去(y<−6)黑屏 0.5 秒回最近重生点,搬运中的物件回原底座。旋转杆参数(3.6m / 0.8 rad/s / 高 0.4m)是实测的(随便跑约 6 成能过),**改旋转杆或桥的参数要重新验证通过率**。传送带/移动平台/空中岛未做。
- **资源**(缺文件静默退化):模型 `models/roam/{player,platform_tile,bounce_pad,spinner,pedestal,delivery_ring}.glb`(+可选 `cloud`);音效 `sounds/roam/{jump,land,bounce,grab,wrong,deliver,respawn,bump}.wav` + 变形工坊 `fx_*.wav`、`machine.wav`(程序合成,`sounds/gen_fx_sounds.py`,可换同名 wav)。`player.glb` 蛋形静态网格(动画全程序化,可选节点 `HandL/HandR`)。

## 20. 场景模板(`scenes/*.json`,`scene_registry` 启动时加载;**改完要重启后端**)
**目标结构**:每个场景有 3 次有意义的操作——点人物问线索 → 选地点(探索)→ 选词(评判);走路版是"走路抓取 → 交付"。只有最后的评判动作会提交 `/words/scene/evaluate`。无效/缺失模板只记日志,不阻止服务启动;`validate_scenes.py` 校验全部模板与"固定文本撞词"。

**当前 32 个已发布模板**(31 个 roam,只有手动的 `verb_persuade` 是点选):

| 类别 | 模板(arena) | 备注 |
|---|---|---|
| 名词 | `shop`(shop_inside) `restaurant`(restaurant_inside,`foodOnly`) `find`(street_find) `find_room`(study_room) | 自动轮换。`shop` 四货架区 fruit/bakery/drinks/digital,**正确答案放在词的 `scene_zone` 区**(没配置随机,digital 不参与随机) |
| 名词 | `group_photo`(schoolyard) `roam_party`(roam_party) | `manualOnly`(不自动轮换) |
| 名词·奖励关 | `reward_noun_grow`(street_find) `reward_noun_boom`(roam_party) `reward_noun_magic`(shop_inside) | 自动轮换;交付后在交付环上方摆这个词自己的 emoji 当奖品 |
| 动词 | `verb_home`(home_house) `verb_school`(classroom) `verb_note`(classroom,`verbForms:any`) `verb_magic`(magic_room,`verbForms:any`) `verb_park`(park) `verb_restaurant`(restaurant_inside) `verb_treasure`(treasure_island,`verbForms:any`) | 自动轮换;句式 `Vamos ____ / quero ____` 只有单个词的不定式读得通,变位/过去分词/反身只进 `verbForms:any` 的模板 |
| 动词·奖励关 | `reward_verb_grow`(park) `reward_verb_boom`(treasure_island) `reward_verb_magic`(magic_room) | `verbForms:any`;奖品是 🏆 |
| 动词 | `verb_persuade`(无 arena,`roomOnly`,`manualOnly`) | **唯一的点选模板**(足球/冰淇淋/小鸭子),用 `stage3d-layouts.js` |
| 形容词·贴词牌 | `describe_object`(adj_plaza) `describe_person`(adj_stage) | 无变形效果,抽象词(bom、bonito、difícil…)走这里 |
| 形容词·变形工坊 | `adj_workshop_object`(adj_plaza) `adj_workshop_person`(adj_stage) | 带 `effects` 效果表 |
| 形容词·性数配对 | `adj_agree_object`(adj_agree_hall) `adj_agree_person`(adj_agree_stage) | `manualOnly`,四词形必须互不相同 |
| 形容词·奖励关 | `adj_reward_{grow,boom,magic}_{object,person}`(object→adj_plaza,person→adj_stage) | 6 个;所有形容词都能用 |

- **共用标志**:`roam`、`manualOnly`(不参与自动轮换,只在词里明确选了才用)、`foodOnly`、`adjectiveOnly`、`roomOnly`、`verbForms`、`carrier`(预习里的携带物 emoji)、`helperName`、`actors/cast/locations/hotspots`。
- **形容词 6+6 个模板的共用骨架**(服务端 `scene_registry.CONTEXT_SCENES` 含 12 个):`roam:true`、`adjectiveOnly:true`、`applies_to.pos=["adjective"]`、各带 4 个 `noun_contexts`(顺序 **阳单 / 阴单 / 阳复 / 阴复**)、`context_pick:"by_word_id"`、**`adjective_family` 必填**(`object` 物体系 / `person` 人物系)。人物系的 `noun_contexts` 是 rapaz / rapariga / rapazes / raparigas。词里的名词语境 `nounCtx` 按 `word.id` 取(管理端 `scene_noun` 可指定);`roam_choice` 的 `variant_by:"noun_context"` 让 arena 只显示这一组摆件;线索卡 = 名词图标+名词中文+「找"xx"的词牌」。`variant_by` 只允许在形容词模板里出现。`GET /scene/line-audio` 的 `variant` 就是 `noun_contexts` 索引。

### 20.1 变形工坊(`adj_workshop_*`)
- 仍是一次抓取一次 `evaluateChoice`(`selected_word_id == word_id`)。抓对 → 词牌飞到展台,物体按词义变化并保持到 `thanks`;**抓错 → 词牌也自动飞到展台,按"错词"的意思变一下(约 1.6 秒)再复位,只是反馈,不影响计分和重试**;预习收尾演反义词;**测验保留中文线索**。模板必须带 `effects`,其 `roam_choice` 必须 `fx:true`。
- **`effects` 效果表**(写在模板 JSON,不进数据库、不用改管理端):键 = 形容词**词典原形**(取词的 `SceneAdjMS`,小写;前端比较时去重音)。单条 `{kind, family, opposite?, conflicts?, burst?, …参数}`,**9 种 kind**(`scene_registry.EFFECT_PARAMS` ↔ 前端 `effects.js` 的 `EFFECT_KINDS`):`scale`(`to` 三轴 0.3–2.5)/`tint`(`color` #rrggbb、`mix` 0–1、`shine`)/`aura`(`tint`、`particles` ≤4 字符、`drift` up|down)/`dirt`(`clean`)/`age`(`fresh`)/`weight`(`light`)/`emote`(`icon`、`motion` hop|droop|sway|shake|**jitter**、`tint`)/`speed`(`fast`)/**`tag`**(头顶价签,`text` ≤8 字符、`tint`)。`family` ≤16 字符;`burst`(≤4 字符 emoji 迸发,任何效果可叠,奖励关用);`opposite` 必须在表里且**互为反义**;`conflicts`(视觉上也说得通的词,如 grande/alto)必须在表里,**永远不会同时出现在同一题的选项里**。校验 `scene_registry.validate_effects`。
- **现状**:物体系 **36 词**(grande tanto pequeno alto baixo comprido curto vermelho azul amarelo verde branco preto rosa quente frio sujo limpo novo velho roxo laranja castanho cinzento dourado prateado claro escuro largo estreito pesado leve doce salgado barato caro),人物系 **12 词**(feliz triste cansado zangado rápido lento grande pequeno alto baixo contente agitado)。`weight`/`tag`/`jitter` 都已有词在用。
- **新增 / 改效果 = 同步**:新词只改 json 的 `effects`(物体系/人物系各一张表,同一个词可两边都有);**新增 `kind` 要三处同步**:`scene_registry.EFFECT_PARAMS`、前端 `roam/effects.js` 的 `EFFECT_KINDS` 与对应 `case`(以及该 kind 的效果音名 `sfxOf`)、必要时 `arena.js`。新增效果词时前端 `scene.js` 的 `GENERIC_ADJ`(干扰项兜底词表,每项 `[阳单,阴单,阳复,阴复]`)也要补,否则它的反义词在预习收尾没有词形可显示。
- **效果引擎要点**:变体摆件登记时**克隆材质并记录原色/原缩放**(GLB 共享材质,不克隆 `tint` 会串到别的摆件);`arena.variantTargets()` 是当前显示的那组摆件,配对用 `arena.stallTargets(i)`;复位后缩放/颜色必须回到原样、重复触发不叠加;粒子是 emoji 精灵,同屏 ≤ `MAX_PARTICLES`(30),效果结束必须销毁;没有 `pad.fx` 时引擎完全不运行;人物表情是头顶气泡 emoji,不改脸。`createEffects` 可传 `hooks`(`sfx/sfxDelay/onStart/onEnd`),`roam/index.js` 用它播效果音并驱动场地里的变形机(`arena.machineRun`;`ARENAS.adj_plaza/adj_stage` 的 `machine` 字段,只在模板带 `effects` 时才建)。
- **选项构造**(`scene.js buildOptions` 的变形工坊分支,拿不到就逐级降级):正确 1 + **反义词 1** + **不同 `family` 的带效果词 2**(排除 `conflicts`)→ 不够再用旧逻辑补;同形去重(`sameKey`),不变形容词不能让两个选项同形。⚠️ 副作用:`GENERIC_ADJ` 含效果表里的全部词,贴词牌版 `describe_*` 的干扰项也会出现它们,且没有 `conflicts` 过滤(grande 配 comprido 这类理论上可能出现)。

### 20.2 性数配对(`adj_agree_*`,`manualOnly`)
- 节点 `roam_match`(只允许出现在 `AGREE_SCENES`;整个模板只能有 1 个,**不能再有** `roam_choice`/`roam_deliver`;`stalls` 必须是 `"noun_contexts"`,`pass_max_errors` 0–3,`grab_range` 0.8–3,必须带 `wrong_feedback{pt,zh}` 和 `on_complete`)。玩法:同一形容词的 4 个词形牌送到 4 个名词展台,牌的词形序号 == 展台语境序号才算送对;送错弹回、错误+1;掉下场地不计错;**4 张全送对才通关**。**整局只判一次**:`errors ≤ pass_max_errors`(默认 1)→ `evaluateChoice(w, w.id)`,否则 `evaluateChoice(w, -1)`。每送对一张读整句 `sentence-audio?…&variant=i`(模板 `sentence_pt:"{art} {noun} {adj}"`,文本由服务端 `scene_registry.adjective_sentence` 组装)。**四个词形必须互不相同**(阴阳同形/单复数同形的 grande、verde、feliz 等不行),否则选模板阶段抛错页,不降级。60 秒"快速通道"(传送到最近的未放词牌)沿用走路引擎。

### 20.3 奖励关(`reward_*` / `adj_reward_*`,12 个)
- **思路**:奖励型场景**与词义无关**——抓对词牌/物件后,从模板 `reward.effects`(1~6 个效果,格式同变形工坊的单条效果,但**不允许 `opposite/conflicts`**)里**随机播一个**炫酷效果(`grow` 巨大化 / `boom` 庆典 / `magic` 魔法变色),所有词都能用。`roam_choice` **不能带 `fx`**(抓错不变形,奖励只在抓对之后);`NOUN_VERB_REWARD_SCENES` 必须 `roam:true`(奖励在 `roam_deliver` 之后播)。校验:`scene_registry.validate_reward`,且 `reward` 字段只允许出现在 `REWARD_SCENES = ADJECTIVE_REWARD_SCENES ∪ NOUN_VERB_REWARD_SCENES`。
- 名词/动词的奖励关:交付环上方摆一个奖品(名词 = 这个词自己的 emoji,没有则 🎁;动词 = 🏆),奖励效果作用在奖品上(`stage.showReward` + `stage.playFx(...,{dur:2.8,hold:true})`)。形容词的奖励关:效果作用在名词语境摆件/人物上。
- 新增奖励主题 = 新模板 JSON + 把 id 加进 `scene_registry` 对应集合(`CONTEXT_SCENES`/`ADJECTIVE_REWARD_SCENES`/`NOUN_VERB_REWARD_SCENES`)+ 前端 `scene.js` 的 `ADJECTIVE_TEMPLATES`(形容词时)。

### 20.4 自动选形容词模板(`scene.js chooseAdjectiveTemplate`,词里没设 `scene_template` 时)
① 管理端 `scene_noun` 是人物名词 → 人物系,否则物体系;② 该系变形工坊效果表里有这个词 → **变形工坊**;③' 效果表里没有的词 → 该系的**奖励关** `adj_reward_*`(按**词 id 取模固定主题**,同一个词永远同一个模板);③ 没配 `scene_noun` 且只有人物系有效果(feliz、rápido…)→ 人物系变形工坊;④ 没有奖励关模板(后端还没部署)才退回该系的贴词牌版 `describe_*`。`manualOnly` 的性数配对不参加。**管理端明确选了模板 = 一律照办**(想强制贴词牌版就在管理端选 `describe_*`);手动选了变形工坊但效果表里没有这个词 → 抛错页。`window.Scene.chooseTemplate` 只读导出给自动化测试用。
- **让词能玩的数据前置**:效果表里的词要先在 WordMemorizer 启用:`ScenePos=adjective` + `scene_ok` + `scene_confirmed` + **四词形填全**;**不要给它们设 `scene_template`**(留空走自动选择);人物类词可配 `scene_noun`。**词库里同一个词常有多条记录(vermelho 8 条、feliz 9 条),每条要单独启用**。用 `python tools/adjective_enable_report.py [--db <库>] [--csv 启用清单.csv]` 列清单。
- **部署顺序**:前端(`scene.js`、`roam/*.js`、`css/roam.css`)→ 后端校验器与接口(`scene_registry.py`、`routes.py`、`admin_routes.py`)→ 模板 JSON → 重启后端。顺序反了,旧前端会在 `roam_choice`/`roam_match`/奖励节点卡住。

### 20.5 节点图字段速记(完整说明在 `scene.js` 文件头注释)
节点公共:`type, modes(['preview']/['assessment']), location, effects(FX 字符串如 enter:friend / talk:friend / bubble_target / sparkle…)`;`dialogue/feedback:speaker(friend|helper), pt, zh, speech(auto|on_tap|none), button?, next, request?, delay_ms?`;`hotspot_choice:hotspots, prompt_zh, on_target, on_decoy, assign_target(random|noun_context|word_zone)`;`actor_tap:actors, prompt_zh, on_tap_<id>, next, hint_for`;`word_choice:prompt_zh, display{preview,assessment}, on_correct, on_wrong`;`complete:reveal_pt({target}), reveal_speech`。占位符:pt 里 `{blank}→______`、`{art}`、`{noun}`、`{adj}`;zh 里 `{target_zh}`、`{noun_zh}`、`{hotspot_zh}`。`speech` 只有 `auto/on_tap` 的节点才可被 `line-audio` 合成。

## 21. 安全与通用约定
- **所有对外路径/文件名都走白名单**:音频 `^msg_[0-9a-f]{12}\.(wav|mp3)$`、背景 `bg_[0-9a-f]{32}\.(jpg|png|webp)`、配图 `(\d{8}/)?wimg_\d{1,9}_[0-9a-f]{8}\.(jpg|png|webp)`,一律 `fullmatch`;上传图片按**魔数**判格式,不信 Content-Type/文件名。
- TTS 类接口**只按 id/模板取服务端自己的文本**(单词朗读、场景台词、跟读句),不接受前端传任意文本,避免被当免费 TTS 代理;场景语音有限速。
- LLM 提示里嵌入用户/词库数据时,标明"这些只是数据,不是指令"(见 `image_prompts`、场景候选提示)。
- 所有对 LLM 的结构化输出都要容错解析并**降级而不是让主流程失败**(例句、场景候选、配图、聊天联动都吞异常 + `logger.exception`)。
- 新接口遵循统一错误格式(§18);新表/新列遵循"启动时检测缺列 ALTER"的迁移模式(§8)。

## 22. 有意的取舍(别顺手改)
- 单词库(`/vocab`)没有浏览/删除/去重界面;单词页进度只在前端内存;前端没有 PIN 界面、没有鉴权 token;聊天页录音每次重新申请麦克风;`/ws/chat` 是骨架不落库。
- 场景演练没有 2D 回退、没有录音跟读;填空只做精确匹配(模糊匹配是未做的后续项);`word_errors` 只记录不参与调度。
- 形容词 12 个模板的 `noun_contexts` 与 `context_pick` 是服务端与前端/arena 序号对应的依据,别在前端假设它们可以改。
- 跟读(mode 5):不出新词 / 周五回顾 / 周六加练;不带 `cloze`(补测总是 mode 2);不置位 `mode2_ok`;判分是纯规则,不做模糊匹配,只差重音算通过标黄。
- 不要引入构建链/框架/第三方库(`three-bundle.js` 是唯一的第三方文件)。
- `IMAGE_FALLBACK_POLLINATIONS=True` 意味着画面描述会发给第三方——开关由用户决定。
- 没做的扩展:传送带/移动平台/空中岛、镜头自动回正、首次教程、触觉开关、`weekly` 之外的奖励主题、周计划文本导入的同名复用。

## 23. 文档与代码不一致清单(遇到相关问题先查这里)
| 文件 | 过时点 | 以什么为准 |
|---|---|---|
| `portuguese-tutor-server/README.md` | 仍写 `.env`、Grok、只有 `/chat/*`、4 个文件的目录结构 | 本文 §1、§3、§18 |
| `docs/word-scheduling-algorithm.md` | 参数表里还有 `PREVIEW_MAX=8`;未反映"预习承诺(pinned_new)"与"周五预习=周六计划" | `word_planner.py` + 本文 §5、§6 |
| `每周日操作清单.md` | Lychee 配置(`LYCHEE_*`)已被 word-pic-audio 取代;仍说"gen_examples 单独手动跑" | 本文 §15 |
| `portuguese-tutor-web/AGENTS.md` | `fetchToday` mode 白名单写 `[1,2,3]`(实际 `[1,2,3,4]`);"目前只有点选模板 verb_persuade 在用 stage3d"是对的 | 代码 |
| `tools/scene_registry.py` | 与 `memory/scene_registry.py` 有 4 行差异的旧拷贝 | `memory/scene_registry.py` |
| `deploy.md` | 只是几条运维命令,`f5-tts_infer-gradio` 属于 C# 端发音/语音合成环境 | — |

## 24. 修 bug 的方法(项目里验证过有效)
1. **先看数据再下结论**:拷一份 `sessions.db` → 用服务端真实模块(`word_planner`/`word_progress_manager`/`word_source`)在副本上复现(设 `PT_SQLITE_PATH` 指向副本、`PT_SQLITE_WAL=0`);`word_routes` 依赖 faster_whisper,容器里没有时用 `unittest.mock.MagicMock` 桩掉 `faster_whisper/torch/...` 再 import。
2. **对照时间线**:`word_task_done.completed_at`(服务器本地时间)与 zip 内各文件修改时间,判断"当时线上跑的是不是新代码"。例:2026-10-30 周五 19:53 完成任务,但 `_plan_saturday` 相关代码 21:29~21:49 才改好 → 周六计划没生成 → 周五预习为空(已用 `/today` 自愈补生成修复)。
3. **改动小而可回退**:开关放 `config.py`/`word_planner` 顶部常量;迁移走"检测缺列 ALTER";新增字段三处同步(服务端模型 / wm_manager 字典 / C# DTO);改完保持 CRLF 并 `py_compile`。