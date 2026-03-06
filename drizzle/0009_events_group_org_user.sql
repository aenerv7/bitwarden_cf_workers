-- Events: 添加 groupId、organizationUserId 以支持事件日志中“编辑了群组/用户”等展示（与官方 Event 实体一致）
ALTER TABLE events ADD COLUMN group_id TEXT;
ALTER TABLE events ADD COLUMN organization_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_events_organization_id ON events(organization_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
