"""街坊库 —— 数据层：SQLite 连接、建表、种子数据。"""
import os
import sqlite3

from werkzeug.security import generate_password_hash

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "data", "jiefangku.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,               -- 称呼
    role          TEXT NOT NULL CHECK (role IN ('admin', 'neighbor')),
    building      TEXT NOT NULL,               -- 楼栋，如 3栋
    unit          TEXT NOT NULL,               -- 门牌，如 2单元502（敏感，仅楼长/本人可见）
    phone         TEXT NOT NULL                -- 手机号（敏感，仅楼长/本人可见）
);

CREATE TABLE IF NOT EXISTS tools (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    category     TEXT NOT NULL,                -- 品类
    deposit      REAL NOT NULL,                -- 押金（按件收取，归还退还）
    slots        TEXT NOT NULL,                -- 可借时段
    safety_level INTEGER NOT NULL DEFAULT 1,   -- 1普通 2需阅读安全说明 3需楼长现场确认
    safety_note  TEXT NOT NULL DEFAULT '',     -- 安全说明
    status       TEXT NOT NULL DEFAULT 'available'
                 CHECK (status IN ('available','reserved','lent','repair','delisted')),
    owner_id     INTEGER NOT NULL REFERENCES users(id),
    description  TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
"""

# 内置账号：1 位楼长（管理员）+ 15 户邻居。无注册功能。
USERS = [
    # username,      password,  name,    role,       building, unit,        phone
    ("admin",       "admin123", "陈桂芳", "admin",    "1栋", "1单元101", "13901010001"),
    ("wangjianguo", "123456",   "王建国", "neighbor", "3栋", "2单元502", "13901015021"),
    ("lixiulan",    "123456",   "李秀兰", "neighbor", "3栋", "2单元501", "13901015022"),
    ("zhangwei",    "123456",   "张伟",   "neighbor", "5栋", "1单元301", "13901015023"),
    ("liumin",      "123456",   "刘敏",   "neighbor", "5栋", "1单元302", "13901015024"),
    ("zhaoqiang",   "123456",   "赵强",   "neighbor", "2栋", "3单元201", "13901015025"),
    ("sunli",       "123456",   "孙丽",   "neighbor", "2栋", "3单元202", "13901015026"),
    ("zhoujie",     "123456",   "周杰",   "neighbor", "4栋", "1单元601", "13901015027"),
    ("wufang",      "123456",   "吴芳",   "neighbor", "4栋", "1单元602", "13901015028"),
    ("zhenghao",    "123456",   "郑浩",   "neighbor", "6栋", "2单元401", "13901015029"),
    ("fengxue",     "123456",   "冯雪",   "neighbor", "6栋", "2单元402", "13901015030"),
    ("hejun",       "123456",   "何军",   "neighbor", "1栋", "2单元303", "13901015031"),
    ("guojing",     "123456",   "郭静",   "neighbor", "1栋", "2单元304", "13901015032"),
    ("machao",      "123456",   "马超",   "neighbor", "7栋", "1单元101", "13901015033"),
    ("luoping",     "123456",   "罗萍",   "neighbor", "7栋", "1单元102", "13901015034"),
    ("gaoxiang",    "123456",   "高翔",   "neighbor", "5栋", "2单元501", "13901015035"),
]

# 25 件工具，覆盖全部 5 种状态。owner 用 username 指代，入库时映射成 id。
TOOLS = [
    # name, category, deposit, slots, safety_level, safety_note, status, owner, description
    ("博世冲击电钻 GSB-13", "电动工具", 200, "工作日 18:00-21:00 / 周末 9:00-17:00", 2,
     "使用前阅读说明书，佩戴护目镜；瓷砖打孔先用玻璃钻头定位，勿在潮湿环境使用。",
     "available", "wangjianguo", "家用冲击钻，混凝土、砖墙都能打，附 6/8/10mm 钻头。"),
    ("电锤（26 型）", "电动工具", 180, "工作日 18:00-21:00 / 周末 9:00-17:00", 3,
     "冲击力大，需楼长现场确认作业环境（墙体结构、水电走向）后借出。",
     "available", "wangjianguo", "适合混凝土开槽、打膨胀螺栓，配四坑钻头。"),
    ("角磨机（含切割片）", "电动工具", 150, "周末 9:00-17:00", 3,
     "切割作业有飞溅风险，必须戴护目镜和手套，需楼长现场确认防护后借出。",
     "repair", "zhangwei", "切割金属、瓷砖用。目前护罩松动，维修中。"),
    ("曲线锯", "电动工具", 120, "周末 9:00-17:00", 2,
     "锯条锋利，切割时双手握持，木料需固定后再下锯。",
     "lent", "zhoujie", "木工曲线切割，附木工锯条 3 根。"),
    ("热风枪", "电动工具", 60, "每天 8:00-20:00", 2,
     "出风口温度可达 500℃，远离易燃物，用完放支架上冷却。",
     "available", "zhenghao", "除漆、热缩管、解冻水管都能用。"),
    ("电烙铁套装", "电动工具", 50, "每天 8:00-20:00", 1, "",
     "available", "hejun", "60W 调温电烙铁，含焊锡丝、吸锡器、支架。"),
    ("激光测距仪", "测量工具", 100, "每天 8:00-20:00", 1, "",
     "available", "zhaoqiang", "量程 40 米，装修量房神器。"),
    ("2 米水平仪", "测量工具", 40, "每天 8:00-20:00", 1, "",
     "available", "zhaoqiang", "贴砖、装柜子找平用。"),
    ("人字梯（2 米）", "登高工具", 80, "每天 8:00-20:00", 2,
     "登梯前确认四脚着地、卡扣锁死；勿站最顶两级。",
     "available", "lixiulan", "铝合金五步梯，换灯、擦窗够用。"),
    ("伸缩梯（3.8 米）", "登高工具", 120, "周末 9:00-17:00", 3,
     "高空作业需楼长现场确认，建议两人配合，一人扶梯。",
     "reserved", "machao", "可够到二楼外窗，收纳后仅 1 米。"),
    ("管钳（14 寸）", "手动工具", 30, "每天 8:00-20:00", 1, "",
     "available", "hejun", "拧水管、暖气阀门用。"),
    ("棘轮扳手套装", "手动工具", 60, "每天 8:00-20:00", 1, "",
     "available", "gaoxiang", "46 件套，修车、装家具都行。"),
    ("精密螺丝刀 32 件套", "手动工具", 40, "每天 8:00-20:00", 1, "",
     "available", "guojing", "手机、笔记本、眼镜维修用。"),
    ("羊角锤", "手动工具", 20, "每天 8:00-20:00", 1, "",
     "available", "sunli", "钉钉子、起钉子。"),
    ("高压清洗机", "清洁工具", 150, "周末 9:00-17:00", 2,
     "水压高，勿对人、宠物、电器直喷；使用时接漏电保护插座。",
     "available", "liumin", "洗车、冲院子、洗纱窗，水压可调。"),
    ("大功率吸尘器", "清洁工具", 100, "每天 8:00-20:00", 1, "",
     "lent", "wufang", "装修开荒保洁用，干湿两用。"),
    ("蒸汽拖把", "清洁工具", 80, "每天 8:00-20:00", 1, "",
     "available", "fengxue", "高温蒸汽拖地杀菌，木地板可用。"),
    ("绿篱修剪机", "园艺工具", 90, "周末 9:00-17:00", 2,
     "刀片锋利，操作时戴手套，注意电源线位置防止割断。",
     "available", "luoping", "电动绿篱剪，修灌木、造型用。"),
    ("园艺剪刀套装", "园艺工具", 30, "每天 8:00-20:00", 1, "",
     "available", "luoping", "修枝剪、篱笆剪、高枝剪三件套。"),
    ("车载充气泵", "其他", 50, "每天 8:00-20:00", 1, "",
     "available", "gaoxiang", "12V 点烟器供电，汽车、自行车、球类充气。"),
    ("手摇管道疏通器", "其他", 40, "每天 8:00-20:00", 1, "",
     "available", "zhangwei", "5 米弹簧，通厨房、卫生间下水。"),
    ("搬家小推车", "搬运工具", 60, "全天可借（提前一天打招呼）", 1, "",
     "available", "admin", "楼委会公共物资，承重 150kg，搬家电、纸箱。"),
    ("平板小拖车", "搬运工具", 50, "全天可借（提前一天打招呼）", 1, "",
     "repair", "admin", "楼委会公共物资，目前一个轮子坏了，维修中。"),
    ("小型电焊机", "电动工具", 300, "周末 9:00-17:00", 3,
     "动火作业，需楼长现场确认作业环境与灭火措施，暂不外借。",
     "delisted", "wangjianguo", "已下架：小区消防规定收紧，暂停外借。"),
    ("玻璃吸盘（双爪）", "其他", 30, "每天 8:00-20:00", 1, "",
     "available", "zhenghao", "搬玻璃、瓷砖、大理石台面用，单爪承重 50kg。"),
]


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()
    try:
        conn.executescript(SCHEMA)
        if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] > 0:
            return  # 已有数据，不重复播种
        uid = {}
        for username, password, name, role, building, unit, phone in USERS:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash, name, role, building, unit, phone)"
                " VALUES (?,?,?,?,?,?,?)",
                (username, generate_password_hash(password), name, role, building, unit, phone),
            )
            uid[username] = cur.lastrowid
        for name, category, deposit, slots, level, note, status, owner, desc in TOOLS:
            conn.execute(
                "INSERT INTO tools (name, category, deposit, slots, safety_level, safety_note,"
                " status, owner_id, description) VALUES (?,?,?,?,?,?,?,?,?)",
                (name, category, deposit, slots, level, note, status, uid[owner], desc),
            )
        conn.commit()
    finally:
        conn.close()
