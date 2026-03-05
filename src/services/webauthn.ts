/**
 * Bitwarden Workers - WebAuthn 服务
 * 对应原始项目 Core/Auth/UserFeatures/TwoFactorAuth 中的 WebAuthn 命令
 *
 * 纯 Web Crypto API 实现，无外部依赖，兼容 Cloudflare Workers
 *
 * 参考:
 * - WebAuthn spec: https://www.w3.org/TR/webauthn-3/
 * - Fido2NetLib (official server uses this)
 * - Bitwarden official: StartTwoFactorWebAuthnRegistrationCommand.cs
 *                       CompleteTwoFactorWebAuthnRegistrationCommand.cs
 *                       DeleteTwoFactorWebAuthnCredentialCommand.cs
 */

// WebAuthn 凭证数据 - 对应 TwoFactorProvider.WebAuthnData
export interface WebAuthnData {
    Name: string;
    Descriptor: {
        Type: string;
        Id: string; // Base64URL encoded credential ID
    };
    PublicKey: string; // Base64URL encoded COSE public key
    UserHandle: string; // Base64URL encoded user handle
    SignatureCounter: number;
    CredType: string;
    RegDate: string;
    AaGuid: string;
    Migrated: boolean;
}

// PublicKeyCredentialCreationOptions JSON 格式 (发送给客户端)
export interface CredentialCreationOptionsJSON {
    rp: { name: string; id: string };
    user: { id: string; name: string; displayName: string };
    challenge: string; // Base64URL
    pubKeyCredParams: { type: string; alg: number }[];
    timeout: number;
    excludeCredentials: { type: string; id: string }[];
    authenticatorSelection: {
        authenticatorAttachment?: string;
        requireResidentKey: boolean;
        residentKey: string;
        userVerification: string;
    };
    attestation: string;
    extensions: Record<string, any>;
}

// 配置
const PREMIUM_MAX_CREDENTIALS = 10;
const NON_PREMIUM_MAX_CREDENTIALS = 5;

/**
 * 从 twoFactorProviders JSON 中获取 WebAuthn provider (type=7)
 */
export function getWebAuthnProvider(providers: Record<number, any>): { metaData: Record<string, any>; enabled: boolean } | null {
    return providers[7] || null;
}

/**
 * 获取已注册的 WebAuthn 密钥列表
 */
export function getRegisteredKeys(provider: { metaData: Record<string, any> } | null): { id: number; data: WebAuthnData }[] {
    if (!provider?.metaData) return [];
    return Object.entries(provider.metaData)
        .filter(([key]) => key.startsWith('Key'))
        .map(([key, value]) => ({
            id: parseInt(key.replace('Key', ''), 10),
            data: value as WebAuthnData,
        }));
}

/**
 * 获取 RP ID：从请求的 Origin 中提取域名
 */
function getRpId(origin: string): string {
    try {
        const url = new URL(origin);
        return url.hostname;
    } catch {
        return 'localhost';
    }
}

/**
 * 生成 WebAuthn 注册 challenge
 * 对应 StartTwoFactorWebAuthnRegistrationCommand
 */
export async function startWebAuthnRegistration(
    user: { id: string; name: string; email: string },
    providers: Record<number, any>,
    isPremium: boolean,
    origin: string,
): Promise<{ options: CredentialCreationOptionsJSON; updatedProviders: Record<number, any> }> {
    let provider = providers[7] || { metaData: {}, enabled: false };
    if (!provider.metaData) provider.metaData = {};

    const registeredKeys = getRegisteredKeys(provider);
    const maxCredentials = isPremium ? PREMIUM_MAX_CREDENTIALS : NON_PREMIUM_MAX_CREDENTIALS;

    if (registeredKeys.length >= maxCredentials) {
        throw new Error('Maximum allowed WebAuthn credential count exceeded.');
    }

    const rpId = getRpId(origin);

    // 生成 32 字节随机 challenge
    const challengeBytes = new Uint8Array(32);
    crypto.getRandomValues(challengeBytes);

    // 排除已注册的凭证
    const excludeCredentials = registeredKeys.map(k => ({
        type: 'public-key' as const,
        id: k.data.Descriptor.Id,
    }));

    // 将 user ID (UUID) 转为 Base64URL
    const userIdBytes = uuidToBytes(user.id);

    const options: CredentialCreationOptionsJSON = {
        rp: {
            name: 'Bitwarden',
            id: rpId,
        },
        user: {
            id: bytesToBase64Url(userIdBytes),
            name: user.email,
            displayName: user.name || '',
        },
        challenge: bytesToBase64Url(challengeBytes),
        pubKeyCredParams: [
            { type: 'public-key', alg: -7 },   // ES256
            { type: 'public-key', alg: -257 },  // RS256
            { type: 'public-key', alg: -8 },    // EdDSA
        ],
        timeout: 60000,
        excludeCredentials,
        authenticatorSelection: {
            requireResidentKey: false,
            residentKey: 'discouraged',
            userVerification: 'discouraged',
        },
        attestation: 'none',
        extensions: {},
    };

    // 存储 pending challenge
    provider.metaData['pending'] = JSON.stringify(options);
    providers[7] = provider;

    return { options, updatedProviders: providers };
}

