// server/utils/db.js
// 双驱动数据库：SQLite（本地开发）+ MySQL（生产）
// 通过 .env 中 DB_TYPE 切换，默认 sqlite

const DB_TYPE = process.env.DB_TYPE || 'sqlite';
const path = require('path');

// ---------- 表名映射：SQLite 名 → MySQL 名 ----------
const TABLE = {
  users:          DB_TYPE === 'mysql' ? 'user_info'         : 'users',
  cards:          DB_TYPE === 'mysql' ? 'knowledge_card'    : 'cards',
  study_logs:     DB_TYPE === 'mysql' ? 'study_log'         : 'study_logs',
  checkins:       DB_TYPE === 'mysql' ? 'checkins'          : 'checkins',
  posts:          DB_TYPE === 'mysql' ? 'community_post'    : 'posts',
  comments:       DB_TYPE === 'mysql' ? 'community_comment' : 'comments',
  post_likes:     DB_TYPE === 'mysql' ? 'post_likes'        : 'post_likes',
  chat_sessions:  DB_TYPE === 'mysql' ? 'chat_sessions'     : 'chat_sessions',
};

// ---------- 列名映射（SQL → MySQL）----------
const COL = DB_TYPE === 'mysql' ? {
  // qualified
  'users.tags':              'user_info.interest_tags',
  'users.created_at':        'user_info.create_time',
  'cards.quiz_correct_index':'knowledge_card.correct_index',
  'cards.quiz_explanation':  'knowledge_card.explanation',
  'cards.created_at':        'knowledge_card.create_time',
  'study_logs.read_at':      'study_log.create_time',
  'posts.created_at':        'community_post.create_time',
  'comments.created_at':     'community_comment.create_time',
  'chat_sessions.timestamp': 'chat_sessions.create_time',
} : {};

// 无表前缀的列名替换（全局安全）
const WORD_REPLACE = DB_TYPE === 'mysql' ? [
  ['RANDOM()', 'RAND()'],
  [/\\bread_at\\b/g, 'create_time'],
  [/\\btimestamp\\b/g, 'create_time'],
] : [];

// MySQL → SQLite 结果行 key 映射
const KEY_NORMALIZE = DB_TYPE === 'mysql' ? {
  'interest_tags':    'tags',
  'correct_index':    'quiz_correct_index',
  'explanation':      'quiz_explanation',
  'create_time':      'created_at',
} : null;

// 翻译 SQL 中的表名和列名（MySQL 模式）
function translateSQL(sql) {
  if (DB_TYPE !== 'mysql') return sql;
  let result = sql;
  // 先翻列名（更具体）
  for (const [from, to] of Object.entries(COL)) {
    result = result.replace(new RegExp(from.replace('.', '\\.'), 'g'), to);
  }
  // 再翻表名
  for (const [from, to] of Object.entries(TABLE)) {
    result = result.replace(new RegExp('\\b' + from + '\\b', 'g'), to);
  }
  // 无前缀词替换
  for (const [pattern, replacement] of WORD_REPLACE) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// MySQL 结果行 key 转 SQLite 风格
function normalizeRow(row) {
  if (!row || !KEY_NORMALIZE) return row;
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    mapped[KEY_NORMALIZE[key] || key] = value;
  }
  return mapped;
}
function normalizeRows(rows) {
  if (!KEY_NORMALIZE) return rows;
  return rows.map(normalizeRow);
}

// ==================== SQLite 驱动 ====================
let sqliteDb = null;
function getSqlite() {
  if (!sqliteDb) {
    const Database = require('better-sqlite3');
    sqliteDb = new Database(path.join(__dirname, '..', 'database.sqlite'));
    sqliteDb.pragma('journal_mode = WAL');
    initSqliteTables();
  }
  return sqliteDb;
}

