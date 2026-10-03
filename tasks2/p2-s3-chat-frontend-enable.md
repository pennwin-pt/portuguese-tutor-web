# P2 步骤 3/3:聊天页提示 + 打开开关 + 验证 + 更新 skill

## 背景(只需要知道这些)
葡语学习网页的聊天联动已经在后端做完(P2 步骤 1、2):`/api/chat/audio` 和 `/api/chat/text` 的响应里有 `used_words`,形如 `[{"word_id": 7, "pt_word": "casa", "boosted": true}]`(**总是存在**,没有就是 `[]`)。开关 `config.py::CHAT_WORD_LINK` 目前默认关闭。
**本步:前端弹一个轻提示;把开关默认值改成开;验证;更新 skill。这是唯一会让功能"上线"的一步。**

## 要附的文件
`js/index.js`(聊天页脚本)、`config.py`、`SKILL.md`(项目的 skill 文档,没有就不附)

## 只读这些文件。定位用 grep 锚点,不要信行号。`index.js` 是 CRLF,改完保持 CRLF。

## 任务

### A. 前置检查(任何一项不满足就**停下**,不要改开关,告诉用户缺什么)
让用户确认以下脚本都已跑过并通过(AI 如果能运行就自己跑):
```
python tools/test_p2s1.py
python tools/test_p2s2.py
python tools/test_step5.py        # 第一阶段回归
```

### B. `js/index.js`:聊天响应后弹提示(锚点:`addAI(d);` 下面那一行 `if (d.tts_fallback) toast(`)
把这一行
```js
        if (d.tts_fallback) toast('在线语音暂时不可用，已用本地语音代替');
```
替换成(`toast` 一次只显示一条,所以合并成一条消息):
```js
        const notes = [];
        if (d.used_words?.length) notes.push('✅ 用到了：' + d.used_words.map(x => x.pt_word).join('、'));
        if (d.tts_fallback) notes.push('在线语音暂时不可用，已用本地语音代替');
        if (notes.length) toast(notes.join('；'));
```
- `toast` 内部用 `textContent`,所以 `pt_word` 不会被当 HTML。**不要**改用 `innerHTML`。
- **其余一律不动**(重新生成语音那处的 `tts_fallback` 提示是另一个函数,不要改)。

### C. `config.py`:打开开关
把 `CHAT_WORD_LINK` 的默认值 `"0"` 改成 `"1"`:
```python
CHAT_WORD_LINK: bool = os.getenv("CHAT_WORD_LINK", "1") not in ("0", "false", "False", "")
```
只改这一处。提醒用户:如果 `.env` 里已经写了 `CHAT_WORD_LINK=0`,那个优先,需要删掉或改成 1。

### D. 新建 `tools/test_p2s3.py`(**完整输出**)
放 `tools/`,开头 `sys.path.insert(0, 项目根目录)`,用 `assert`,全部通过打印 `P2步骤3测试全部通过`。
1. **静态检查 `index.js`**(路径按 `js/index.js`,不存在则按 `portuguese-tutor-web/js/index.js` 再找):
   - 包含 `d.used_words?.length` 和 `'✅ 用到了：'`;
   - 不再包含单独一行的 `if (d.tts_fallback) toast('在线语音暂时不可用，已用本地语音代替');`;
   - 文件全是 CRLF(没有单独的 `\n`);
   - 有 `node` 时 `node --check` 通过,没有就跳过并打印提示。
2. **开关**:`from config import settings`,在**没有** `CHAT_WORD_LINK` 环境变量的情况下(测试里先 `os.environ.pop`,再用 `importlib.reload(config)`),`settings.CHAT_WORD_LINK is True`;设成 `"0"` 后 reload 为 `False`;测完还原。
3. **端到端(后端)**:复用 `tools/test_p2s2.py` 的做法(假 LLM / 假 TTS / 临时库),开关开着跑一轮:进度里有 `casa`(box=1),用户说 "Eu moro numa casa pequena",教练上一句不含 `casa` → 返回 `used_words` 含 `casa`、`boosted:True`;连续 3 天(patch `today_str`)每天都说一遍 → box 依次 2、3、3,**从未出现 `mastered=1`**。

