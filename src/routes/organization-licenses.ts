/**
 * Bitwarden Workers - Self-hosted Organization Licenses 路由
 *
 * 对应官方服务端 `SelfHostedOrganizationLicensesController`：
 * - POST /organizations/licenses/self-hosted           -> CreateLicenseAsync
 * - POST /organizations/licenses/self-hosted/{id}      -> UpdateLicenseAsync   (此处做最小实现，暂不完整对齐)
 * - POST /organizations/licenses/self-hosted/{id}/sync -> SyncLicenseAsync     (此处仅返回 204，避免客户端报错)
 *
 * 主要用于通过 `bitwarden_organization_license.json` 文件在自建环境中创建组织。
 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import {
    organizations,
    organizationUsers,
    users,
    collections,
    collectionUsers,
    organizationLicenses,
} from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { BadRequestError, NotFoundError } from '../middleware/error';
import { generateUuid } from '../services/crypto';
import type { Bindings, Variables } from '../types';

type AppEnv = { Bindings: Bindings; Variables: Variables };

const orgLicenses = new Hono<AppEnv>();

// 所有端点都需要认证（与官方 [Authorize("Application")] 对齐）
orgLicenses.use('/*', authMiddleware);

/**
 * 从 multipart/form-data 中提取 license 文件。
 * Web 前端通过 `FormData` 字段名 `license` 上传。
 */
async function extractLicenseFile(
    c: import('hono').Context<AppEnv>,
): Promise<{ file: File; formData: Record<string, unknown> }> {
    const formData = await c.req.parseBody({ all: true });

    const licenseField = formData['license'];
    if (licenseField instanceof File) {
        return { file: licenseField, formData };
    }
    if (Array.isArray(licenseField)) {
        for (const item of licenseField) {
            if (item instanceof File) {
                return { file: item, formData };
            }
        }
    }

    // 兜底：遍历所有字段，找到第一个 File
    for (const key of Object.keys(formData)) {
        const value = formData[key];
        if (value instanceof File) {
            return { file: value, formData };
        }
        if (Array.isArray(value)) {
            for (const item of value) {
                if (item instanceof File) {
                    return { file: item, formData };
                }
            }
        }
    }

    throw new BadRequestError('License file is required.');
}

/**
 * 将 license JSON 映射为 organizations 表需要的字段。
 * 这里做的是「尽量兼容」的最小实现：
 * - Name / BillingEmail 直接取自 license，对应 Organization.Name / BillingEmail
 * - Seats / MaxStorageGb / PlanType 仅作基础填充，不做计费或复杂校验
 */
function mapLicenseToOrganizationFields(license: unknown) {
    const lic = license as Record<string, unknown>;
    // 组织名称：优先使用 Name，其次 BusinessName，兜底一个固定值避免为空
    const name: string =
        (lic?.Name as string | undefined) ||
        (lic?.OrganizationName as string | undefined) ||
        (lic?.BusinessName as string | undefined) ||
        'Organization';

    const billingEmail: string =
        (lic?.BillingEmail as string | undefined) ||
        (lic?.Email as string | undefined) ||
        '';

    if (!billingEmail) {
        throw new BadRequestError('Invalid license: missing billing email.');
    }

    //  seats / storage 只是近似，主要保证客户端显示正常
    const seats = typeof lic?.Seats === 'number' ? (lic.Seats as number) : 5;
    const maxStorageGb =
        typeof lic?.MaxStorageGb === 'number' ? (lic.MaxStorageGb as number) : 1;

    // planType 在官方服务端是枚举，这里只区分 Free / 非 Free，非 Free 统一当作 1（付费）
    let planType = 0;
    if (lic?.PlanType != null) {
        // 如果 license 自身有枚举值，直接使用
        planType = Number(lic.PlanType) || 0;
    } else if (typeof lic?.Plan === 'string') {
        const plan = (lic.Plan as string).toLowerCase();
        if (
            plan.includes('teams') ||
            plan.includes('enterprise') ||
            plan.includes('business') ||
            plan.includes('family') ||
            plan.includes('families')
        ) {
            planType = 2;
        } else if (!plan.includes('free')) {
            planType = 1;
        }
    }

    const useTotp = !!lic?.UseTotp;
    const enabled = lic?.Enabled !== false;

    return { name, billingEmail, seats, maxStorageGb, planType, useTotp, enabled };
}