/**
 * 完成 WebAuthn 注册
 * 对应 CompleteTwoFactorWebAuthnRegistrationCommand
 *
 * Bitwarden 客户端发送格式 (来自 default-two-factor-api.service.ts):
 * {
 *   id: string,
 *   rawId: btoa(id),  // standard base64
 *   type: 'public-key',
 *   extensions: {},
 *   response: {
 *     AttestationObject: string (standard base64),
 *     clientDataJson: string (standard base64)
 *   }
 * }
 */
export async function completeWebAuthnRegistration(
    user: { id: string },
    providers: Record<number, any>,
    id: number,
    name: string,
    deviceResponse: any,
    isPremium: boolean,
    origin: string,
): Promise<{ success: boolean; updatedProviders: Record<number, any> }> {
    const provider = providers[7];
    if (!provider?.metaData?.pending) {
        return { success: false, updatedProviders: providers };
    }

    const registeredKeys = getRegisteredKeys(provider);
    const maxCredentials = isPremium ? PREMIUM_MAX_CREDENTIALS : NON_PREMIUM_MAX_CREDENTIALS;
    if (registeredKeys.length >= maxCredentials) {
        throw new Error('Maximum allowed WebAuthn credential count exceeded.');
    }

    const pendingOptions: CredentialCreationOptionsJSON = JSON.parse(provider.metaData.pending);
    const rpId = getRpId(origin);

    // 解析客户端响应
    const resp = deviceResponse.response || {};
    const attestationObjectB64 = resp.AttestationObject || resp.attestationObject;
    const clientDataJsonB64 = resp.clientDataJson || resp.clientDataJSON;

    if (!attestationObjectB64 || !clientDataJsonB64) {
        return { success: false, updatedProviders: providers };
    }

    // 解码 clientDataJSON 并验证
    const clientDataBytes = standardBase64ToBytes(clientDataJsonB64);
    const clientDataStr = new TextDecoder().decode(clientDataBytes);
    const clientData = JSON.parse(clientDataStr);

    // 验证 type
    if (clientData.type !== 'webauthn.create') {
        return { success: false, updatedProviders: providers };
    }

    // 验证 challenge (clientData.challenge 是 Base64URL 编码)
    if (clientData.challenge !== pendingOptions.challenge) {
        return { success: false, updatedProviders: providers };
    }

    // 验证 origin
    if (clientData.origin !== origin) {
        return { success: false, updatedProviders: providers };
    }

    // 解码 attestationObject (CBOR encoded)
    const attestationObjectBytes = standardBase64ToBytes(attestationObjectB64);
    const attestationObject = decodeCBOR(attestationObjectBytes);

    // 提取 authData
    const authData = attestationObject.authData;
    if (!(authData instanceof Uint8Array) || authData.length < 37) {
        return { success: false, updatedProviders: providers };
    }

    // 验证 rpIdHash (前32字节)
    const rpIdHash = authData.slice(0, 32);
    const expectedRpIdHash = new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId))
    );
    if (!arraysEqual(rpIdHash, expectedRpIdHash)) {
        return { success: false, updatedProviders: providers };
    }

    // 验证 flags (第33字节)
    const flags = authData[32];
    const UP = (flags & 0x01) !== 0; // User Present
    if (!UP) {
        return { success: false, updatedProviders: providers };
    }

    // 解析 signCount (bytes 33-36, big-endian)
    const signCount = (authData[33] << 24) | (authData[34] << 16) | (authData[35] << 8) | authData[36];

    // 解析 AAGUID (bytes 37-52)
    const aaguid = authData.slice(37, 53);
    const aaguidHex = Array.from(aaguid).map(b => b.toString(16).padStart(2, '0')).join('');
    const aaguidFormatted = `${aaguidHex.slice(0, 8)}-${aaguidHex.slice(8, 12)}-${aaguidHex.slice(12, 16)}-${aaguidHex.slice(16, 20)}-${aaguidHex.slice(20)}`;

    // 解析 credentialIdLength (bytes 53-54, big-endian)
    const credIdLen = (authData[53] << 8) | authData[54];

    // 解析 credentialId (bytes 55 to 55+credIdLen)
    const credentialId = authData.slice(55, 55 + credIdLen);
    const credentialIdB64Url = bytesToBase64Url(credentialId);

    // 验证 credentialId 与客户端发送的 id 匹配
    if (credentialIdB64Url !== deviceResponse.id && credentialIdB64Url !== standardBase64ToBase64Url(deviceResponse.id)) {
        return { success: false, updatedProviders: providers };
    }

    // 提取 COSE public key (剩余的 authData)
    const publicKeyCose = authData.slice(55 + credIdLen);

    // 存储凭证数据
    const keyId = `Key${id}`;
    delete provider.metaData.pending;
    provider.metaData[keyId] = {
        Name: name,
        Descriptor: {
            Type: 'public-key',
            Id: credentialIdB64Url,
        },
        PublicKey: bytesToBase64Url(publicKeyCose),
        UserHandle: bytesToBase64Url(uuidToBytes(user.id)),
        SignatureCounter: signCount,
        CredType: 'public-key',
        RegDate: new Date().toISOString(),
        AaGuid: aaguidFormatted,
        Migrated: false,
    } as WebAuthnData;

    provider.enabled = true;
    providers[7] = provider;

    return { success: true, updatedProviders: providers };
}

