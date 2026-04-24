/**
 * Bitwarden Workers - Sends 路由
 * 对应原始项目 Api/Tools/Controllers/SendsController.cs
 * 处理：Send（安全分享）�?CRUD 及匿名访�?
 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { sends, users } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { BadRequestError, NotFoundError } from '../middleware/error';
import { generateUuid, hashSendPassword, verifySendPassword } from '../services/crypto';
import type { Bindings, Variables, SendRequest, SendResponse, SendAccessResponse, SendType } from '../types';
import { pushSyncSend } from '../services/push-notification';
import { PushType } from '../types/push-notification';

const sendsRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/** PascalCase �?camelCase 键名转换 */
function normalizeKeys(obj: any): any {
    if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(normalizeKeys);
    const result: any = {};
    for (const key of Object.keys(obj)) {
        const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
        result[camelKey] = obj[key];
    }
    return result;
}

function toSendResponse(send: any): SendResponse {
    const data = send.data ? JSON.parse(send.data) : null;

    // AuthType 推断逻辑 (参照 Bitwarden Core)
    // 0: Email, 1: Password, 2: None
    let authType = 2;
    if (send.hideEmail && (send as any).emails) authType = 0; // Approximation, since we only use password
    if (send.password) authType = 1;

    const baseResponse: any = {
        id: send.id,
        accessId: send.id,
        userId: send.userId,
        type: send.type as SendType,
        authType,
        name: data?.name || '',
        notes: data?.notes || null,
        key: send.key || '',
        maxAccessCount: send.maxAccessCount,
        accessCount: send.accessCount,
        revisionDate: send.revisionDate,
        expirationDate: send.expirationDate,
        deletionDate: send.deletionDate,
        password: send.password ? 'set' : null,
        disabled: send.disabled,
        hideEmail: send.hideEmail,
        object: 'send',
    };

    if (send.type === 0) { // Text
        const textObj = typeof data?.text === 'object' ? data.text : undefined;
        baseResponse.text = {
            text: textObj?.text ?? data?.text ?? '',
            hidden: textObj?.hidden ?? data?.hidden ?? false
        };
    } else if (send.type === 1) { // File
        baseResponse.file = {
            id: data?.id || null, // we don't store distinct file id usually unless from client
            fileName: data?.file?.fileName || '',
            size: data?.file?.size || null,
            sizeName: data?.file?.sizeName || null,
        };
    }

    return baseResponse;
}

// ==================== 公开端点（匿名访问，必须先于认证路由注册�?===================

/**
 * POST /api/sends/access/:id
 * 对应 SendsController.Access - 匿名访问 Send
 */
sendsRoute.post('/access/:id', async (c) => {
    const db = drizzle(c.env.DB);
    const sendId = c.req.param('id');
    const body = await c.req.json<{ password?: string }>().catch(() => ({ password: undefined as string | undefined }));

    const send = await db.select().from(sends).where(eq(sends.id, sendId)).get();
    if (!send) throw new NotFoundError('Send not found.');

    const now = new Date().toISOString();

    if (send.disabled) throw new BadRequestError('This Send has been disabled.');
    if (send.deletionDate <= now) throw new NotFoundError('This Send is no longer available.');
    if (send.expirationDate && send.expirationDate <= now) throw new BadRequestError('This Send has expired.');
    if (send.maxAccessCount !== null && send.accessCount >= send.maxAccessCount) {
        throw new BadRequestError('This Send has reached its maximum access count.');
    }

    // 验证密码
    if (send.password) {
        if (!body.password) {
            return c.json({ error: 'password_required', error_description: 'A password is required.', object: 'error' }, 401);
        }
        let ok = false;
        try {
            ok = await verifySendPassword(body.password, send.password);
        } catch {
            // PBKDF2 computation error �?treat as invalid password
        }
        if (!ok) {
            return c.json({ message: 'Invalid password.', validationErrors: null, exceptionMessage: null, exceptionStackTrace: null, innerExceptionMessage: null, object: 'error' }, 400);
        }
    }

    // 增加访问次数
    await db.update(sends).set({ accessCount: send.accessCount + 1 }).where(eq(sends.id, sendId));

    const data = send.data ? JSON.parse(send.data) : null;
    const response: SendAccessResponse = {
        id: send.id,
        type: send.type as SendType,
        name: data?.name || '',
        key: send.key || '',
        expirationDate: send.expirationDate,
        object: 'send-access',
    };

    if (send.type === 0) { // Text
        const textObj = typeof data?.text === 'object' ? data.text : undefined;
        response.text = {
            text: textObj?.text ?? data?.text ?? '',
            hidden: textObj?.hidden ?? data?.hidden ?? false
        };
    } else if (send.type === 1) { // File
        response.file = {
            id: data?.id || null,
            fileName: data?.file?.fileName || '',
            size: data?.file?.size || null,
            sizeName: data?.file?.sizeName || null,
        };
    }

    return c.json(response);
});

// ==================== 认证端点 ====================

const authed = new Hono<{ Bindings: Bindings; Variables: Variables }>();
authed.use('/*', authMiddleware);

/**
 * GET /api/sends - 获取所�?Send
 */
authed.get('/', async (c) => {
    const db = drizzle(c.env.DB);
    const userId = c.get('userId');
    const results = await db.select().from(sends).where(eq(sends.userId, userId)).all();
    const now = new Date().toISOString();
    const active = results.filter(s => s.deletionDate > now);
    return c.json({ data: active.map(toSendResponse), object: 'list', continuationToken: null });
});

/**
 * GET /api/sends/:id - 获取单个 Send
 */
