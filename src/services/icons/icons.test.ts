import { describe, expect, it } from 'vitest';

import { buildCacheKeys } from './cache';
import { mapDomain } from './constants';
import { isSafeHttpUrl, normalizeAndValidateHostname } from './security';

describe('icons caching contract', () => {
    it('builds stable cross-user cache keys', () => {
        const keys = buildCacheKeys('google.com');
        expect(keys.meta).toBe('icon:v1:google.com:meta');
        expect(keys.data).toBe('icon:v1:google.com:data');
    });

    it('maps known domains to canonical base domain', () => {
        expect(mapDomain('accounts.google.com')).toBe('google.com');
        expect(mapDomain('example.com')).toBe('example.com');
    });
});

describe('icons hostname validation', () => {
    it('accepts regular public hostnames', () => {
        expect(normalizeAndValidateHostname('github.com')).toBe('github.com');
        expect(normalizeAndValidateHostname('accounts.google.com')).toBe('accounts.google.com');
    });

    it('rejects private and malformed hostnames', () => {
        expect(normalizeAndValidateHostname('localhost')).toBeNull();
        expect(normalizeAndValidateHostname('127.0.0.1')).toBeNull();
        expect(normalizeAndValidateHostname('192.168.0.10')).toBeNull();
        expect(normalizeAndValidateHostname('bad/host')).toBeNull();
    });
});

describe('icons url safety checks', () => {
    it('allows only safe http(s) urls', () => {
        expect(isSafeHttpUrl('https://github.com/favicon.ico')).toBe(true);
        expect(isSafeHttpUrl('http://example.com/icon.png')).toBe(true);
    });

    it('blocks non-standard ports and local addresses', () => {
        expect(isSafeHttpUrl('https://github.com:8443/icon.png')).toBe(false);
        expect(isSafeHttpUrl('http://localhost/icon.png')).toBe(false);
        expect(isSafeHttpUrl('http://127.0.0.1/icon.png')).toBe(false);
    });
});