/**
 * 删除 WebAuthn 凭证
 * 对应 DeleteTwoFactorWebAuthnCredentialCommand
 */
export function deleteWebAuthnCredential(
    providers: Record<number, any>,
    id: number,
): { success: boolean; updatedProviders: Record<number, any> } {
    const provider = providers[7];
    if (!provider?.metaData) {
        return { success: false, updatedProviders: providers };
    }

    const keyName = `Key${id}`;
    if (!provider.metaData[keyName]) {
        return { success: false, updatedProviders: providers };
    }

    const keyCount = Object.keys(provider.metaData).filter(k => k.startsWith('Key')).length;
    if (keyCount < 2) {
        return { success: false, updatedProviders: providers };
    }

    delete provider.metaData[keyName];
    providers[7] = provider;

    return { success: true, updatedProviders: providers };
}

/**
 * 生成 WebAuthn 认证 challenge (用于登录时的 2FA 验证)
 */
export function generateWebAuthnAuthenticationChallenge(
    providers: Record<number, any>,
    origin: string,
): { challenge: string; allowCredentials: { type: string; id: string }[]; rpId: string } | null {
    const provider = providers[7];
    if (!provider?.enabled) return null;

    const registeredKeys = getRegisteredKeys(provider);
    if (registeredKeys.length === 0) return null;

    const rpId = getRpId(origin);
    const challengeBytes = new Uint8Array(32);
    crypto.getRandomValues(challengeBytes);

    return {
        challenge: bytesToBase64Url(challengeBytes),
        allowCredentials: registeredKeys.map(k => ({
            type: 'public-key',
            id: k.data.Descriptor.Id,
        })),
        rpId,
    };
}

/**
 * 验证 WebAuthn 认证响应 (登录时的 2FA 验证)
 */
