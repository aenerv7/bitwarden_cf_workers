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
 * 对应 SecurityTaskController.Get — 当前用户的安全任务列表
 */
tasks.get('/', (c) =>
    c.json({
        data: [],
        object: 'list',
        continuationToken: null,
    })
);

/**
 * GET /api/tasks/organization?organizationId=xxx
 * 对应 SecurityTaskController.ListForOrganization — 组织的安全任务列表
 */
tasks.get('/organization', (c) =>
    c.json({
        data: [],
        object: 'list',
        continuationToken: null,
    })
);

/**
 * GET /api/tasks/:orgId/metrics
 * 对应 SecurityTaskController.GetTaskMetricsForOrganization
 */
tasks.get('/:orgId/metrics', (c) =>
    c.json({
        completedTasks: 0,
        totalTasks: 0,
    })
);

export default tasks;
