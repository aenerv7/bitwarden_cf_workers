import type { Bindings } from '../../types';
import type { IconCacheConfig } from './types';

export const DEFAULT_ICON_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAABMAAAATCAQAAADYWf5HAAABu0lEQVR42nXSvWuTURTH8R+t0heI9Y04aJycdBLNJNrBFBU7OFgUER3q21I0bXK+JwZpXISm/QdcRB3EgqBBsNihsUbbgODQQSKCuKSDOApJuuhj8tCYQj/jvYfD795z1MZ+nBKrNKhSwrMxbZTrtRnqlEjZkB/xC/xmhZrlc71qS0Up8yVzTCGucFNKD1JhORVd70SZNU4okNx5d4+U2UXRIpJFWLClsR79YzN88wQvLWNzzPKEeS/wkQGpWVhhqhW8TtDJD3Mm1x/23zLSrZCdpBY8BueTNjHSbc+8wC9HlHgU5Aj5AW5zPdcVdpq0UcknWBSr/pjixO4gfp899Kd23pM2qQCH7LkCnqAqGh73OK/8NPOcaibr90LrW/yWAnaUhqjaOSl9nFR2r5rsqo22ypn1B5IN8VOUMHVgOnNQIX+d62plcz6rg1/jskK8CMb4we4pG6OWHtR/LBJkC2E4a7ZPkuX5ntumAOM2xxveclEhLvGH6XCmLPs735Eetrw63NnOgr9P9q1viC3xlRUGOjImqFDuOBvrYYoaZU9z1uPpYae5NfdvbNVG2ZjDIlXq/oMi46lo++4vjjPBl2Dlg00AAAAASUVORK5CYII=';

export const DEFAULT_ICON_BYTES = Uint8Array.from(atob(DEFAULT_ICON_PNG_BASE64), (c) => c.charCodeAt(0));
export const DEFAULT_ICON_CONTENT_TYPE = 'image/png';

export const DEFAULT_ICON_CACHE_CONFIG: IconCacheConfig = {
    successTtlSeconds: 60 * 60 * 24 * 14, // 14 days
    negativeTtlSeconds: 60 * 60 * 12, // 12 hours
    maxImageBytes: 51200, // 50 KB
};

const DOMAIN_MAP: Record<string, string> = {
    'login.yahoo.com': 'yahoo.com',
    'accounts.google.com': 'google.com',
    'photo.walgreens.com': 'walgreens.com',
    'passport.yandex.com': 'yandex.com',
};

export function resolveIconCacheConfig(env: Bindings): IconCacheConfig {
    const successTtlSeconds = parsePositiveInt(env.ICONS_CACHE_SUCCESS_TTL_SECONDS, DEFAULT_ICON_CACHE_CONFIG.successTtlSeconds);
    const negativeTtlSeconds = parsePositiveInt(env.ICONS_CACHE_NEGATIVE_TTL_SECONDS, DEFAULT_ICON_CACHE_CONFIG.negativeTtlSeconds);
    const maxImageBytes = parsePositiveInt(env.ICONS_MAX_IMAGE_BYTES, DEFAULT_ICON_CACHE_CONFIG.maxImageBytes);

    return { successTtlSeconds, negativeTtlSeconds, maxImageBytes };
}

export function mapDomain(hostname: string): string {
    const lower = hostname.toLowerCase();
    return DOMAIN_MAP[lower] ?? lower;
}

function parsePositiveInt(value: string | undefined, defaultValue: number): number {
    if (value == null) {
        return defaultValue;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return defaultValue;
    }
    return parsed;
}
