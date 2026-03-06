/**
 * 注册控制守卫
 * 根据 SIGNUPS_ALLOWED 环境变量和系统状态判断是否允许新用户注册。
 *
 * SIGNUPS_ALLOWED 取值：
 *   "true"  - 始终允许
 *   "false" - 始终禁止（仅邀请注册有效）
 *   "auto"  - 系统无用户时允许首个注册，之后自动关闭（默认）
 *
 * 邀请注册（organization_users 中存在该邮箱的待接受邀请）不受此限制。
 */

import { eq, sql } from 'drizzle-orm';
import { users, organizationUsers } from '../db/schema';
import type { Bindings } from '../types';

export async function isSignupAllowed(
    env: Bindings,
    db: ReturnType<typeof import('drizzle-orm/d1').drizzle>,
    email: string,
): Promise<boolean> {
    // 1. 如果该邮箱存在组织邀请（status=0 即 Invited），始终放行
    const pendingInvite = await db.select({ id: organizationUsers.id })
        .from(organizationUsers)
        .where(eq(organizationUsers.email, email.toLowerCase().trim()))
        .get();
    if (pendingInvite) return true;

    // 2. 根据环境变量判断
    const mode = (env.SIGNUPS_ALLOWED ?? 'auto').toLowerCase().trim();

    if (mode === 'true') return true;
    if (mode === 'false') return false;

    // 3. auto 模式：检查系统中是否已有用户
    const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .get();
    const userCount = result?.count ?? 0;
    return userCount === 0;
}
