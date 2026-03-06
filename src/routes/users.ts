/**
 * Bitwarden Workers - Users 路由
 * 对应官方 Api/KeyManagement/Controllers/UsersController.cs
 * 用于成员确认等场景获取用户公钥
 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { NotFoundError } from '../middleware/error';
import type { Bindings, Variables } from '../types';

const usersRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>();
usersRoute.use('/*', authMiddleware);

/**
 * GET /api/users/:id/public-key
 * 获取用户公钥（成员确认等流程使用）
 */
usersRoute.get('/:id/public-key', async (c) => {
    const db = drizzle(c.env.DB);
    const userId = c.req.param('id');
    const row = await db.select({ id: users.id, publicKey: users.publicKey })
        .from(users)
        .where(eq(users.id, userId))
        .get();
    if (!row || row.publicKey == null || row.publicKey === '') {
        throw new NotFoundError('User public key not found.');
    }
    return c.json({
        userId: row.id,
        publicKey: row.publicKey,
        object: 'userKey',
    });
});

export default usersRoute;