export async function verifyWebAuthnAuthentication(
    providers: Record<number, any>,
    assertionResponse: any,
    expectedChallenge: string,
    origin: string,
): Promise<{ verified: boolean; updatedProviders: Record<number, any> }> {
    const provider = providers[7];
    if (!provider?.metaData) {
        return { verified: false, updatedProviders: providers };
    }

    const rpId = getRpId(origin);
    const registeredKeys = getRegisteredKeys(provider);

    // 找到匹配的凭证
    const credentialId = assertionResponse.id;
    const matchedKey = registeredKeys.find(k => k.data.Descriptor.Id === credentialId);
    if (!matchedKey) {
        return { verified: false, updatedProviders: providers };
    }

    try {
        const resp = assertionResponse.response || {};

        // 解码 clientDataJSON
        const clientDataBytes = base64UrlToBytes(resp.clientDataJSON || resp.clientDataJson);
        const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));

        if (clientData.type !== 'webauthn.get') {
            return { verified: false, updatedProviders: providers };
        }
        if (clientData.challenge !== expectedChallenge) {
            return { verified: false, updatedProviders: providers };
        }
        if (clientData.origin !== origin) {
            return { verified: false, updatedProviders: providers };
        }

        // 解码 authenticatorData
        const authDataBytes = base64UrlToBytes(resp.authenticatorData);

        // 验证 rpIdHash
        const rpIdHash = authDataBytes.slice(0, 32);
        const expectedRpIdHash = new Uint8Array(
            await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId))
        );
        if (!arraysEqual(rpIdHash, expectedRpIdHash)) {
            return { verified: false, updatedProviders: providers };
        }

        // 验证 flags
        const flags = authDataBytes[32];
        if ((flags & 0x01) === 0) { // UP not set
            return { verified: false, updatedProviders: providers };
        }

        // 解析 signCount
        const signCount = (authDataBytes[33] << 24) | (authDataBytes[34] << 16) | (authDataBytes[35] << 8) | authDataBytes[36];

        // 验证签名
        const signatureBytes = base64UrlToBytes(resp.signature);
        const clientDataHash = new Uint8Array(
            await crypto.subtle.digest('SHA-256', clientDataBytes)
        );

        // signedData = authData + clientDataHash
        const signedData = new Uint8Array(authDataBytes.length + clientDataHash.length);
        signedData.set(authDataBytes);
        signedData.set(clientDataHash, authDataBytes.length);

        // 导入公钥并验证签名
        const publicKeyCose = base64UrlToBytes(matchedKey.data.PublicKey);
        const verified = await verifySignatureWithCoseKey(publicKeyCose, signedData, signatureBytes);

        if (verified) {
            matchedKey.data.SignatureCounter = signCount;
            provider.metaData[`Key${matchedKey.id}`] = matchedKey.data;
            providers[7] = provider;
        }

        return { verified, updatedProviders: providers };
    } catch {
        return { verified: false, updatedProviders: providers };
    }
}

// ===================== CBOR 解码 =====================

/**
 * 最小 CBOR 解码器 - 仅支持 WebAuthn attestationObject 所需的类型
 */
