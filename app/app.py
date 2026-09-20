"""街坊库 —— 邻里工具共享平台（地基版）。

两块地基：
  1. 工具档案：名称 / 品类 / 押金 / 可借时段 / 安全等级 / 状态
  2. 邻居管理：楼栋门牌 + 联系方式，联系方式脱敏展示

平台规则（同时展示在界面上）：
  · 押金按件收取：每借一件工具缴纳该工具对应押金，归还验收后退还，多借多押。
  · 完整联系方式（手机号、门牌号）仅楼长（管理员）与本人可见；
    普通邻居只能看到楼栋 + 手机号尾号。越权查看返回明确的 403 错误页。
"""
import functools
import os

from flask import (Flask, abort, flash, g, redirect, render_template, request,
                   session, url_for)
from werkzeug.security import check_password_hash

from db import get_db, init_db

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "jiefangku-dev-secret")

TOOL_STATUS = {
    "available": "可借",
    "reserved": "已预约",
    "lent": "借出",
    "repair": "维修中",
    "delisted": "已下架",
}
SAFETY_LEVELS = {
    1: "普通",
    2: "需阅读安全说明",
    3: "需楼长现场确认",
}
CATEGORIES = ["电动工具", "手动工具", "测量工具", "登高工具", "清洁工具", "园艺工具", "搬运工具", "其他"]

DEPOSIT_RULE = "押金按件收取：每借一件工具缴纳该工具对应押金，归还验收后当场退还；多借多押，按件累计。"
PRIVACY_RULE = "完整联系方式（手机号、门牌号）仅楼长（管理员）与本人可见；其他邻居只能看到楼栋和手机号尾号。"


# ---------- 工具函数 ----------

def mask_phone(phone):
    """手机号脱敏：只保留尾号 4 位。"""
    return "****" + phone[-4:]


def get_db_conn():
    if "db" not in g:
        g.db = get_db()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def current_user():
    if "uid" not in session:
        return None
    return get_db_conn().execute("SELECT * FROM users WHERE id = ?", (session["uid"],)).fetchone()


@app.before_request
def load_user():
    g.user = current_user()


@app.context_processor
def inject_globals():
    return {
        "user": g.get("user"),
        "TOOL_STATUS": TOOL_STATUS,
        "SAFETY_LEVELS": SAFETY_LEVELS,
        "DEPOSIT_RULE": DEPOSIT_RULE,
        "PRIVACY_RULE": PRIVACY_RULE,
    }


def login_required(view):
    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        if g.user is None:
            flash("请先登录。", "warn")
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)
    return wrapped


def admin_required(view):
    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        if g.user is None:
            flash("请先登录。", "warn")
            return redirect(url_for("login", next=request.path))
        if g.user["role"] != "admin":
            return render_template(
                "error.html", code=403, title="无权操作",
                message="该功能仅楼长（管理员）可用。你是普通邻居账号，只能浏览工具档案和脱敏的邻居信息。",
            ), 403
        return view(*args, **kwargs)
    return wrapped


def masked_neighbor(row):
    """普通邻居视角的脱敏信息：姓名 + 楼栋 + 手机号尾号。"""
    return {
        "id": row["id"],
        "name": row["name"],
        "role": row["role"],
        "building": row["building"],
        "phone_tail": mask_phone(row["phone"]),
    }


# ---------- 登录 / 退出 ----------

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        row = get_db_conn().execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if row and check_password_hash(row["password_hash"], password):
            session.clear()
            session["uid"] = row["id"]
            flash(f"欢迎回来，{row['name']}！", "ok")
            return redirect(request.args.get("next") or url_for("tools"))
        flash("账号或密码不对，请重试。", "err")
    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    flash("已退出登录。", "ok")
    return redirect(url_for("login"))


# ---------- 工具档案 ----------

@app.route("/")
def index():
    return redirect(url_for("tools"))