function initSqliteTables() {
  const db = sqliteDb;
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openid TEXT UNIQUE NOT NULL,
      nickname TEXT DEFAULT '知学探索者',
      avatar_url TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      checkin_days INTEGER DEFAULT 0,
      likes_received INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      level_name TEXT DEFAULT '探索者',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT DEFAULT '',
      content TEXT NOT NULL,
      ai_insight TEXT DEFAULT '',
      quiz_question TEXT DEFAULT '',
      quiz_options TEXT DEFAULT '',
      quiz_correct_index INTEGER DEFAULT 0,
      quiz_explanation TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS study_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openid TEXT NOT NULL,
      title TEXT NOT NULL,
      read_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_study_logs_openid_readat ON study_logs(openid, read_at DESC);
    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openid TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_unique ON checkins(openid, date);
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openid TEXT NOT NULL,
      content TEXT NOT NULL,
      likes INTEGER DEFAULT 0,
      ai_reply TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_posts_openid ON posts(openid);
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      openid TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id, created_at);
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openid TEXT NOT NULL,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_lookup ON chat_sessions(openid, session_id, timestamp);
    CREATE TABLE IF NOT EXISTS post_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      openid TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(post_id, openid)
    );
    CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON post_likes(post_id);
    CREATE INDEX IF NOT EXISTS idx_post_likes_openid ON post_likes(openid);
  `);
  // 迁移
  try { db.exec('ALTER TABLE users ADD COLUMN likes_received INTEGER DEFAULT 0'); } catch (e) {}
  // 种子数据
  const count = db.prepare('SELECT COUNT(*) as count FROM cards').get();
  if (count.count === 0) seedSqliteCards(db);
}

function seedSqliteCards(db) {
  const cards = getSeedCards();
  const insert = db.prepare(`
    INSERT INTO cards (category, title, subtitle, content, ai_insight, quiz_question, quiz_options, quiz_correct_index, quiz_explanation, tags)
    VALUES (@category, @title, @subtitle, @content, @ai_insight, @quiz_question, @quiz_options, @quiz_correct_index, @quiz_explanation, @tags)
  `);
  const insertMany = db.transaction((items) => { for (const c of items) insert.run(c); });
  insertMany(cards);
}

// ==================== MySQL 驱动 ====================
let mysqlPool = null;
async function getMysqlPool() {
  if (!mysqlPool) {
    const mysql = require('mysql2/promise');
    mysqlPool = mysql.createPool({
      host:     process.env.MYSQL_HOST || '127.0.0.1',
      port:     parseInt(process.env.MYSQL_PORT) || 3306,
      user:     process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'zhixue_ai',
      charset:  'utf8mb4',
      waitForConnections: true,
      connectionLimit: 10,
    });
    // 种子数据（仅在表为空时）
    const [rows] = await mysqlPool.execute('SELECT COUNT(*) as count FROM knowledge_card');
    if (rows[0].count === 0) await seedMysqlCards();
  }
  return mysqlPool;
}

async function seedMysqlCards() {
  const pool = mysqlPool;
  const cards = getSeedCards();
  for (const c of cards) {
    await pool.execute(
      `INSERT INTO knowledge_card (category, title, subtitle, content, ai_insight, tags, quiz_question, quiz_options, correct_index, explanation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [c.category, c.title, c.subtitle, c.content, c.ai_insight, c.tags, c.quiz_question, c.quiz_options, c.quiz_correct_index, c.quiz_explanation]
    );
  }
}

