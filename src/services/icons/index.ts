import type { Bindings } from '../../types';
import { buildCacheKeys, readCachedIcon, readNegativeCache, writeNegativeCache, writeSuccessCache } from './cache';
import { DEFAULT_ICON_BYTES, DEFAULT_ICON_CONTENT_TYPE, mapDomain, resolveIconCacheConfig } from './constants';
import { fetchBestIconForDomain } from './fetch';
import { normalizeAndValidateHostname } from './security';
import type { IconResolveResult } from './types';

const inFlight = new Map<string, Promise<IconResolveResult>>();

export async function resolveIconResponse(hostnameParam: string, env: Bindings, requestUrl: string): Promise<Response> {
    const hostname = normalizeAndValidateHostname(hostnameParam);
    if (!hostname) {
        return new Response('Bad Request', { status: 400 });
    }

    const mappedDomain = mapDomain(hostname);
    const config = resolveIconCacheConfig(env);
    const cacheKeys = buildCacheKeys(mappedDomain);
    const edgeCache = caches.default;
    const edgeCacheKey = new Request(buildEdgeCacheUrl(requestUrl, mappedDomain), { method: 'GET' });

    const edgeHit = await edgeCache.match(edgeCacheKey);
    if (edgeHit) {
        console.log(`[icons] edge_hit domain=${mappedDomain}`);
        return edgeHit;
    }

    const kvHit = await readCachedIcon(env.ICONS_CACHE, cacheKeys);
    if (kvHit) {
        console.log(`[icons] kv_hit domain=${mappedDomain}`);
        const response = createIconResponse(kvHit.image, kvHit.contentType, config.successTtlSeconds);
        await edgeCache.put(edgeCacheKey, response.clone());
        return response;
    }

    const hasNegative = await readNegativeCache(env.ICONS_CACHE, cacheKeys);
    if (hasNegative) {
        console.log(`[icons] negative_hit domain=${mappedDomain}`);
        const response = createDefaultResponse(config.negativeTtlSeconds);
        await edgeCache.put(edgeCacheKey, response.clone());
        return response;
    }

    const result = await resolveWithDedup(mappedDomain, async () => {
        const fetched = await fetchBestIconForDomain(mappedDomain, config.maxImageBytes);
        if (!fetched) {
            console.log(`[icons] fetch_miss domain=${mappedDomain}`);
            await writeNegativeCache(env.ICONS_CACHE, cacheKeys, mappedDomain, config);
            return { status: 'not_found', domain: mappedDomain };
        }
        console.log(`[icons] fetch_hit domain=${mappedDomain} bytes=${fetched.image.byteLength}`);
        await writeSuccessCache(env.ICONS_CACHE, cacheKeys, mappedDomain, fetched, config);
        return { status: 'ok', domain: mappedDomain, icon: fetched };
    });

    if (result.status === 'not_found') {
        const response = createDefaultResponse(config.negativeTtlSeconds);
        await edgeCache.put(edgeCacheKey, response.clone());
        return response;
    }

    const response = createIconResponse(result.icon.image, result.icon.contentType, config.successTtlSeconds);
    await edgeCache.put(edgeCacheKey, response.clone());
    return response;
}

export function createDefaultResponse(ttlSeconds: number): Response {
    return createIconResponse(DEFAULT_ICON_BYTES.buffer, DEFAULT_ICON_CONTENT_TYPE, ttlSeconds);
}

function createIconResponse(image: ArrayBuffer, contentType: string, ttlSeconds: number): Response {
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', `public, max-age=${ttlSeconds}, stale-while-revalidate=86400`);
    headers.set('Content-Length', String(image.byteLength));
    return new Response(image, { status: 200, headers });
}

function buildEdgeCacheUrl(requestUrl: string, mappedDomain: string): string {
    const url = new URL(requestUrl);
    return `${url.origin}/_icon_cache/${mappedDomain}/icon.png`;
}

async function resolveWithDedup(domain: string, loader: () => Promise<IconResolveResult>): Promise<IconResolveResult> {
    const existing = inFlight.get(domain);
    if (existing) {
        return existing;
    }

    const pending = loader().finally(() => {
        inFlight.delete(domain);
    });
    inFlight.set(domain, pending);
    return pending;
}
