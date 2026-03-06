-- Groups: 对应官方 Group、GroupUser、CollectionGroup
CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    external_id TEXT,
    creation_date TEXT NOT NULL,
    revision_date TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_groups_org_id ON groups(organization_id);

CREATE TABLE IF NOT EXISTS group_users (
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    organization_user_id TEXT NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, organization_user_id)
);
CREATE INDEX IF NOT EXISTS idx_group_users_org_user_id ON group_users(organization_user_id);

CREATE TABLE IF NOT EXISTS collection_groups (
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    read_only INTEGER DEFAULT 0,
    hide_passwords INTEGER DEFAULT 0,
    manage INTEGER DEFAULT 0,
    PRIMARY KEY (collection_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_collection_groups_group_id ON collection_groups(group_id);
