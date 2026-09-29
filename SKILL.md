---
name: "pt-tutor-app"
description: 帮 Peng Wang 开发/修改「葡语陪练」全栈项目(前端:index.html/css/index.css/css/touch-protection.css/js/index.js,原生JS无构建;后端:FastAPI+SQLite+Faster-Whisper+Piper/在线TTS+Gemini/Grok/Ollama)时必须使用此skill。用户提到"葡语陪练"、粘贴项目任意一端代码,或要求改语音对话/ASR/TTS音色/LLM切换/智能体绑定/主题背景/历史记录/删除消息/单词拆解/单词库等任何功能时,先读本skill再动手,不要让用户重新粘贴源文件或解释背景与接口约定。前后端常一起改,涉及接口字段时两端都要检查。
---

# 葡语陪练 · 协作规则

语音进-语音出的葡语陪练 APP。前端纯静态原生 JS(**不引入构建链/框架**);后端 FastAPI(**不引入 ORM/新数据库**),除非用户明确要求。
流水线:ASR → 记忆(SQLite) → LLM(可切换+自动降级) → TTS。改源文件即上线。

## 文件地图
```
前端  index.html / css/index.css / css/touch-protection.css / js/index.js
后端  main.py(入口,startup 预加载+建表+WS骨架)  run.py  config.py(读.env)
  api/routes.py        聊天/历史/翻译/解析/拆词/重生成语音/删消息/音频/清空/单词库
  api/user_routes.py   智能体绑定 + 主题 + 背景
  core/asr_engine.py   Faster-Whisper 单例懒加载
  core/llm_engine.py   Gemini/Grok/Ollama 工厂 + 降级
  core/tts_engine.py   Piper + google/edge/streamelements 在线音源(synthesize_any)
  memory/session_manager.py  messages 表   memory/user_manager.py  users 表
  memory/vocab_manager.py    vocab 表
  prompts/tutor_prompt.py(教练规则 A1 pt-PT + `build_system_prompt(persona)`)  prompts/helper_prompts.py(ZH2PT/PT2ZH/EXPLAIN/BREAKDOWN)
```

## 术语与身份
- UI 里一律叫 **智能体**(不再叫"用户名");代码/接口仍沿用 `username`/`/api/user/*`,不要改接口名。
- **智能体名 = username = session_id**。未绑定时用游客 `guestSid`(`localStorage.sid`)。三张表按 `session_id` 关联,无外键。
- 名称正则两端必须一致:`/^[A-Za-z0-9_\u4e00-\u9fa5]{2,20}$/`(前端 `NAME_RE`,后端 `user_manager.USERNAME_RE`,后端用 `fullmatch`)。
- users 表有可选 PIN(pbkdf2),**前端无 PIN UI**;不存在且无 PIN 则静默创建,有 PIN 必须传对否则 401。

