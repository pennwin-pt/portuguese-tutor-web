# P4 步骤 2/3:后端——挖空时轮换例句、朗读接口支持 `ex`

## 背景(只需要知道这些)
葡语学习网页(FastAPI)的单词任务有「句子填空」(mode 3)。`api/word_routes.py::_load_words(entries)` 把计划条目 `{word_id, kind, mode}` 展开成前端用的词对象;对 `mode == 3` 的条目,现在用 `word_planner.make_cloze(w.pt_sentence, w.pt_word)` 挖空:成功就带 `cloze` 字段、保持 3;失败就把 `mode` 改成 2、不带 `cloze`(不回写计划表)。
P4 步骤 1 已经做好(**签名就是这样**):`memory/word_example_manager.py` 里有 `get_examples(word_ids) -> {word_id: [{"idx","pt_sentence","cn_sentence"}...]}`(只含 enabled、idx ≥ 1、按 idx 升序)和已建好的表 `word_example_use(session_id, word_id, last_idx, last_used_on)`(本步才用)。**idx = 0 约定为词库里的原例句**(不在表里)。
**本步目标**:挖空时在「原例句 + 可用生成例句」里**轮换**选一条(而不是总用原例句);这既避免用户背住句子,也把"原例句挖不出空、但生成例句能挖空"的词救回来。没生成过例句时,行为必须和改动前完全一样。

## 要附的文件
`api/word_routes.py`、`memory/word_example_manager.py`(步骤 1 的产物)

## 只读这两个文件。定位用 grep 锚点,不要信行号。CRLF 保持。

## 任务

### A. `memory/word_example_manager.py`:追加 4 个函数(不改步骤 1 已有的)
1. **纯函数** `pick_example(pool: list[dict], last_idx: int | None, used_today: bool) -> dict | None`
   - `pool`:候选列表,每项至少有 `idx`;**调用方保证它们都已经能挖空**;按 `idx` 升序处理(函数内部自己排序,不要信入参顺序)。
   - 空 `pool` → `None`。
   - `used_today` 为真 **且** `last_idx` 在 `pool` 的某个 `idx` 里 → 返回那一项(**同一天刷新页面,题目必须稳定**)。
   - 否则轮换:`last_idx is None` → 取 `idx` 最小的一项(优先原例句 idx 0);否则取 `idx` 大于 `last_idx` 的最小一项;没有更大的就回到最小的一项。
2. `async def get_example(word_id: int, idx: int) -> dict | None`:返回 `{"idx","pt_sentence","cn_sentence"}`,**只返回 enabled 的**;没有返回 `None`。
3. `async def get_uses(session_id: str, word_ids: list[int]) -> dict[int, dict]`:`{word_id: {"last_idx", "last_used_on"}}`;空入参返回 `{}`。
4. `async def record_use(session_id: str, uses: list[tuple[int, int, str]]) -> None`:`uses` 元素 `(word_id, idx, today_iso)`;`INSERT ... ON CONFLICT(session_id, word_id) DO UPDATE`;一次事务;空列表什么都不做。

