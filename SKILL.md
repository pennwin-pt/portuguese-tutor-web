---
name: pt-tutor-app
description: 帮 Peng Wang 开发/修改「葡语陪练」全栈项目(前端:index.html/index.css/touch-protection.css/index.js,原生JS无构建;后端:FastAPI+SQLite+Faster-Whisper+Piper+Gemini/Grok/Ollama)时必须使用此skill。只要用户提到"葡语陪练"、粘贴这个项目任意一端的代码,或要求修改语音对话/ASR/TTS/LLM切换/用户绑定/主题背景/历史记录/单词拆解/单词库等任何功能,先读本skill再动手,不要让用户重新粘贴源文件或重新解释项目背景与接口约定。前后端经常一起改,改动涉及接口字段时两端都要检查。
---

# 葡语陪练 · 全栈项目协作规则

语音进-语音出的葡萄牙语陪练 APP。**前端**纯静态原生 JS(无构建工具/无框架);
**后端** FastAPI,流水线是 ASR(Faster-Whisper)→ 记忆(SQLite)→ LLM(Gemini/
Grok/Ollama,可切换+自动降级)→ TTS(Piper)。改动直接编辑源文件即可上线,
**不要给前端引入构建链/框架,不要给后端引入 ORM/新数据库,除非用户明确要求。**

## 文件地图
```
前端: index.html / css/index.css / css/touch-protection.css / js/index.js
后端:
  main.py              FastAPI入口,挂路由 + startup预加载模型/初始化DB(含vocab表) + WS骨架
  run.py                PyCharm调试入口(reload=False)
  config.py             全局配置,读.env
  api/routes.py          /api/chat,/history,/translate,/explain,/breakdown,/audio,/session,/vocab 核心业务
  api/user_routes.py      /api/user/*,/api/background/* 用户名+主题+背景
  core/asr_engine.py      Faster-Whisper单例懒加载
  core/llm_engine.py      Gemini/Grok/Ollama抽象工厂 + 自动降级
  core/tts_engine.py      Piper子进程封装
  memory/session_manager.py  对话历史SQLite(messages表,含breakdown缓存列)
  memory/user_manager.py     用户资料SQLite(users表,含可选PIN)
  memory/vocab_manager.py    单词库SQLite(vocab表),按session_id归属
  prompts/tutor_prompt.py    教练人设系统提示词(A1难度,pt-PT)
  prompts/helper_prompts.py  中文求助翻译/语法解析/单词拆解的一次性提示词
```

## 身份 & 会话模型(前后端共用,改动前必读)
- **方案A:`username` 就是 `session_id`**,没绑定用户名时前端用本机随机 `guestSid`
  (`localStorage.sid`)。聊天记录表、单词库表都按 `session_id` 存,不需要额外关联
  用户表。
- 用户名校验正则 **前后端必须完全一致**:`/^[A-Za-z0-9_\u4e00-\u9fa5]{2,20}$/`
  (前端 `NAME_RE`,后端 `user_manager.USERNAME_RE`,注意后端用 `fullmatch`)。改这个
  正则必须两端同改,否则会出现前端放行、后端拒绝的情况。
- `users` 表支持可选 PIN(pbkdf2 加盐哈希),但**前端当前完全没有 PIN 相关 UI**——
  `bind_user` 接口签名里有 `pin` 字段,如果用户要加 PIN 功能,前端 `/api/user/bind`
  调用和绑定弹窗都要补。
- 用户不存在且未设 PIN 时,`get_or_create_user` 会静默创建;已设 PIN 时必须传对,
  否则 401。

## 请求流水线(`/api/chat/audio`、`/api/chat/text` → `_run_turn`)
1. `mode=zh`(中文求助)时先用 `ZH2PT_PROMPT` 把中文译成葡语,`user_pt` 是最终进入
   教练对话历史的葡语;`mode=pt` 时 `user_pt == raw_text`。
2. 取 `session_manager.get_history()`(最近 `LLM_HISTORY_TURNS` 轮)+ `SYSTEM_PROMPT`
   + 当前用户输入,调用 `llm_engine.get_llm_engine().generate()`。
