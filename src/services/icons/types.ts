export interface IconCacheConfig {
    successTtlSeconds: number;
    negativeTtlSeconds: number;
    maxImageBytes: number;
}

export interface CachedIconMeta {
    version: 1;
    status: 'ok' | 'not_found';
    domain: string;
    contentType: string | null;
    dataKey: string | null;
    fetchedAt: number;
    expiresAt: number;
}

export interface FetchedIcon {
    image: ArrayBuffer;
    contentType: string;
}

export interface IconResultFound {
    status: 'ok';
    domain: string;
    icon: FetchedIcon;
}

export interface IconResultNotFound {
    status: 'not_found';
    domain: string;
}

export type IconResolveResult = IconResultFound | IconResultNotFound;
