-- Step 1: Expand organizations table with all official fields
ALTER TABLE organizations ADD COLUMN identifier TEXT;
ALTER TABLE organizations ADD COLUMN business_name TEXT;
ALTER TABLE organizations ADD COLUMN business_address1 TEXT;
ALTER TABLE organizations ADD COLUMN business_address2 TEXT;
ALTER TABLE organizations ADD COLUMN business_address3 TEXT;
ALTER TABLE organizations ADD COLUMN business_country TEXT;
ALTER TABLE organizations ADD COLUMN business_tax_number TEXT;
ALTER TABLE organizations ADD COLUMN plan TEXT DEFAULT 'Free';
ALTER TABLE organizations ADD COLUMN max_collections INTEGER;
ALTER TABLE organizations ADD COLUMN max_autoscale_seats INTEGER;
-- Feature flags
ALTER TABLE organizations ADD COLUMN use_policies INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN use_sso INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN use_key_connector INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN use_scim INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN use_groups INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN use_directory INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN use_events INTEGER DEFAULT 1;
ALTER TABLE organizations ADD COLUMN use_2fa INTEGER DEFAULT 1;
ALTER TABLE organizations ADD COLUMN use_api INTEGER DEFAULT 1;
ALTER TABLE organizations ADD COLUMN use_reset_password INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN use_secrets_manager INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN self_host INTEGER DEFAULT 1;
ALTER TABLE organizations ADD COLUMN users_get_premium INTEGER DEFAULT 1;
ALTER TABLE organizations ADD COLUMN use_custom_permissions INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN use_password_manager INTEGER DEFAULT 1;
ALTER TABLE organizations ADD COLUMN use_risk_insights INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN use_organization_domains INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN use_admin_sponsored_families INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN use_automatic_user_confirmation INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN use_disable_sm_ads_for_users INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN use_phishing_blocker INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN use_my_items INTEGER DEFAULT 1;
-- Collection management
ALTER TABLE organizations ADD COLUMN limit_collection_creation INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN limit_collection_deletion INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN limit_item_deletion INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN allow_admin_access_to_all_collection_items INTEGER DEFAULT 1;
-- Secrets Manager
ALTER TABLE organizations ADD COLUMN sm_seats INTEGER;
ALTER TABLE organizations ADD COLUMN sm_service_accounts INTEGER;
ALTER TABLE organizations ADD COLUMN max_autoscale_sm_seats INTEGER;
ALTER TABLE organizations ADD COLUMN max_autoscale_sm_service_accounts INTEGER;
-- Other fields
ALTER TABLE organizations ADD COLUMN storage INTEGER;
ALTER TABLE organizations ADD COLUMN two_factor_providers TEXT;
ALTER TABLE organizations ADD COLUMN expiration_date TEXT;
ALTER TABLE organizations ADD COLUMN license_key TEXT;

-- Step 2: Expand organization_users table
ALTER TABLE organization_users ADD COLUMN reset_password_key TEXT;
ALTER TABLE organization_users ADD COLUMN external_id TEXT;
ALTER TABLE organization_users ADD COLUMN access_secrets_manager INTEGER DEFAULT 0;

-- Step 3: Rename use_web_authn -> drop it (no longer needed, covered by use_2fa)
-- SQLite doesn't support DROP COLUMN in older versions, so we leave use_web_authn as-is.