3. TTS 合成到临时文件,`shutil.move` 到 `data/replies/` **持久化**(不是用完即删),
   文件名 `msg_{uuid12hex}.wav`,受 `_AUDIO_NAME` 正则白名单保护(防目录穿越)。
4. 入库两条消息:`user` 角色存 `content=user_pt, orig=raw_text`;`assistant` 角色存
   `content=ai_text, msg_uid=uid, audio_file=final.name`。
5. 返回体**不含** `audio_base64`(那是 WebSocket 骨架专用的),HTTP 接口固定用
   `audio_url`。**改动响应体字段时,前端 `audioUrl()`/`fillMe()`/`addAI()` 要同步检查。**

## 单词拆解 & 单词库(长按教练语音条 → 🧩 拆解单词)
- 入口:前端 `press()` 长按语音气泡弹出 `#mask` 菜单,`data-k="bd"` 触发
  `openBreakdown(m)` → `POST /api/breakdown`(FormData: text,message_id?,session_id)。
- **教练的一条回复可能是好几句拼在一起**,典型情况是纠错句 `"Correção: ...\n\n..."`。
  `BREAKDOWN_PROMPT`(`prompts/helper_prompts.py`)要求 LLM 先按自然边界拆句、去掉
  `Correção:`/`Correcão:` 前缀,再逐句给出单词。返回的每个单词自带 `sentence`/
  `sentence_zh`(这个词所在的那一句原文+中文翻译),**不要退回成"整段话当一个例句"**
  的旧设计,不然纠错句和后面的问句会被错误地拼在一起当例句。
- 后端 `_parse_breakdown_json`(`api/routes.py`)有兜底清洗:正则去掉残留的
  `Correção:` 前缀,并过滤掉 `word` 本身就是 "correção"(不管大小写/有无重音)的
  情况——这是纠错标记,不是要学的葡语单词。**新增/修改拆词逻辑时这条兜底不要删**,
  它是防 LLM 不听 prompt 话的最后一道保险。
- 拆词结果按 `message_id` 缓存在 `messages.breakdown` 列(JSON 字符串,复用
  `translation`/`explanation` 的缓存写法,同一句话第二次点不会重复调 LLM)。
- 前端拆词面板(`#wmask`/`#wlist`)列出可勾选的单词,点"加入单词库"→
  `POST /api/vocab`,body 是 `{session_id, items:[...]}`,**这一个接口是 JSON body
  不是 FormData**(因为要传数组),前端 `post()` 本身两种都支持,不用改。
- 单词库表结构(`memory/vocab_manager.py` 的 `vocab` 表,字段名和用户要求的
  Language/Word/ExampleSentence/ChineseMeaning/ExampleChinese 一一对应):
  `language`(默认 `"pt-PT"`,以后加英语等其他语言时前端传别的值,后端不用改)、
  `word`、`example_sentence`、`chinese_meaning`、`example_chinese`。
- `GET /api/vocab?session_id=` 后端已实现,**前端目前没有"浏览/管理单词库"的界面**,
  只有"加入"的入口。用户要看单词库列表/删词的话,这块 UI 还没做,需要新加。

