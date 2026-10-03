# 步骤 1/5:新增 `make_cloze` 挖空函数 + 覆盖率检测脚本

## 背景(只需要知道这些)
项目是葡语学习网页(FastAPI 后端 + 原生 JS 前端)。要给单词任务新增"句子填空"题型:把例句里的目标单词换成 `____`,让用户说出缺的词。**本步只写一个纯函数和一个检测脚本,不改变任何现有行为。**

## 要附的文件
`memory/word_planner.py`(只会在文件里**新增**内容,不改现有代码)

## 只读这个文件,别的都不用看。

## 任务

### A. 在 `memory/word_planner.py` 新增(放在顶部常量区之后、第一个函数之前)

```python
CLOZE_BLANK = "____"      # 挖空占位符；前端按它切分例句
CLOZE_MAX = 6             # 一天最多出几道填空题（步骤 2 使用）
```
并在文件顶部确认已 `import re`、`import unicodedata`(缺什么补什么,已有的不重复)。

新增纯函数(不 import 路由/数据库,不改其他函数):

```python
def make_cloze(sentence: str | None, pt_word: str | None) -> str | None:
    """把例句里的目标词换成 CLOZE_BLANK；找不到返回 None（调用方据此退回普通题）。"""
```

**规则(必须完全照做):**
1. `sentence` 或 `pt_word` 为 `None` / 空 / 全空白 → 返回 `None`。
2. 两个入参都先做 `unicodedata.normalize("NFC", ...)` 和 `strip()`。
3. `target` = `pt_word` 去掉所有括号及括号内的内容(全角和半角括号都要处理,如 `"casa (n.)"` → `"casa"`,`"casa（名词）"` → `"casa"`),再 `strip()`。结果为空 → `None`。
4. 正则:`(?<!\w)` + `re.escape(target)` + `(?!\w)`,flags=`re.IGNORECASE`。(Python 3 的 `\w` 默认支持 Unicode,带重音的字母算单词字符。)
5. **只替换第一处匹配**,替换成 `CLOZE_BLANK`;没匹配到 → `None`。
6. **只做整词精确匹配**,不做动词变位/复数的模糊匹配(有意的,以后再说)。
7. 返回的字符串保持原句其余部分原样(大小写、标点、空格不变)。

### B. 新建 `tools/check_cloze.py`(**完整输出这个文件**)

用途:用户在自己的机器上运行,统计词库里多少词能挖空。要求:
1. 文件开头 `sys.path.insert(0, 项目根目录)`(脚本在 `tools/` 下,项目根是上一级),这样能 `from config import settings` 和 `from memory.word_planner import make_cloze`。
2. **先跑自测**(下面的断言表),任何一条失败就打印失败项并 `sys.exit(1)`。
3. 再用 `sqlite3` **只读**打开 `settings.WORD_DB_PATH`(用 URI:`file:{path}?mode=ro`,`uri=True`),执行 `SELECT Id, Text, ExampleSentence FROM Words`。词库文件不存在则打印友好错误并退出。
4. 对每一行调用 `make_cloze(ExampleSentence, Text)`,统计:总词数、有例句的词数、成功数、**成功率 = 成功数 / 有例句的词数**。
5. 打印:上面的统计,以及最多 10 个失败样例(`Text` 和 `ExampleSentence`)。
6. 最后一行打印结论:成功率 ≥ 50% 打印 `✅ 可以继续步骤 2`;否则打印 `⚠️ 覆盖率偏低，请把以上输出发给设计者，先别继续`。
7. 全部中文输出;不修改数据库;不依赖第三方库。

### 自测断言表(脚本里照抄)

| 输入 `(sentence, pt_word)` | 期望 |
|---|---|
| `("Eu gosto da minha casa.", "casa")` | `"Eu gosto da minha ____."` |
| `("A Casa é grande.", "casa")` | `"A ____ é grande."` |
| `("As casas são grandes.", "casa")` | `None` |
| `("Eu gosto da minha casa.", "casa (n.)")` | `"Eu gosto da minha ____."` |
| `("Eu gosto da minha casa.", "casa（名词）")` | `"Eu gosto da minha ____."` |
| `("Vou à praia.", "")` | `None` |
| `(None, "casa")` | `None` |
| `("Ele é um bom amigo.", "bom")` | `"Ele é um ____ amigo."` |
| `("A casa e a casa.", "casa")` | `"A ____ e a casa."`(只换第一处) |
| `("Está na hora de comer.", "hora")` | `"Está na ____ de comer."` |

## 不要做
- 不要改 `choose_mode`、`apply_outcome`、`build_today_plan` 或任何现有函数。
- 不要加开关、不要接入路由。
- 不要新建数据库表。

## 交付格式
1. 改后的 `memory/word_planner.py`(完整文件,或只给新增的常量和 `make_cloze` 函数,按总览里的"两种输出方式")。
2. 完整的 `tools/check_cloze.py`。
3. **交接备注**(照这个模板,3~5 行):
```
步骤1完成。
- 改动：word_planner.py 新增 CLOZE_BLANK、CLOZE_MAX、make_cloze；新增 tools/check_cloze.py
- 自测：<通过/失败哪几条>
- 偏差：<无 / 具体说明>
```

## 完成标志
`python tools/check_cloze.py` 的自测全部通过(AI 在自己环境里无法访问词库时,只要自测断言通过即可,覆盖率由用户自己运行)。
