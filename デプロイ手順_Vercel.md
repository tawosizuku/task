# TaskBoard — Vercel + Supabase デプロイ手順

---

## 全体の流れ（30分くらいで完了します）

```
Supabase登録 → DB作成 → コード準備 → Vercelにデプロイ
```

---

## STEP 1 ｜ Supabaseのアカウントを作成する

1. https://supabase.com にアクセス
2. 「Start your project」をクリック
3. GitHubアカウントでサインアップ（一番簡単です）
4. ログイン後、「New project」をクリック
5. 以下を入力して「Create new project」
   - **Name**：`taskboard`（なんでもOK）
   - **Database Password**：強いパスワードを設定してメモしておく
   - **Region**：`Northeast Asia (Tokyo)` を選択
6. プロジェクトの作成に1〜2分かかります。完了まで待つ ✅

---

## STEP 2 ｜ データベースのテーブルを作成する

1. 左メニューの **「SQL Editor」** をクリック
2. 「New query」をクリック
3. 以下のSQLをコピー＆ペーストして「Run」を押す

```sql
create table tasks (
  id          text primary key,
  title       text not null,
  description text default '',
  assignee    text default '',
  priority    text default 'medium',
  status      text default 'todo',
  tag         text default '',
  created_at  bigint not null,
  updated_at  bigint not null
);

-- 全員が読み書きできるようにする（認証なしで使う場合）
alter table tasks enable row level security;
create policy "全員読み取り可" on tasks for select using (true);
create policy "全員書き込み可" on tasks for insert with check (true);
create policy "全員更新可"   on tasks for update using (true);
create policy "全員削除可"   on tasks for delete using (true);
```

4. 「Success」と表示されれば完了 ✅

---

## STEP 3 ｜ Supabaseの接続情報をメモする

1. 左メニューの **「Project Settings」→「API」** をクリック
2. 以下の2つをメモしておく

| 項目 | 場所 |
|------|------|
| **Project URL** | `https://xxxxxx.supabase.co` |
| **anon public key** | `eyJhbGci...` で始まる長い文字列 |

---

## STEP 4 ｜ プロジェクトファイルを準備する

ダウンロードしたファイル一式を使います。

```
taskboard/
├── index.html
├── package.json
├── vite.config.js
├── .env          ← STEP3の情報を書き込む
└── src/
    └── main.jsx  ← アプリ本体
```

**`.env` ファイルを編集する**

```
VITE_SUPABASE_URL=https://xxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

---

## STEP 5 ｜ Vercelにデプロイする

### 方法A：GitHubを使う（推奨）

1. GitHubに新しいリポジトリを作成（例：`taskboard`）
2. プロジェクトフォルダをpush
   ```bash
   git init
   git add .
   git commit -m "first commit"
   git remote add origin https://github.com/あなた/taskboard.git
   git push -u origin main
   ```
3. Vercel（https://vercel.com）にログイン
4. 「Add New Project」→ GitHubリポジトリを選択
5. **Environment Variables** に以下を追加
   - `VITE_SUPABASE_URL` → SupabaseのProject URL
   - `VITE_SUPABASE_ANON_KEY` → Supabaseのanon key
6. 「Deploy」をクリック → 完了 ✅

### 方法B：Vercel CLIを使う（GitHubなしでOK）

```bash
npm install -g vercel
cd taskboard
vercel
```
画面の指示に従って進めるとデプロイ完了です。

---

## 完成後のURL

```
https://taskboard-xxx.vercel.app
```

このURLをチームメンバーに共有すれば、全員が同じデータベースにアクセスできます 🎉

---

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| データが取得できない | `.env` のURLとKEYが正しいか確認 |
| 「permission denied」エラー | STEP2のRLS設定が完了しているか確認 |
| Vercelでビルドエラー | Environment Variablesが設定されているか確認 |
