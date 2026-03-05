import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import ReactDOM from "react-dom/client";

// ── Supabase クライアント ──────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ── 定数 ──────────────────────────────────────────
const PRIORITIES = { high: "高", medium: "中", low: "低" };
const STATUSES   = { todo: "未着手", doing: "進行中", done: "完了" };
const DELETE_PASSWORD = "1234";

const PROJECT_COLORS = [
  "#60a5fa", "#818cf8", "#a78bfa", "#f472b6", "#fb923c",
  "#fbbf24", "#34d399", "#2dd4bf", "#f87171", "#94a3b8",
];

const P_CFG = {
  high:   { color: "#ff6b6b", bg: "rgba(255,107,107,0.12)", border: "rgba(255,107,107,0.3)" },
  medium: { color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.3)"  },
  low:    { color: "#34d399", bg: "rgba(52,211,153,0.12)",  border: "rgba(52,211,153,0.3)"  },
};
const S_CFG = {
  todo:  { color: "#64748b", icon: "○" },
  doing: { color: "#60a5fa", icon: "◐" },
  done:  { color: "#34d399", icon: "●" },
};

const genId = () => "T" + Math.random().toString(36).substr(2, 5).toUpperCase();
const genProjId = () => "P" + Math.random().toString(36).substr(2, 5).toUpperCase();

function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "今";
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}

function getUserName(user) {
  return user?.user_metadata?.display_name || "";
}

