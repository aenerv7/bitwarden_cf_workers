/**
 * Bitwarden Workers - Tasks 路由（安全任务）
 * 对应官方 Api/Vault/Controllers/SecurityTaskController.cs
 * 自建暂无安全任务表，返回空列表避免客户端 404
 */

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import type { Bindings, Variables } from '../types';

const tasks = new Hono<{ Bindings: Bindings; Variables: Variables }>();
tasks.use('/*', authMiddleware);

/**
 * GET /api/tasks
 * 当前用户的安全任务列表；无表时返回空列表
 */
tasks.get('/', (c) =>
    c.json({
        data: [],
        object: 'list',
        continuationToken: null,
    })
);

export default tasks;
