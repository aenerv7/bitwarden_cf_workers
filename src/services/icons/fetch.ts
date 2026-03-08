import { isSafeHttpUrl } from './security';
import type { FetchedIcon } from './types';

const MAX_REDIRECTS = 3;
const MAX_LINKS_SCANNED = 200;
const MAX_ICON_LINKS = 10;
const MAX_HTML_BYTES = 256 * 1024;
const HTTP_TIMEOUT_MS = 5000;
const FETCH_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const ALLOWED_MEDIA_TYPES = new Set([
    'image/png',
    'image/x-icon',
    'image/vnd.microsoft.icon',
    'image/jpeg',
    'image/svg+xml',
    'image/webp',
]);

const BLOCKLISTED_RELS = new Set(['preload', 'image_src', 'preconnect', 'canonical', 'alternate', 'stylesheet']);
const ICON_RELS = new Set(['icon', 'apple-touch-icon', 'shortcut icon']);
const ICON_EXTENSIONS = new Set(['.ico', '.png', '.jpg', '.jpeg', '.svg', '.webp']);

interface IconLinkCandidate {
    href: string;
    rel: string | null;
    type: string | null;
    size: string | null;
    priority: number;
}

export async function fetchBestIconForDomain(domain: string, maxImageBytes: number): Promise<FetchedIcon | null> {
    const pageCandidates = buildPageCandidates(domain);
    for (const pageUrl of pageCandidates) {
        const page = await fetchText(pageUrl);
        if (!page) {
            continue;
        }

        const iconCandidates = extractIconCandidates(page.html, page.finalUrl).slice(0, MAX_ICON_LINKS);
        for (const candidate of iconCandidates) {
            const icon = await fetchIconBinary(candidate.href, maxImageBytes);
            if (icon) {
                return icon;
            }
        }
    }

    const fallback = await fetchIconBinary(`https://${domain}/favicon.ico`, maxImageBytes);
    if (fallback) {
        return fallback;
    }

    return await fetchIconBinary(`http://${domain}/favicon.ico`, maxImageBytes);
}

async function fetchText(url: string): Promise<{ html: string; finalUrl: string } | null> {
    const response = await safeFetchWithRedirects(url);
    if (!response || !response.ok) {
        return null;
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('text/html')) {
        return null;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const limited = bytes.byteLength > MAX_HTML_BYTES ? bytes.slice(0, MAX_HTML_BYTES) : bytes;
    const html = new TextDecoder().decode(limited);
    return { html, finalUrl: response.url || url };
}

async function fetchIconBinary(url: string, maxImageBytes: number): Promise<FetchedIcon | null> {
    if (!isSafeHttpUrl(url)) {
        return null;
    }

    const response = await safeFetchWithRedirects(url);
    if (!response || !response.ok) {
        return null;
    }

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > maxImageBytes) {
        return null;
    }

    let contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!ALLOWED_MEDIA_TYPES.has(contentType)) {
        contentType = detectContentType(bytes);
    }
    if (!ALLOWED_MEDIA_TYPES.has(contentType)) {
        return null;
    }

    return { image: bytes, contentType };
}

async function safeFetchWithRedirects(input: string, redirects = 0): Promise<Response | null> {
    if (!isSafeHttpUrl(input)) {
        return null;
    }

    let response: Response;
    try {
        response = await fetch(input, {
            redirect: 'manual',
            signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
            headers: { 'User-Agent': FETCH_UA },
        });
    } catch {
        return null;
    }

    if (!isRedirect(response.status)) {
        return response;
    }

    if (redirects >= MAX_REDIRECTS) {
        return null;
    }

    const location = response.headers.get('location');
    if (!location) {
        return null;
    }

    const next = new URL(location, input).toString();
    if (!isSafeHttpUrl(next)) {
        return null;
    }

    return safeFetchWithRedirects(next, redirects + 1);
}