// ==================== 种子数据 ====================
function getSeedCards() {
  return [
    { category:'计算机科学',title:'CAP 定理',subtitle:'分布式系统的不可能三角',content:'在分布式系统中，一致性(C)、可用性(A)、分区容错性(P)，这三个要素最多只能同时实现两点。对于分布式数据存储，分区容错性是客观存在的。',ai_insight:'架构选型核心：业务是更能容忍数据延迟(AP)，还是服务不可用(CP)？',quiz_question:'Redis Cluster 默认倾向于保证什么？',quiz_options:'["C (一致性)", "A (可用性)", "CA (两者兼顾)"]',quiz_correct_index:1,quiz_explanation:'Redis Cluster 默认倾向于 AP，它尽力提供服务，主从切换期间可能丢失少量写入。',tags:'Java,架构'},
    { category:'心理学',title:'心流体验',subtitle:'极致专注的愉悦状态',content:'心流(Flow)是指我们在做某些事情时，那种全神贯注、投入忘我的状态。在这种状态下，不仅效率极高，而且会感到深度的满足感。触发条件核心在于：目标明确、反馈即时、以及挑战与技能的完美匹配。',ai_insight:'Debug 的过程就是挑战与反馈不断循环的过程，极易产生心流。',quiz_question:'哪种活动最难产生高质量心流？',quiz_options:'["挑战新游戏关卡", "无脑刷短视频", "练习乐器"]',quiz_correct_index:1,quiz_explanation:'刷短视频属于被动娱乐，缺乏挑战与技能的匹配，容易导致空虚。',tags:'心理学,自我提升'},
    { category:'历史',title:'美第奇家族',subtitle:'文艺复兴的推手',content:'美第奇家族是佛罗伦萨的无冕之王。他们通过银行业积累财富，并赞助了达芬奇、米开朗基罗等巨匠。没有他们的资助，文艺复兴的光辉可能会暗淡许多。',ai_insight:'资源集中往往能催生技术与艺术的爆炸。',quiz_question:'美第奇家族资助艺术的核心动机？',quiz_options:'["慈善行为", "逃避税收", "政治公关"]',quiz_correct_index:2,quiz_explanation:'通过公共艺术品展示家族财富与品味，有效洗白高利贷名声并赢得民心。',tags:'历史,艺术'},
    { category:'经济学',title:'博弈论基础',subtitle:'囚徒困境与纳什均衡',content:'博弈论研究的是策略互动的数学理论。囚徒困境中，两个嫌疑人被分开审讯，如果双方都保持沉默，各判1年；如果都坦白，各判5年；如果一人坦白一人沉默，坦白者释放，沉默者判10年。从个体理性出发，坦白是占优策略，但合作沉默才能达到集体最优。',ai_insight:'在竞争与合作的平衡中，信任是降低交易成本的核心要素。',quiz_question:'囚徒困境中，从个体理性出发的最优策略是？',quiz_options:'["保持沉默", "坦白", "取决于对方"]',quiz_correct_index:1,quiz_explanation:'无论对方选什么，坦白对自己都是更优解——这就是占优策略。',tags:'经济管理'},
    { category:'人工智能',title:'大语言模型的幻觉',subtitle:'LLM为什么一本正经地胡说八道',content:'大语言模型(LLM)存在幻觉(Hallucination)现象，即模型生成的内容看似合理但与事实不符。这是因为LLM本质上是概率预测模型，而非知识库。它学习词语间的统计关系来预测下一个token，缺乏对真实世界的理解和验证机制。',ai_insight:'LLM就像一位博学但偶尔记混的朋友——它不是在检索事实，而是在预测最像正确答案的词序。',quiz_question:'LLM产生幻觉的根本原因是什么？',quiz_options:'["训练数据太少", "本质是概率预测而非事实检索", "算力不足"]',quiz_correct_index:1,quiz_explanation:'LLM通过预测token概率生成文本，不进行事实核查或数据库检索。',tags:'AI大模型,计算机科学'},
    { category:'前端开发',title:'浏览器渲染流程',subtitle:'从HTML到像素的旅程',content:'浏览器将HTML渲染为可视页面的关键路径：解析HTML构建DOM树 → 解析CSS构建CSSOM树 → 合并为渲染树(Render Tree) → 布局(Layout)计算元素位置 → 绘制(Paint)填充像素。回流(Reflow)触发布局重算，重绘(Repaint)只重新填充颜色，回流代价远大于重绘。',ai_insight:'前端性能优化的本质：减少回流次数。批量修改DOM、用transform替代left/top都是基于这个原理。',quiz_question:'以下哪个操作触发的代价最大？',quiz_options:'["修改元素背景色", "修改元素宽度", "修改元素文字颜色"]',quiz_correct_index:1,quiz_explanation:'修改宽度触发回流+重绘，另外两个只需要重绘。',tags:'前端开发'},
    { category:'计算机科学',title:'JVM 垃圾回收',subtitle:'你创建的对象都去哪了',content:'JVM 的垃圾回收(GC)并非随机清理，而是基于可达性分析算法。从 GC Roots 出发，凡是通过引用链无法到达的对象即为"垃圾"。常见的 GC Roots 包括栈帧中的局部变量、静态变量、JNI 引用等。不同的垃圾收集器——Serial、Parallel、CMS、G1、ZGC——在吞吐量和暂停时间之间做出不同权衡。',ai_insight:'GC 的哲学隐喻：不被任何"根"引用的东西终将被回收——代码里如此，人生中的无意义连接也如此。',quiz_question:'JVM 判断对象是否可回收的核心算法是什么？',quiz_options:'["引用计数法", "可达性分析法", "标记-清除法"]',quiz_correct_index:1,quiz_explanation:'可达性分析从 GC Roots 开始遍历引用链；引用计数法无法解决循环引用问题，主流 JVM 不采用。',tags:'Java,架构'},
    { category:'心理学',title:'达克效应',subtitle:'越无知越自信的认知偏差',content:'达克效应(Dunning-Kruger Effect)指出：能力较低的个体倾向于高估自己的能力，而真正的高手反而会低估自己。初学者刚入门时信心爆棚，学到中期意识到知识海洋的浩瀚后反而陷入绝望，只有持续深耕才能重建真正的自信。',ai_insight:'如果你在学某个技术时突然感到"我怎么什么都不会"，恭喜——你正从愚昧之巅滑向开悟之坡。',quiz_question:'达克效应描述的认知偏差是什么？',quiz_options:'["聪明人更自信", "能力低的人高估自己", "所有人都低估自己"]',quiz_correct_index:1,quiz_explanation:'能力欠缺者缺乏评估自身能力的元认知能力，因此无法认识到自己的不足。',tags:'心理学,自我提升'},
    { category:'历史',title:'敦煌藏经洞',subtitle:'一座被封存900年的图书馆',content:'1900年，道士王圆箓在敦煌莫高窟偶然发现了一间密封的石室，内藏公元4-11世纪的写本、绢画等文物5万余件，涵盖佛经、儒家典籍、天文历法、医学、契约文书等。这座"图书馆"大约在11世纪初被封存，原因至今成谜。这批文物后来散落于英、法、俄、日等国的博物馆。',ai_insight:'一个偶然发现改变了我们对丝路文明的认识——历史往往隐藏在最不起眼的角落。',quiz_question:'敦煌藏经洞是由谁在1900年发现的？',quiz_options:'["斯坦因", "王圆箓", "张大千"]',quiz_correct_index:1,quiz_explanation:'道士王圆箓在清理洞窟积沙时无意间发现了藏经洞，后来斯坦因等外国探险家陆续来到敦煌。',tags:'历史,艺术'},
    { category:'经济学',title:'复利效应',subtitle:'世界第八大奇迹',content:'爱因斯坦据说称复利为"世界第八大奇迹"。复利的威力不在于收益率的高低，而在于时间的长短。假设年化收益8%，1万元30年后会变成约10万元；如果再给10年——40年后——会变成约21.7万元。最后10年的增长超过了前30年的总和。这就是指数曲线的爆发力：前面大部分时间都在"蓄力"，真正的飞跃发生在后半段。',ai_insight:'学习也是复利——每天进步1%，一年后你是原来的37.8倍。坚持的难点在于前99%的时间你都看不到曲线的陡峭。',quiz_question:'复利效应中，决定最终收益的最关键因素是？',quiz_options:'["本金大小", "收益率高低", "持续时间"]',quiz_correct_index:2,quiz_explanation:'时间是指数函数的指数，拉长周期后时间的作用远超本金和收益率的差异。',tags:'经济管理'},
    { category:'人工智能',title:'反向传播算法',subtitle:'神经网络学习的核心引擎',content:'反向传播(Backpropagation)是训练神经网络的核心算法。它利用链式法则，从输出层开始逐层向前计算损失函数对每个参数的梯度，然后沿梯度反方向更新参数。这个过程需要计算成千上万个偏导数，但核心就是大一微积分里的链式法则——再复杂的深度学习模型，底层数学原理都源于此。',ai_insight:'反向传播的本质是"从错误中学习"——每次犯错后精确计算出每个参数该调整多少。这也是人类学习的理想模式：不只看结果对错，还要追溯到每个决策环节。',quiz_question:'反向传播算法依赖的数学原理是什么？',quiz_options:'["泰勒展开", "链式法则", "傅里叶变换"]',quiz_correct_index:1,quiz_explanation:'链式法则允许将输出层的误差逐层"反向传播"到前面的每一层，计算每个参数的梯度。',tags:'AI大模型,计算机科学'},
    { category:'前端开发',title:'JavaScript Event Loop',subtitle:'单线程如何实现高并发',content:'JavaScript 是单线程语言，但浏览器却能同时处理用户交互、网络请求、定时器和渲染——这靠的是 Event Loop 机制。主线程执行同步代码，异步任务（setTimeout、fetch、事件监听）被丢给 Web APIs 处理，完成后回调进入任务队列。Event Loop 不断检查：调用栈空了？好，从微任务队列取一个执行；微任务空了？好，从宏任务队列取一个。如此往复。',ai_insight:'Event Loop 的智慧：单线程不等于低效。把耗时工作外包，主线程只负责调度——这跟管理者的核心能力一模一样。',quiz_question:'以下哪个属于微任务(Microtask)？',quiz_options:'["setTimeout", "Promise.then", "DOM 事件"]',quiz_correct_index:1,quiz_explanation:'Promise.then/catch/finally 的回调进入微任务队列，优先于 setTimeout 等宏任务执行。',tags:'前端开发'},
  ];
}