## 前端结构(js/index.js)
- **标题栏**:`#st` 连接状态 | `#ttl`(`h1#agent` 显示智能体名,游客显示"葡语陪练";`#agentVoice` 小字显示当前音色如"🔊 Edge · 女声 Raquel") | 👤 🎨 模式按钮。长按 h1 = 清空当前会话。`updateTitle()` 同步标题和 `document.title`。
- **👤 面板 `#umask`(绑定智能体)**:名称输入 + **语音音色设置**(`#ttsSeg` 音源四选一、`#voiceOptSeg` 音色、`#voiceHint`)+ 绑定/退出。音色**不再常驻页面**,只在此面板里改,点击即生效。
- **角色人设**:同一面板里音色下面,`#persona` 多行输入(≤300 字)+ 模板按钮(三年级老师 Sara/三年级女生/三年级男生/默认 Tuga)+ `#psave` 保存。**只存服务器**(`users.persona`),游客禁用;`applyServerPersona/syncPersonaUI/refreshPersona`,`syncUserUI()` 会顺带重置草稿。`PERSONA_MAX` 与后端 `user_manager.PERSONA_MAX` 必须一致,`cleanPersona` 与后端 `clean_persona` 规则一致(统一换行、去控制字符和 `<>`)。
- **音色按智能体各存一份**:`localStorage['tts_'+sid] = {provider, voices:{edge,streamelements}}`,`loadTts/saveTts`;启动与切换/退出智能体时调 `syncAgentVoice()`(= loadTts + syncTtsSeg + updateTitle)。旧全局键 `ttsProvider/ttsVoice_*` 首次加载时一次性迁移给当前 sid 后删除。**音色只在本机,不上服务器**(换设备需重选;要同步得给后端加字段)。
- `VOICE_OPTIONS`(edge: Raquel/Duarte;streamelements: Ines/Cristiano)的 key **必须与后端 `tts_engine` 的 EDGE_VOICES/STREAMELEMENTS_VOICES 白名单一致**,改一边同步另一边。
- **消息渲染**:`addMe`/`fillMe`(用户)、`addAI`(教练)、`makePill`(语音条,教练/中文求助用户共用)、`press(node,onLong,onTap)`(长按 420ms)、`bindAudio`、`restoreCache`。每个消息行带 `data-rid` = 数据库行 id。
- 葡语模式:用户消息是**纯文字气泡,无长按**(保留系统复制文字)。中文求助模式:用户译文有自己的语音条,长按菜单与教练一致。
- **长按菜单 `#sheet`**(`openMenu(m)`):`data-k` = pt 原文 / zh 翻译 / ex 语法解析 / bd 拆词 / regen 重生成语音 / del 删除 / x 取消。`m.rowId` 缺失时隐藏 del。
- 主题:CSS 变量 `--blue/--me/--blue2`,`applyTheme/saveTheme`;背景 `setBg`。面板通用关闭走 `.mask` + `data-close`。
- 通用:`req(path, body, method)`(FormData→multipart,对象→JSON,返回 `j.data||j`),`post/get`;错误 `errMsg()` 读 `detail`/`message`。

## 角色人设(persona)
- 存 `users.persona`(纯文本,自动补列);`POST /api/user/{username}/persona` JSON `{persona}`,清洗后 >300 字 422(不静默截断),空串=清除;`_profile` 返回 `persona`。
- `_run_turn` 里 `user_manager.get_persona(session_id)` 取一次,`build_system_prompt(persona)` = 原规则 + `<persona>` 段落,段落声明「只改身份/性格/语气,不得违反规则 1–8」(pt-PT、A1、简短、`Correção:`、无 Markdown)。读取失败退回默认教练。
- **只影响聊天回复**:ZH2PT/PT2ZH/EXPLAIN/BREAKDOWN 一次性提示词不带人设;WS 骨架不带人设(有意)。
- 中途改人设:历史里旧语气会影响几轮,属预期;智能体名**不**注入提示词(模板里自带名字如 Sara)。

## 后端主流程 `_run_turn`(/chat/audio、/chat/text)
1. `mode=zh` 先用 `ZH2PT_PROMPT` 译成葡语(`user_pt`);`mode=pt` 时 `user_pt == raw_text`。中文模式 ASR 必须 `language="zh"`。
2. 取 `get_history()`(最近 `LLM_HISTORY_TURNS` 轮)+ `SYSTEM_PROMPT` + 当前输入 → LLM。中文模式下用户译文语音与 LLM **并行**合成(`_safe_synth`,失败不影响主流程)。
3. TTS:`synthesize_any(text, provider, voice, force=False)`,在线音源失败自动回退 Piper,返回 `(tmp, ext, used_provider)`。表单字段 `tts_provider`(piper/google/edge/streamelements)、`tts_voice`(仅 edge/SE,非法值后端回退默认)。
4. `_persist_reply`:落到 `data/replies/msg_{uuid12}.{wav|mp3}`;`CACHED_PROVIDERS`(在线音源)用 **copy**(缓存要留),Piper 用 **move**。
5. 入库用 **`session_manager.add_turn`(同一事务写用户+教练两行,保证相邻)**:用户行 `content=user_pt, orig=raw_text, msg_uid/audio_file(仅中文模式有)`;教练行 `msg_uid, audio_file`。
6. 响应体(HTTP 无 `audio_base64`,统一 `audio_url`):`message_id/ai_text/audio_url/audio_format`(教练)、`user_text/user_pt`、`user_message_id/user_audio_url/user_audio_format`(仅中文模式)、**`user_row_id/ai_row_id`**、`tts_provider_used/tts_fallback`。改字段时同步查前端 `send()/fillMe()/addAI()/audioUrl()`。

