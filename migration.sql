-- ============================================================
-- プロジェクトメンバー管理機能 マイグレーション
-- Supabase SQL Editor で実行してください
-- ============================================================

-- 1a. project_members テーブル作成
CREATE TABLE project_members (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('owner', 'member')) DEFAULT 'member',
  created_at BIGINT NOT NULL,
  UNIQUE(project_id, user_id)
);

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- 1b. メールでユーザー検索する RPC 関数
CREATE OR REPLACE FUNCTION search_users_by_email(search_email TEXT)
RETURNS TABLE(id UUID, email TEXT, display_name TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT au.id, au.email::TEXT,
    COALESCE(au.raw_user_meta_data->>'display_name', '')::TEXT
  FROM auth.users au
  WHERE au.email ILIKE '%' || search_email || '%'
  LIMIT 10;
$$;

-- 1b2. ユーザーIDリストからユーザー情報を取得する RPC 関数
CREATE OR REPLACE FUNCTION get_users_by_ids(user_ids UUID[])
RETURNS TABLE(id UUID, email TEXT, display_name TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT au.id, au.email::TEXT,
    COALESCE(au.raw_user_meta_data->>'display_name', '')::TEXT
  FROM auth.users au
  WHERE au.id = ANY(user_ids);
$$;

-- 1c. 既存 RLS ポリシー削除
-- projects テーブル
DROP POLICY IF EXISTS "Allow all for authenticated" ON projects;
DROP POLICY IF EXISTS "projects_select" ON projects;
DROP POLICY IF EXISTS "projects_insert" ON projects;
DROP POLICY IF EXISTS "projects_update" ON projects;
DROP POLICY IF EXISTS "projects_delete" ON projects;

-- tasks テーブル
DROP POLICY IF EXISTS "Allow all for authenticated" ON tasks;
DROP POLICY IF EXISTS "tasks_select" ON tasks;
DROP POLICY IF EXISTS "tasks_insert" ON tasks;
DROP POLICY IF EXISTS "tasks_update" ON tasks;
DROP POLICY IF EXISTS "tasks_delete" ON tasks;

-- project_members テーブル (念のため)
DROP POLICY IF EXISTS "pm_select" ON project_members;
DROP POLICY IF EXISTS "pm_insert" ON project_members;
DROP POLICY IF EXISTS "pm_delete" ON project_members;

-- ── projects テーブル：メンバーベース RLS ──
CREATE POLICY "projects_select" ON projects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = projects.id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "projects_insert" ON projects FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "projects_update" ON projects FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = projects.id
        AND pm.user_id = auth.uid()
        AND pm.role = 'owner'
    )
  );

CREATE POLICY "projects_delete" ON projects FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = projects.id
        AND pm.user_id = auth.uid()
        AND pm.role = 'owner'
    )
  );

-- ── tasks テーブル：メンバーのみ ──
CREATE POLICY "tasks_select" ON tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = tasks.project_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "tasks_insert" ON tasks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = tasks.project_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "tasks_update" ON tasks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = tasks.project_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "tasks_delete" ON tasks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = tasks.project_id
        AND pm.user_id = auth.uid()
    )
  );

-- ── project_members テーブル RLS ──
CREATE POLICY "pm_select" ON project_members FOR SELECT
  USING (user_id = auth.uid());

-- ヘルパー関数: 自己参照RLS回避のため SECURITY DEFINER で直接チェック
CREATE OR REPLACE FUNCTION is_project_owner(p_project_id TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id
      AND user_id = p_user_id
      AND role = 'owner'
  );
$$;

CREATE POLICY "pm_insert" ON project_members FOR INSERT
  WITH CHECK (
    -- 自分をownerとして追加（プロジェクト作成時）
    (user_id = auth.uid() AND role = 'owner')
    OR
    -- 既にownerなら他ユーザーを追加可能
    is_project_owner(project_id, auth.uid())
  );

CREATE POLICY "pm_delete" ON project_members FOR DELETE
  USING (
    is_project_owner(project_id, auth.uid())
  );

-- 1d. 既存データのバックフィル
-- ※ 以下のクエリは、既存プロジェクトのオーナーを設定するためのものです。
-- ※ YOUR_USER_UUID を実際のユーザーUUIDに置き換えてから実行してください。
-- INSERT INTO project_members (project_id, user_id, role, created_at)
-- SELECT id, 'YOUR_USER_UUID'::UUID, 'owner', EXTRACT(EPOCH FROM NOW()) * 1000
-- FROM projects
-- ON CONFLICT (project_id, user_id) DO NOTHING;