/**
 * 依据官方 `OrganizationLicense.CanUse` / `ObsoleteCanUse` 的规则做尽量一致的校验。
 * - Premium 个人许可证不能用于组织
 * - 必须允许 SelfHost
 * - 不允许使用已禁用或已过期的 license
 * - 如配置了 INSTALLATION_ID，则校验 InstallationId 一致性
 */
function validateOrganizationLicense(rawLicense: unknown, env: Bindings) {
    const lic = rawLicense as Record<string, unknown>;
    const now = new Date();

    // LicenseType != Organization 时，沿用官方错误文案
    const licenseType = lic?.LicenseType as number | undefined;
    if (licenseType !== undefined && licenseType !== 1) {
        throw new BadRequestError(
            'Premium licenses cannot be applied to an organization. Upload this license from your personal account settings page.',
        );
    }

    const errors: string[] = [];

    // Enabled
    const enabled = lic?.Enabled as boolean | undefined;
    if (enabled === false) {
        errors.push('Your cloud-hosted organization is currently disabled.');
    }

    // Issued 时间（尚未生效）
    const issuedStr = lic?.Issued as string | undefined;
    if (issuedStr) {
        const issued = new Date(issuedStr);
        if (issued.getTime() > now.getTime()) {
            errors.push("The license hasn't been issued yet.");
        }
    }

    // 过期时间（优先 Expires，其次 ExpirationWithoutGracePeriod）
    const expiresStr =
        (lic?.Expires as string | undefined) ||
        (lic?.ExpirationWithoutGracePeriod as string | undefined) ||
        (lic?.Expiration as string | undefined);
    if (expiresStr) {
        const expires = new Date(expiresStr);
        if (expires.getTime() < now.getTime()) {
            errors.push('The license has expired.');
        }
    }

    // SelfHost 必须为 true
    const selfHost = lic?.SelfHost as boolean | undefined;
    if (selfHost === false) {
        errors.push('The license does not allow for on-premise hosting of organizations.');
    }

    // InstallationId 与当前安装匹配（如果配置了 INSTALLATION_ID）
    const installationId = lic?.InstallationId as string | undefined;
    if (env.INSTALLATION_ID && installationId && installationId !== env.INSTALLATION_ID) {
        errors.push('The installation ID does not match the current installation.');
    }

    if (errors.length > 0) {
        throw new BadRequestError(`Invalid license. ${errors.join(' ')}`);
    }
}

/**
 * 从 license JSON 中提取用于唯一性检查和持久化的数据。
 */
function extractLicensePersistenceFields(rawLicense: unknown) {
    const lic = rawLicense as Record<string, unknown>;
    const licenseKey = lic?.LicenseKey as string | undefined;
    if (!licenseKey) {
        throw new BadRequestError('Invalid license: missing LicenseKey.');
    }

    const issued =
        (lic?.Issued as string | undefined) ||
        (lic?.IssueDate as string | undefined) ||
        null;

    const expires =
        (lic?.Expires as string | undefined) ||
        (lic?.ExpirationWithoutGracePeriod as string | undefined) ||
        (lic?.Expiration as string | undefined) ||
        null;

    const selfHost = lic?.SelfHost as boolean | undefined;
    const installationId = (lic?.InstallationId as string | undefined) ?? null;
    const licenseOrgId = (lic?.Id as string | undefined) ?? null;

    return { licenseKey, issued, expires, selfHost, installationId, licenseOrgId };
}

/**
 * 确认 license 真的属于当前要操作的组织。
 * 官方 `VerifyData` 会比较 Id / LicenseKey / Name 等，我们在 Workers 中至少保证 Id 一致：
 * - 如果 license 中包含 Id，则必须与本地 organizationId 一致，否则视为无效 license。
 */