@app.route("/tools")
@login_required
def tools():
    q = request.args.get("q", "").strip()
    category = request.args.get("category", "")
    status = request.args.get("status", "")

    sql = ("SELECT t.*, u.name AS owner_name, u.building AS owner_building"
           " FROM tools t JOIN users u ON u.id = t.owner_id WHERE 1=1")
    params = []
    if q:
        sql += " AND (t.name LIKE ? OR t.description LIKE ?)"
        params += [f"%{q}%", f"%{q}%"]
    if category in CATEGORIES:
        sql += " AND t.category = ?"
        params.append(category)
    if status in TOOL_STATUS:
        sql += " AND t.status = ?"
        params.append(status)
    sql += " ORDER BY t.id"
    rows = get_db_conn().execute(sql, params).fetchall()
    return render_template("tools.html", tools=rows, q=q, category=category,
                           status=status, categories=CATEGORIES)


@app.route("/tools/<int:tool_id>")
@login_required
def tool_detail(tool_id):
    row = get_db_conn().execute(
        "SELECT t.*, u.name AS owner_name, u.building AS owner_building"
        " FROM tools t JOIN users u ON u.id = t.owner_id WHERE t.id = ?", (tool_id,)).fetchone()
    if row is None:
        abort(404)
    return render_template("tool_detail.html", t=row)


def tool_form_data():
    return {
        "name": request.form.get("name", "").strip(),
        "category": request.form.get("category", ""),
        "deposit": request.form.get("deposit", "").strip(),
        "slots": request.form.get("slots", "").strip(),
        "safety_level": request.form.get("safety_level", "1"),
        "safety_note": request.form.get("safety_note", "").strip(),
        "status": request.form.get("status", "available"),
        "owner_id": request.form.get("owner_id", ""),
        "description": request.form.get("description", "").strip(),
    }


def validate_tool(data):
    errors = []
    if not data["name"]:
        errors.append("工具名称不能为空。")
    if data["category"] not in CATEGORIES:
        errors.append("请选择品类。")
    try:
        data["deposit"] = round(float(data["deposit"]), 2)
        if data["deposit"] < 0:
            raise ValueError
    except ValueError:
        errors.append("押金需为不小于 0 的数字。")
    if not data["slots"]:
        errors.append("请填写可借时段。")
    try:
        data["safety_level"] = int(data["safety_level"])
        if data["safety_level"] not in SAFETY_LEVELS:
            raise ValueError
    except (TypeError, ValueError):
        errors.append("请选择安全等级。")
    if isinstance(data["safety_level"], int) and data["safety_level"] >= 2 and not data["safety_note"]:
        errors.append("安全等级为「需阅读说明」及以上时，必须填写安全说明。")
    if data["status"] not in TOOL_STATUS:
        errors.append("状态不合法。")
    try:
        data["owner_id"] = int(data["owner_id"])
    except ValueError:
        errors.append("请选择所属邻居。")
    return errors


@app.route("/tools/new", methods=["GET", "POST"])
@admin_required
def tool_new():
    owners = get_db_conn().execute("SELECT id, name, building FROM users ORDER BY id").fetchall()
    if request.method == "POST":
        data = tool_form_data()
        errors = validate_tool(data)
        if not errors:
            get_db_conn().execute(
                "INSERT INTO tools (name, category, deposit, slots, safety_level, safety_note,"
                " status, owner_id, description) VALUES (?,?,?,?,?,?,?,?,?)",
                (data["name"], data["category"], data["deposit"], data["slots"],
                 data["safety_level"], data["safety_note"], data["status"],
                 data["owner_id"], data["description"]))
            get_db_conn().commit()
            flash(f"已上架「{data['name']}」。", "ok")
            return redirect(url_for("tools"))
        for e in errors:
            flash(e, "err")
        return render_template("tool_form.html", t=data, owners=owners,
                               categories=CATEGORIES, is_new=True), 400
    return render_template("tool_form.html", t=None, owners=owners,
                           categories=CATEGORIES, is_new=True)


