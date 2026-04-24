/**
 * Bitwarden Workers - Folders 路由
 * 对应原始项目 Api/Vault/Controllers/FoldersController.cs
 * 处理：文件夹�?CRUD 操作
 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { folders, users } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { BadRequestError, NotFoundError } from '../middleware/error';
import { generateUuid } from '../services/crypto';
import type { Bindings, Variables, FolderRequest, FolderResponse } from '../types';
import { pushSyncFolder } from '../services/push-notification';
import { PushType } from '../types/push-notification';

const foldersRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>();

foldersRoute.use('/*', authMiddleware);

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

function toFolderResponse(folder: any): FolderResponse {
    return {
        id: folder.id,
        name: folder.name,
        revisionDate: folder.revisionDate,
        object: 'folder',
    };
}

/**
 * GET /api/folders
 */
foldersRoute.get('/', async (c) => {
    const db = drizzle(c.env.DB);
    const userId = c.get('userId');

    const results = await db.select().from(folders).where(eq(folders.userId, userId)).all();

    return c.json({
        data: results.map(toFolderResponse),
        object: 'list',
        continuationToken: null,
    });
});

/**
 * GET /api/folders/:id
 */
foldersRoute.get('/:id', async (c) => {
    const db = drizzle(c.env.DB);
    const userId = c.get('userId');
    const folderId = c.req.param('id');

    const folder = await db.select().from(folders)
        .where(and(eq(folders.id, folderId), eq(folders.userId, userId))).get();

    if (!folder) throw new NotFoundError('Folder not found.');
    return c.json(toFolderResponse(folder));
});

/**
 * POST /api/folders
 */
foldersRoute.post('/', async (c) => {
    const db = drizzle(c.env.DB);
    const userId = c.get('userId');
    const rawBody = await c.req.json<any>();
    const body: FolderRequest = normalizeKeys(rawBody.folder || rawBody.Folder || rawBody);

    if (!body.name) throw new BadRequestError('Name is required.');

    const now = new Date().toISOString();
    const folderId = generateUuid();

    await db.insert(folders).values({
        id: folderId,
        userId,
        name: body.name,
        creationDate: now,
        revisionDate: now,
    });

    await db.update(users).set({ accountRevisionDate: now }).where(eq(users.id, userId));

    const created = await db.select().from(folders).where(eq(folders.id, folderId)).get();

    const contextId = c.get('jwtPayload')?.device || null;
    c.executionCtx.waitUntil(pushSyncFolder(c.env, PushType.SyncFolderCreate, folderId, userId, now, contextId));

    return c.json(toFolderResponse(created!));
});

/**
 * PUT /api/folders/:id
 */
foldersRoute.put('/:id', async (c) => {
    const db = drizzle(c.env.DB);
    const userId = c.get('userId');
    const folderId = c.req.param('id');
    const rawBody = await c.req.json<any>();
    const body: FolderRequest = normalizeKeys(rawBody.folder || rawBody.Folder || rawBody);

    const existing = await db.select().from(folders)
        .where(and(eq(folders.id, folderId), eq(folders.userId, userId))).get();
    if (!existing) throw new NotFoundError('Folder not found.');

    const now = new Date().toISOString();
    await db.update(folders).set({
        name: body.name,
        revisionDate: now,
    }).where(eq(folders.id, folderId));

    await db.update(users).set({ accountRevisionDate: now }).where(eq(users.id, userId));

    const updated = await db.select().from(folders).where(eq(folders.id, folderId)).get();

    const contextId = c.get('jwtPayload')?.device || null;
    c.executionCtx.waitUntil(pushSyncFolder(c.env, PushType.SyncFolderUpdate, folderId, userId, now, contextId));

    return c.json(toFolderResponse(updated!));
});

/**
 * POST /api/folders/:id (alias for PUT)
 */
foldersRoute.post('/:id', async (c) => {
    const db = drizzle(c.env.DB);
    const userId = c.get('userId');
    const folderId = c.req.param('id');
    const rawBody = await c.req.json<any>();
    const body: FolderRequest = normalizeKeys(rawBody.folder || rawBody.Folder || rawBody);

    const existing = await db.select().from(folders)
        .where(and(eq(folders.id, folderId), eq(folders.userId, userId))).get();
    if (!existing) throw new NotFoundError('Folder not found.');

    const now = new Date().toISOString();
    await db.update(folders).set({ name: body.name, revisionDate: now }).where(eq(folders.id, folderId));
    await db.update(users).set({ accountRevisionDate: now }).where(eq(users.id, userId));

    const updated = await db.select().from(folders).where(eq(folders.id, folderId)).get();

    const contextId = c.get('jwtPayload')?.device || null;
    c.executionCtx.waitUntil(pushSyncFolder(c.env, PushType.SyncFolderUpdate, folderId, userId, now, contextId));

    return c.json(toFolderResponse(updated!));
});

/**
 * DELETE /api/folders/:id
 */
foldersRoute.delete('/:id', async (c) => {
    const db = drizzle(c.env.DB);
    const userId = c.get('userId');
    const folderId = c.req.param('id');

    const existing = await db.select().from(folders)
        .where(and(eq(folders.id, folderId), eq(folders.userId, userId))).get();
    if (!existing) throw new NotFoundError('Folder not found.');

    await db.delete(folders).where(eq(folders.id, folderId));

    const now = new Date().toISOString();
    await db.update(users).set({ accountRevisionDate: now }).where(eq(users.id, userId));

    const contextId = c.get('jwtPayload')?.device || null;
    c.executionCtx.waitUntil(pushSyncFolder(c.env, PushType.SyncFolderDelete, folderId, userId, now, contextId));

    return c.json(null, 200);
});

export default foldersRoute;