## 删除消息(仅语音条入口)
- 前端:长按教练语音条或中文求助的用户语音条 → 🗑 → `delTurn(m)` → `DELETE /api/message/{row_id}?session_id=`;按返回的 `deleted` id 移除 `.row[data-rid]`,空了显示 `TIP`,并停掉已被移除的播放。无二次确认(有意)。
- 后端 `session_manager.delete_turn`:校验 `session_id` 与行匹配(否则 404);删教练行→带走其前一条 user 行;删用户行→带走其后一条 assistant 行;同事务删除。LLM 记忆读自 messages 表,故记忆同步清除;缓存(翻译/解析/拆词)在行内一并消失;音频文件过 `_AUDIO_NAME` 白名单后 unlink;**单词库不受影响**。
- 历史接口每条带 `row_id`。WS 通道用 `add_message`、不存行 id,**不支持删除**(有意,别顺手统一)。

## 重新生成语音 `/regenerate_audio`
对同一 `content` 用当前音源/音色 `force=True` 重合成(跳过在线缓存)。**新文件名必须每次随机**(否则 URL 不变,浏览器 `<audio>` 播缓存旧内容),更新 `audio_file` 后删旧文件。教练与中文模式用户语音条都走它,不限 role。

## 单词拆解 & 单词库
- 入口:菜单 `bd` → `openBreakdown(m)` → `POST /api/breakdown`(FormData: text,message_id?,session_id);按 `message_id` 缓存在 `messages.breakdown`(JSON)。
- 教练一条回复可能多句(如 `Correção: ...\n\n...`)。`BREAKDOWN_PROMPT` 要求先拆句、去 `Correção:` 前缀,每词自带 `sentence/sentence_zh`。**不要退回"整段当例句"**。
- `_parse_breakdown_json` 兜底(剥 ```json 围栏、正则去残留前缀、过滤 word 为 correção 系列)**不要删**;格式不对直接 502,不硬凑。
- 加入单词库:`POST /api/vocab`,**JSON body**(非 FormData):`{session_id, items:[{language,word,example_sentence,chinese_meaning,example_chinese}]}`;`language` 默认 `pt-PT`。
- `GET /api/vocab?session_id=&limit=500` 已有,**前端无浏览/删词界面,无去重**。

## API 契约
| 接口 | 说明 |
|---|---|
| `GET /api/health` | 健康检查 |
| `POST /api/chat/audio` | FormData: audio,session_id,mode,tts_provider,tts_voice? |
| `POST /api/chat/text` | FormData: session_id,text,mode,tts_provider,tts_voice? |
| `GET /api/history?session_id=&limit=100` | 历史,含 row_id/缓存的 translation/explanation |
| `POST /api/translate` `/explain` `/breakdown` | FormData: text,message_id?,session_id(占位);有 message_id 且有缓存则不调 LLM |
| `POST /api/regenerate_audio` | FormData: message_id,tts_provider,tts_voice? |
| `DELETE /api/message/{row_id}?session_id=` | 删一轮(见上),返回 `{deleted:[ids]}` |
| `DELETE /api/session/{session_id}` | 清空历史 + 删音频 |
| `GET /api/audio/{name}` | 白名单 `^msg_[0-9a-f]{12}\.(wav\|mp3)$` |
| `POST /api/user/bind` | JSON {username,pin?} → profile |
| `GET /api/user/{username}` | 拉 profile |
| `POST /api/user/{username}/persona` | JSON {persona:str},≤300 字(清洗后),空=清除 |
| `POST /api/user/{username}/theme` | JSON {theme:{--var:#hex}},≤32项,双重白名单 |
| `POST /api/user/{username}/background` | FormData: file ≤5MB,后缀+魔数双校验,存 `bg_{uuid32}.{ext}` |
| `GET /api/background/{name}` | 白名单,`Cache-Control: immutable` |
| `POST/GET /api/vocab` | 见上 |
| `WS /ws/chat/{session_id}` | 简化骨架,整段收发,不落 orig/msg_uid/audio_file |

错误统一 `HTTPException(status, "中文信息")`;新接口沿用此约定。

## 安全模式(涉及文件/用户输入时复用)
- 文件名服务端生成(`msg_{uuid12}`、`bg_{uuid32}`),不拼用户输入;读/删文件前先 `fullmatch` 白名单。
- 上传不信 Content-Type/后缀,靠魔数嗅探;大小限制用"多读一字节"(`read(MAX+1)`)。
- 主题变量前后端各校验:key `--[\w-]{1,30}`,value `#hex`。
- LLM 结构化输出不直接信任:剥围栏→parse→失败 502;有明确禁忌值时在解析层再加正则兜底。

## LLM / ASR / TTS 要点
- `LLM_PROVIDER`:gemini/grok/ollama;业务只调 `get_llm_engine().generate(messages)`。云端自动包 `FallbackEngine`:429 冷却 30 分钟走 Ollama,其他故障 1 分钟;冷却在内存(`_skip_until`),重启重置。Gemini 另有模型降级(主→2.5-flash→2.0-flash,429/404 立即换,5xx 重试 2 次)。新增 provider:继承 `BaseLLMEngine` 实现 `async generate`,注册进 `_ENGINES`。
- ASR:全局单例 + `asyncio.Lock` 双检锁;Windows 手动加 torch/cublas/cudnn DLL 路径。
- TTS:`clean_text_for_tts()` 清 Markdown/换行,**LLM 不要输出 Markdown**;Piper 异步子进程,临时文件带 uuid。

## 存储(SQLite,自动迁移)
- `messages`:id,session_id,role,content,created_at + 后加列 `msg_uid/orig/audio_file/translation/explanation/breakdown`。`init_db()` 用 `PRAGMA table_info` 缺列自动 `ALTER`,**新增列照此模式,不用删库**。
- `users`:同样自动迁移(含 `tts`、`persona` 列);`theme` 存 JSON 字符串,读出 `json.loads`。
- `vocab`:session_id,language,word,example_sentence,chinese_meaning,example_chinese;暂无迁移机制。

## 已知简化 / 别顺手"修复"
- 无鉴权 token,身份靠名称明文 + 可选 PIN;上线前需补鉴权/限流。
- WS 与 `/chat/*` 持久化不对齐(有意)。
- 语法纠错格式靠 Prompt(`Correção: ` 前缀),不是结构化输出。
- `data/tmp_audio/` 异常退出可能残留,无定时清理。
- 音色仅本机存储(见上)。

## 回复与交付约定
- 默认只改涉及的文件;**被改文件以完整文件形式**用 `create_file` 写到 `/mnt/user-data/outputs/`(保持原目录结构、原换行符,前端文件是 CRLF)并 `present_files` 交付,**正文不贴大段代码**,只简述改了什么/为什么/哪一侧要跟着改。
- 改接口字段/参数必须指出另一端要同步改什么;交付前对 Python 做 `ast.parse`、JS 做 `node --check`,后端逻辑能用临时 SQLite 就实测。
- 中文 UI 文案 + 中文注释;葡语提示词用葡语。涉及 `.env`/API Key 提醒用户分享前清空。
- 改完功能顺手更新本 skill(文件地图/API 表/存储/已知简化);`/mnt/skills` 只读时,把新版 SKILL.md 放 outputs 让用户自行替换。