### E. 更新 `SKILL.md`(如果用户附了;只做最小改动,找不到对应小节就加在最接近的位置)
1. **配置/参数表**增加两行:`CHAT_WORD_LINK`(聊天联动总开关,默认开;`.env` 设 0 关闭)、`CHAT_WORD_N`(每轮最多给教练几个目标词,默认 5)。
2. **数据表说明**里 `word_progress` 补两列:`used_count`(聊天里用到的累计次数)、`last_used_on`(最近一次生效日期);注明它们**不在 `_COLS` 里**,只被 `credit_chat_use` 读写。
3. 新增一小节「聊天联动(P2)」,照抄要点,不要扩写:
   - 目标词:`word_planner.pick_chat_focus`——未掌握且最弱的词(`lapses` 降序 → 上次 `again` 优先 → `hard_streak` 降序 → `box` 升序)+ 最多 `CHAT_FOCUS_NEW`(2)个本周还没进入进度表的新词,共 ≤ `CHAT_WORD_N`。
   - 注入:`build_system_prompt(persona, focus_words)`;提示词让教练每轮最多自然带入 1~2 个词,不改人设/A1/简短等规则;无目标词时提示词与改动前逐字节相同。
   - 检测:仅 `mode == "pt"`;`pt_text.find_words` 整词匹配(不做词形变化/模糊);排除教练上一句里已出现的词(防鹦鹉学舌);目标词(去空格)少于 3 个字母不参与。
   - 加分:`credit_chat_use`——每词每天最多生效一次;只有 `box <= 2` 才 `+1`(封顶 3,**聊天绝不让词毕业**);`due_date/lapses/last_outcome/mode2_ok/mastered` 不动。
   - 接口:`/api/chat/audio`、`/api/chat/text` 响应新增 `used_words: [{word_id, pt_word, boosted}]`(总是存在)。前端 `index.js` 在 `addAI` 之后弹"✅ 用到了:…",与 `tts_fallback` 提示合并成一条 toast。
   - 故障隔离:`chat_words.py` 里所有异常吞掉并记日志,聊天主流程不受影响。
   - 回退:`.env` 加 `CHAT_WORD_LINK=0` 重启即可。
4. **"已知简化 / 别顺手修复"** 补三条:只检测当前注入的目标词,聊天里用了别的已学词不加分(有意,限成本);ASR 听错的词不会被计数(宁可漏判不误判);`used_words` 里 `boosted:false` 的词(今天已加过 / box≥3 / 没有进度行)只提示不加分。

## 不要做
- 不要改除上面 B、C 之外的任何代码;不要为了让测试通过而改步骤 1、2 的逻辑,测试不过就如实报告。
- 不要实现"聊天里查词加入单词本"之类别的联动。

## 交付格式
1. 改后的 `js/index.js`、`config.py`(只有上面几行的改动,可只给改动处)。
2. 完整的 `tools/test_p2s3.py`。
3. 改后的 `SKILL.md`(完整文件,若用户附了)。
4. **最终报告**(给用户看,6 行内):
```
P2完成，聊天联动已开启。
- 前置脚本：<都通过 / 哪个没过>
- P2步骤3测试：<通过 / 哪条没过>
- 回退方法：.env 加 CHAT_WORD_LINK=0 并重启
- 偏差：<无 / 具体说明>
```
末尾**原样附上**这段「上线后观察什么」:
- 聊天时教练偶尔会自然带入你最弱的词;回复仍应是 A1 水平、两句以内。如果发现教练回复变长/变生硬/总在讲单词,把 `.env` 里 `CHAT_WORD_N` 改成 2,或直接 `CHAT_WORD_LINK=0`。
- 你说的葡语里用到了这些词,会弹"✅ 用到了:xxx";同一个词每天最多加一次分,而且最多把熟练度推到 3,毕业仍要靠单词任务里的测试。
- 中文求助模式、打字和说话都不影响提示;只有 `pt` 模式才会加分。

## 完成标志
`python tools/test_p2s3.py` 打印 `P2步骤3测试全部通过`,且 `CHAT_WORD_LINK` 默认值为开。
