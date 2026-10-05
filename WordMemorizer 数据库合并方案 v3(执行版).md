# WordMemorizer 数据库合并方案 v3(执行版)

日期:2026-10-05 · 基于「修订版」,对照你现在上传的后端 zip、C# zip 和前端文件重新核对后整理。目标不变:把 WordMemorizer 的 SQLite 库合并进葡语陪练服务端的 `sessions.db`,之后 WordMemorizer 不再直接碰数据库,全部走 `/api/admin/*`。

## 0. 一屏结论

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 0 | 备份、实测真实库 | ✅ 已完成(结果见修订版 3.5) |
| 1 | 服务端:`wm_calendar` / `wm_manager` / `admin_routes` + 测试 | ✅ 已完成,已核对 |
| 2A | 服务端收尾:迁移脚本、备份脚本、`reset_week.py` 改造、迁移测试 | ⬜ **下一步** |
| 2B | 影子演练(副本 + 8001 端口) | ⬜ |
| 3 | C# 改造(指向影子实例) | ⬜ |
| 4 | 正式切换 | ⬜ |
| 5 | 收尾(清理 C# 依赖、更新 skill、归档旧库) | ⬜ |

**依赖关系**:2A → 2B → 3 → 4 → 5。3 可以和 2B 后半段交叠,但 4 必须等 2B 和 3 都验收通过。

**到切换为止,线上系统(8000 端口 + 旧 `WordMemorizer.db` + 旧版 WordMemorizer)完全不动**,照常使用,所以放弃或重来的成本为零。

## 1. 现状核对(我实际检查/运行的)

**后端(portuguese-tutor-server.zip)**

- `memory/wm_calendar.py`(98 行)、`memory/wm_manager.py`(624 行)、`api/admin_routes.py`(260 行)都在;`main.py` 启动时调用 `wm_manager.init_db()` 并挂载 `admin_router`。`/api/admin/*` 的 23 个接口全部注册。
- `config.py` 只做了第 1 步:支持环境变量 `PT_SQLITE_PATH` / `PT_WORD_DB_PATH` / `PT_SQLITE_WAL`;`WORD_DB_PATH` 默认值仍是旧库 `...\output\Debug\WordMemorizer.db`,`SQLITE_WAL` 默认关。**这是对的**,第 2 步留到阶段 4。
- 测试(我在 Linux 沙箱里跑的):`test_wm_calendar` 50 项、`test_wm_admin` 112 项、`test_newwords` 13 项,`test_p2s1` \~ `test_p4s3` 全部通过。其中 `test_p2s3`、`test_p3s3` 需要设 `INDEX_JS_PATH` / `WORDS_JS_PATH` 指向前端文件,否则只是「跳过」(退出码非 0)而不是通过——我用你上传的 `index.js` / `words.js` 跑过,通过。建议你在自己的 Windows 环境里再跑一遍。
- **还不存在**:`tools/merge_wordmemorizer.py`、`tools/backup_db.py`、`tools/test_merge.py`;`tools/reset_week.py` 仍用 `shutil.copy2`;`start_server.bat` 没有调用备份。

**C#(WordMemorizer\_Core.zip)——零改动**

- 5 个仓储类仍然是 Dapper + `DatabaseHelper` 直连 `BaseDirectory\WordMemorizer.db`;没有 `ApiClient`;`FormMain.cs` 73\~89 行仍然用 `当前Id-1/-2/-3`;`using Dapper;` 仍在 `Word.cs`、`FormNewWords.cs`、`FormAddWeek.cs`。

**前端**:合并**不需要改**。`index.js` 已经处理 `/api/vocab` 返回的 `existing_words`;`index.js` / `words.js` 都不调用 `/api/admin/*`。

## 2. 本版相对修订版的新增发现

| # | 发现 | 处理 |
| --- | --- | --- |
| N1 | 线上服务一旦部署阶段 1 的代码,`/api/admin/*` 就在局域网可达(无鉴权),启动时还会建 6 张空表。阶段 3 期间如果 C# 仍指向 `127.0.0.1:8000`,任何一次写操作都会写进线上的空表,迁移脚本「目标表非空就拒绝」会让切换卡死 | ① C# 的管理接口地址做成**可配置**,开发期指 8001;② 阶段 4 加一步「6 张表必须全空」的检查;③ 阶段 3 期间不要让 C# 连 8000 |
| N2 | 修订版让 `ApiClient` 复用 `AUDIO_RECOGNIZING_SERVER_URL`,但语音识别(`PronunciationTranscriber`)也用这个地址 | 管理接口地址**另设一个键**(默认 = 语音地址 + `/admin`),项目里已有 `ConfigIniHelper`(`config.ini`)可存。演练期间只有管理流量去 8001,识别仍走 8000 |
| N3 | 影子实例启动会 `asr_engine.preload()`,再往 GPU 加载一份 Whisper large-v3 | 影子目录里的 `config.py` 改成 `ASR_MODEL_SIZE="tiny"`、`ASR_DEVICE="cpu"`、`ASR_COMPUTE_TYPE="int8"`(管理接口不用 ASR) |
| N4 | 合并后聊天、单词任务(只读连接)和管理接口(`BEGIN IMMEDIATE` 写事务)共用一个文件。回滚日志模式下写事务会挡住读,**WAL 不是可选项** | 阶段 4 把 `SQLITE_WAL` 默认值和 `WORD_DB_PATH` 一起改;`backup_db.py` 必须先于 WAL 存在 |
| N5 | 接线完成后,C# 里还有 5 个仓储方法没人调用:`AddWord`、`AddWordToWeeklyPlan`、`CreateCurrentWeekPlan`、`DeleteCurrentWeekPlanIfExists`、`SetNewWordAsRecorded`(只被那 3 处被替换的调用点使用) | 和「8 个从未使用的方法」一起删,共 13 个;服务端接口保留 |
| N6 | 原 `AppendToCurrentWeekPlan` 对每个词单独 try/catch(坏一个跳过一个),服务端是**单事务全有或全无** | 行为变化,是改进:C# 返回值改用服务端的 `imported`,失败时弹出服务端的中文 `detail` |
| N7 | 修订版阶段 5 漏了几处 SQLite 残留:`.csproj` 里 `DatabaseHelper.cs` 的编译项、Dapper / `System.Data.SQLite*` 引用、第 652\~655 行 `Stub.System.Data.SQLite...` 的 `<Error>` / `<Import>`;`App.config` 里 SQLite / EF6 的 provider 配置 | 补进阶段 5 清单 |
| N8 | 今天是 2026-10-05(周一),下一次周日录入是 10-11 | 见阶段 4 开头的时间窗建议 |
| N9 | `config.py` 里有真实的 Gemini / Groq Key(核对时看到的) | 两个 zip 外传前先清空并轮换 |

## 3. 阶段 2A:服务端收尾

目标:补齐迁移和备份工具,服务端代码到「可以演练」的状态。**不改线上行为。**

### 3.1 `tools/backup_db.py`

- 用 `sqlite3.Connection.backup()`,**不用** `shutil.copy2`(开 WAL 后最新数据可能还在 `-wal` 里)。
- `python tools\backup_db.py`:备份 `settings.SQLITE_PATH` 到 `data\backups\sessions-YYYYMMDD.db`,同一天已有就跳过,保留最近 14 份。
- `python tools\backup_db.py --src <库> --to <文件>`:通用单次备份,演练、切换、迁移脚本都用它。
- 在 `start_server.bat` 启动 uvicorn 之前调用一次;失败只打印警告,不阻止启动。

### 3.2 `tools/reset_week.py`

把 `shutil.copy2(db_path, bak)` 换成 backup 接口,其余不动。联动重置上线后,它只剩手动兜底的用途。

### 3.3 `tools/merge_wordmemorizer.py`

参数:`--src`(**必填**;切换后 `WORD_DB_PATH` 会指向目标库本身,不能再当默认值)、`--dst`(默认 `SQLITE_PATH`)、`--dry-run`。连接用 `isolation_level=None`,事务手动控制。

执行顺序(第 1\~6 步在**同一个事务**里,失败即回滚):

1. 两个文件都存在;**先 `ATTACH` 源库为 `wm`,再 `BEGIN IMMEDIATE`**(超时 1 秒)。拿不到锁 = 服务或 WordMemorizer 还开着,直接退出。源库必须有 6 张表。
2. 用 backup 接口给 `--dst` 和 `--src` 各备份一份带时间戳的副本(拿到锁之后做,保证备份的是迁移前状态)。
3. 执行修订版 5.2 的建表语句(`CREATE TABLE / INDEX IF NOT EXISTS`)。
4. **目标 6 张表任何一张非空就退出,绝不覆盖。**
5. 拷贝:`INSERT INTO main.T (列…) SELECT 列… FROM wm.T`,列取源表与目标表的交集(缺列在报告里列出),保留 `Id`,日期原样拷贝不解析;`WeeklyPlanWords` 按 `rowid` 排序;6 张表的 `sqlite_sequence` 设为 `max(源序号, 目标 MAX(Id))`。
6. 对账并打印报告:
   - 每张表的行数、`MAX(Id)`、序号;
   - 每张表 `SELECT * FROM wm.T EXCEPT SELECT * FROM main.T` 必须 0 行;
   - 只警告不失败:孤儿检查(`WeeklyPlanWords.WordId`、`ScoreRecord.WordId` 不在 `Words`;`word_progress.word_id` 不在 `Words`)、日期格式统计(含 `T` / 小数秒 / `+` `Z` 后缀)、`date(StartDate)` 重复(你的库里已知有 Id 29、30 一组);
   - `PRAGMA integrity_check`。
7. `--dry-run` 做完 1\~6 后回滚。**WAL 不在这个事务里开**(`journal_mode` 不能在事务内切换),由服务启动时的 `init_db` 完成。

退出码:0 = 成功(含 dry-run),非 0 = 任何失败。**不迁移** `TutorVocabImportState` 和 `vocab`。

### 3.4 `tools/test_merge.py`

用合成的 `WordMemorizer.db` 和合成的目标库,覆盖:行数 / `MAX(Id)` / `EXCEPT` 对账;源库缺列;目标非空拒绝;`--dry-run` 不落盘;重复运行拒绝;`sqlite_sequence` 大于 `MAX(Id)` 时迁移后不倒退;`WeeklyPlanWords` 顺序一致;重复 `StartDate` 与带时区后缀的警告;源库被另一个连接持有写锁时快速失败;孤儿告警。

### 3.5 2A 验收

- [ ] `test_merge.py` 通过;`test_wm_calendar` / `test_wm_admin` / 全部 `test_p*` / `test_newwords` 仍然通过(记得设 `INDEX_JS_PATH`、`WORDS_JS_PATH`)。
- [ ] 在**副本**上手动跑一次 `backup_db.py`,备份文件能用 `sqlite3` 打开且 `PRAGMA integrity_check` 为 ok。
- [ ] `config.py` 的第 2 步(阶段 4 里的代码)**已写好但没有应用**到线上目录。

## 4. 阶段 2B:影子演练

目标:在副本上把「迁移 → 启动 → 读写」完整走一遍,线上不受影响。**这一步可重复**——出问题就删掉影子目录重来。

### 2B.1 建影子目录(线上服务可以继续运行)

```bat
mkdir C:\shadow
xcopy /E /I /Y <线上服务目录> C:\shadow\server
python tools\backup_db.py --src data\sessions.db --to C:\shadow\server\data\sessions.db
python tools\backup_db.py --src <线上 WordMemorizer.db 完整路径> --to C:\shadow\WordMemorizer.src.db
```

- 为什么复制整个目录:`REPLY_DIR` 和各类缓存目录都从 `data\` 推导,共用会互相污染音频文件。`models\` 很大,可以删掉复制品里的再建符号链接。
- 影子里的 `sessions.db` 是 `backup_db.py` 做的一致性副本,**不要**直接复制 `.db` 文件。
- 编辑 `C:\shadow\server\config.py`:按 N3 改 ASR 三项。

### 2B.2 迁移(在影子目录)

```bat
cd C:\shadow\server
set PT_SQLITE_PATH=C:\shadow\server\data\sessions.db
set PT_WORD_DB_PATH=C:\shadow\server\data\sessions.db
set PT_SQLITE_WAL=1
python tools\merge_wordmemorizer.py --src C:\shadow\WordMemorizer.src.db --dry-run
python tools\merge_wordmemorizer.py --src C:\shadow\WordMemorizer.src.db
```

核对报告:6 张表行数与源库一致、`EXCEPT` 全 0、序号 ≥ `MAX(Id)`、重复周计划只有已知的那一组、没有意外的孤儿。(把 `PT_WORD_DB_PATH` 也指向同一个库,就完整模拟了切换后的状态。)

### 2B.3 启动第二个实例

```bat
uvicorn main:app --host 0.0.0.0 --port 8001
```

不要加 `--reload`。日志里应出现「WordMemorizer 表已就绪」;`C:\shadow\server\data\` 下出现 `sessions.db-wal` / `-shm`。

### 2B.4 比对:合并前后「单词任务读到的东西」必须一致

在影子目录写一个临时脚本(不用保存进项目):对最近 12 个周日各查一次 `word_source.current_plan_week_start(d)` 和 `word_source.list_word_ids(d)`,输出存成文件。分别用 `PT_WORD_DB_PATH=旧库` 和 `PT_WORD_DB_PATH=新库` 各跑一次,用 `fc` 对比,**必须逐字相同(含顺序)**。

### 2B.5 影子实例上的手工检查

用 `curl` 或浏览器(`http://127.0.0.1:8001/docs`)逐个打:`/api/admin/weeks/current`、`/weeks/recent?n=3`、`/points`、`/newwords/stats`。再用前端指向 8001 打开单词页,确认 `/words/today` 正常。

### 2B.6 2B 验收

- [ ] 迁移报告对账全过
- [ ] 2B.4 比对无差异
- [ ] `/points` 的 `correct_count`、`consumed_total` 与旧版 WordMemorizer 显示的积分一致
- [ ] 8001 上的 `/words/today` 正常

## 5. 阶段 3:C# 改造

原则:仓储类的类名、方法签名、返回类型**保持不变**,只把方法体从 Dapper 换成 API 调用,绝大多数窗体不用改。**每改完一个仓储类就编译、运行一次。全程只连影子实例(8001)。**

### 3.0 准备

- [ ] 用 git 提交当前状态(或拷一份源码目录),随时可以回退。
- [ ] `Constants.cs` 新增 `ADMIN_API_BASE_URL`:先读 `config.ini` 里的一个键(例如 `AdminApiUrl`,走现有 `ConfigIniHelper.GetValue`),读不到就用 `AUDIO_RECOGNIZING_SERVER_URL + "/admin"`。开发期在 `config.ini` 里设成 `http://127.0.0.1:8001/api/admin`。这份 `config.ini` 不要带进正式版。
- [ ] 新建 `ApiClient` 和 `ApiException`(见 3.1)。

### 3.1 `ApiClient`

- 单例 `HttpClient`,超时 15 秒;Newtonsoft + `SnakeCaseNamingStrategy`,模型类不用改(`ScoreRecord.Word` 直接反序列化嵌套的 `word`)。
- 仓储类是**同步**的:在 `ApiClient` 里统一 `Task.Run(...).GetAwaiter().GetResult()`,内部 `ConfigureAwait(false)`,避免在 UI 线程上死锁。
- 非 2xx 时读响应里的 `detail`(字符串或 `[{msg}]`),抛 `ApiException(状态码, detail)`;404 由调用方映射成原来的返回值,503 提示「数据库正被占用,请稍后再试」。

### 3.2 接口映射(保留的 21 个仓储方法 + `WordImporter` 1 个)

| C# 方法 | 接口 | 原有的失败 / 空值语义(要保持) |
| --- | --- | --- |
| `WeeklyPlanRepository.GetAllWeeklyPlans` | `GET /weeks` |  |
| `GetWordsInWeeklyPlan(id)` | `GET /weeks/{id}/words` | 计划不存在 → 空列表 |
| `CurrentWeekPlanExists` | `GET /weeks/current` 的 `exists` |  |
| `GetCurrentWeekPlanId` | `GET /weeks/current` 的 `id` | 无计划 → `Constants.INVALID_DB_ID`(-1) |
| `WordRepository.GetWordById` | `GET /words/{id}` | 404 → `null` |
| `ScoreRecordRepository.AddScoreRecord` | `POST /scores` | 返回 `{id}` |
| `SetRecordCorrect` / `SetRecordInCorrect` | `PUT /scores/{id}/result` | 404 → `false` |
| `GetAllCorrectRecordsCount` | `GET /points` 的 `correct_count` | 失败 → -1 |
| `GetBatchNumbersForCurrentWeek` | `GET /scores/batches?week=current` | 失败 → 空列表 |
| `GetRecordsByBatchNumber` | `GET /scores/batches/{batch}` | 每条内嵌 `word` |
| `ConsumeLogRepository.AddConsumeRecord` | `POST /consume` | `score` ≥ 1 |
| `GetTotalConsumedScore` | `GET /points` 的 `consumed_total` |  |
| `GetAllConsumeLogs` | `GET /consume` |  |
| `NewWordsRepository.AddNewWords` | `POST /newwords` | 返回 `{id, existed}`,已存在不插入 |
| `GetNewWordByWord` | `GET /newwords/by_word` | 404 → `null` |
| `GetAllNewWords` | `GET /newwords?filter&only_unrecorded&descending` | 失败 → 空集合 |
| `UpdateNewWord` | `PUT /newwords/{id}` |  |
| `DeleteNewWordById` | `DELETE /newwords/{id}` | 404 → `false` |
| `SetNewWordAsUnrecorded` | `PUT /newwords/{id}/recorded`,`{recorded:false}` |  |
| `GetUnrecordedNewWordsCount` | `GET /newwords/stats` 的 `unrecorded` | 失败 → -1 |
| `WordImporter.AppendToCurrentWeekPlan` | `POST /weeks/current/words` |  |
| (新增)`GetRecentWeeks(n)` | `GET /weeks/recent?n=3` | 供 `FormMain` 用 |

### 3.3 改造顺序(每步都编译并运行)

1. **读**:`WeeklyPlanRepository`(`GetAll` / `GetWordsInWeeklyPlan` / `Exists` / `GetId`)和 `WordRepository.GetWordById`。验证 `FormAddWeek` 浏览历史周计划、主窗体本周词。
2. **`FormMain` 前几周**(73\~89 行):把 `当前Id-1 / -2 / -3` 三次调用换成 `GetRecentWeeks(3)`,把返回的各周 `words` 合并进 `_monthWordList`;本周词仍用当前计划。
3. **`NewWordsRepository`**(除 `SetNewWordAsRecorded`、`GetNewWordById`)。验证查询 / 新增 / 修改 / 删除 / 标为未录入;大小写不同的重复词不应再调 AI(`by_word` 与 `POST` 用同一套归一化)。
4. **`ConsumeLogRepository`**。
5. **`ScoreRecordRepository`**:`AddScoreRecord` 照常发 `DateTime.Now`(服务端负责归一化 `RecordTime`);`BatchNumber` 仍由客户端按 UTC 生成并原样发送(必须 14 位数字,否则 422)。
6. **三处写周计划**:

| 位置 | 改成 |
| --- | --- |
| `WordImporter.AppendToCurrentWeekPlan` | 文本解析仍在 C#(`ParseTextToWords`);把 `List<Word>` 转成 `{words:[{text, chinese_meaning, example_sentence, example_chinese, reference_image_number}]}` → `POST /weeks/current/words`;返回值用服务端的 `imported` |
| `FormAddWeek.BtnAppend_Click` | 不变(走上面的 Importer) |
| `FormAddWeek.BtnReCreateWeekPlan_Click`(66\~72 行) | 先弹**确认框**(现在没有,而覆盖会联动清空 `word_week`),再 `PUT /weeks/current/words`;不再先调 `DeleteCurrentWeekPlanIfExists` |
| `FormNewWords.BtnRecordToWeekPlan_Click`(227\~275 行) | 保留「数量不足」判断和「是否覆盖」确认框;去掉循环里的 `SetNewWordAsRecorded` / `AddWord` / `AddWordToWeeklyPlan` 和前面的 `Delete…` / `Create…`;改为 `PUT /weeks/current/from_newwords`,body `{new_word_ids: wordsToRecord.Select(x => x.Id)}`;成功后可用响应里的 `reset.word_week` 提示「已重置 N 条本周词表」 |

限制:一次请求最多 200 个词;`chinese_meaning` 不能为空,否则 422,直接弹服务端的 `detail`。

7. **删除 13 个方法**:8 个从未使用的(`WordRepository.GetAllWords / UpdateWord / DeleteWord`、`WeeklyPlanRepository.AddWeeklyPlan`、`ScoreRecordRepository.GetRecordsByDate / DeleteRecord / GetRecordsByBatchNumberEx`、`NewWordsRepository.GetNewWordById`)+ 接线后无人调用的 5 个(见 N5)。编译,确认没有残留引用。
8. **服务没开时**:`FormMain` 启动时已有 `/health` 检查(388 行),保持并给出明确提示;其余窗体捕获 `ApiException` 后只弹一次中文提示,不要各自弹数据库异常。

### 3.4 阶段 3 验收

- [ ] 所有改过的窗体对着 8001 走完「验收清单」里 WordMemorizer 那一组。
- [ ] `FormNewWords` 记录到周计划、`FormAddWeek` 追加 / 覆盖之后,8001 上 `GET /weeks/current` 和 `word_week` 的变化符合预期。
- [ ] 没有 `config.ini` 的 `AdminApiUrl` 时,地址会落到 8000 + `/admin`:确认默认值逻辑正确,但**切换之前不要这样运行**。

## 6. 阶段 4:正式切换

### 4.0 前置条件(全部满足才开始)

- 2B、3 都已验收通过;`backup_db.py` 已在线上目录,`start_server.bat` 的调用已试过。
- 已经过了 10-11(周日)的周计划录入(以及你平时的 `gen_week_examples.bat`)。**切换选在工作日晚上**,避开周日录入和周六加练;预留 30 分钟,期间家里人不用聊天和单词页。
- 旧版 WordMemorizer 仍然可用(回滚要靠它)。
- 切换前**记下基线**:WordMemorizer 主窗体的积分、本周词数、你自己智能体的 `/words/today` 响应、6 张表的行数。

### 4.1 步骤

1. 关闭所有 WordMemorizer 窗口;停服务(在 uvicorn 窗口按 Ctrl+C);确认没有 `gen_examples.py` 在运行。
2. 备份(用 backup 接口,不要直接复制文件):

```bat
python tools\backup_db.py --src data\sessions.db --to data\backups\pre-merge-sessions.db
python tools\backup_db.py --src <WordMemorizer.db 完整路径> --to data\backups\pre-merge-WordMemorizer.db
```

3. **空表检查(N1)**:线上 `sessions.db` 里的 6 张表必须全空(报 `no such table` 也正常,迁移脚本会建):

```bat
python -c "import sqlite3;c=sqlite3.connect('data/sessions.db');print({t:c.execute('select count(*) from '+t).fetchone()[0] for t in ['Words','WeeklyPlans','WeeklyPlanWords','ScoreRecord','ConsumeLog','NewWords']})"
```

任何一个大于 0:停下来查是谁写的(多半是 C# 或别的客户端误连了 8000),不要强行迁移。

4. 迁移:先 `python tools\merge_wordmemorizer.py --src <WordMemorizer.db 完整路径> --dry-run`,报告没问题再去掉 `--dry-run` 正式跑。期望:对账全 0;重复周计划只有已知的一组(Id 29、30);行数等于**切换当天**源库的行数(10-05 实测:`Words` 1970、`WeeklyPlans` 52、`ScoreRecord` 7985、`NewWords` 255、`ConsumeLog` 28,之后会随录入增长)。
5. **应用 `config.py` 第 2 步**(保持 CRLF 换行),然后把全部测试再跑一遍(`test_newwords`、`test_p4s1` 里有 `settings.WORD_DB_PATH = ...` 的赋值,必须仍然可用):

```python
# WORD_DB_PATH 留空 = 跟随 SQLITE_PATH(同一个库);环境变量仍可覆盖
WORD_DB_PATH: str = os.environ.get("PT_WORD_DB_PATH") or ""
# WAL 默认开启(备份必须用 tools/backup_db.py)
SQLITE_WAL: bool = os.environ.get("PT_SQLITE_WAL", "1") == "1"

settings = Settings()
if not settings.WORD_DB_PATH:          # 普通属性,不要用只读 property
    settings.WORD_DB_PATH = settings.SQLITE_PATH
```

6. 启动 `start_server.bat`:先看到备份脚本运行,再看到日志「WordMemorizer 表已就绪」;`data\` 下出现 `sessions.db-wal` / `-shm`。
7. API 冒烟(8000 端口):`/api/admin/weeks/current`、`/points`、`/newwords/stats`、`/api/words/today?session_id=<你的智能体>`,和基线对比。
8. 部署新版 WordMemorizer(`config.ini` 里去掉 `AdminApiUrl`,或指向 8000),走「验收清单」。
9. 前端:聊天里「拆解单词 → 加入单词库」,确认进了 `NewWords`,重复词提示「已存在」。

### 4.2 观察期(至少 1 周)

每天确认 `data\backups\` 有新备份;周日录入时重点看追加 / 覆盖和单词页(验收清单最后一组);**不要再用旧版 WordMemorizer 写旧库**。

## 7. 阶段 5:收尾

### 5.1 C# 清理清单(观察期结束后)

- [ ] 删除 `DB\DatabaseHelper.cs`,以及 `.csproj` 里的 `<Compile Include="DB\DatabaseHelper.cs" />`。
- [ ] `.csproj`:删除 Dapper、`System.Data.SQLite`、`System.Data.SQLite.Core`、`System.Data.SQLite.EF6`、`System.Data.SQLite.Linq`、`Stub.System.Data.SQLite.Core.NetFramework` 的 `<Reference>` / `<HintPath>`,以及 652\~655 行附近的 `<Error>` / `<Import>`。
- [ ] `packages.config` 删掉对应 6 条;`App.config` 删掉 SQLite / EF6 的 provider 配置。
- [ ] 删除所有 `using Dapper;`(`Word.cs`、`FormNewWords.cs`、`FormAddWeek.cs`,以及还在的仓储类);`Constants.DB_FILE_NAME` 不再使用就删。
- [ ] 全文搜索 `SQLite`、`Dapper`、`DatabaseHelper` 都没有结果;清理并重新生成解决方案;输出目录里残留的 SQLite 相关 DLL 可以删。
- [ ] 旧 `WordMemorizer.db` 归档到别处,保留至少 1 个月,期间不再写入。

### 5.2 服务端与文档

- [ ] 更新 pt-tutor-app skill:文件地图(新增 `wm_calendar`、`wm_manager`、`admin_routes`、`backup_db`、`merge_wordmemorizer`)、API 契约表(23 个 `/api/admin/*`)、存储一节(同一个库、WAL、备份规则)、「已知简化」(删掉「WordMemorizer 只读」的描述;补上重复周计划不自动合并、`Words` 孤儿行不清理)。
- [ ] `word_source.py` 顶部注释里「与 sessions.db 分开」改成「同一个库」。

## 8. 验收清单(2B / 3 对 8001 走一遍,4 对 8000 再走一遍)

**WordMemorizer**

- [ ] 主窗体:本周词、最近几周词(走 `/weeks/recent`,有空档的周不再取空);积分(答对数 − 消耗)与基线一致
- [ ] `FormAddWeek`:查看历史周计划;追加导入;覆盖重建(应先弹出确认框)
- [ ] `FormNewWords`:新增生词(含重复词、大小写不同的重复词,重复时不应调 AI);修改;删除;标为未录入;「记录到周计划」
- [ ] `FormExam` → `FormCorrection`:考试写入、批次列表(和迁移前的分组对比,UTC 修正会让边界批次归属变化)、改对 / 改错
- [ ] `FormConsumeScore`:消耗积分与历史
- [ ] 新写入的 `ScoreRecord.RecordTime` 在库里是 `YYYY-MM-DD HH:MM:SS[.小数秒]`,没有 `T` 和时区后缀

**葡语陪练**

- [ ] 周日 / 周一\~周五 / 周六各一天的词和顺序与迁移前一致(`/words/today` 只认服务器当天日期,按日期的比对用 2B.4 的脚本)
- [ ] 评判、记错题、标记已掌握、聊天里用词加分
- [ ] 聊天「拆解单词 → 加入单词库」:新词进生词本,重复词提示「已存在」
- [ ] WordMemorizer **覆盖**本周计划后,不跑 `reset_week.py`,单词页立即变成新词表
- [ ] WordMemorizer **追加**本周计划后,已打开过单词页的智能体的 `word_week` 里出现新增的词(不丢已学词),今天的任务不变
- [ ] `tools/gen_examples.py --report` 与 `--week` 正常

**并发与备份**

- [ ] 一边在 WordMemorizer 里批量导入,一边聊天、做单词任务,不出现 `database is locked`
- [ ] 开启 WAL 后 `data\` 下有 `-wal` / `-shm`;跑一次 `backup_db.py`,用备份文件能在影子实例里正常启动

## 9. 回滚

- **阶段 4 之前**:没有改动任何线上文件,放弃即可;影子目录删掉重来。
- **阶段 4 之后、观察期内**:停服务 → 删除 `sessions.db`、`sessions.db-wal`、`sessions.db-shm` → 把 `data\backups\pre-merge-sessions.db` 复制回 `data\sessions.db` → `config.py` 里 `WORD_DB_PATH` 改回旧库路径、`SQLITE_WAL` 改回 `False` → 启动服务 → 用旧版 WordMemorizer(旧库没被改过)。**切换之后新写入的数据会丢**(聊天记录、单词进度、新考试记录),所以观察期要短,发现问题尽快决定。

## 10. 决策记录与范围

**已确认(沿用修订版第 13 节)**:① 覆盖 / 删除本周计划时联动重置 `word_week` 和今天起的 `word_daily_plan`;② 迁入的表保持 Pascal 原名;③ 启用 WAL + 每日备份;④ 删除 8 个从未使用的 C# 方法;⑤ 本周批次区间按 UTC 修正;⑥ 追加走续号追加;⑦ 新增 `/weeks/recent` 并让 `FormMain` 改调它。

**本次不做**:表名 / 字段名统一;Gemini / Groq 调用改走服务端;录音与朗读音频的存放位置;鉴权与限流;清理 `Words` 孤儿行;合并已有的重复周计划(只在迁移报告里警告)。