### B. `api/word_routes.py::_load_words`(锚点:`async def _load_words`)
1. **签名向后兼容**:`async def _load_words(entries: List[dict], session_id: Optional[str] = None) -> List[dict]`。已有的、没有传 `session_id` 的调用(`/today` 里给 `preview` 用的那处,以及第一阶段测试 `tools/test_step3.py` 里的调用)**行为必须不变**。
2. 给计划条目的那处调用传入 `session_id`(锚点:`words = await _load_words(plan["items"])` → `words = await _load_words(plan["items"], session_id)`;`session_id` 为空/`None` 时就传 `None`)。`preview` 那处不传。
3. 对 `mode == 3` 的条目,把原来的"`cloze = make_cloze(w.pt_sentence, w.pt_word)`,失败降级"改成:
   - **没有 `session_id`**:候选池只有原例句(idx 0)——也就是和改动前完全一样,**不访问例句表**。
   - **有 `session_id`**:
     1. 一次性(整个 `_load_words` 只查一次)取这批词的 `get_examples(ids)` 和 `get_uses(session_id, ids)`。
     2. 对每个 mode 3 的词,候选池 = `[原例句 idx 0] + 它的生成例句`;**只保留 `make_cloze(候选的 pt_sentence, w.pt_word)` 不为 `None` 的**(挖空必须在读取时重新校验,因为词条文本可能被改过),每项带上它的 `cloze`。
     3. `used_today = uses.get(wid, {}).get("last_used_on") == 今天`(今天 = `word_task_manager.today_str()`);`chosen = pick_example(pool, last_idx, used_today)`。
     4. `chosen is None` → 降级:`mode = 2`,**不带** `cloze` / `ex`(同改动前)。
     5. 否则词对象:`mode` 保持 3;`cloze = chosen["cloze"]`;**`pt_sentence` 和 `cn_sentence` 换成所选例句的**(这样前端的填空题中文翻译、结果页例句都和挖空的句子一致);新增字段 **`ex = chosen["idx"]`**(整数;原例句为 0)。
     6. 本批所有选择完成后,把**今天还没记录过的**选择(`not used_today`,或 `used_today` 但 `last_idx` 变了)用一次 `record_use(session_id, [...])` 写入。
   - **故障隔离**:访问例句表(`get_examples` / `get_uses` / `record_use`)出现任何异常 → `logger.exception`,**退回"只用原例句"的旧行为**,绝不能让 `/today` 失败。
4. 不是 mode 3 的条目、预习条目:不带 `ex`,行为不变。
5. **不要把降级或选择回写到计划表**(计划表里仍是 3,每次读取重新判定)。

### C. 朗读接口支持 `ex`(锚点:`async def words_audio`)
- 参数新增 `ex: int = 0`。
- `kind == "sentence"` 且 `ex > 0`:文本取 `word_example_manager.get_example(word_id, ex)` 的 `pt_sentence`;取不到 → `HTTPException(404, "例句不存在")`。其余情况(`ex == 0`、`kind == "word"`)文本来源不变。
- 缓存键是按文本哈希算的,**不用改**(不同例句自然不同缓存文件)。
- `ex < 0` → 422(用 `Query(0, ge=0)` 或手动检查,按文件里现有风格)。

## 不要做
- 不要改 `make_cloze`、`word_planner.py`、`word_progress_manager.py`、前端。
- 不要改 mode 1 / 2 的词的例句(轮换只发生在 mode 3)。
- 不要改 `_judge_pt_cloze` 等评判函数;不要新增表/列。
- 不要在 `_load_words` 里逐个词查库(必须批量,避免 N+1)。

## 要新建的测试脚本 `tools/test_p4s2.py`(**完整输出**)
放 `tools/`,开头 `sys.path.insert(0, 项目根目录)`;用 `assert`,全部通过打印 `P4步骤2测试全部通过`。数据库用临时 `settings.SQLITE_PATH`(`init_db()` 各 manager);`word_source.get_words` / `get_word` 换成返回固定 `WordItem` 的假函数;`word_task_manager.today_str` 用 patch 控制日期;`asyncio.run`。(参考 `tools/test_step3.py` 的做法。)

**`pick_example`(纯函数)**
| # | 输入 | 期望 |
|---|---|---|
| 1 | pool idx `[0,1,2]`,`last=None, used_today=False` | idx 0 |
| 2 | `last=0` / `1` / `2`,`used_today=False` | 依次 1 / 2 / 0(回绕) |
| 3 | `last=1, used_today=True` | 1(同天稳定) |
| 4 | `last=3`(已不在池里),`used_today=True` | 不当作"今天已用":回绕到 idx 0 |
| 5 | pool `[1,2]`(原例句不可挖空),`last=None` / `2` | 1 / 1 |
| 6 | pool `[]`;pool `[0]` 任意 last | `None`;idx 0 |
| 7 | 入参 pool 乱序 `[2,0,1]` | 结果与有序时相同 |