// ==================== 统一异步 API ====================

/**
 * 执行查询并返回所有行
 * db.all('SELECT * FROM users WHERE openid = ?', [openid])
 */
async function all(sql, params = []) {
  sql = translateSQL(sql);
  if (DB_TYPE === 'mysql') {
    const pool = await getMysqlPool();
    const [rows] = await pool.execute(sql, params);
    return normalizeRows(rows);
  } else {
    const db = getSqlite();
    return db.prepare(sql).all(...params);
  }
}

/**
 * 执行查询并返回第一行（无结果返回 undefined）
 * db.get('SELECT * FROM users WHERE openid = ?', [openid])
 */
async function get(sql, params = []) {
  sql = translateSQL(sql);
  if (DB_TYPE === 'mysql') {
    const pool = await getMysqlPool();
    const [rows] = await pool.execute(sql, params);
    return normalizeRow(rows[0]);
  } else {
    const db = getSqlite();
    return db.prepare(sql).get(...params);
  }
}

/**
 * 执行写操作（INSERT/UPDATE/DELETE）
 * 返回 { lastInsertRowid, changes }
 * db.run('INSERT INTO posts (openid, content) VALUES (?, ?)', [openid, content])
 */
async function run(sql, params = []) {
  sql = translateSQL(sql);
  if (DB_TYPE === 'mysql') {
    const pool = await getMysqlPool();
    const [result] = await pool.execute(sql, params);
    return { lastInsertRowid: result.insertId, changes: result.affectedRows };
  } else {
    const db = getSqlite();
    const result = db.prepare(sql).run(...params);
    return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
  }
}