function isRedirect(status: number): boolean {
    return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function buildPageCandidates(domain: string): string[] {
    const candidates = [`https://${domain}`, `http://${domain}`];
    const baseDomain = toBaseDomain(domain);
    if (baseDomain && baseDomain !== domain) {
        candidates.push(`https://${baseDomain}`);
    }
    if (domain.split('.').length <= 2) {
        candidates.push(`https://www.${domain}`);
    }
    return Array.from(new Set(candidates));
}

function toBaseDomain(domain: string): string | null {
    const parts = domain.split('.');
    if (parts.length < 3) {
        return null;
    }
    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
}

function extractIconCandidates(html: string, pageUrl: string): IconLinkCandidate[] {
    const head = extractHead(html);
    const baseUrl = extractBaseHref(head, pageUrl);
    const links = head.match(/<link\b[^>]*>/gi) ?? [];
    const candidates: IconLinkCandidate[] = [];

    for (const tag of links.slice(0, MAX_LINKS_SCANNED)) {
        const href = getAttr(tag, 'href');
        if (!href) {
            continue;
        }

        const rel = getAttr(tag, 'rel')?.toLowerCase() ?? null;
        if (rel && BLOCKLISTED_RELS.has(rel)) {
            continue;
        }

        const looksLikeIcon = rel != null ? ICON_RELS.has(rel) : hasIconExtension(href);
        if (!looksLikeIcon) {
            continue;
        }

        const absoluteHref = toAbsoluteUrl(baseUrl, href);
        if (!absoluteHref || !isSafeHttpUrl(absoluteHref)) {
            continue;
        }

        const size = getAttr(tag, 'sizes');
        candidates.push({
            href: absoluteHref,
            rel,
            type: getAttr(tag, 'type'),
            size,
            priority: computePriority(size),
        });
    }

    return candidates.sort((a, b) => a.priority - b.priority);
}

function extractHead(html: string): string {
    const match = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    return match ? match[1] : html;
}

function extractBaseHref(headHtml: string, pageUrl: string): string {
    const baseHref = getAttr(headHtml.match(/<base\b[^>]*>/i)?.[0] ?? '', 'href');
    try {
        return baseHref ? new URL(baseHref, pageUrl).toString() : pageUrl;
    } catch {
        return pageUrl;
    }
}

function getAttr(tag: string, name: string): string | null {
    const attrRegex = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
    const match = tag.match(attrRegex);
    return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function toAbsoluteUrl(baseUrl: string, href: string): string | null {
    try {
        return new URL(href, baseUrl).toString();
    } catch {
        return null;
    }
}

function hasIconExtension(href: string): boolean {
    const cleanHref = href.split('?')[0]?.toLowerCase() ?? '';
    for (const ext of ICON_EXTENSIONS) {
        if (cleanHref.endsWith(ext)) {
            return true;
        }
    }
    return false;
}

function computePriority(sizeAttr: string | null): number {
    if (!sizeAttr) {
        return 200;
    }
    const match = sizeAttr.toLowerCase().match(/(\d+)\s*x\s*(\d+)/);
    if (!match) {
        return 200;
    }
    const width = Number.parseInt(match[1], 10);
    const height = Number.parseInt(match[2], 10);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width !== height) {
        return 200;
    }
    if (width === 32) {
        return 1;
    }
    if (width === 64) {
        return 2;
    }
    if (width >= 24 && width <= 128) {
        return 3;
    }
    if (width === 16) {
        return 4;
    }
    return 100;
}

function detectContentType(bytes: ArrayBuffer): string {
    const view = new Uint8Array(bytes);

    if (startsWith(view, [0x00, 0x00, 0x01, 0x00])) {
        return 'image/x-icon';
    }
    if (startsWith(view, [0x89, 0x50, 0x4e, 0x47])) {
        return 'image/png';
    }
    if (startsWith(view, [0xff, 0xd8, 0xff])) {
        return 'image/jpeg';
    }
    if (startsWith(view, [0x52, 0x49, 0x46, 0x46])) {
        return 'image/webp';
    }
    const header = new TextDecoder().decode(view.slice(0, 128)).toLowerCase();
    if (header.includes('<svg')) {
        return 'image/svg+xml';
    }
    return '';
}

function startsWith(bytes: Uint8Array, header: number[]): boolean {
    if (bytes.length < header.length) {
        return false;
    }
    for (let i = 0; i < header.length; i += 1) {
        if (bytes[i] !== header[i]) {
            return false;
        }
    }
    return true;
}