@app.route("/tools/<int:tool_id>/edit", methods=["GET", "POST"])
@admin_required
def tool_edit(tool_id):
    db = get_db_conn()
    row = db.execute("SELECT * FROM tools WHERE id = ?", (tool_id,)).fetchone()
    if row is None:
        abort(404)
    owners = db.execute("SELECT id, name, building FROM users ORDER BY id").fetchall()
    if request.method == "POST":
        data = tool_form_data()
        errors = validate_tool(data)
        if not errors:
            db.execute(
                "UPDATE tools SET name=?, category=?, deposit=?, slots=?, safety_level=?,"
                " safety_note=?, status=?, owner_id=?, description=? WHERE id=?",
                (data["name"], data["category"], data["deposit"], data["slots"],
                 data["safety_level"], data["safety_note"], data["status"],
                 data["owner_id"], data["description"], tool_id))
            db.commit()
            flash(f"已更新「{data['name']}」。", "ok")
            return redirect(url_for("tool_detail", tool_id=tool_id))
        for e in errors:
            flash(e, "err")
        data["id"] = tool_id
        return render_template("tool_form.html", t=data, owners=owners,
                               categories=CATEGORIES, is_new=False), 400
    return render_template("tool_form.html", t=row, owners=owners,
                           categories=CATEGORIES, is_new=False)


@app.route("/tools/<int:tool_id>/status", methods=["POST"])
@admin_required
def tool_status(tool_id):
    """楼长快捷变更状态：上架 / 下架 / 维修 / 可借 等。"""
    new_status = request.form.get("status", "")
    db = get_db_conn()
    row = db.execute("SELECT * FROM tools WHERE id = ?", (tool_id,)).fetchone()
    if row is None:
        abort(404)
    if new_status not in TOOL_STATUS:
        flash("状态不合法。", "err")
        return redirect(url_for("tool_detail", tool_id=tool_id))
    db.execute("UPDATE tools SET status = ? WHERE id = ?", (new_status, tool_id))
    db.commit()
    flash(f"「{row['name']}」状态已改为：{TOOL_STATUS[new_status]}。", "ok")
    return redirect(url_for("tool_detail", tool_id=tool_id))


# ---------- 邻居管理 ----------

@app.route("/neighbors")
@login_required
def neighbors():
    rows = get_db_conn().execute("SELECT * FROM users ORDER BY building, unit").fetchall()
    is_admin = g.user["role"] == "admin"
    # 楼长看完整信息；普通邻居只看脱敏信息（楼栋 + 手机号尾号）
    view = rows if is_admin else [masked_neighbor(r) for r in rows]
    return render_template("neighbors.html", neighbors=view, is_admin=is_admin)


@app.route("/neighbors/<int:neighbor_id>")
@login_required
def neighbor_detail(neighbor_id):
    row = get_db_conn().execute("SELECT * FROM users WHERE id = ?", (neighbor_id,)).fetchone()
    if row is None:
        abort(404)
    can_view_full = g.user["role"] == "admin" or g.user["id"] == row["id"]
    tools = get_db_conn().execute(
        "SELECT * FROM tools WHERE owner_id = ? ORDER BY id", (neighbor_id,)).fetchall()
    return render_template("neighbor_detail.html", n=row, masked=masked_neighbor(row),
                           can_view_full=can_view_full, tools=tools)


@app.route("/neighbors/<int:neighbor_id>/contact")
@login_required
def neighbor_contact(neighbor_id):
    """完整联系方式：仅楼长与本人可见，其余人返回明确的 403 错误页。"""
    row = get_db_conn().execute("SELECT * FROM users WHERE id = ?", (neighbor_id,)).fetchone()
    if row is None:
        abort(404)
    if g.user["role"] != "admin" and g.user["id"] != row["id"]:
        return render_template(
            "error.html", code=403, title="无权查看完整联系方式",
            message=f"你只能看到 {row['name']} 的楼栋（{row['building']}）和手机号尾号"
                    f"（{mask_phone(row['phone'])}）。完整手机号和门牌号仅楼长（管理员）与本人可见。"
                    "确有急事请联系楼长转达。",
        ), 403
    return render_template("contact.html", n=row)


# ---------- 错误页 ----------

@app.errorhandler(404)
def not_found(_e):
    return render_template("error.html", code=404, title="页面不存在",
                           message="你访问的页面不存在或已被移除。"), 404


@app.errorhandler(403)
def forbidden(_e):
    return render_template("error.html", code=403, title="无权访问",
                           message="你没有权限访问该内容。"), 403


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8107)