/**
 * 事务包装
 * tx 对象提供 { run, get, all } 三个方法，在事务上下文中执行
 * await db.transaction(async (tx) => {
 *   const post = await tx.get('SELECT ...', [...]);
 *   await tx.run('INSERT ...', [...]);
 *   await tx.run('UPDATE ...', [...]);
 * })
 */
async function transaction(fn) {
  if (DB_TYPE === 'mysql') {
    const pool = await getMysqlPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const txRun = async (sql, params = []) => {
        sql = translateSQL(sql);
        const [result] = await conn.execute(sql, params);
        return { lastInsertRowid: result.insertId, changes: result.affectedRows };
      };
      const txGet = async (sql, params = []) => {
        sql = translateSQL(sql);
        const [rows] = await conn.execute(sql, params);
        return rows[0];
      };
      const txAll = async (sql, params = []) => {
        sql = translateSQL(sql);
        const [rows] = await conn.execute(sql, params);
        return rows;
      };
      const result = await fn({ run: txRun, get: txGet, all: txAll });
      await conn.commit();
      return result;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } else {
    const db = getSqlite();
    const txFn = () => {
      const tx = {
        run: (sql, params = []) => db.prepare(sql).run(...params),
        get: (sql, params = []) => db.prepare(sql).get(...params),
        all: (sql, params = []) => db.prepare(sql).all(...params),
      };
      return fn(tx);
    };
    return db.transaction(txFn)();
  }
}

// 暴露表名常量，路由文件中拼接 SQL 时使用
module.exports = { all, get, run, transaction, TABLE, DB_TYPE };
