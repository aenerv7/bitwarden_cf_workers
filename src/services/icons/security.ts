const BLOCKED_HOSTS = new Set([
    'localhost',
    'localhost.localdomain',
    'local',
]);

const BLOCKED_SUFFIXES = [
    '.localhost',
    '.local',
    '.internal',
    '.home',
    '.lan',
    '.arpa',
];

const IP_V4_PATTERN = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export function normalizeAndValidateHostname(hostnameParam: string): string | null {
    const hostname = decodeURIComponent(hostnameParam).trim().toLowerCase();
    if (!hostname || hostname.length > 253 || hostname.endsWith('.')) {
        return null;
    }

    if (hostname.includes('/') || hostname.includes('@') || hostname.includes(':')) {
        return null;
    }

    if (!hostname.includes('.')) {
        return null;
    }

    if (BLOCKED_HOSTS.has(hostname) || BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
        return null;
    }

    if (isIpAddress(hostname)) {
        return null;
    }

    const labels = hostname.split('.');
    for (const label of labels) {
        if (!label || label.length > 63) {
            return null;
        }
        if (!/^[a-z0-9-]+$/.test(label) || label.startsWith('-') || label.endsWith('-')) {
            return null;
        }
    }

    return hostname;
}

export function isSafeHttpUrl(input: string): boolean {
    let url: URL;
    try {
        url = new URL(input);
    } catch {
        return false;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return false;
    }

    if (url.port && url.port !== '80' && url.port !== '443') {
        return false;
    }

    if (!normalizeAndValidateHostname(url.hostname)) {
        return false;
    }

    return true;
}

/**
 * IP 地址、内网域名等无法/不应抓取 icon 的 hostname，
 * 直接返回默认图标而非 400。
 */
export function isUnfetchableHost(raw: string): boolean {
    const h = raw.trim().toLowerCase();
    if (!h || !h.includes('.')) {
        return true;
    }
    if (isIpAddress(h)) {
        return true;
    }
    if (BLOCKED_HOSTS.has(h) || BLOCKED_SUFFIXES.some((s) => h.endsWith(s))) {
        return true;
    }
    return false;
}

function isIpAddress(hostname: string): boolean {
    if (IP_V4_PATTERN.test(hostname)) {
        return true;
    }

    // Accepts simplified IPv6 literals after URL parsing, e.g. "2001:db8::1"
    if (hostname.includes(':')) {
        return true;
    }

    return false;
}