// ── DB操作（プロジェクト）─────────────────────────
async function fetchProjects() {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

async function insertProject(proj) {
  const { error } = await supabase.from("projects").insert({
    id: proj.id, name: proj.name, color: proj.color,
    created_at: proj.createdAt, updated_at: proj.updatedAt,
  });
  if (error) throw error;
}

async function updateProject(proj) {
  const { error } = await supabase.from("projects").update({
    name: proj.name, color: proj.color, updated_at: proj.updatedAt,
  }).eq("id", proj.id);
  if (error) throw error;
}

async function deleteProject(id) {
  const { error: taskErr } = await supabase.from("tasks").delete().eq("project_id", id);
  if (taskErr) throw taskErr;
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

// ── DB操作（タスク）───────────────────────────────
async function fetchTasks(projectId) {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}

async function fetchAllTaskCounts() {
  const { data, error } = await supabase.from("tasks").select("project_id, status");
  if (error) throw error;
  const counts = {};
  for (const t of data) {
    if (!counts[t.project_id]) counts[t.project_id] = { total: 0, todo: 0, doing: 0, done: 0 };
    counts[t.project_id].total++;
    counts[t.project_id][t.status]++;
  }
  return counts;
}

async function insertTask(task) {
  const { error } = await supabase.from("tasks").insert({
    id: task.id, title: task.title, description: task.description,
    assignee: task.assignee, priority: task.priority, status: task.status,
    tag: task.tag, project_id: task.projectId,
    created_at: task.createdAt, updated_at: task.updatedAt,
  });
  if (error) throw error;
}

async function updateTask(task) {
  const { error } = await supabase.from("tasks").update({
    title: task.title, description: task.description, assignee: task.assignee,
    priority: task.priority, status: task.status, tag: task.tag,
    updated_at: task.updatedAt,
  }).eq("id", task.id);
  if (error) throw error;
}

async function deleteTask(id) {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

async function deleteAllTasks(projectId) {
  const { error } = await supabase.from("tasks").delete().eq("project_id", projectId);
  if (error) throw error;
}

// ── 変換 ──────────────────────────────────────────
function toTask(row) {
  return { ...row, projectId: row.project_id, createdAt: row.created_at, updatedAt: row.updated_at };
}
function toProject(row) {
  return { ...row, createdAt: row.created_at, updatedAt: row.updated_at };
}

// ── 共通コンポーネント ────────────────────────────

const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    ::-webkit-scrollbar{display:none}
    button{font-family:'Outfit',sans-serif;cursor:pointer;}
    button:active{transform:scale(.96);}
    input,textarea,select{font-family:'Outfit',sans-serif;color:#f1f5f9;}
    select option{background:#111827;}
    input::placeholder,textarea::placeholder{color:#334155;}
    @keyframes toastPop{from{opacity:0;transform:translateX(-50%) scale(.9)}to{opacity:1;transform:translateX(-50%) scale(1)}}
    @keyframes sheetUp{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes shakeX{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
  `}</style>
);

function Toast({ msg, ok, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2000); return () => clearTimeout(t); }, []);
  return (
    <div style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", zIndex: 999, background: ok ? "rgba(52,211,153,0.95)" : "rgba(248,113,113,0.95)", color: "#fff", padding: "10px 22px", borderRadius: 100, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(0,0,0,0.35)", animation: "toastPop .2s ease" }}>
      {ok ? "✓ " : "✕ "}{msg}
    </div>
  );
}

function PasswordSheet({ title, onConfirm, onClose }) {
  const [pw, setPw] = useState("");
  const [shake, setShake] = useState(false);
  const inputRef = useRef();
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 300); }, []);
  const attempt = () => {
    if (pw === DELETE_PASSWORD) { onConfirm(); onClose(); }
    else { setShake(true); setPw(""); setTimeout(() => setShake(false), 500); }
  };
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 540, background: "#111827", borderRadius: "24px 24px 0 0", padding: "0 20px 40px", animation: "sheetUp .28s cubic-bezier(.32,.72,0,1)" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 8px" }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>
        <div style={{ textAlign: "center", padding: "12px 0 24px" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔒</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#f8fafc" }}>{title}</div>
          <div style={{ fontSize: 13, color: "#475569", marginTop: 6 }}>パスワードを入力してください</div>
        </div>
        <div style={{ animation: shake ? "shakeX .4s ease" : "none" }}>
          <input ref={inputRef} type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && attempt()} placeholder="••••"
            style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${shake ? "rgba(248,113,113,0.6)" : "rgba(255,255,255,0.1)"}`, borderRadius: 14, padding: "15px", color: "#f1f5f9", fontSize: 22, outline: "none", textAlign: "center", letterSpacing: "0.3em", fontFamily: "'Outfit',sans-serif", boxSizing: "border-box", marginBottom: 12 }} />
          {shake && <div style={{ textAlign: "center", color: "#f87171", fontSize: 13, marginBottom: 12 }}>パスワードが違います</div>}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#64748b", padding: "14px", borderRadius: 14, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>キャンセル</button>
          <button onClick={attempt} style={{ flex: 2, background: "linear-gradient(135deg,#f43f5e,#fb923c)", border: "none", color: "#fff", padding: "14px", borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>削除する</button>
        </div>
      </div>
    </div>
  );
}

function Sheet({ onClose, children, title }) {
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 400, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 540, background: "#111827", borderRadius: "24px 24px 0 0", padding: "0 0 32px", animation: "sheetUp .28s cubic-bezier(.32,.72,0,1)", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>
        <div style={{ padding: "4px 20px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: "#f8fafc" }}>{title}</span>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#94a3b8", width: 32, height: 32, borderRadius: "50%", fontSize: 16, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ overflowY: "auto", padding: "0 20px", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={{ display: "block", fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
    {children}
  </div>
);

const inputStyle = { width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "13px 14px", color: "#f1f5f9", fontSize: 15, outline: "none", fontFamily: "'Outfit',sans-serif", boxSizing: "border-box" };

// ── ログイン画面 ──────────────────────────────────

function AuthView() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    if (!email.trim() || !password.trim()) return setError("メールとパスワードを入力してください");
    if (mode === "signup" && !name.trim()) return setError("名前を入力してください");
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { display_name: name.trim() } },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 540, margin: "0 auto", height: "100dvh", display: "flex", flexDirection: "column", background: "#0a0f1e", fontFamily: "'Outfit',sans-serif", color: "#e2e8f0", justifyContent: "center", padding: "0 24px" }}>
      <GlobalStyle />
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 32, fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.5px" }}>TaskBoard</div>
        <div style={{ fontSize: 13, color: "#475569", marginTop: 6 }}>{mode === "login" ? "ログイン" : "アカウント作成"}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {mode === "signup" && (
          <Field label="名前">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="表示名" style={inputStyle} />
          </Field>
        )}
        <Field label="メールアドレス">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" style={inputStyle} />
        </Field>
        <Field label="パスワード">
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={inputStyle}
            onKeyDown={e => e.key === "Enter" && submit()} />
        </Field>
        {error && <div style={{ color: "#f87171", fontSize: 13, textAlign: "center" }}>{error}</div>}
        <button onClick={submit} disabled={loading} style={{ width: "100%", padding: "16px", borderRadius: 16, fontSize: 16, fontWeight: 700, border: "none", cursor: "pointer", marginTop: 8, background: "linear-gradient(135deg,#60a5fa,#818cf8)", color: "#fff", opacity: loading ? 0.5 : 1 }}>
          {loading ? "処理中…" : mode === "login" ? "ログイン" : "登録する"}
        </button>
        <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }} style={{ background: "none", border: "none", color: "#60a5fa", fontSize: 13, padding: "12px", cursor: "pointer" }}>
          {mode === "login" ? "アカウントを作成する" : "ログインに戻る"}
        </button>
      </div>
    </div>
  );
}

// ── プロジェクト一覧画面 ──────────────────────────

function ProjectListView({ onSelect, user, onLogout }) {
  const [projects, setProjects] = useState([]);
  const [taskCounts, setTaskCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [pwSheet, setPwSheet] = useState(null);
  const [modal, setModal] = useState(false);
  const [editProj, setEditProj] = useState(null);
  const [form, setForm] = useState({ name: "", color: PROJECT_COLORS[0] });

  const notify = (msg, ok = true) => setToast({ msg, ok });
  const askPassword = (title, onConfirm) => setPwSheet({ title, onConfirm });

  const load = useCallback(async () => {
    try {
      const [projs, counts] = await Promise.all([fetchProjects(), fetchAllTaskCounts()]);
      setProjects(projs.map(toProject));
      setTaskCounts(counts);
    } catch (e) {
      notify("取得エラー: " + e.message, false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch1 = supabase.channel("projects-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => load())
      .subscribe();
    const ch2 = supabase.channel("tasks-count-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [load]);

  const openAdd = () => { setForm({ name: "", color: PROJECT_COLORS[0] }); setEditProj(null); setModal(true); };
  const openEdit = (p) => { setForm({ name: p.name, color: p.color }); setEditProj(p); setModal(true); };

  const submit = async () => {
    if (!form.name.trim()) return;
    try {
      if (editProj) {
        await updateProject({ ...editProj, ...form, updatedAt: Date.now() });
        notify("更新しました");
      } else {
        await insertProject({ id: genProjId(), ...form, createdAt: Date.now(), updatedAt: Date.now() });
        notify("作成しました");
      }
      setModal(false);
      setEditProj(null);
    } catch (e) { notify("エラー: " + e.message, false); }
  };

  const del = (proj) => askPassword(`「${proj.name}」を削除`, async () => {
    try { await deleteProject(proj.id); notify("削除しました", false); }
    catch (e) { notify("エラー: " + e.message, false); }
  });

  const displayName = getUserName(user);

  return (
    <div style={{ maxWidth: 540, margin: "0 auto", height: "100dvh", display: "flex", flexDirection: "column", background: "#0a0f1e", fontFamily: "'Outfit',sans-serif", color: "#e2e8f0" }}>
      <GlobalStyle />

      <div style={{ padding: "20px 16px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.5px" }}>プロジェクト</div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{displayName} · {projects.length}件</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={onLogout} style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171", padding: "8px 12px", borderRadius: 12, fontSize: 11, fontWeight: 600 }}>ログアウト</button>
            <button onClick={load} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "#64748b", width: 36, height: 36, borderRadius: 12, fontSize: 16 }}>↻</button>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 90px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#334155" }}>
            <div style={{ fontSize: 36, opacity: .3 }}>○</div>
            <div style={{ fontSize: 13, marginTop: 12 }}>読み込み中…</div>
          </div>
        ) : projects.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 52, opacity: .15 }}>◎</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#334155", marginTop: 16 }}>プロジェクトなし</div>
            <div style={{ fontSize: 13, color: "#1e293b", marginTop: 6 }}>下の ＋ から作成できます</div>
          </div>
        ) : projects.map((p, i) => {
          const c = taskCounts[p.id] || { total: 0, todo: 0, doing: 0, done: 0 };
          const progress = c.total > 0 ? Math.round((c.done / c.total) * 100) : 0;
          return (
            <div key={p.id} onClick={() => onSelect(p)} style={{ background: "#111827", borderRadius: 18, padding: "16px", marginBottom: 10, border: "1px solid rgba(255,255,255,0.06)", position: "relative", overflow: "hidden", cursor: "pointer", animation: `fadeIn .3s ease ${i * 0.03}s both` }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${p.color},transparent)`, borderRadius: "18px 18px 0 0" }} />
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: `${p.color}20`, border: `2px solid ${p.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                  {p.name.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#f1f5f9", marginBottom: 6 }}>{p.name}</div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: "#64748b" }}>{c.total}件</span>
                    <span style={{ fontSize: 11, color: S_CFG.todo.color }}>{c.todo} 未着手</span>
                    <span style={{ fontSize: 11, color: S_CFG.doing.color }}>{c.doing} 進行中</span>
                    <span style={{ fontSize: 11, color: S_CFG.done.color }}>{c.done} 完了</span>
                  </div>
                  <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${progress}%`, background: p.color, borderRadius: 2, transition: "width .3s ease" }} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={e => { e.stopPropagation(); openEdit(p); }} style={{ background: "rgba(255,255,255,0.06)", border: "none", color: "#64748b", width: 30, height: 30, borderRadius: 9, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✎</button>
                  <button onClick={e => { e.stopPropagation(); del(p); }} style={{ background: "rgba(248,113,113,0.1)", border: "none", color: "#f87171", width: 30, height: 30, borderRadius: 9, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={openAdd} style={{ position: "fixed", bottom: 32, right: 16, width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg,#60a5fa,#818cf8)", border: "none", color: "#fff", fontSize: 26, boxShadow: "0 8px 32px rgba(96,165,250,0.4)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 200 }}>＋</button>

      {modal && (
        <Sheet onClose={() => { setModal(false); setEditProj(null); }} title={editProj ? "プロジェクトを編集" : "新しいプロジェクト"}>
          <Field label="プロジェクト名 *">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="プロジェクト名" style={inputStyle} autoFocus />
          </Field>
          <Field label="カラー">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PROJECT_COLORS.map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))} style={{ width: 36, height: 36, borderRadius: 10, background: c, border: form.color === c ? "3px solid #fff" : "3px solid transparent", cursor: "pointer", transition: "border .15s" }} />
              ))}
            </div>
          </Field>
          <button onClick={submit} disabled={!form.name.trim()} style={{ width: "100%", padding: "16px", borderRadius: 16, fontSize: 16, fontWeight: 700, border: "none", cursor: "pointer", marginTop: 8, marginBottom: 4, background: form.name.trim() ? "linear-gradient(135deg,#60a5fa,#818cf8)" : "#1e293b", color: form.name.trim() ? "#fff" : "#334155" }}>
            {editProj ? "更新する" : "作成する"}
          </button>
        </Sheet>
      )}

      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
      {pwSheet && <PasswordSheet title={pwSheet.title} onConfirm={pwSheet.onConfirm} onClose={() => setPwSheet(null)} />}
    </div>
  );
}

// ── タスクカード ───────────────────────────────────

function TaskCard({ task, onEdit, onDelete, onCycle }) {
  const pc = P_CFG[task.priority];
  const sc = S_CFG[task.status];
  return (
    <div onClick={() => onEdit(task)} style={{ background: "#111827", borderRadius: 18, padding: "16px", marginBottom: 10, border: "1px solid rgba(255,255,255,0.06)", position: "relative", overflow: "hidden", cursor: "pointer", transition: "transform .15s" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${pc.color},transparent)`, borderRadius: "18px 18px 0 0" }} />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <button onClick={e => { e.stopPropagation(); onCycle(task); }} style={{ width: 34, height: 34, borderRadius: "50%", background: `${sc.color}20`, border: `2px solid ${sc.color}`, color: sc.color, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
          {sc.icon}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 5, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#334155" }}>{task.id}</span>
            {task.tag && <span style={{ fontSize: 10, color: "#a78bfa", background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", padding: "1px 8px", borderRadius: 100 }}>{task.tag}</span>}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: task.status === "done" ? "#475569" : "#f1f5f9", textDecoration: task.status === "done" ? "line-through" : "none", lineHeight: 1.4, marginBottom: task.description ? 6 : 10 }}>
            {task.title}
          </div>
          {task.description && <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5, marginBottom: 10 }}>{task.description}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, background: pc.bg, border: `1px solid ${pc.border}`, color: pc.color, padding: "3px 10px", borderRadius: 100, fontWeight: 600 }}>{PRIORITIES[task.priority]}優先度</span>
            <span style={{ fontSize: 11, color: sc.color, fontWeight: 500 }}>{STATUSES[task.status]}</span>
            {task.assignee && <span style={{ fontSize: 11, color: "#475569" }}>@{task.assignee}</span>}
            <span style={{ fontSize: 11, color: "#1e293b", marginLeft: "auto" }}>{timeAgo(task.updatedAt)}</span>
          </div>
        </div>
        <button onClick={e => { e.stopPropagation(); onDelete(task.id); }} style={{ background: "rgba(248,113,113,0.1)", border: "none", color: "#f87171", width: 30, height: 30, borderRadius: 9, fontSize: 14, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>
    </div>
  );
}

// ── DBビュー ───────────────────────────────────────

function DBView({ tasks, onClear, onBack }) {
  const [q, setQ] = useState("");
  const filt = tasks.filter(t => Object.values(t).join(" ").toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "16px 16px 0", display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.06)", border: "none", color: "#94a3b8", width: 36, height: 36, borderRadius: 12, fontSize: 18, cursor: "pointer" }}>←</button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#f8fafc" }}>データベース</div>
          <div style={{ fontSize: 11, color: "#475569" }}>{tasks.length}件のタスク</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, padding: "16px" }}>
        {[["全", tasks.length, "#60a5fa"], ["未", tasks.filter(t => t.status === "todo").length, "#64748b"], ["中", tasks.filter(t => t.status === "doing").length, "#60a5fa"], ["済", tasks.filter(t => t.status === "done").length, "#34d399"]].map(([l, n, c]) => (
          <div key={l} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "12px 8px", textAlign: "center", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: c, fontFamily: "monospace" }}>{n}</div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: "0 16px 12px" }}>
        <button onClick={onClear} style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171", padding: "10px 20px", borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>⊘ 全タスクを削除</button>
      </div>
      <div style={{ padding: "0 16px 10px" }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="検索…" style={{ ...inputStyle, fontSize: 14 }} />
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
        {filt.map(t => (
          <div key={t.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "12px 14px", marginBottom: 8, fontSize: 13 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
              <span style={{ color: "#60a5fa", fontFamily: "monospace", fontSize: 11 }}>{t.id}</span>
              <span style={{ color: S_CFG[t.status]?.color, fontSize: 11 }}>{STATUSES[t.status]}</span>
              <span style={{ color: P_CFG[t.priority]?.color, fontSize: 11, marginLeft: "auto" }}>{PRIORITIES[t.priority]}</span>
            </div>
            <div style={{ color: "#e2e8f0", fontWeight: 500, marginBottom: 4 }}>{t.title}</div>
            <div style={{ color: "#475569", fontSize: 12 }}>
              {t.assignee && `@${t.assignee} · `}{t.tag && `${t.tag} · `}{t.createdAt && new Date(t.createdAt).toLocaleDateString("ja")}
            </div>
          </div>
        ))}
        {filt.length === 0 && <div style={{ textAlign: "center", color: "#334155", padding: "40px 0", fontSize: 14 }}>データなし</div>}
      </div>
    </div>
  );
}

// ── タスクボード画面（プロジェクト内）──────────────

function TaskBoardView({ project, onBack, user }) {
  const defaultAssignee = getUserName(user);
  const BLANK = { title: "", assignee: defaultAssignee, priority: "medium", status: "todo", description: "", tag: "" };

  const [tasks,    setTasks]    = useState([]);
  const [filter,   setFilter]   = useState("all");
  const [modal,    setModal]    = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [form,     setForm]     = useState(BLANK);
  const [loading,  setLoading]  = useState(true);
  const [synced,   setSynced]   = useState(null);
  const [toast,    setToast]    = useState(null);
  const [dbView,   setDbView]   = useState(false);
  const [pwSheet,  setPwSheet]  = useState(null);

  const notify     = (msg, ok = true) => setToast({ msg, ok });
  const askPassword = (title, onConfirm) => setPwSheet({ title, onConfirm });

  const load = useCallback(async () => {
    try {
      const data = await fetchTasks(project.id);
      setTasks(data.map(toTask));
    } catch (e) {
      notify("取得エラー: " + e.message, false);
    }
    setLoading(false);
    setSynced(Date.now());
  }, [project.id]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`tasks-realtime-${project.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, (payload) => {
        const row = payload.new || payload.old;
        if (row && row.project_id === project.id) load();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [load, project.id]);

  const openAdd  = () => { setForm(BLANK); setEditTask(null); setModal(true); };
  const openEdit = t  => { setForm({ title: t.title, assignee: t.assignee || "", priority: t.priority, status: t.status, description: t.description || "", tag: t.tag || "" }); setEditTask(t); setModal(true); };
  const closeModal = () => { setModal(false); setEditTask(null); };

  const submit = async () => {
    if (!form.title.trim()) return;
    try {
      if (editTask) {
        await updateTask({ ...editTask, ...form, updatedAt: Date.now() });
        notify("更新しました");
      } else {
        await insertTask({ id: genId(), ...form, projectId: project.id, createdAt: Date.now(), updatedAt: Date.now() });
        notify("追加しました");
      }
      closeModal();
    } catch (e) { notify("エラー: " + e.message, false); }
  };

  const del = (id) => askPassword("タスクを削除", async () => {
    try { await deleteTask(id); notify("削除しました", false); }
    catch (e) { notify("エラー: " + e.message, false); }
  });

  const cycle = async (task) => {
    const order = ["todo", "doing", "done"];
    const next  = order[(order.indexOf(task.status) + 1) % 3];
    try { await updateTask({ ...task, status: next, updatedAt: Date.now() }); notify(STATUSES[next]); }
    catch (e) { notify("エラー: " + e.message, false); }
  };

  const doClear = () => askPassword("全タスクを削除", async () => {
    try { await deleteAllTasks(project.id); notify("全削除しました", false); }
    catch (e) { notify("エラー: " + e.message, false); }
  });

  const FILTERS = [["all", "すべて"], ["todo", "未着手"], ["doing", "進行中"], ["done", "完了"]];
  const shown = tasks.filter(t => filter === "all" || t.status === filter);
  const cnt   = s => tasks.filter(t => t.status === s).length;

  if (dbView) return (
    <div style={{ maxWidth: 540, margin: "0 auto", height: "100dvh", display: "flex", flexDirection: "column", background: "#0a0f1e", fontFamily: "'Outfit',sans-serif", color: "#e2e8f0" }}>
      <GlobalStyle />
      <DBView tasks={tasks} onClear={doClear} onBack={() => setDbView(false)} />
      {toast   && <Toast {...toast} onDone={() => setToast(null)} />}
      {pwSheet && <PasswordSheet title={pwSheet.title} onConfirm={pwSheet.onConfirm} onClose={() => setPwSheet(null)} />}
    </div>
  );

  return (
    <div style={{ maxWidth: 540, margin: "0 auto", height: "100dvh", display: "flex", flexDirection: "column", background: "#0a0f1e", fontFamily: "'Outfit',sans-serif", color: "#e2e8f0", position: "relative" }}>
      <GlobalStyle />

      {/* ヘッダー */}
      <div style={{ padding: "20px 16px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={onBack} style={{ background: "rgba(255,255,255,0.06)", border: "none", color: "#94a3b8", width: 36, height: 36, borderRadius: 12, fontSize: 18, cursor: "pointer" }}>←</button>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: project.color }} />
                <div style={{ fontSize: 20, fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.5px" }}>{project.name}</div>
              </div>
              <div style={{ fontSize: 12, color: "#334155", marginTop: 2, marginLeft: 18 }}>
                {synced ? `${timeAgo(synced)}同期` : "読み込み中…"}
                {!loading && <span style={{ color: "#34d399", marginLeft: 6 }}>● live</span>}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setDbView(true)} style={{ background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)", color: "#60a5fa", padding: "8px 12px", borderRadius: 12, fontSize: 12, fontWeight: 600 }}>DB</button>
            <button onClick={load} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "#64748b", width: 36, height: 36, borderRadius: 12, fontSize: 16 }}>↻</button>
          </div>
        </div>

        {/* 統計 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 }}>
          {[["進行中", cnt("doing"), "#60a5fa"], ["未着手", cnt("todo"), "#94a3b8"], ["完了", cnt("done"), "#34d399"]].map(([l, n, c]) => (
            <div key={l} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: c, lineHeight: 1 }}>{n}</div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* フィルター */}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 4 }}>
          {FILTERS.map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} style={{ background: filter === k ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${filter === k ? "rgba(96,165,250,0.4)" : "rgba(255,255,255,0.07)"}`, color: filter === k ? "#60a5fa" : "#64748b", padding: "7px 16px", borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
              {l}{filter === k && ` · ${shown.length}`}
            </button>
          ))}
        </div>
      </div>

      {/* タスクリスト */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 90px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#334155" }}>
            <div style={{ fontSize: 36, opacity: .3 }}>○</div>
            <div style={{ fontSize: 13, marginTop: 12 }}>読み込み中…</div>
          </div>
        ) : shown.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 52, opacity: .15 }}>◎</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#334155", marginTop: 16 }}>タスクなし</div>
            <div style={{ fontSize: 13, color: "#1e293b", marginTop: 6 }}>下の ＋ から追加できます</div>
          </div>
        ) : shown.map((t, i) => (
          <div key={t.id} style={{ animation: `fadeIn .3s ease ${i * 0.03}s both` }}>
            <TaskCard task={t} onEdit={openEdit} onDelete={del} onCycle={cycle} />
          </div>
        ))}
      </div>

      {/* FAB */}
      <button onClick={openAdd} style={{ position: "fixed", bottom: 88, right: 16, width: 56, height: 56, borderRadius: "50%", background: `linear-gradient(135deg,${project.color},#818cf8)`, border: "none", color: "#fff", fontSize: 26, boxShadow: `0 8px 32px ${project.color}66`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 200 }}>＋</button>

      {/* ボトムナビ */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 540, background: "rgba(10,15,30,0.95)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.07)", display: "grid", gridTemplateColumns: "repeat(4,1fr)", padding: "8px 0 20px", zIndex: 100 }}>
        {[["all", "全て", "○"], ["todo", "未着手", "◌"], ["doing", "進行中", "◐"], ["done", "完了", "●"]].map(([k, l, ic]) => {
          const active = filter === k;
          const col = k === "doing" ? "#60a5fa" : k === "done" ? "#34d399" : "#94a3b8";
          return (
            <button key={k} onClick={() => setFilter(k)} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", padding: "4px 0" }}>
              <span style={{ fontSize: 18, color: active ? col : "#334155" }}>{ic}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: active ? col : "#334155" }}>{l}</span>
              {active && <div style={{ width: 4, height: 4, borderRadius: "50%", background: col }} />}
            </button>
          );
        })}
      </div>

      {/* タスク追加・編集シート */}
      {modal && (
        <Sheet onClose={closeModal} title={editTask ? "タスクを編集" : "新しいタスク"}>
          <Field label="タスク名 *">
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="何をしますか？" style={inputStyle} autoFocus />
          </Field>
          <Field label="担当者">
            <input value={form.assignee} onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))} placeholder="名前" style={inputStyle} />
          </Field>
          <Field label="タグ">
            <input value={form.tag} onChange={e => setForm(f => ({ ...f, tag: e.target.value }))} placeholder="#デザイン" style={inputStyle} />
          </Field>
          <Field label="メモ">
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="詳細…" style={{ ...inputStyle, resize: "none" }} />
          </Field>
          <Field label="優先度">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {Object.entries(PRIORITIES).map(([k, l]) => {
                const c = P_CFG[k]; const sel = form.priority === k;
                return <button key={k} onClick={() => setForm(f => ({ ...f, priority: k }))} style={{ background: sel ? c.bg : "rgba(255,255,255,0.04)", border: `1px solid ${sel ? c.border : "rgba(255,255,255,0.08)"}`, color: sel ? c.color : "#64748b", padding: "10px", borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{l}</button>;
              })}
            </div>
          </Field>
          <Field label="ステータス">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {Object.entries(STATUSES).map(([k, l]) => {
                const c = S_CFG[k]; const sel = form.status === k;
                return <button key={k} onClick={() => setForm(f => ({ ...f, status: k }))} style={{ background: sel ? `${c.color}15` : "rgba(255,255,255,0.04)", border: `1px solid ${sel ? c.color + "44" : "rgba(255,255,255,0.08)"}`, color: sel ? c.color : "#64748b", padding: "10px", borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{l}</button>;
              })}
            </div>
          </Field>
          <button onClick={submit} disabled={!form.title.trim()} style={{ width: "100%", padding: "16px", borderRadius: 16, fontSize: 16, fontWeight: 700, border: "none", cursor: "pointer", marginTop: 8, marginBottom: 4, background: form.title.trim() ? `linear-gradient(135deg,${project.color},#818cf8)` : "#1e293b", color: form.title.trim() ? "#fff" : "#334155" }}>
            {editTask ? "更新する" : "追加する"}
          </button>
        </Sheet>
      )}

      {toast   && <Toast {...toast} onDone={() => setToast(null)} />}
      {pwSheet && <PasswordSheet title={pwSheet.title} onConfirm={pwSheet.onConfirm} onClose={() => setPwSheet(null)} />}
    </div>
  );
}

// ── メインアプリ ──────────────────────────────────
function App() {
  const [user, setUser] = useState(undefined); // undefined=loading, null=not logged in
  const [currentProject, setCurrentProject] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setCurrentProject(null);
  };

  // ローディング中
  if (user === undefined) {
    return (
      <div style={{ maxWidth: 540, margin: "0 auto", height: "100dvh", display: "flex", flexDirection: "column", background: "#0a0f1e", fontFamily: "'Outfit',sans-serif", color: "#e2e8f0", justifyContent: "center", alignItems: "center" }}>
        <GlobalStyle />
        <div style={{ fontSize: 36, opacity: .3 }}>○</div>
        <div style={{ fontSize: 13, color: "#334155", marginTop: 12 }}>読み込み中…</div>
      </div>
    );
  }

  // 未ログイン
  if (!user) {
    return <AuthView />;
  }

  // ログイン済み
  if (currentProject) {
    return <TaskBoardView project={currentProject} onBack={() => setCurrentProject(null)} user={user} />;
  }
  return <ProjectListView onSelect={setCurrentProject} user={user} onLogout={logout} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