## API 契约(全部接口,新增功能优先复用而非重新设计)
| 接口 | 说明 |
|---|---|
| `GET /api/health` | 健康检查 |
| `POST /api/chat/audio` | FormData: audio,session_id,mode(pt/zh) |
| `POST /api/chat/text` | FormData: session_id,text,mode |
| `GET /api/history?session_id=&limit=100` | 恢复历史,含缓存的 translation/explanation |
| `POST /api/translate` `POST /api/explain` | FormData: text,message_id?,session_id(未用,占位)。有 message_id 且已有缓存则直接命中,不再调 LLM |
| `POST /api/breakdown` | FormData: text,message_id?,session_id。返回 `{words:[{word,meaning,sentence,sentence_zh}]}`,message_id 缓存命中不再调 LLM |
| `GET /api/audio/{name}` | 白名单正则 `^msg_[0-9a-f]{12}\.wav$` |
| `DELETE /api/session/{session_id}` | 清空历史 + 删除关联的回复音频文件 |
| `POST /api/user/bind` | body: {username, pin?} 绑定/恢复,返回 profile |
| `GET /api/user/{username}` | 拉 profile |
| `POST /api/user/{username}/theme` | body: {theme: {--var: #hex}},≤32项,双重正则白名单 |
| `POST /api/user/{username}/background` | FormData: file,≤5MB,后缀+文件头魔数双重校验,服务端生成 `bg_{uuid32}.{ext}` 文件名 |
| `GET /api/background/{name}` | 白名单正则,带 `Cache-Control: immutable`(文件名带uuid,内容不会变) |
| `POST /api/vocab` | **JSON body**(不是FormData): {session_id, items:[{language,word,example_sentence,chinese_meaning,example_chinese}]},批量加入单词库 |
| `GET /api/vocab?session_id=&limit=500` | 拉某个 session 的单词库列表,按插入时间倒序 |
| `WS /ws/chat/{session_id}` | **简化骨架**:整段收/整段发,历史走 `session_manager.get_history` 但**不落库** `orig`/`msg_uid`/`audio_file`,与 `/chat/*` 的持久化不对齐。要给 WS 通道加翻译/解析/拆词缓存需要先补这部分 |

统一错误格式:`HTTPException(status, "中文错误信息")`,前端 `errMsg()` 读
`detail`(string 或 `[{msg}]` 数组)或 `message`。响应体用 `{status, data}` 或扁平
对象均可,前端 `req()` 用 `j.data || j` 兼容。**新增接口请遵循这套约定。**

## 安全模式(项目里反复用到的写法,新增涉及文件/用户输入的功能时复用)
- **服务端生成文件名,绝不用用户输入拼路径**:回复音频 `msg_{uuid12}.wav`,背景图
  `bg_{uuid32}.{ext}`。
- **读取/删除文件前必须过白名单正则** `fullmatch`,防目录穿越(`_AUDIO_NAME`/
  `_BG_NAME`)。
- **上传文件不信任 Content-Type 和后缀**,靠文件头魔数嗅探(`_sniff_image`),且
  校验後缀与真实格式一致。
- **大小限制用"多读一字节"模式**(`file.read(MAX+1)`),避免整个超大文件读进内存
  才发现超限。
- **主题变量走双重正则白名单**(key: `--[\w-]{1,30}`,value: `#hex`),前后端
  各自校验一遍,任何一边新增变量名规则都要同步改。
- **LLM 返回结构化数据(如拆词的 JSON)时不要直接信任格式**:先剥掉可能的
  ```json 代码块标记再 parse,parse 失败或字段缺失直接 502,不要静默吞掉拼出
  一个假结果;有明确"这个词/值不该出现"的规则(比如 Correção 不是单词)时,在
  解析层再加一道正则兜底清洗,不要只靠 prompt 约束。

## LLM 引擎(`core/llm_engine.py`)
- `LLM_PROVIDER` 三选一:`gemini`/`grok`/`ollama`,业务代码(`routes.py`)完全不关心
  具体实现,只调 `get_llm_engine().generate(messages)`。
- 云端模式(gemini/grok)自动包一层 `FallbackEngine`:额度用完(429)冷却 30 分钟
  直接走本地 Ollama,其他故障冷却 1 分钟。**冷却期靠内存里的 `_skip_until`,进程重
  启会重置**,不持久化。
- Gemini 额外有模型级降级:主模型 → `gemini-2.5-flash` → `gemini-2.0-flash`,
  429/404 立即换模型,500/502/503/504 重试 `ATTEMPTS_PER_MODEL=2` 次再换。
- 新增 provider 需要继承 `BaseLLMEngine` 实现 `async generate(messages)`,注册进
  `_ENGINES` dict。

## ASR / TTS
- `asr_engine.py`:全局单例 + `asyncio.Lock` 双重检查锁定,防止并发请求重复加载
  模型;Windows 下会在 import 前手动把 torch/cublas/cudnn 的 DLL 目录加进搜索路径。
  中文求助模式必须显式传 `language="zh"`,否则会按葡语解码出现乱码。
- `tts_engine.py`:`clean_text_for_tts()` 会清掉 Markdown 符号和换行,**改
  `SYSTEM_PROMPT` 或新增回复内容时要注意 LLM 别输出 Markdown**,不然合成会有杂音。
  Piper 走异步子进程,每次生成带 uuid 的临时文件名避免并发覆盖。

## 存储(SQLite,`memory/` 下三个独立表)
- `messages` 表(session_manager):`msg_uid`/`orig`/`audio_file`/`translation`/
  `explanation`/`breakdown` 是后加的列,`init_db()` 用 `PRAGMA table_info` 检测缺列
  自动 `ALTER TABLE`,**旧库不需要删库重建,新增列也照这个模式加**。
- `users` 表(user_manager):同样的自动迁移模式。`theme` 存 JSON 字符串,读出来
  再 `json.loads`。
- `vocab` 表(vocab_manager):单词库,字段 `session_id`/`language`/`word`/
  `example_sentence`/`chinese_meaning`/`example_chinese`,新表没有历史包袱,目前
  没用自动迁移那套,以后加列可以照 messages/users 的模式补上。
- 三个表目前**没有外键关联**,纯靠 `session_id`(等于 `username` 或游客的
  `guestSid`)这个约定串起来。

## 已知简化 / 别顺手"修复"
- 没有鉴权 token,身份完全基于 username 明文 + 可选 PIN,生产部署前需要补鉴权/限流
  (README 里已经标注为待办)。
- WebSocket 骨架的持久化字段与 `/chat/*` 不对齐(见上面 API 表),这是有意的过渡
  状态,不要在无关需求里顺便"统一"。
- LLM 的语法纠错格式依赖 Prompt 约束(`tutor_prompt.py` 里的"Correção: "前缀),不是
  强约束的结构化输出;拆词逻辑因此要专门处理这个前缀(见上面"单词拆解 & 单词库"
  一节),不要假设教练的回复永远是干净的单句。
- `data/tmp_audio/` 正常流程会自动清理,进程异常退出可能残留,目前没有定时清理任务。
- 单词库目前没有查看/删除的前端界面,也没有去重(同一个词可以重复加入多条)。

## 回复用户时的默认做法
- 用户一般直接贴改动需求或报 bug,默认只改动涉及的文件。**每个被改动的文件要以
  完整文件的形式生成(从头到尾,包含未改动的部分),写到用户可以直接下载覆盖本地
  文件的地方(用 create_file 写到 /mnt/user-data/outputs/ 下对应文件名,再用
  present_files 交付),而不是把整份代码贴在聊天正文里。** 没有被这次改动涉及的
  文件不要重复生成。聊天正文里只用简短文字说明改了什么、为什么这么改、前后端
  哪一侧要跟着改;讲思路/原理也可以多写,但代码本身通过文件下载交付,不在正文里
  展示大段代码块。
- **改动接口字段/请求参数时,必须同时指出前端或后端哪一侧要跟着改**,不要只改一端
  就当作完成了。
- 涉及新文件上传/文件名生成的功能,默认套用上面"安全模式"里的写法(服务端生成
  文件名 + 白名单正则 + 魔数嗅探),除非用户明确说不需要。
- 项目语言是简体中文注释 + 中文 UI 文案(后端日志/异常信息也是中文),葡语系统
  提示词本身用葡语撰写,新增代码保持这个风格。
- 涉及 `.env`/API Key 的内容,提醒用户上传/分享前清空真实 Key。
- **改完项目功能后想一下这份 skill 有没有过时**:文件地图、API 契约表、存储
  一节、已知简化一节,只要新增/删改了接口、表、文件,就顺手同步更新,不要让 skill
  和实际代码脱节。
