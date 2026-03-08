import { Hono } from 'hono';
import type { Bindings, Variables } from '../types';
import { resolveIconResponse } from '../services/icons';

const iconsRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /:hostname/icon.png
 * Bitwarden 官方 Icons 服务兼容路径。
 */
iconsRoute.get('/:hostname/icon.png', async (c) => {
    const hostname = c.req.param('hostname');
    return resolveIconResponse(hostname, c.env, c.req.url);
});

export default iconsRoute;
