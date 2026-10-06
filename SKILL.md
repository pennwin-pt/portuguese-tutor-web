---
name: "pt-tutor-app"
description: 帮 Peng Wang 开发/修改「葡语陪练」全栈项目(前端:index.html/index.css/touch-protection.css/index.js + 单词任务页 words.html/words.css/words.js,原生JS无构建;后端:FastAPI+SQLite+Faster-Whisper+Piper/Google/Edge/StreamElements TTS+Gemini/Groq/Ollama;配套的 WordMemorizer C# WinForms 管理端经 /api/admin/* 读写同一个 sessions.db)时必须使用此skill。只要用户提到"葡语陪练"、"WordMemorizer"、管理端、周计划/生词本/积分/Admin API/数据库合并、粘贴这个项目任意一端的代码(含 C# 的 AdminApiClient/FormMain/FormAddWeek/FormNewWords 等),或要求修改语音对话/ASR/TTS音色/LLM切换/智能体绑定/角色人设/主题背景/历史记录/单词拆解/单词库/单词任务/复习调度/周六加练/掌握规则等任何功能,先读本skill再动手,不要让用户重新粘贴源文件或重新解释项目背景与接口约定。前后端经常一起改,改动涉及接口字段时两端都要检查。
---

# 葡语陪练 · 全栈项目协作规则

语音进-语音出的欧洲葡萄牙语(pt-PT)陪练 APP,另带一个「单词任务」页(间隔重复复习)。**前端**纯静态原生 JS(无构建工具/无框架);
**后端** FastAPI,聊天流水线是 ASR(Faster-Whisper)→ 记忆(SQLite)→ LLM(Gemini/Groq/Ollama,可切换+自动降级)→ TTS(Piper/谷歌/Edge/StreamElements)。
改动直接编辑源文件即可上线,**不要给前端引入构建链/框架,不要给后端引入 ORM/新数据库,除非用户明确要求。**
UI 文案里"用户名"已经改叫**智能体**(绑定智能体 = 绑定用户名),代码里变量仍叫 `username`。
另有配套的 **WordMemorizer**(C# WinForms 管理端,.NET Framework 4.7.2):管周计划 / 生词本 / 考试记录 / 积分。**它不直连数据库**,全部走服务端 `/api/admin/*`,数据与陪练共用同一个 `sessions.db`(见"WordMemorizer 管理端与 Admin API"一节)。

## 文件地图
```
前端(部署后在 portuguese-tutor-web/ 下):
  index.html / css/index.css / css/touch-protection.css / js/index.js      聊天页
  words.html / css/words.css / js/words.js                                单词任务页(复用 index.css;聊天页 header 的 📚 进入)
  sounds/success.wav, sounds/fail.wav                                      单词页答对/答错音效(缺文件静默不播)
后端:
  main.py                  FastAPI入口,挂聊天/用户/单词/管理 API 路由 + startup 初始化各 manager(SQLite)
  run.py / start_server.bat  PyCharm调试入口 / Windows启动脚本
  config.py                全局配置,读.env(ASR/LLM/TTS/WORD_*/SQLITE_PATH/CORS)
  api/routes.py            聊天核心:/chat/*,/history,/translate,/explain,/breakdown,/regenerate_audio,/audio,/session,/message,/vocab
  api/user_routes.py       /user/* 绑定、主题、背景、音色(tts)、角色人设(persona),/background/{name}
  api/word_routes.py       /words/* 今日任务(动态调度)/语音评判/完成结算/记错题/标记已掌握/单词朗读
  core/asr_engine.py       Faster-Whisper单例懒加载
  core/llm_engine.py       Gemini/Groq/Ollama工厂 + FallbackEngine自动降级
  core/tts_engine.py       Piper子进程 + 谷歌/Edge/StreamElements在线音源(带缓存) + synthesize_any 统一入口
  memory/session_manager.py       对话历史(messages表)
  memory/user_manager.py          智能体资料(users表:PIN/背景/主题/tts/persona)
  memory/vocab_manager.py         旧 vocab 表查询接口
  memory/newword_manager.py       聊天拆词后加生词:写入 NewWords(与 WordMemorizer 共用服务端库)
  memory/word_source.py           单词任务数据源:只读服务端 SQLite 中的 Words / WeeklyPlans(WORD_DB_PATH 默认与 SQLITE_PATH 相同)
  memory/wm_manager.py            WordMemorizer 六张管理表的建表与读写(与陪练共用 sessions.db)
  api/admin_routes.py             WordMemorizer 管理 API:/api/admin/*(23 个接口,契约见下文)
  memory/wm_calendar.py           WordMemorizer 的日期/周/批次号工具(周日起算、时间归一化),wm_manager 用
  memory/word_planner.py          ★调度算法(纯函数,不碰数据库):Leitner盒子+工作日间隔+周六加练;另有 pick_chat_focus(聊天联动选目标词)
  memory/word_progress_manager.py ★进度存储:word_progress/word_week/word_daily_plan/word_outcomes 四张表;另有 get_latest_week_ids / credit_chat_use(聊天加分)
  memory/pt_text.py               ★葡语文本公共纯函数(P2):norm_pt / strip_parens / find_words(整词匹配);word_routes._norm_pt 即从这里导入
  memory/chat_words.py            ★聊天联动异步薄封装(P2):pick_focus / detect_and_credit,所有异常吞掉并记日志
  memory/word_task_manager.py     每日"是否完成"记录(word_task_done)
  memory/word_error_manager.py    错词事件流(word_errors)
  memory/word_example_manager.py  ★生成例句缓存(P4):word_examples/word_example_use 两张表 + norm_sentence/pick_example 轮换
  prompts/tutor_prompt.py   教练人设(A1难度,pt-PT)+ build_system_prompt(persona, focus_words=None)
  prompts/helper_prompts.py 中文求助翻译/语法解析/单词拆解提示词
  prompts/word_prompts.py   单词评判提示词(mode1 义项语义 / mode2 葡语是否说对目标词)+ 例句生成提示词 WORD_EXAMPLES_PROMPT,纯JSON输出
  tools/gen_examples.py     ★在用户机器上手动运行:给词批量生成 pt-PT 例句写入 word_examples(见「多例句轮换」一节)
  tools/backup_db.py        SQLite backup API 备份 sessions.db(start_server.bat 每次启动自动跑:每天一份,保留最近 14 份)
  tools/merge_wordmemorizer.py  一次性迁移(旧 WordMemorizer.db → sessions.db),已用完,可归档
  tools/reset_week.py       手动兜底:重置某智能体本周词表 / 当天计划(合库后覆盖或删除周计划时服务端已自动重置)
  tools/test_*.py           各阶段自测脚本(test_wm_admin / test_wm_calendar / test_merge …)
```

## 身份 & 会话模型(前后端共用,改动前必读)
- **方案A:`username` 就是 `session_id`**,没绑定智能体时前端用本机随机 `guestSid`(`localStorage.sid`)。聊天记录、单词库、单词进度全部按 `session_id` 存,不需要额外关联用户表。
- 名称校验正则 **前后端必须完全一致**:`/^[A-Za-z0-9_\u4e00-\u9fa5]{2,20}$/`(前端 `NAME_RE` 在 index.js **和 words.js 各有一份**,后端 `user_manager.USERNAME_RE`,后端用 `fullmatch`)。改正则必须三处同改。
- `users` 表支持可选 PIN(pbkdf2 加盐哈希),但**前端没有 PIN 的 UI**;`/user/bind` 签名里有 `pin`,要做 PIN 功能时绑定弹窗和调用都要补。用户不存在且未设 PIN 时静默创建;已设 PIN 必须传对,否则 401。
- 前端 localStorage 键:`sid`、`username`、`theme`、`tts_<sid>`(每个智能体各自的音源+音色)。index.js 与 words.js 读同一份,**改键名两个 JS 和后端要一起改**。绑定后,主题/音色/人设/背景都会同步到服务器,换设备绑定同名智能体即可恢复。

## 聊天流水线(`/api/chat/audio`、`/api/chat/text` → `_run_turn`)
1. `mode=zh`(中文求助)先用 `ZH2PT_PROMPT` 译成葡语,`user_pt` 才是进入教练历史的葡语;`mode=pt` 时 `user_pt == raw_text`。中文求助模式 ASR 必须显式传 `language="zh"`。
2. 取最近 `LLM_HISTORY_TURNS` 轮历史;**系统提示词 = `build_system_prompt(persona, focus_words)`**,persona 来自 `user_manager.get_persona(session_id)`(游客/没设 = 空串 = 默认 Tuga 老师;读取失败退回默认,不影响聊天);`focus_words` 是聊天联动注入的目标词(见"聊天联动(P2)"一节,无目标词时提示词与原来逐字节相同)。
3. 中文求助模式下,译出的葡语也并行合成一条语音(用户语音条);教练回复再合成。TTS 走 `synthesize_any(text, provider, voice)`,在线音源失败会兜底回 Piper,响应里 `tts_provider_used`/`tts_fallback` 告知实际用了谁。
4. 语音落盘到 `data/replies/`,文件名 `msg_{uuid12hex}.(wav|mp3)`;缓存型在线音源(google/edge/streamelements)只能 **copy**,Piper 临时文件 **move**。
5. `session_manager.add_turn` 原子写入用户+教练两行并返回 `user_row_id`/`ai_row_id`(前端删除一轮靠它)。教练行存 `msg_uid`/`audio_file`;用户行存 `content=user_pt, orig=raw_text`,中文求助模式下还有自己的 `msg_uid`/`audio_file`。
6. 响应体固定用 `audio_url`(不含 base64)。**改响应字段时前端 `audioUrl()`/`fillMe()`/`addAI()` 要同步检查。**
7. `add_turn` 成功之后(失败的轮次不加分),`CHAT_WORD_LINK` 开且有目标词且 `mode=="pt"` 时检测用户用了哪些目标词并加分;响应里**总是**带 `used_words`(见"聊天联动(P2)")。

## 聊天页功能要点
- **长按语音条菜单**:原文 / 翻译中文 / 语法解析 / 拆解单词 / 🔁 重新生成语音 / 🗑 删除这一轮 / 取消。
- **重新生成语音**(`POST /regenerate_audio`,FormData: message_id,tts_provider,tts_voice):`force=True` 跳过在线音源缓存;**新文件名必须每次随机**,不能复用 message_id,否则 URL 不变,浏览器 `<audio>` 会播旧缓存。旧文件合成成功后再删。教练回复和用户译文语音条都走这里,不限 role。
- **删除一轮**(`DELETE /message/{row_id}?session_id=`):连同配对的另一句一起删,清对应音频文件(先过 `_AUDIO_NAME` 白名单)。LLM 记忆读自 messages 表,所以记忆同步去掉。session_id 必须与消息归属一致。
- **历史分页**:`GET /history?session_id=&limit=30&before_id=` 返回 `{messages, has_more}`,用 `row_id` 做游标(不用 OFFSET)。前端先取最近 `HIST_PAGE=30` 条,上滑到顶再按最早一条的 `row_id` 加载更早的。limit 服务端夹在 1–100。
- **绑定智能体弹窗**含:绑定/恢复、音源四选一(本地 Piper/谷歌/Edge/SE)、音色(只有 edge 和 streamelements 有多音色)、角色人设(模板按钮 + ≤300 字文本框,游客禁用)。
- **音色白名单**:前端 `VOICE_OPTIONS` 与后端 `tts_engine.EDGE_VOICES`/`STREAMELEMENTS_VOICES` 必须一致,改一边另一边同步;`/user/{u}/tts` 对非法音源/音色直接 422,不静默丢弃。
- **角色人设**:`PERSONA_MAX=300`,前端 `PERSONA_MAX` 与后端 `user_manager.PERSONA_MAX` 一致;`clean_persona` 去控制字符和 `<>`(人设包在 `<persona>` 标签里拼进系统提示词,防标签注入);超长直接 422 不静默截断;空串=清除。每轮对话都会带上人设,所以要限长省 token。
- **用词提示**:`/chat/*` 响应的 `used_words` 非空时,`index.js` 在 `addAI(d)` 之后弹 toast「✅ 用到了:xxx」,与 `tts_fallback` 的提示合并成一条(`toast` 一次只显示一条;内部用 `textContent`,不要改成 `innerHTML`)。重新生成语音那处的 `tts_fallback` 提示是另一个函数,不动。

## 聊天联动(P2)
- **做什么**:教练聊天时自然带入用户最弱的几个词;用户在对话里用到了,该词熟练度加一点。开关 `CHAT_WORD_LINK`(默认开;`.env` 写 `CHAT_WORD_LINK=0` 并重启即可关闭,不用改代码);`CHAT_WORD_N`(每轮最多给教练几个目标词,默认 5)。这两项在 `config.py`,走环境变量。
- **目标词**:`word_planner.pick_chat_focus(progress, week_ids, n)`(纯函数)——未掌握且最弱的词(`lapses` 降序 → 上次 `again` 优先 → `hard_streak` 降序 → `box` 升序 → `word_id`)+ 最多 `CHAT_FOCUS_NEW`(2)个本周还没进入进度表的新词,共 ≤ `CHAT_WORD_N`。本周词表来自 `word_progress_manager.get_latest_week_ids`(`word_week` 里 `week_start` 最大的那周;`week_start` 是周计划起始日即周日,不是周一)。
- **注入**:`build_system_prompt(persona, focus_words)`;`_FOCUS_SECTION` 让教练每轮最多自然带入 1~2 个词,不改人设/A1/简短/`Correção:` 等规则;词包在 `<focus_words>` 标签里当数据(清洗:只留字符串、去 `<>` 和换行、截断 30 字符、最多 5 个)。无目标词时提示词与改动前逐字节相同。**提示词每轮多约 100~150 token**,嫌贵就调小 `CHAT_WORD_N` 或压缩 `_FOCUS_SECTION`。
- **检测**:`chat_words.detect_and_credit`——仅 `mode == "pt"`;`pt_text.find_words` 整词/整短语匹配(不做词形变化/模糊,`casas` 不命中 `casa`);目标词去括号、按 `/,;` 拆变体,去空格后少于 3 个字母的不参与;排除教练**上一句**里已出现的词(防鹦鹉学舌)。只检测当前注入的目标词。
- **加分**:`word_progress_manager.credit_chat_use`——每词每天最多生效一次(`last_used_on == today` 跳过);没有进度行或已掌握的跳过;只有 `box <= 2` 才 `+1`(**封顶 3,聊天绝不让词毕业**,毕业只能靠单词任务测试);`due_date/lapses/streak/last_outcome/mode2_ok/mastered` 一律不动。`used_count`/`last_used_on` 每次生效都记(box ≥ 3 时只记次数不加分)。
- **接口**:`/api/chat/audio`、`/api/chat/text` 响应新增 `used_words: [{word_id, pt_word, boosted}]`(总是存在)。`boosted:false` = 用到了但没加分(今天已加过 / box ≥ 3)。前端 `index.js` 在 `addAI` 之后弹"✅ 用到了:…",与 `tts_fallback` 提示合并成一条 toast。
- **故障隔离**:`chat_words.py` 里所有异常吞掉并 `logger.exception`,聊天主流程不受影响;加分失败时命中的词仍返回(`boosted:false`)。失败的轮次(LLM/TTS 出错)不加分。
- **回退**:`.env` 加 `CHAT_WORD_LINK=0` 重启即可。

## 单词拆解 & 单词库(长按教练语音条 → 🧩 拆解单词)
- 聊天加词请求会携带来源 message_id；服务端把该词所在句子及同一会话中紧邻的上一条、下一条对话写入 WordMemorizer 的 NewWords.Remark（最多 5000 字符）。重复词不会新增记录或覆盖原备注。
- `POST /api/breakdown`(FormData: text,message_id?,session_id)。**教练一条回复可能是好几句拼在一起**(典型:`"Correção: ...\n\n..."`),`BREAKDOWN_PROMPT` 要求先按自然边界拆句、去掉 `Correção:` 前缀,再逐句给词;每个词自带 `sentence`/`sentence_zh`(所在那一句原文+中文),**不要退回"整段话当一个例句"**。
- 后端 `_parse_breakdown_json` 有兜底:正则去 `Correção:` 前缀,过滤 `word` 本身就是 correção(不论大小写/重音)的项。**这条兜底不要删**,是防 LLM 不听 prompt 的最后一道保险。
- 结果按 `message_id` 缓存在 `messages.breakdown` 列(同 `translation`/`explanation`)。
- 前端拆词面板列出可勾选单词 → `POST /api/vocab`(**JSON body**,不是 FormData):`{session_id, items:[{language,word,example_sentence,chinese_meaning,example_chinese}]}`;`language` 默认 `pt-PT`。
- `GET /api/vocab?session_id=&limit=500` 已实现,**前端没有浏览/删除单词库的界面,也没有去重**。

# 单词任务(每周动态调度 · 间隔重复)

## 数据来源
`word_source.py` 通过只读连接(`PRAGMA query_only`)从服务端数据库读取 `WeeklyPlans` → `WeeklyPlanWords` → `Words`。WordMemorizer 的六张表与陪练数据共存于 `SQLITE_PATH` 指定的 `sessions.db`；`WORD_DB_PATH` 默认自动跟随 `SQLITE_PATH`，不要再把它当作独立的客户端数据库。对外三个函数:`list_word_ids(on)`、`current_plan_week_start(on)`、`get_word(id)`。库文件不存在时返回空列表并记日志。WordMemorizer 通过服务端 `/api/admin/*` 管理接口读写这些数据。
`WordItem={id,pt_word,cn_meaning,pt_sentence,cn_sentence,source,remark,reference_image_number,mode(1/2)}`(词源默认值永远是 1,`word_source.py` 里的 `Literal[1, 2]` 有意不改),**前后端字段必须一致**;今日接口会额外带 `kind`,mode 3 的词还带 `cloze`,若挖空用的是生成例句还带 `ex`(见「多例句轮换」)。来源值 1=图片关联、2=口语陪练；学习词从 NewWords 转入 Words 时要复制 Source/Remark。单词学习页“查看来源”按来源弹出图片或 Remark；图片通过 `/api/words/source-image/{image_number}` 从 WordMemorizer.Core/images/jpg 读取。

## 一周节奏(周日~周六)
- **周日**:新一周词表已生成,全部放进 `preview` 只看不测不记进度,没有测试任务(前端 `previewOnly()`),周一才开始记。(前端另有"周日以测代看"`sunMode`,见"造句与周日以测代看"一节。)
- **周一~周五**:复习(到期词,≤15)→ 周五加"本周回顾"→ 新词;最后还有 `preview`(预习明天的词,只看不评分)。
- **周六**:没有新词;到期复习(≤8,`WEEKEND_REVIEW_MAX`)+ **周六加练**(`kind=extra`),总数 ≤10(`SATURDAY_MAX`)。没有任何弱词时周六就是休息日(`/words/complete` 对空计划返回 422)。
- 周末不安排普通复习,间隔按**工作日**计算。"今天"= 服务器本地日期(`word_task_manager.today_str()`)。
- 本周词表(`word_week`)首次请求时固定;上周没学完的顺延到下周,再从词源按顺序补没用过的词,凑满 `WEEK_SIZE=30`。当天计划(`word_daily_plan`)首次请求时生成并固定,刷新页面/重新学习都不变(**计划为空时不落库,每次请求会重算**)。

## 调度参数(全部集中在 `word_planner.py` 顶部,调参只改这里)
| 参数 | 值 | 含义 |
|---|---|---|
| `WEEK_SIZE` | 30 | 每周新词数 |
| `WORKLOAD` / `NEW_MIN` / `NEW_MAX` | 20 / 3 / 10 | 一天总量上限 / 每天新词数上下限 |
| `REVIEW_MAX` / `WEEKEND_REVIEW_MAX` | 15 / 8 | 工作日 / 周末复习上限 |
| `PREVIEW_MAX` | 8 | 预习词上限 |
| `INTERVALS` | {1:1,2:2,3:4,4:7,5:14} | box → 下次复习间隔(工作日数) |
| `MASTER_BOX` | 4 | box ≥ 此值且说葡语答对过 ⇒ 掌握 |
| `RATE_LOW`/`RATE_HIGH` | 0.6 / 0.9 | 昨日一次通过率阈值(低则少学 2 个新词,高则多学 1 个) |
| `STUBBORN_LAPSES` | 3 | 忘记次数 ≥ 此值 ⇒ 顽固词,复习排最前,且固定用 mode1(较容易) |
| `WEAK_LAPSES` | 2 | 周六加练:忘记次数 ≥ 此值 |
| `WEAK_HARD_STREAK` | 2 | 周六加练:连续 hard ≥ 此次数 |
| `LAPSE_DECAY_STREAK` | 2 | 每连续答对(good)这么多次,lapses −1(最低 0) |
| `SATURDAY_MAX` | 10 | 周六任务总上限 |
| `CLOZE_ENABLED` | True | 句子填空(mode 3)总开关;改回 False 重启即可回退 |
| `CLOZE_MAX` | 6 | 一天最多几道填空题 |
| `CHAT_FOCUS_NEW` | 2 | 聊天联动:目标词里最多留几个"本周还没测过的新词"名额 |

## 每个词当天结果(只看第一轮,每词每天只结算一次)
前端 `noteOutcome` 判定,点"完成"时随 `/words/complete` 提交 `outcomes`:
| outcome | 触发 | box | lapses | hard_streak | streak | 下次复习 |
|---|---|---|---|---|---|---|
| good | 一次答对 | +1(≤5) | 满足衰减条件时 −1 | 清零 | +1 | 按 box 间隔 |
| hard | 答错后重试才对 | 不降,至少 1 | 不变 | **+1** | 清零 | 按 box 间隔 |
| again | 点了"公布答案"或被 AI 判错 ≥2 次 | −2,至少 1 | **+1** | 清零 | 清零 | **下一个工作日** |
| skipped | 点"跳过" | 不变,至少 1 | 不变 | 不变 | 不变 | 按 box 间隔 |
- good 衰减:`streak % LAPSE_DECAY_STREAK == 0 and lapses > 0` 时 lapses −1(streak 本身不清零,所以是每 2 次一减)。
- mode=2(说葡语)good ⇒ `mode2_ok=1`;mode=2 的 again ⇒ `mode2_ok=0`(之前"会说"的证明作废)。mode=3(填空)答对也会置 `mode2_ok=1`;mode=3 答错**不会**清 `mode2_ok`。
- `mastered = box ≥ MASTER_BOX 且 mode2_ok`。**已掌握的词后端 `settle` 直接跳过,不会被自动改回未掌握**(也没有定期抽查机制,是已知简化)。
- 用户在结果页点"✅ 我已掌握"(`POST /words/mark_mastered`):`master_row` 直接 box=5、`mode2_ok=1`、`mastered=1`、`hard_streak=0`,以后不再复习,也不会再当新词;前端同时从本轮 `outcomes`/`failedList` 里移除该词。
- 没听清/ASR 空结果(422)、公布答案都**不算 AI 判错**,不计入 `aiWrong`。

## 周六加练的选词规则(`build_today_plan`,`today.weekday()==5`)
候选 = 未掌握、且不在今天到期复习里的词,满足**任一**:`lapses ≥ 2` | `last_outcome == "again"` | `hard_streak ≥ 2`。
排序:顽固词(lapses≥3)优先 → 上次 again 的优先 → lapses 多的优先 → hard_streak 多的优先 → box 低的优先 → word_id。取前 `SATURDAY_MAX − 已有条数` 个。
注意:周五结算后的词 due 基本都在周一以后,所以**周六的 review 通常是空的,加练才是主体**;进度只在点"完成"时结算,周五中途退出的结果周六看不到。

## word_progress 表与迁移
`word_progress(session_id, word_id, box, due_date, streak, lapses, hard_streak, introduced_on, last_mode, last_outcome, mode2_ok, mastered)`,主键 (session_id, word_id)。
另有两列 `used_count`(聊天里用到的累计次数)、`last_used_on`(最近一次生效日期,TEXT,默认空串)——P2 后加,**不在 `_COLS` 里**(所以 `new_row`/`_upsert`/`get_progress` 都看不到它们),只被 `credit_chat_use` 读写。
`hard_streak` 是后加的列:`word_progress_manager.init_db()` 用 `PRAGMA table_info` 检测缺列自动 `ALTER TABLE ... DEFAULT 0`(幂等,旧库不用删)。`apply_outcome` 对没有该键的旧 row 用 `setdefault` 兼容。**以后给这张表加列照这个模式。**
其余三张:`word_week`(每周 30 词及顺序)、`word_daily_plan`(当天计划,kind 含 `preview`)、`word_outcomes`(主键 (session_id,task_date,word_id),保证"一天只结算一次";`yesterday_rate` 取最近一个学习日的 good 占比)。`word_task_done` 由 `word_task_manager` 管,`word_errors` 由 `word_error_manager` 管(每次答错一行,`pt_word`/`cn_meaning` 是快照,目前只记录不参与调度)。
`settle` 只认今天计划里的词(不信前端传的 id),且 `outcome`/`mode` 过枚举校验。

## 句子填空(mode 3)
- 定义:显示挖空例句(`____`)+ 中文翻译 + 提示,用户只说缺的词;不自动朗读、无喇叭(读句子会泄露答案)。
- 出题规则:仅 `kind=review`;`choose_mode` 在"顽固/上次 again → 1"之后、"box≥2"之前,`box==3 且 last_outcome=="good"` → 3;一天最多 `CLOZE_MAX` 个;非 review 的 mode 3 一律降为 2(`build_today_plan` 末尾后处理)。
- 挖空:`word_planner.make_cloze(sentence, pt_word)`,只做整词精确匹配、忽略大小写、去掉 `pt_word` 里的括号备注,只换第一处;`word_routes._load_words` 里对 mode 3 构造 `cloze`,**找不到就把该词 mode 降为 2 且不带 `cloze`**(不回写计划表)。P4 之后挖空的例句来源不止原例句,见下一节「多例句轮换」。
- 评判:`_judge_pt_cloze` = 规则 → 逐词规则 → `_judge_pt_llm`;ASR 与 mode 2 一样用葡语。
- 前端:`fetchToday` 的 mode 白名单为 `[1,2,3]`;`viewCloze` 渲染;下一轮翻转 `3→1, 1→2, 2→1`。
- 接口:`/words/today` 的 `words[].mode` 可为 3 并带 `cloze`;`/words/evaluate`、`/words/complete`、`/words/record_error` 的 `mode` 取值 `1|2|3|4`(4=造句)。
- 回退:`CLOZE_ENABLED=False` 重启即可,不用动其他代码。
- 已知取舍:"掌握前必过填空"是概率保证(box 3 且 last 非 good 时走 mode 1 可绕过);动词变位/复数的词会降级回 mode 2(词库实测约 78% 的词能挖空);跑过 `gen_examples.py` 的词可被救回(见下一节)。

## 多例句轮换(P4)
- **为什么**:词库里每个词只有 1 条例句,约 22% 因例句里是变位/复数挖不出空;且总用同一句,用户会背句子而不是背词。P4 用 LLM 给词再生成 pt-PT 例句缓存起来,mode 3 挖空时轮换,同时把挖不出空的词救回来。
- **生成(每周日,在用户机器上手动运行)**:每周日在 WordMemorizer 导入本周 30 个新词后,运行 `python tools/gen_examples.py --week`(只处理当天所在周的计划词,约 3 次 LLM 调用)。**历史老词不批量生成**,继续只用原例句;要补"正在学、未掌握"的老词用 `--active`。其余参数:`--report`(只看覆盖率,不调 LLM、不写库)/ `--dry-run` / `--only-failing` / `--ids` / `--limit` / `--per-word`(默认 2,最大 3)/ `--batch`(默认 10)/ `--sleep`。`--ids/--week/--active` 取并集,都不给 = 词库全部词(不推荐);周计划为空或 sessions.db 里没有相关表时**不会退化成处理全库**。只读词库、只写 `word_examples`,可断点续跑(已有 ≥ `per_word` 条的词自动跳过,每词写完即提交)。启动时脚本先 `load_dotenv(项目根/.env)`。
- **提示词与校验**:`WORD_EXAMPLES_PROMPT`——pt-PT、A1~A2、5~12 词、**必须原样包含目标词(不变位不变复数;`-se` 反身动词写成 `lembrar-se`,主语用第三人称)**、简体中文翻译。`validate_example` 必须全过才入库:能 `make_cloze` 挖空、有汉字、词数 3~16、≤120 字符、`norm_sentence` 后不与已有例句重复。LLM 常输出的 U+2010/2011/2012 连字符先归一成 `-`;`parse_examples_json` 容错(多余逗号、裸换行、被截断时逐条捞);解析失败的 LLM 原文落盘 `data/gen_examples_failed.txt`。**不要为了通过校验而放宽 `validate_example`。**
- **表**(`memory/word_example_manager.py`,`main.py` 启动时 `init_db`):`word_examples(word_id, idx, pt_sentence, cn_sentence, enabled, source, created_on)`——idx ≥ 1,**idx 0 = 词库原例句,不入表**;`enabled=0` 停用某条;新增 idx 在已有最大 idx(含已停用)之后顺延,所以停用后不会复用编号。`word_example_use(session_id, word_id, last_idx, last_used_on)`——每人每词上次用的例句编号,用于轮换。两张表无外键。
- **选择**(只发生在 mode 3):`word_routes._load_words(entries, session_id=None)`。有 `session_id` 时整个调用**批量**取一次 `get_examples` 和 `get_uses`(无 N+1);候选池 = 原例句(idx 0)+ 启用的生成例句,**读取时重新用 `make_cloze` 校验**、只留能挖空的;`pick_example(pool, last_idx, used_today)` 轮换(`last_idx` 之后的下一个,回绕;`last_used_on == 今天` 且 `last_idx` 仍在池里则沿用,同一天刷新不变);池为空才降级 mode 2。**没有任何生成例句的词、没传 `session_id`(预习那处)、或例句表读取异常**:退回只用原例句的旧行为(不带 `ex`、不写 `word_example_use`);`get_examples`/`get_uses`/`record_use` 的异常都 `logger.exception` 吞掉,绝不让 `/today` 失败。选择结果用一次 `record_use` 写入(只写今天还没记录过、或 `last_idx` 变了的)。不回写计划表。
- **词对象**:选中例句时 `pt_sentence`/`cn_sentence` 换成该例句(填空题的中文翻译、结果页例句都和挖空的句子一致),并新增 `ex`(整数,原例句为 0);没有 `ex` 键 = 没走例句轮换。mode 1/2、预习条目不带 `ex`。
- **朗读**:`GET /words/{id}/audio?kind=sentence&ex=N`;`ex` 缺省 0 = 原例句,`ex<0` 422,`ex>0` 取不到(不存在或已停用)404,`kind=word` 时忽略 `ex`。前端 `speak` 在 `kind==='sentence' && w.ex` 时才带 `ex`;`ex` 随 `{...w, mode}` 拷贝自动带到下一轮。缓存键按文本哈希,不用改。
- **评判**:不变,`_judge_pt_cloze` 仍以 `pt_word` 为准,与用了哪条例句无关。
- **回退**:`UPDATE word_examples SET enabled = 0;` 即回到只用原例句,不用改代码。单条不好的:`UPDATE word_examples SET enabled = 0 WHERE word_id = … AND idx = …;`。
- **已知取舍**:生成例句没有人工审核,靠自动校验 + 抽查;只有跑过 `--week`/`--active` 的词有生成例句,老词没有;`--report` 的覆盖率统计的是**整个词库**,每周只生成 30 个词时涨得很慢,不是成功指标;mode 1 / 2 不轮换例句;挖空仍是精确匹配,所以生成例句必须含原形(模糊匹配仍是未做的后续项)。

## 评判规则(`/words/evaluate`,FormData: audio,word_id,mode)
- **mode=1**(看葡语说中文):ASR 用 zh → 先做义项精确匹配快速通道(`cn_meaning` 按 `;；,，、/|` 拆义项,括号备注不参与)→ 不中再交给 LLM 语义评判(`WORD_MEANING_JUDGE_PROMPT`)。
- **mode=2**(看中文说葡语):ASR 用 pt。先走规则:`_norm_pt` 归一化(NFC+小写+连字符当空格+去标点,**保留重音**)后完全一致;含空格短语相似度 ≥ `WORD_PT_MATCH_THRESHOLD`(0.85);单个 ≥7 字母的长词允许"同词干近似"(`_near_single_word`:相似度 ≥ `WORD_PT_SINGLE_THRESHOLD` 0.80 且共享前缀 ≥ max(5,len−3))。规则没放行的再交给 LLM(`WORD_PT_JUDGE_PROMPT`);LLM 调用失败退回规则结果;`WORD_PT_USE_LLM=0` 可关闭 LLM。LLM 返回解析失败 → 502(不算答错,前端让用户再说)。
- **mode=3**(填空):见上面"句子填空"一节,ASR 用 pt,评判走 `_judge_pt_cloze`。
- **mode=4**(造句):见"造句与周日以测代看"一节,ASR 用 pt(`ASR_PROMPT_PT`),评判走 `_judge_sentence`。
- ASR **刻意不给目标单词做 initial_prompt**(否则识别被带向正确答案);mode=2 只用 `ASR_PROMPT_WORD`(风格提示,不含具体单词)。
- 录音大小限制 `WORD_MAX_AUDIO_SIZE`(10MB),超限 413;422 = 没录上/没听清(不算答错)。
- 单词朗读 `GET /words/{id}/audio?kind=word|sentence&tts_provider=&tts_voice=`:**只按 id 取服务端文本合成,不接受任意文本**(防被当 TTS 代理);Piper 结果按文本哈希落 `data/word_audio/`。

## 单词页前端流程(`words.js`,纯前端状态机)
- state:`loading → idle → test ⇄ judging → result → …`,另有 `preview`(只看不评分)、`done`(今日已完成,可"重新学习")。
- **逐词练**:答错/公布答案后停在同一个词同一个方向,按钮变"🔁 再试一次"(`retry()`),答对才"下一个"。`curMissed` 标记当前词本轮是否出过错;**只有一次就答对的词才进 `passed`**,出过错的词进 `failedList`(每词每轮只进一次)。本轮测完后 `failedList` 拷贝并**翻转 mode(1↔2;3→1)**成为下一轮 `todoList`(用 `{...w, mode}` 拷贝,不改 `today.words`,所以"重新学习"仍是服务器原始方向);`failedList` 为空才 `finish()`。`firstPass` 只统计第 1 轮一次通过的词。
- **公布答案**(`#reveal`,仅测试中):纯前端,不调 evaluate;按"答错"处理(`markMissed`,进 `failedList`),并调 `record_error`(`user_text` 传空串);不计入 `attempts`、不播失败音效;自动朗读单词;结果记 `again`。
- **跳过**(`#skip`):同一个词本轮被 AI 判错 ≥ `SKIP_AFTER=2` 次才在结果页出现(ASR 对葡语不准);跳过 = 记 `skipped` + 从 `failedList` 移除 + 算过关,不计入 `firstPass`。
- `outcomes` 只记第 1 轮(`round===1`)的结果,后续翻转重测不改;`finish()` 时 `POST /words/complete`(JSON: session_id,rounds,first_pass,attempts,outcomes),**服务器 `total` 取计划里的词数,不信前端**;重新学习后再完成:成绩覆盖、`times+1`,但进度不会重复结算。
- `KIND_LABEL`:🆕新词 / 🔁复习 / 📅本周回顾 / 💪周六加练。进度只在内存,中途退出会弹确认且**不保留**。
- **麦克风流复用**:`getMic()` 整个测试期间复用同一个 MediaStream(每次按下重新 `getUserMedia` 在安卓/小米平板上要 1~3 秒,iPhone 较快),`begin()` 时预热;`finish()`、页面切到后台(`visibilitychange`)、`pagehide` 时 `releaseMic()` 释放,`onstop` 里**不要再 stop 轨道**。轨道被系统抢走(`readyState!=='live'`)会自动重新申请;**`live` 的流也可能被系统静音(`muted`,iOS 音频会话被打断)**:按下时 `waitMicLive` 等 1.5s 仍不 unmute 就丢弃旧流(`releaseMic()`)重新申请一次,还不行就提示"麦克风暂时被系统占用"而不是对着静音轨道录音;录出空文件(<`MIN_BYTES`)时也 `releaseMic()`,下次按住用新流;`getMic()` 缓存申请中的 Promise,预热和首次按住不会开出两条流。若某设备出现"录音后朗读音量变小/走听筒",是安卓开着麦克风时的音频通道副作用,可回退为每次申请,或给 getUserMedia 关掉 echoCancellation/noiseSuppression 再试。聊天页 index.js 仍是每次申请(未改)。
- 声音:进页面和每次手势里 `unlock()`/`primeSfx()` 解锁 iOS 自动播放;答错先播失败音效,播完(≤1.5s)再朗读单词。录音手势与聊天页一致(按住录、松开发、上滑取消,iOS 优先 audio/mp4)。**按住说话的手势里不要 `unlock()`**(只 `player.pause()`):往 `#player` 塞静音 wav 并 play 会和 getUserMedia/`rec.start()` 同时切换 iOS 音频会话,是"没录上"的嫌疑之一。
- `touch-protection.css` 里**不要给 `#hold` 设 `touch-action: manipulation`**:会覆盖 `index.css` 的 `none`,iOS 上手指稍动就 `pointercancel`,录音被悄悄丢掉(聊天页、单词页共用)。
- 单词页标题栏放大等样式写在 `words.css`(`#app > header` 覆盖),**不要改 `index.css`**(聊天页共用)。
- words.js 里有一小段从 index.js 精简拷贝的 `NAME_RE`/guestSid/主题/`ttsCfg()`,改这些时 index.js、words.js、后端一起改。

# WordMemorizer 管理端(C#)与 Admin API

## 现状
- **WordMemorizer.Core** 是家庭用的 C# WinForms 管理端(.NET Framework 4.7.2,VS/MSBuild 构建,输出 `..\output\Debug|Release\`):录入周计划、生词本、考试记录/纠错、积分消耗。
- **数据库已合并**:它原来的 6 张表(`Words`/`WeeklyPlans`/`WeeklyPlanWords`/`ScoreRecord`/`ConsumeLog`/`NewWords`,PascalCase)现在在陪练的 `sessions.db` 里,由 `memory/wm_manager.py` 读写。C# 端**不再直连任何数据库**——项目里已经没有 SQLite / Dapper / EntityFramework / `DatabaseHelper`,**不要加回来**。
- 合并已在生产上验收通过;`tools/merge_wordmemorizer.py` 已用完,旧 `WordMemorizer.db` 只做归档,**不要再用旧客户端往旧库写**。

## C# 端结构
```
WordMemorizer.Core/
  AdminApiClient.cs     静态 HttpClient(15 秒超时)+ Get/Post/Put/Delete<T>;对窗体是同步调用
                        (GetAwaiter().GetResult(),内部全程 ConfigureAwait(false),不会死锁)。
                        JSON 用 Newtonsoft 的 SnakeCaseNamingStrategy,所以模型类保持 PascalCase 不用改。
                        非 2xx → ApiException(StatusCode, detail);连不上/超时 StatusCode 为 0;ShowError 统一弹窗(503 加"数据库暂时不可用")。
                        文件内还有 CurrentWeekResponse / RecentWeekResponse / IdResponse / PointsResponse / NewWord*Response 等响应 DTO。
  DB/Repositories/*     WeeklyPlan / Word / NewWords / ScoreRecord / ConsumeLog 五个仓储,都只是 API 薄封装,方法签名沿用原来的。
  DB/WordImporter.cs    解析"单词 / 中文释义 / Ex:例句 / 例句译文"文本 → 调周计划接口;无参构造;Append / Replace / ReplaceFromNewWords 三个入口。
  Program.cs            Application.ThreadException 全局兜底:ApiException 弹服务错误,其他异常记日志 + 弹窗。
  FormMain.cs           FormMain_Shown 先查 /api/health,不通就 Tools.RunAudioReconizeAPIAsync() 拉起服务并轮询(2 秒 × 60),通了才 ReloadData();
                        _serverReady 防止服务没起来时 Activated 里刷新积分。最近几周词表用 GET /weeks/recent?n=3。
```
- **管理 API 地址**:运行目录 `config.ini` 的 `AdminApiUrl`;读不到就用 `Constants.AUDIO_RECOGNIZING_SERVER_URL + "/admin"` = `http://127.0.0.1:8000/api/admin`。注意 `ConfigIniHelper.GetValue` 读不到键会把默认值写回 config.ini(所以缺省时会多出一行空的 `AdminApiUrl=`)。改地址只改这个键,不要动语音识别的 URL。**排查"连到了别的实例"先看 config.ini 里有没有残留的旧值。**
- **错误映射**:404 → 仓储按原语义返回 `null` / `false` / 空列表(`GetWordById`、`GetNewWordByWord`、`DeleteNewWordById`、`SetRecordCorrect/InCorrect`、`GetWordsInWeeklyPlan`);422 显示服务端 `detail`;503 提示数据库暂不可用。`GetAllCorrectRecordsCount` / `GetBatchNumbersForCurrentWeek` / `GetRecordsByBatchNumber` 自己吞异常(返回 -1 / 空列表),保持原语义。窗体里写入类操作各自 `catch (ApiException)` → `AdminApiClient.ShowError`,漏掉的走全局兜底。
- **调用是同步阻塞的**:服务不在时窗体操作会卡到 15 秒超时才报错。
- **不要在 C# 里 try 吞掉服务端的 422**:服务端要求单词和中文释义非空,一次周计划请求最多 200 个词,错误要把 `detail` 显示给用户,不要静默跳过部分词。

## Admin API 契约(`api/admin_routes.py`,完整路径都在 `/api/admin` 下,字段 snake_case,无鉴权)
| 接口 | 说明 |
|---|---|
| `GET /weeks` | 全部周计划(Id 升序)`[{id,week_number,start_date,end_date}]` |
| `GET /weeks/current` | `{exists,id,week_number,start_date,end_date}`;没有本周计划时 `exists=false, id=-1` |
| `GET /weeks/recent?n=3` | 本周**之前**最近 n 份(1~12,按日期,不依赖 Id 连续),每份带 `words`;取代原来的"Id-1/-2/-3" |
| `GET /weeks/{plan_id}/words` | 该计划的词;计划不存在返回 `[]` |
| `POST /weeks/current/words` | body `{words:[{text,chinese_meaning,example_sentence?,example_chinese?,reference_image_number?}]}`:追加(没有本周计划就创建)→ `{plan_id,created_plan,imported,word_ids,appended:{word_week}}` |
| `PUT /weeks/current/words` | 同上 body:覆盖(删旧建新)→ `{plan_id,deleted_plans,imported,word_ids,reset:{word_week,daily_plan}}` |
| `PUT /weeks/current/from_newwords` | body `{new_word_ids:[…]}`:生词本 → 本周计划,**单事务**(校验 → 删旧计划 → 建新计划 → 复制词 → 标记已录入 → 重置调度);已录入的 422,不存在的 404;返回同覆盖 |
| `DELETE /weeks/current` | → `{deleted_plans,reset}`;只删计划,`Words` 保留(`word_progress` 可能还引用) |
| `GET /words/{id}` | 单个词,404 = 不存在 |
| `POST /scores` | `{batch_number,word_id,record_time?,is_correct,audio_path?,notes?,is_portuguese}` → `{id}`;`batch_number` 必须是 14 位 `yyyyMMddHHmmss`;词不存在 404 |
| `GET /scores/batches` | 本周批次号(倒序);`GET /scores/batches/{batch}` 该批次记录,每条内嵌 `word`(C# `ScoreRecord.Word` 从这里反序列化) |
| `PUT /scores/{id}/result` | `{is_correct,notes?}`,改对 / 改错 |
| `GET /points` | `{correct_count,today_count,consumed_total,balance}` |
| `POST /consume` / `GET /consume` | `{score:1~1000000}` → `{id}` / 消耗记录(时间倒序)`[{id,consumed_score,created_time}]` |
| `GET /newwords?filter=&only_unrecorded=&descending=` | 生词本列表(`filter` 匹配 word / meaning,已转义 LIKE 通配符) |
| `GET /newwords/by_word?word=` | 归一化后精确查找,没有 404;`GET /newwords/stats` → `{total,unrecorded}` |
| `POST /newwords` | `{word,meaning?,example?,example_chinese?,reference_image_number?,is_recorded?}`;已存在则不插入 → `{id,existed}` |
| `PUT /newwords/{id}` / `DELETE /newwords/{id}` / `PUT /newwords/{id}/recorded` | 改全部字段 / 删除 / `{recorded}` |

## 服务端规则(改 wm_manager / admin_routes / C# 时必须保持)
- 写操作都在 `BEGIN IMMEDIATE` 事务里,失败整体回滚。业务异常 `WMNotFound`→404、`WMInvalid`→422、`WMDBError`→503(库被占用 / 缺表 / 文件不存在),消息是中文。
- **周从周日起算**(`wm_calendar.week_range`);`WeekNumber` 等价 .NET `GetWeekOfYear(FirstDay, Sunday)`;`StartDate`/`EndDate` 存文本 `YYYY-MM-DD 00:00:00`;同一个 StartDate 可能有多份计划(跨年旧数据),按日期匹配并全部处理。
- **与单词任务的联动**:追加 → 新词续号追加进已固定的 `word_week`;覆盖 / 生词转计划 / 删除 → 重置所有智能体本周的 `word_week` + 今天起到本周六的 `word_daily_plan`。**不碰** `word_progress` / `word_outcomes`。所以管理端改了词表,单词页立即看到新词表,不用再跑 `reset_week.py`。
- **时间**:`record_time` 接受 `YYYY-MM-DD HH:MM:SS[.fff…]`、T 分隔、带 `Z` / `±HH:MM` 后缀,归一成服务器本地无时区格式;表里 `CreatedTime`/`AddedDate` 保持 `DEFAULT CURRENT_TIMESTAMP`(UTC),不显式写入。
- 请求体多余字段会被忽略,所以 C# 可以直接把模型对象(含 `id`、`created_time`)序列化发过去。生词去重沿用聊天加生词那套(`newword_manager._clean_word` / `_key`)。
- **改字段 = 三处同步**:`admin_routes.py` 的 pydantic 模型、`wm_manager._word/_plan/_newword` 返回字典、C# 的模型类与 `AdminApiClient.cs` 里的 DTO。

## 备份与 WAL
- `SQLITE_WAL` 默认开(环境变量 `PT_SQLITE_WAL=0` 可临时关),聊天、管理接口、`gen_examples.py` 同时访问同一个库;`wm_manager.init_db` 建表并切到 WAL。
- **备份只用 `tools/backup_db.py`**(SQLite backup API;开了 WAL 后直接复制 `.db` 会漏掉 `-wal` 里的最新数据)。`start_server.bat` 每次启动自动跑:每天一份 `data\backups\sessions-YYYYMMDD.db`,保留最近 14 份;手动:`python tools\backup_db.py --src <库> --to <文件> [--force]`。
- `config.py` 里 `WORD_DB_PATH` 留空 = 跟随 `SQLITE_PATH`,只在测试里临时覆盖。没有"退回旧库"的路径(旧客户端写的是旧库),出问题用 `data\backups` 里的备份恢复。

## 单词测验积分(陪练与管理端共用 `ScoreRecord`)
- 单词页正式测验答对记 1 分,写进共用的 `ScoreRecord`:管理端 `FormMain` 的"累计得分"就是 `/points.correct_count`;单词页顶部 `#points` 栏读同一个 `/api/admin/points`(累计 / 今日 / 余额 / 本轮得分)。
- 表(在 `wm_manager.SCHEMA`,同一个 `sessions.db`):`WordQuizRun(RunId,SessionId,TaskDate,BatchNumber,Completed,CreatedTime)`、`WordQuizAward(RunId,WordId,ScoreRecordId)`,主键 `(RunId,WordId)` ⇒ **同一批次同一个词最多记 1 分**。批次号是 14 位 `yyyyMMddHHmmss`(同一秒冲突就 +1),和管理端考试批次同格式,所以会出现在管理端的批次列表里(`Notes="葡语站单词学习"`,`IsPortuguese = (mode != 1)`)。
- 接口:`POST /api/words/run` JSON `{session_id,restart}` → `{run_id,batch_number,round_score}`:取当天未完成的批次,`restart=true` 新建一个(今天没有计划 422);`/api/words/evaluate` 可选 FormData `session_id`、`run_id`,通过且该词在今天计划里 → 响应并入 `earned`/`round_score`;`/api/words/complete` 可选 `run_id`:`round_score` 由服务器数,写入 `word_task_done.round_score`(自动迁移的列),并把批次置 `Completed`;`today.completed` 带 `round_score`。
- **谁能加分**:`config.WORD_QUIZ_POINT_USERS`(集合,**新增账号要编辑它**)且该智能体已存在于 users 表;不在名单只是不加分,不报错。
- 周日以测代看(`sunMode`)不带 `run_id`,不加分。wm_manager 出错 → HTTP 503。

## 造句与周日以测代看(代码里已有的速记)
- **mode 4 造句**:看目标词说一整句话。`_judge_sentence`:少于 2 个词直接判错(不调 LLM)→ 规则(整词匹配目标词)→ LLM(词义 / 用法 / 改正),返回 `corrected`(**只有 mode 4 的 evaluate 响应带**);`WORD_PT_USE_LLM=0` 或 LLM 调用出错退回规则,LLM 返回解析失败 502。
- **出题**(`word_planner`,`build_today_plan` 后处理改写):`SENTENCE_ENABLED`(默认 True)、`SENTENCE_MAX=3`、`SENTENCE_BOX_MIN=3`、`SENTENCE_LOW_RATE=0.5`;只给 box ≥ 3 且未掌握的复习词和周六加练词;box 3 的词在填空 / 造句之间按比例稳定分流;无 cloze、无 `ex`。前端重测方向翻转:`3→1, 4→2, 1→2, 2→1`。
- **周日以测代看**(前端 `sunMode`):不碰学习进度,不放"我已掌握",不带 `run_id`;细节见 `words.js` 里 `sunMode` 的注释。

# API 契约(新增功能优先复用,不要重新设计)
| 接口 | 说明 |
|---|---|
| `GET /api/health` | 健康检查 |
| `POST /api/chat/audio` | FormData: audio,session_id,mode(pt/zh),tts_provider,tts_voice?。响应含 `used_words: [{word_id,pt_word,boosted}]`(总是存在,没有就是 `[]`) |
| `POST /api/chat/text` | FormData: session_id,text,mode,tts_provider,tts_voice?。响应同上含 `used_words` |
| `GET /api/history?session_id=&limit=30&before_id=` | `{messages,has_more}`,含缓存的 translation/explanation;游标分页 |
| `POST /api/translate` `POST /api/explain` | FormData: text,message_id?,session_id(占位)。有 message_id 且有缓存则不再调 LLM |
| `POST /api/breakdown` | FormData: text,message_id?,session_id → `{words:[{word,meaning,sentence,sentence_zh}]}` |
| `POST /api/regenerate_audio` | FormData: message_id,tts_provider,tts_voice? → 新 audio_url(文件名每次随机) |
| `GET /api/audio/{name}` | 白名单 `^msg_[0-9a-f]{12}\.(wav\|mp3)$` |
| `DELETE /api/session/{session_id}` | 清空历史 + 删关联音频 |
| `DELETE /api/message/{row_id}?session_id=` | 删一轮(配对的两条)+ 音频文件 |
| `POST /api/user/bind` | body {username,pin?} 绑定/恢复,返回 profile `{username,background_url,theme,tts,persona,has_pin}` |
| `GET /api/user/{username}` | 拉 profile |
| `POST /api/user/{username}/theme` | body {theme:{--var:#hex}},≤32 项,key/value 双重正则白名单 |
| `POST /api/user/{username}/background` | FormData: file,≤5MB,后缀+魔数双重校验,服务端生成 `bg_{uuid32}.{ext}` |
| `POST /api/user/{username}/tts` | body {provider,voices:{edge?,streamelements?}},白名单校验,非法 422 |
| `POST /api/user/{username}/persona` | body {persona},清洗后超 300 字 422,空串清除 |
| `GET /api/background/{name}` | 白名单正则,`Cache-Control: immutable` |
| `POST /api/vocab` | **JSON body** {session_id,items:[...]} 批量加入单词库 |
| `GET /api/vocab?session_id=&limit=500` | 单词库列表,按插入时间倒序 |
| `GET /api/words/today?session_id=` | `{date,words:[WordItem+kind(+cloze,+ex)],preview:[WordItem],meta:{new,review,weekly,extra,preview,...},completed}`;completed 非空 = 今天已完成 `{rounds,total,first_pass,attempts,round_score,times,completed_at}` |
| `POST /api/words/evaluate` | FormData: audio,word_id,mode(1/2/3/4),session_id?,run_id? → `{word_id,mode,passed,recognized_text,comment}`;mode 4 另带 `corrected`;带 run_id 且通过时并入 `earned`/`round_score`;422 没听清(不算答错) |
| `POST /api/words/complete` | **JSON** {session_id,run_id?,rounds,first_pass,attempts,outcomes:[{word_id,outcome,mode}]};结算进度 + 记完成;今天没计划 422 |
| `POST /api/words/record_error` | **JSON** {session_id,word_id,mode,user_text?},写 `word_errors` |
| `POST /api/words/mark_mastered` | **JSON** {session_id,word_id},手动标记已掌握 |
| `POST /api/words/run` | **JSON** {session_id,restart?} → `{run_id,batch_number,round_score}`;取当天未完成的测验批次或新建(见"单词测验积分") |
| `/api/admin/*` | WordMemorizer 管理 API(23 个接口),契约见"WordMemorizer 管理端与 Admin API"一节;单词页只用其中的 `GET /api/admin/points`,其余是管理端专用 |
| `GET /api/words/{id}/audio?kind=word\|sentence&tts_provider=&tts_voice=&ex=` | 朗读单词/例句;`ex`(≥0,默认 0)仅 `kind=sentence` 有效:读第 ex 条生成例句,不存在/已停用 404,负数 422 |
| `WS /ws/chat/{session_id}` | **简化骨架**,整段收发,**不落库** orig/msg_uid/audio_file,与 `/chat/*` 不对齐;有意的过渡状态,不要顺手统一 |

统一错误格式:`HTTPException(status, "中文错误信息")`,前端 `errMsg()` 读 `detail`(string 或 `[{msg}]`)或 `message`。响应体用 `{status,data}` 或扁平对象均可,前端 `req()` 用 `j.data || j` 兼容。**新增接口遵循这套约定。**

## 安全模式(涉及文件/用户输入的新功能照此写)
- **服务端生成文件名,绝不用用户输入拼路径**:回复音频 `msg_{uuid12}.{wav|mp3}`,背景图 `bg_{uuid32}.{ext}`,单词朗读缓存 `piper_{sha1[:16]}.wav`。
- **读取/删除文件前必须过白名单正则**(`_AUDIO_NAME`/`_BG_NAME` 用 `fullmatch`)。
- **上传文件不信任 Content-Type 和后缀**,靠文件头魔数嗅探(`_sniff_image`),且后缀与真实格式一致。
- **大小限制用"多读一字节"模式**(`file.read(MAX+1)`)。
- **主题变量双重正则白名单**(key `--[\w-]{1,30}`,value `#hex`),前后端各校验一遍。
- **用户可编辑文本拼进提示词前要清洗**(人设:去控制字符和 `<>`,放进标签包裹),超长直接 422。
- **LLM 返回结构化数据不要直接信任**:先剥 ```json 代码块再 parse,失败/字段缺失直接 502,不静默拼假结果;有明确"不该出现"的值(如 Correção)时在解析层再加正则兜底。
- 单词朗读等"按 id 取服务端文本"的接口**不接受前端传任意文本**;结算接口**只认服务端计划里的词**,不信前端 id/总数。

## LLM 引擎(`core/llm_engine.py`)
- `LLM_PROVIDER` 三选一:`gemini` / `groq` / `ollama`,业务代码只调 `get_llm_engine().generate(messages)`。
- 云端模式(gemini/groq)包一层 `FallbackEngine`,按 `[gemini, groq]` 链(主 provider 排前面)依次降级,最后是本地 Ollama;额度用完(429)冷却 30 分钟(`QUOTA_COOLDOWN`),其他故障冷却 1 分钟(`ERROR_COOLDOWN`)。**冷却靠内存 `_skip_until`,重启重置**。
- Gemini 另有模型级降级(主模型 → `gemini-2.5-flash` → `gemini-2.0-flash`),429/404 立即换模型,5xx 重试 `ATTEMPTS_PER_MODEL=2` 次再换。
- 新增 provider:继承 `BaseLLMEngine` 实现 `async generate(messages)`,注册进 `_ENGINES`。

## ASR / TTS
- `asr_engine.py`:全局单例 + `asyncio.Lock` 双重检查,防并发重复加载;Windows 下 import 前手动加 torch/cublas/cudnn 的 DLL 目录。中文求助必须传 `language="zh"`,否则按葡语解码乱码。
- `tts_engine.py`:`clean_text_for_tts()` 清 Markdown 符号和换行,**改系统提示词/新增回复内容时让 LLM 别输出 Markdown**。四个音源:`piper`(本地子进程,每次带 uuid 临时文件)、`google`(翻译接口,`GOOGLE_TTS_MAX_CHARS` 限长)、`edge`、`streamelements`;后三者带按文本(+音色)哈希的缓存目录,`CACHED_PROVIDERS` 里的文件只能 copy 不能 move。`synthesize_any(..., force=True)` 跳过缓存读取。

## 存储(SQLite)
- `messages`:`msg_uid`/`orig`/`audio_file`/`translation`/`explanation`/`breakdown` 是后加的列;`users`:`pin_hash`/`background_file`/`theme`/`tts`/`persona` 是后加的列;`word_progress.hard_streak`/`used_count`/`last_used_on`、`word_task_done.round_score` 同理。这些都用 `PRAGMA table_info` 检测缺列自动 `ALTER TABLE`,**旧库不需要删库,新增列照这个模式加**。
- `users.theme`/`users.tts` 存 JSON 字符串,读出来 `json.loads`(损坏的 JSON 会被忽略并记日志)。
- `vocab`:`session_id`/`language`/`word`/`example_sentence`/`chinese_meaning`/`example_chinese`(新表,没用自动迁移,加列可照上面模式补)。
- 陪练自身的 `messages`、`users`、`word_*` 等表与 WordMemorizer 的 `Words`、`WeeklyPlans`、`WeeklyPlanWords`、`ScoreRecord`、`ConsumeLog`、`NewWords` 六张表共用同一个 `SQLITE_PATH` 数据库。后六张表保留 PascalCase 表名，由 FastAPI 的 `wm_manager` 管理(另有 `WordQuizRun`/`WordQuizAward` 两张测验积分表也在 `wm_manager.SCHEMA` 里)；WordMemorizer 通过 `/api/admin/*` 读写，陪练的 `word_source.py`(只读)和 `newword_manager.py`(写生词)按 `WORD_DB_PATH`(默认 = `SQLITE_PATH`)访问同一个库。WAL 默认开启，备份必须使用 `tools/backup_db.py`(SQLite backup API)，**不要直接复制 `.db` 文件**，详见"备份与 WAL"一节。
- P4 另有 `word_examples` / `word_example_use` 两张表(见"多例句轮换"一节,由 `word_example_manager` 管)。它们也在服务端 `SQLITE_PATH` 数据库中；`gen_examples.py` 读取 `Words` 并写入例句表。

## 已知简化 / 别顺手"修复"
- 没有鉴权 token,身份完全基于 username 明文 + 可选 PIN;生产部署前需要补鉴权/限流(README 已标待办)。
- WebSocket 骨架持久化与 `/chat/*` 不对齐,是有意过渡状态。
- 教练的语法纠错格式依赖 Prompt("Correção: "前缀),不是结构化输出,拆词要专门处理。
- `data/tmp_audio/` 正常会自动清理,异常退出可能残留,没有定时清理。
- 单词库没有浏览/删除界面,也没有去重。
- 已掌握的词不会自动退回复习,没有定期抽查(如要做,需要新 kind + `settle` 放行 mastered 词 + 前端 `KIND_LABEL`,三处一起改)。
- `word_errors` 目前只记录,不参与调度(`hard_streak`/`lapses` 才是调度依据)。
- 单词任务进度(`todoList`/`failedList`/`outcomes`)只在前端内存,刷新或中途退出会丢,该天计划不变、可重新领取。
- 填空只做精确匹配,模糊匹配(共享前缀 + 相似度)是未做的后续项。
- 例句轮换的"今天已用"按服务器日期 `today_str()` 判定;`record_use` 是在读取 `/today` 时写的,不是用户真正答题时,所以轮换进度按"每天一轮"推进。
- 聊天联动只检测当前注入的目标词,聊天里用了别的已学词不加分(有意,限成本、防刷);ASR 听错的词不会被计数(宁可漏判不误判);`used_words` 里 `boosted:false` 的词(今天已加过 / box ≥ 3)只提示不加分;中文求助模式不加分。别顺手放宽成"检测所有已学词"或"允许聊天让词毕业"。
- 生成例句没有人工审核;只有跑过 `gen_examples.py --week/--active` 的词才有,老词继续只用原例句——别顺手"给全词库批量生成"。
- `/api/admin/*` 没有鉴权,而 `start_server.bat` 用 `--host 0.0.0.0` 监听所有网卡:只适合受信的家庭局域网,上公网前必须先加鉴权 / 限流或收窄监听范围。
- C# 管理端同步阻塞调用 API,服务不在时窗体会卡到 15 秒超时;没有离线模式 / 重试队列,别顺手加本地缓存库(那等于把直连数据库加回来)。
- 删除本周计划只删 `WeeklyPlans`/`WeeklyPlanWords`,`Words` 行有意保留(`word_progress` / `ScoreRecord` 可能引用)。
- 单词测验积分只有 `WORD_QUIZ_POINT_USERS` 名单里的智能体能加;名单是写死在 `config.py` 里的集合。

## 回复用户时的默认做法
- 用户一般直接贴改动需求或报 bug,默认只改涉及的文件。**每个被改动的文件以完整文件形式生成(从头到尾,含未改动部分),用 create_file 写到 `/mnt/user-data/outputs/` 下对应文件名,再用 present_files 交付**,不要把整份代码贴在聊天里。没涉及的文件不要重复生成。正文只用简短文字说明改了什么、为什么、前后端哪一侧要跟着改;讲思路可以多写。
- **保留原文件的换行符**:后端 `.py` 是 CRLF(Windows 开发),改完要保持 CRLF,否则整文件 diff 全红。C# 的 `.cs` 多数也是 CRLF(个别文件如 `FormNewWords.cs` 是 CRLF/LF 混合,`DB/WordImporter.cs` 是 LF),改动用精确替换保持原样,不要整文件重新规整换行;有 BOM 的保留 BOM。
- **改 C# 时**:本环境没有 .NET 编译器,只能静态核对(方法是否还存在、DTO 字段名、`using`、internal/public 可见性),交付时提醒用户在 VS(或 MSBuild)里重新生成;窗体的新增写入类操作要 `catch (ApiException)` 并 `AdminApiClient.ShowError`;动 Admin API 字段要按"改字段 = 三处同步"一起检查服务端和 C# 两侧。
- **改接口字段/请求参数时,必须同时指出前端或后端哪一侧要跟着改。**
- 涉及新文件上传/文件名生成,默认套用"安全模式"。
- 项目语言是简体中文注释 + 中文 UI 文案(后端日志/异常信息也是中文),葡语系统提示词用葡语撰写,新增代码保持这个风格。
- 改调度规则(`word_planner.py`)时:先用纯函数写个模拟(造几个 row 跑 `apply_outcome` + `build_today_plan`)验证,再交付;动了表结构要补自动迁移并测"跑两次幂等"。
- 涉及 `.env`/API Key 的内容,提醒用户上传/分享前清空真实 Key(**zip 里的 `.env` 带着真实 Gemini/Groq Key,C# 的 `Constants.cs` 里也硬编码了 Gemini/Groq/Hugging Face 的 Key,分享前务必清掉并考虑轮换**)。
- **改完功能后想一下这份 skill 有没有过时**:文件地图、API 契约表、存储一节、已知简化一节,新增/删改了接口、表、文件、调度参数,就顺手同步更新。