function validateLicenseMatchesOrganization(
    rawLicense: unknown,
    organizationId: string,
) {
    const lic = rawLicense as Record<string, unknown>;
    const licenseOrgId = lic?.Id as string | undefined;
    if (licenseOrgId && licenseOrgId.toLowerCase() !== organizationId.toLowerCase()) {
        throw new BadRequestError('Invalid license');
    }
}

/**
 * POST /organizations/licenses/self-hosted
 * 通过 license 文件创建一个自建组织。
 *
 * 与官方行为对齐要点：
 * - 需要有效的用户上下文（当前登录用户即组织 Owner）
 * - 必须有 `license` 文件和 `key` 字段
 * - `collectionName` 为加密后的默认收藏夹名称，可选
 * - 返回 OrganizationResponseModel 兼容的字段集合（简化版）
 */
orgLicenses.post('/self-hosted', async (c) => {
    const db = drizzle(c.env.DB);
    const userId = c.get('userId');

    const currentUser = await db.select().from(users).where(eq(users.id, userId)).get();
    if (!currentUser) {
        throw new NotFoundError('Current user not found.');
    }

    const { file, formData } = await extractLicenseFile(c);

    const ownerKey = typeof formData['key'] === 'string' ? formData['key'] : '';
    if (!ownerKey) {
        throw new BadRequestError('Organization key is required.');
    }

    const collectionName =
        typeof formData['collectionName'] === 'string' ? formData['collectionName'] : null;

    const licenseText = await file.text();
    let licenseJson: unknown;
    try {
        licenseJson = JSON.parse(licenseText);
    } catch {
        throw new BadRequestError('Invalid license');
    }

    // 校验 license 合法性，尽量与官方行为保持一致
    validateOrganizationLicense(licenseJson, c.env);

    const {
        name,
        billingEmail,
        seats,
        maxStorageGb,
        planType,
        useTotp,
        enabled,
    } = mapLicenseToOrganizationFields(licenseJson);

    const { licenseKey, issued, expires, selfHost, installationId, licenseOrgId } =
        extractLicensePersistenceFields(licenseJson);

    // 检查该 LicenseKey 是否已被其它启用组织使用
    const existingLicense = await db
        .select({
            organizationId: organizationLicenses.organizationId,
        })
        .from(organizationLicenses)
        .where(eq(organizationLicenses.licenseKey, licenseKey))
        .get();

    if (existingLicense) {
        // 与官方错误文本保持一致
        throw new BadRequestError('License is already in use by another organization.');
    }

    const now = new Date().toISOString();
    // 为了与官方保持一致，如果 license 中自带 Id（云端组织 Id），则直接使用；
    // 否则退化为本地生成的 UUID。
    const orgId = licenseOrgId || generateUuid();

    // 创建组织记录
    await db.insert(organizations).values({
        id: orgId,
        name,
        billingEmail,
        email: billingEmail,
        key: null,
        planType,
        seats,
        maxStorageGb,
        useTotp,
        useWebAuthn: false,
        enabled,
        creationDate: now,
        revisionDate: now,
    });

    // 持久化 license 信息，供后续更新/验证使用
    await db.insert(organizationLicenses).values({
        organizationId: orgId,
        licenseKey,
        licenseJson: licenseText,
        issued,
        expires,
        selfHost: selfHost ?? null,
        installationId,
        creationDate: now,
        revisionDate: now,
    });

    // 创建 owner 组织成员
    const orgUserId = generateUuid();
    await db.insert(organizationUsers).values({
        id: orgUserId,
        organizationId: orgId,
        userId,
        email: currentUser.email,
        key: ownerKey,
        status: 2, // Confirmed
        type: 0, // Owner
        permissions: null,
        creationDate: now,
        revisionDate: now,
    });

    // 如果传入了默认集合名称，则创建一个集合并赋予 owner 完全权限
    if (collectionName) {
        const collectionId = generateUuid();
        await db.insert(collections).values({
            id: collectionId,
            organizationId: orgId,
            name: collectionName,
            externalId: null,
            creationDate: now,
            revisionDate: now,
        });

        await db.insert(collectionUsers).values({
            collectionId,
            organizationUserId: orgUserId,
            readOnly: false,
            hidePasswords: false,
            manage: true,
        });
    }

    // 目前不保存 license 文件本身（官方存到磁盘 /organization 目录），
    // 如需对齐可以后续扩展为存入 R2/KV。

    return c.json({
        id: orgId,
        name,
        billingEmail,
        planType,
        seats,
        maxStorageGb,
        enabled,
        useTotp,
        useWebAuthn: false,
        object: 'organization',
    });
});