authed.get('/:id', async (c) => {
    const db = drizzle(c.env.DB);
    const userId = c.get('userId');
    const sendId = c.req.param('id');
    const send = await db.select().from(sends).where(and(eq(sends.id, sendId), eq(sends.userId, userId))).get();
    if (!send) throw new NotFoundError('Send not found.');
    return c.json(toSendResponse(send));
});

/**
 * POST /api/sends - 创建 Send
 */
authed.post('/', async (c) => {
    const db = drizzle(c.env.DB);
    const userId = c.get('userId');
    const rawBody = await c.req.json<any>();
    const body: SendRequest = normalizeKeys(rawBody.send || rawBody.Send || rawBody);

    if (body.type === undefined || !body.deletionDate) {
        throw new BadRequestError('Type and deletion date are required.');
    }

    const now = new Date().toISOString();
    const sendId = generateUuid();

    const data: any = { name: body.name || null, notes: body.notes || null };
    if (body.type === 0) data.text = body.text;
    if (body.type === 1) data.file = body.file;

    let hashedPassword: string | null = null;
    if (body.password) hashedPassword = await hashSendPassword(body.password);

    await db.insert(sends).values({
        id: sendId, userId, type: body.type,
        data: JSON.stringify(data), key: body.key,
        password: hashedPassword,
        maxAccessCount: body.maxAccessCount ?? null, accessCount: 0,
        expirationDate: body.expirationDate ?? null,
        deletionDate: body.deletionDate,
        disabled: body.disabled ?? false,
        hideEmail: body.hideEmail ?? false,
        creationDate: now, revisionDate: now,
    });

    await db.update(users).set({ accountRevisionDate: now }).where(eq(users.id, userId));
    const created = await db.select().from(sends).where(eq(sends.id, sendId)).get();

    const contextId = c.get('jwtPayload')?.device || null;
    c.executionCtx.waitUntil(pushSyncSend(c.env, PushType.SyncSendCreate, sendId, userId, now, contextId));

    return c.json(toSendResponse(created!));
});

/**
 * PUT /api/sends/:id - 更新 Send
 */
authed.put('/:id', async (c) => {
    const db = drizzle(c.env.DB);
    const userId = c.get('userId');
    const sendId = c.req.param('id');
    const rawBody = await c.req.json<any>();
    const body: SendRequest = normalizeKeys(rawBody.send || rawBody.Send || rawBody);

    const existing = await db.select().from(sends)
        .where(and(eq(sends.id, sendId), eq(sends.userId, userId))).get();
    if (!existing) throw new NotFoundError('Send not found.');

    const now = new Date().toISOString();
    const data: any = { name: body.name || null, notes: body.notes || null };
    if (body.type === 0) data.text = body.text;
    if (body.type === 1) data.file = body.file;

    let hashedPassword = existing.password;
    if (body.password !== undefined) {
        hashedPassword = body.password ? await hashSendPassword(body.password) : null;
    }

    await db.update(sends).set({
        data: JSON.stringify(data),
        key: body.key !== undefined ? body.key : existing.key,
        password: hashedPassword,
        maxAccessCount: body.maxAccessCount !== undefined ? body.maxAccessCount : existing.maxAccessCount,
        expirationDate: body.expirationDate !== undefined ? body.expirationDate : existing.expirationDate,
        deletionDate: body.deletionDate || existing.deletionDate,
        disabled: body.disabled !== undefined ? body.disabled : existing.disabled,
        hideEmail: body.hideEmail !== undefined ? body.hideEmail : existing.hideEmail,
        revisionDate: now,
    }).where(eq(sends.id, sendId));

    await db.update(users).set({ accountRevisionDate: now }).where(eq(users.id, userId));
    const updated = await db.select().from(sends).where(eq(sends.id, sendId)).get();

    const contextId = c.get('jwtPayload')?.device || null;
    c.executionCtx.waitUntil(pushSyncSend(c.env, PushType.SyncSendUpdate, sendId, userId, now, contextId));

    return c.json(toSendResponse(updated!));
});

/**
 * PUT /api/sends/:id/remove-password - 移除密码
 */
authed.put('/:id/remove-password', async (c) => {
    const db = drizzle(c.env.DB);
    const userId = c.get('userId');
    const sendId = c.req.param('id');

    const existing = await db.select().from(sends)
        .where(and(eq(sends.id, sendId), eq(sends.userId, userId))).get();
    if (!existing) throw new NotFoundError('Send not found.');

    const now = new Date().toISOString();
    await db.update(sends).set({ password: null, revisionDate: now }).where(eq(sends.id, sendId));
    await db.update(users).set({ accountRevisionDate: now }).where(eq(users.id, userId));

    const updated = await db.select().from(sends).where(eq(sends.id, sendId)).get();

    const contextId = c.get('jwtPayload')?.device || null;
    c.executionCtx.waitUntil(pushSyncSend(c.env, PushType.SyncSendUpdate, sendId, userId, now, contextId));

    return c.json(toSendResponse(updated!));
});

/**
 * DELETE /api/sends/:id - 删除 Send
 */
authed.delete('/:id', async (c) => {
    const db = drizzle(c.env.DB);
    const userId = c.get('userId');
    const sendId = c.req.param('id');

    const existing = await db.select().from(sends)
        .where(and(eq(sends.id, sendId), eq(sends.userId, userId))).get();
    if (!existing) throw new NotFoundError('Send not found.');

    await db.delete(sends).where(eq(sends.id, sendId));
    const now = new Date().toISOString();
    await db.update(users).set({ accountRevisionDate: now }).where(eq(users.id, userId));

    const contextId = c.get('jwtPayload')?.device || null;
    c.executionCtx.waitUntil(pushSyncSend(c.env, PushType.SyncSendDelete, sendId, userId, now, contextId));

    return c.body(null, 204);
});

// 挂载认证路由（在公开路由之后�?
sendsRoute.route('/', authed);

export default sendsRoute;