**`_load_words` + 例句表**(`W1`:`pt_word="casa"`,原例句 `"Eu gosto da minha casa."`;生成例句 idx1 `"A casa é grande."`、idx2 `"Vivo numa casa nova."`;`W2`:`pt_word="escrever"`,原例句 `"Agora escrevam a resposta."`(挖不出空),生成例句 idx1 `"Eu quero escrever uma carta."`;条目都是 `mode=3, kind="review"`)
| # | 场景 | 期望 |
|---|---|---|
| 8 | **不传 `session_id`** 调 `_load_words` | `W1` 的 `cloze=="Eu gosto da minha ____."`、`pt_sentence` 是原句、没有 `ex` 键;`W2` 降级为 `mode==2` 且无 `cloze`(= 第一阶段行为) |
| 9 | 传 `session_id`,但例句表是空的 | 与第 8 条完全相同(没生成过例句 = 行为不变) |
| 10 | 传 `session_id`,有生成例句,第 1 天 | `W1`:`ex==0`、原例句挖空;`W2`:**`mode==3`**(被救回)、`ex==1`、`cloze=="Eu quero ____ uma carta."`、`pt_sentence`/`cn_sentence` 是例句 idx1 的 |
| 11 | 同一天再次调用 | 两个词的选择与第 10 条完全相同(稳定) |
| 12 | 把 `today_str` 改成第 2 天、第 3 天、第 4 天,逐天调用 | `W1` 的 `ex` 依次为 1、2、0(轮换并回绕);`W2` 一直是 1 |
| 13 | 生成例句 idx1 被 `enabled=0` 后(换一个新的 `session_id`) | `W1` 的池里没有 idx1:`ex` 序列只在 0、2 之间轮换 |
| 14 | 一个生成例句不含目标词(如词条文本后来被改过) | 该例句不进池(读取时重新校验) |
| 15 | 不同 `session_id` 互不影响 | 用户 A 的轮换进度不影响用户 B |
| 16 | **故障隔离**:让 `get_examples` 抛异常 | `/today` 路径不抛异常,退回只用原例句(与第 8 条相同) |
| 17 | mode 1 / 2 的条目、`preview` 条目 | 没有 `ex` 键,`pt_sentence` 保持原句 |
| 18 | 整个 `_load_words` 调用对例句表的查询次数(给 `get_examples`/`get_uses` 加计数) | 各恰好 1 次(没有 N+1),`record_use` 至多 1 次 |

**朗读接口**(`TestClient` 只挂 `word_routes.router`;`tts_engine.synthesize_any` 换成记录文本并返回真实临时 wav 的假函数;`word_source.get_word` 换成假函数)
| # | 场景 | 期望 |
|---|---|---|
| 19 | `GET /api/words/1/audio?kind=sentence&ex=1` | 200;合成用的文本是例句 idx1 的 `pt_sentence` |
| 20 | `kind=sentence&ex=0`、不传 `ex` | 合成用的文本是词库原例句(行为不变) |
| 21 | `kind=sentence&ex=9`(不存在) | 404 |
| 22 | `ex=-1` | 422 |
| 23 | `kind=word&ex=1` | 朗读的是单词本身(`ex` 被忽略) |

另外**运行已有的** `tools/test_step3.py`、`test_step5.py`、(若已做 P3)`test_p3s2.py`,确认仍然全部通过。

## 交付格式
1. 改后的 `api/word_routes.py`、`memory/word_example_manager.py`(完整文件,或只给改动的函数 + 新增函数,按总览里的"两种输出方式")。
2. 完整的 `tools/test_p4s2.py`。
3. **交接备注**:
```
P4步骤2完成。
- 改动：word_example_manager 新增 pick_example/get_example/get_uses/record_use；word_routes._load_words 新增可选 session_id、mode 3 挖空改为在「原例句+生成例句」里轮换（词对象换 pt_sentence/cn_sentence 并带 ex）、故障隔离；words_audio 新增 ex 参数；新增 tools/test_p4s2.py
- 测试：<23 条全部通过 / 哪几条没过>；回归：<通过/不通过>
- 偏差：<无 / 具体说明>
```

## 完成标志
`python tools/test_p4s2.py` 打印 `P4步骤2测试全部通过`。(没生成过例句时,线上行为与改动前一致。)
