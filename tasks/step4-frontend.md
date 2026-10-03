# 步骤 4/5:前端——渲染句子填空题

## 背景(只需要知道这些)
葡语学习网页的「单词任务页」是原生 JS(无框架无构建),文件 `js/words.js` + `css/words.css`。要新增题型 **mode 3 = 句子填空**。
后端(步骤 3)会在 `GET /api/words/today` 返回的词对象里,对 mode 3 的词多给一个字段 `cloze`(字符串,例如 `"Eu gosto da minha ____."`,缺词处是 4 个下划线 `____`);词对象还有 `pt_word`、`cn_meaning`、`pt_sentence`、`cn_sentence`、`mode`、`kind`、`id`。
- `mode 1` = 看葡语说中文,`2` = 看中文说葡语,`3` = 看挖空句子、**只说缺的那个词**。
- 后端调度开关目前是关闭的,所以**本步做完后页面上不会真的出现 mode 3**,现有功能必须完全不受影响;本步只是让前端"能显示"。

## 要附的文件
`js/words.js`(**最新版**,已含麦克风复用改动)、`css/words.css`

## 只读这两个文件。定位用 grep 锚点,不要信行号。**`words.js` 是 CRLF 换行,改完必须保持 CRLF。**

## 任务

### A. `js/words.js` 的改动(共 4 处)

**1. 放开词过滤**(锚点:`async function fetchToday`)
里面有 `(w.mode === 1 || w.mode === 2)`,改成 `[1, 2, 3].includes(w.mode)`。
> ⚠️ 漏改这一处会导致 mode 3 的词被整个过滤掉、今日任务少词。

**2. 新增渲染函数并接入 `viewTest`**(锚点:`function viewTest`)
在 `viewTest` 前面新增 `viewCloze(w, c)`,并在 `viewTest` 里 `kind` 标签之后加一行:
```js
if (w.mode === 3 && w.cloze) return viewCloze(w, c);     // cloze 缺失时（理论上不会）自然落到下面按 mode 2 渲染
```
`viewCloze(w, c)` 往 `c`(已经是 `.wcard` 元素)里依次追加,**全部用 `el()`(即 `textContent`)构造,禁止 `innerHTML`**(例句里的特殊字符不能被当成 HTML):
1. `el('div', 'tag', '🧩 填空：看句子，说出缺的词')`
2. 挖空句:`el('div', 'cloze')`,把 `w.cloze` 按 `'____'` 切成数组(`split('____')`),依次 `append` 文本节点和 `<span class="blank">＿＿＿</span>`(每两段之间一个 blank;若切出来不是 2 段也要正常显示——有几个分隔就有几个 blank)。
3. 中文翻译:`el('div', 'azh', w.cn_sentence || '')`(`azh` 是已有类;`cn_sentence` 为空则不加这一行)。
4. 提示:`el('div', 'hint', '提示：' + w.cn_meaning)`。
5. 询问行:`el('div', 'ask', state === 'judging' ? '⏳ AI 评判中…' : '请只说出缺的那个词')`。
6. `return c`。
**不要放喇叭按钮,不要自动朗读**(朗读句子会泄露答案)。

**3. 下一轮翻转方向**(锚点:`mode: w.mode === 1 ? 2 : 1`,在 `function next` 里)
改成:`mode: w.mode === 3 ? 1 : (w.mode === 1 ? 2 : 1)`(填空答错的词,下一轮退回最容易的"看葡语说中文";1→2、2→1 不变)。

**4. 顶部注释**(锚点:`Word Item（与后端 memory/word_source.py 的 WordItem 一致）`)
把说明补上:`mode: 1=看葡语说中文, 2=看中文说葡语, 3=句子填空（多一个 cloze 字段，含 ____ 占位）`。

**其余一律不动**:`next()`/`retry()` 里的 `if (cur.mode === 1) speak(...)` 保持原样(mode 3 不会自动朗读,正合需要);公布答案、跳过、录音、评判、`noteOutcome`、`markMastered`、`render`、`viewResult` 都不用改——它们只是把 `w.mode` 原样传递。

### B. `css/words.css`:**只在文件末尾追加**,不改已有规则
```css
/* 句子填空（mode 3） */
.cloze{font-size:24px;font-weight:600;line-height:1.6;word-break:break-word}
.cloze .blank{display:inline-block;min-width:3.2em;margin:0 .15em;border-bottom:3px solid var(--blue);color:transparent;user-select:none}
.hint{margin-top:10px;font-size:13px;color:#9aa5b1}
```
**不要碰 `index.css`。**

## 不要做
- 不要改任何后端文件或其他前端文件。
- 不要改 `viewResult`(不要做单词高亮)。
- 不要引入新的库或模板字符串拼 HTML。

## 要新建的检查脚本 `tools/test_step4.py`(**完整输出**)
用 Python 对 `js/words.js` 和 `css/words.css` 做静态检查(不用测试框架,`assert`,全部通过打印 `步骤4测试全部通过`);脚本从项目根目录运行,文件路径按 `js/words.js`、`css/words.css`(若不存在,按 `portuguese-tutor-web/` 前缀再找一次)。检查项:
1. `words.js` 包含 `[1, 2, 3].includes(w.mode)`,且**不再包含** `(w.mode === 1 || w.mode === 2)`。
2. 包含 `function viewCloze`,且 `viewTest` 里有 `viewCloze(`。
3. `viewCloze` 函数体(从 `function viewCloze` 到下一个顶层 `function`)里**不含** `innerHTML` 和 `speak(`、`spk(`。
4. 包含 `w.mode === 3 ? 1`。
5. `words.js` 的换行符全是 CRLF(没有单独的 `\n`);`words.css` 保持它**原本**的换行风格。
6. `words.css` 以追加方式新增了 `.cloze`、`.blank`、`.hint` 三个选择器。
7. 如果系统里有 `node`:`node --check js/words.js` 通过(没有 node 就跳过并打印提示)。

## 手动预览(可选,给用户自己看效果)
打开单词页,**在页面处于「领取今日任务」首页时**,在浏览器控制台粘贴:
```js
today.words = [{id:1,pt_word:'casa',cn_meaning:'家；房子',pt_sentence:'Eu gosto da minha casa.',cn_sentence:'我喜欢我的家。',mode:3,cloze:'Eu gosto da minha ____.',kind:'review'}]; today.completed = null; render();
```
点「领取今日任务」,应看到:🧩 标签、挖空句(缺词处是一条下划线)、中文翻译、"提示：家；房子"、"请只说出缺的那个词",**没有喇叭、没有朗读**。点「💡 公布答案」应朗读单词并显示结果页。(评判会因为词库里没有 id=1 而报错,这是正常的,只看界面。)

## 交付格式
1. 改后的 `js/words.js`、`css/words.css`(完整文件,或只给改动处,按总览里的"两种输出方式")。
2. 完整的 `tools/test_step4.py`。
3. **交接备注**:
```
步骤4完成。
- 改动：words.js（fetchToday 过滤、新增 viewCloze 并接入 viewTest、next() 翻转、顶部注释）；words.css 末尾追加 3 条规则；新增 tools/test_step4.py
- 测试：<全部通过 / 哪几条没过>
- 偏差：<无 / 具体说明>
```

## 完成标志
`python tools/test_step4.py` 打印 `步骤4测试全部通过`。