export function decodeCBOR(data: Uint8Array): any {
    let offset = 0;

    function readByte(): number {
        return data[offset++];
    }

    function readBytes(n: number): Uint8Array {
        const slice = data.slice(offset, offset + n);
        offset += n;
        return slice;
    }

    function readUint16(): number {
        return (data[offset++] << 8) | data[offset++];
    }

    function readUint32(): number {
        const val = (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
        offset += 4;
        return val >>> 0;
    }

    function readLength(additionalInfo: number): number {
        if (additionalInfo < 24) return additionalInfo;
        if (additionalInfo === 24) return readByte();
        if (additionalInfo === 25) return readUint16();
        if (additionalInfo === 26) return readUint32();
        throw new Error('CBOR: unsupported length encoding');
    }

    function decode(): any {
        const byte = readByte();
        const majorType = byte >> 5;
        const additionalInfo = byte & 0x1f;

        switch (majorType) {
            case 0: // unsigned integer
                return readLength(additionalInfo);

            case 1: // negative integer
                return -1 - readLength(additionalInfo);

            case 2: { // byte string
                const len = readLength(additionalInfo);
                return readBytes(len);
            }

            case 3: { // text string
                const len = readLength(additionalInfo);
                const bytes = readBytes(len);
                return new TextDecoder().decode(bytes);
            }

            case 4: { // array
                const len = readLength(additionalInfo);
                const arr: any[] = [];
                for (let i = 0; i < len; i++) {
                    arr.push(decode());
                }
                return arr;
            }

            case 5: { // map
                const len = readLength(additionalInfo);
                const obj: Record<string, any> = {};
                for (let i = 0; i < len; i++) {
                    const key = decode();
                    const value = decode();
                    obj[String(key)] = value;
                }
                return obj;
            }

            case 7: { // simple values & floats
                if (additionalInfo === 20) return false;
                if (additionalInfo === 21) return true;
                if (additionalInfo === 22) return null;
                if (additionalInfo === 23) return undefined;
                throw new Error('CBOR: unsupported simple value');
            }

            default:
                throw new Error(`CBOR: unsupported major type ${majorType}`);
        }
    }

    return decode();
}

// ===================== COSE 公钥签名验证 =====================

/**
 * 用 COSE 公钥验证签名
 */
export async function verifySignatureWithCoseKey(
    coseKeyBytes: Uint8Array,
    signedData: Uint8Array,
    signature: Uint8Array,
): Promise<boolean> {
    const coseKey = decodeCBOR(coseKeyBytes);
    const kty = coseKey['1']; // Key type
    const alg = coseKey['3']; // Algorithm

    if (kty === 2 && (alg === -7 || alg === undefined)) {
        // EC2 key with ES256 (P-256)
        return verifyES256(coseKey, signedData, signature);
    } else if (kty === 3 && alg === -257) {
        // RSA key with RS256
        return verifyRS256(coseKey, signedData, signature);
    }

    throw new Error(`Unsupported COSE key type: kty=${kty}, alg=${alg}`);
}

/**
 * ES256 签名验证 (P-256 / ECDSA with SHA-256)
 */
async function verifyES256(
    coseKey: Record<string, any>,
    signedData: Uint8Array,
    signature: Uint8Array,
): Promise<boolean> {
    // 从 COSE key 中提取 x, y 坐标
    const x = coseKey['-2'] as Uint8Array;
    const y = coseKey['-3'] as Uint8Array;

    if (!x || !y || x.length !== 32 || y.length !== 32) {
        return false;
    }

    // 构造未压缩公钥 (0x04 + x + y)
    const uncompressedKey = new Uint8Array(65);
    uncompressedKey[0] = 0x04;
    uncompressedKey.set(x, 1);
    uncompressedKey.set(y, 33);

    const key = await crypto.subtle.importKey(
        'raw',
        uncompressedKey,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
    );

    // WebAuthn 使用 DER 编码的签名，Web Crypto API 需要 raw (r||s) 格式
    const rawSignature = derToRaw(signature);

    return crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        rawSignature,
        signedData,
    );
}

/**
 * RS256 签名验证 (RSA with SHA-256)
 */
async function verifyRS256(
    coseKey: Record<string, any>,
    signedData: Uint8Array,
    signature: Uint8Array,
): Promise<boolean> {
    const n = coseKey['-1'] as Uint8Array;
    const e = coseKey['-2'] as Uint8Array;

    if (!n || !e) return false;

    // 构造 JWK
    const jwk = {
        kty: 'RSA',
        n: bytesToBase64Url(n),
        e: bytesToBase64Url(e),
        alg: 'RS256',
    };

    const key = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
    );

    return crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        key,
        signature,
        signedData,
    );
}

/**
 * DER 编码 ECDSA 签名 -> raw (r||s) 格式
 */
function derToRaw(derSig: Uint8Array): Uint8Array {
    // DER: 0x30 <len> 0x02 <rLen> <r> 0x02 <sLen> <s>
    if (derSig[0] !== 0x30) {
        // 可能已经是 raw 格式 (64 bytes for P-256)
        if (derSig.length === 64) return derSig;
        throw new Error('Invalid DER signature');
    }

    let idx = 2; // skip 0x30 + total length

    // Parse r
    if (derSig[idx++] !== 0x02) throw new Error('Invalid DER signature');
    let rLen = derSig[idx++];
    let r = derSig.slice(idx, idx + rLen);
    idx += rLen;

    // Parse s
    if (derSig[idx++] !== 0x02) throw new Error('Invalid DER signature');
    let sLen = derSig[idx++];
    let s = derSig.slice(idx, idx + sLen);

    // 去掉前导零 padding，确保 32 字节
    if (r.length > 32) r = r.slice(r.length - 32);
    if (s.length > 32) s = s.slice(s.length - 32);

    const raw = new Uint8Array(64);
    raw.set(r, 32 - r.length);
    raw.set(s, 64 - s.length);

    return raw;
}

// ===================== 工具函数 =====================

function uuidToBytes(uuid: string): Uint8Array {
    const hex = uuid.replace(/-/g, '');
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
    const binary = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(base64url: string): Uint8Array {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function standardBase64ToBytes(base64: string): Uint8Array {
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function standardBase64ToBase64Url(base64: string): string {
    if (!base64) return '';
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}