/**
 * POST /organizations/licenses/self-hosted/:id
 * 组织许可证更新（最小实现：更新 seats / storage / enabled 等基础字段）。
 * 这样前端“更新许可证”界面不会 404，但暂未完全实现官方所有同步逻辑。
 */
orgLicenses.post('/self-hosted/:id', async (c) => {
    const db = drizzle(c.env.DB);
    const orgId = c.req.param('id');

    const existing = await db.select().from(organizations).where(eq(organizations.id, orgId)).get();
    if (!existing) {
        throw new NotFoundError('Organization not found.');
    }

    const { file } = await extractLicenseFile(c);
    const licenseText = await file.text();
    let licenseJson: unknown;
    try {
        licenseJson = JSON.parse(licenseText);
    } catch {
        throw new BadRequestError('Invalid license');
    }

    // 与创建逻辑相同，先做 license 校验
    validateOrganizationLicense(licenseJson, c.env);
    // 确认 license 属于当前组织（如包含 Id）
    validateLicenseMatchesOrganization(licenseJson, orgId);

    const {
        name,
        billingEmail,
        seats,
        maxStorageGb,
        planType,
        useTotp,
        enabled,
    } = mapLicenseToOrganizationFields(licenseJson);

    const { licenseKey, issued, expires, selfHost, installationId } =
        extractLicensePersistenceFields(licenseJson);

    const now = new Date().toISOString();

    await db
        .update(organizations)
        .set({
            name,
            billingEmail,
            email: billingEmail,
            planType,
            seats,
            maxStorageGb,
            useTotp,
            enabled,
            revisionDate: now,
        })
        .where(eq(organizations.id, orgId));

    // 更新或插入 license 记录:
    // - 若此前已经存过（正常情况），则更新 JSON 与时间字段
    // - 若不存在（历史数据），则创建一条新记录
    const existingLicense = await db
        .select()
        .from(organizationLicenses)
        .where(eq(organizationLicenses.organizationId, orgId))
        .get();

    if (existingLicense) {
        // 如果换了 LicenseKey，需要确保新 key 没被其它组织使用
        if (existingLicense.licenseKey !== licenseKey) {
            const conflict = await db
                .select({ organizationId: organizationLicenses.organizationId })
                .from(organizationLicenses)
                .where(eq(organizationLicenses.licenseKey, licenseKey))
                .get();
            if (conflict) {
                throw new BadRequestError('License is already in use by another organization.');
            }
        }

        await db
            .update(organizationLicenses)
            .set({
                licenseKey,
                licenseJson: licenseText,
                issued,
                expires,
                selfHost: selfHost ?? null,
                installationId,
                revisionDate: now,
            })
            .where(eq(organizationLicenses.organizationId, orgId));
    } else {
        // 旧组织首次写入 license 数据
        const conflict = await db
            .select({ organizationId: organizationLicenses.organizationId })
            .from(organizationLicenses)
            .where(eq(organizationLicenses.licenseKey, licenseKey))
            .get();
        if (conflict) {
            throw new BadRequestError('License is already in use by another organization.');
        }

        await db.insert(organizationLicenses).values({
            organizationId: orgId,
            licenseKey,
            licenseJson: licenseText,
            issued,
            expires,
            selfHost: selfHost ?? null,
            installationId,
            creationDate: now,
            revisionDate: now,
        });
    }

    return c.body(null, 204);
});

/**
 * POST /organizations/licenses/self-hosted/:id/sync/
 * 官方用于从云端重新拉取 license，这里暂不实现实际同步逻辑，
 * 仅返回 204，保证前端调用成功。
 */
orgLicenses.post('/self-hosted/:id/sync/', async (c) => {
    // 将来如需实现，可以在此处调用官方 Cloud API 或其它后端服务。
    return c.body(null, 204);
});

export default orgLicenses;

