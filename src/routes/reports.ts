/**
 * Bitwarden Workers - Reports 路由
 * 对应官方 ReportsController + OrganizationReportsController
 *
 * 路由前缀: /api/reports
 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, desc, isNull, inArray, sql } from 'drizzle-orm';
import {
    organizations,
    organizationUsers,
    organizationReports,
    users,
    ciphers,
    collections,
    collectionUsers,
    collectionCiphers,
    groups,
    groupUsers,
    collectionGroups,
} from '../db/schema';
import type { OrganizationUserRow, OrganizationReportRow } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { NotFoundError, BadRequestError } from '../middleware/error';
import { generateUuid } from '../services/crypto';
import type { Bindings, Variables } from '../types';

const reports = new Hono<{ Bindings: Bindings; Variables: Variables }>();
reports.use('/*', authMiddleware);

type D1Db = ReturnType<typeof drizzle>;

interface OrgUserPermissions {
    accessReports?: boolean;
    [key: string]: boolean | undefined;
}

function parsePermissions(raw: string | null): OrgUserPermissions | null {
    if (!raw) return null;
    try {
        return JSON.parse(raw) as OrgUserPermissions;
    } catch {
        return null;
    }
}

/**
 * AccessReports 权限检查 — 对应官方 CurrentContext.AccessReports
 * Owner / Admin 或 permissions.accessReports
 */
function canAccessReports(orgUser: OrganizationUserRow): boolean {
    if (orgUser.type === 0 || orgUser.type === 1) return true;
    const perms = parsePermissions(orgUser.permissions);
    return !!(perms?.accessReports);
}

async function requireReportsAccess(db: D1Db, orgId: string, userId: string): Promise<OrganizationUserRow> {
    const orgUser = await db.select().from(organizationUsers)
        .where(and(eq(organizationUsers.organizationId, orgId), eq(organizationUsers.userId, userId)))
        .get();

    if (!orgUser || orgUser.status !== 2) {
        throw new NotFoundError('Organization not found or access denied.');
    }
    if (!canAccessReports(orgUser)) {
        throw new NotFoundError('Organization not found or access denied.');
    }
    return orgUser;
}

// ==================== GET /password-health-report-applications/:orgId ====================
// 对应 ReportsController.GetPasswordHealthReportApplications
// Workers 版本暂无 password_health_report_applications 表，返回空数组
reports.get('/password-health-report-applications/:orgId', async (c) => {
    const orgId = c.req.param('orgId');
    const userId = c.get('userId');
    const db = drizzle(c.env.DB);

    await requireReportsAccess(db, orgId, userId);

    return c.json([]);
});

// ==================== GET /organizations/:orgId/latest ====================
// 对应 OrganizationReportsController.GetLatestOrganizationReportAsync
reports.get('/organizations/:orgId/latest', async (c) => {
    const orgId = c.req.param('orgId');
    const userId = c.get('userId');
    const db = drizzle(c.env.DB);

    await requireReportsAccess(db, orgId, userId);

    const latest = await db.select().from(organizationReports)
        .where(eq(organizationReports.organizationId, orgId))
        .orderBy(desc(organizationReports.creationDate))
        .limit(1)
        .get();

    if (!latest) return c.json(null);

    return c.json(toOrganizationReportResponse(latest));
});

// ==================== POST /organizations/:orgId ====================
// 对应 OrganizationReportsController.CreateOrganizationReportAsync
reports.post('/organizations/:orgId', async (c) => {
    const orgId = c.req.param('orgId');
    const userId = c.get('userId');
    const db = drizzle(c.env.DB);

    await requireReportsAccess(db, orgId, userId);

    const body = await c.req.json<{
        organizationId?: string;
        reportData?: string;
        contentEncryptionKey?: string;
        summaryData?: string;
        applicationData?: string;
        metrics?: {
            totalApplicationCount?: number | null;
            totalAtRiskApplicationCount?: number | null;
            totalCriticalApplicationCount?: number | null;
            totalCriticalAtRiskApplicationCount?: number | null;
            totalMemberCount?: number | null;
            totalAtRiskMemberCount?: number | null;
            totalCriticalMemberCount?: number | null;
            totalCriticalAtRiskMemberCount?: number | null;
            totalPasswordCount?: number | null;
            totalAtRiskPasswordCount?: number | null;
            totalCriticalPasswordCount?: number | null;
            totalCriticalAtRiskPasswordCount?: number | null;
        };
    }>();

    if (body.organizationId && body.organizationId !== orgId) {
        throw new BadRequestError('Organization ID in the request body must match the route parameter');
    }

    const org = await db.select().from(organizations).where(eq(organizations.id, orgId)).get();
    if (!org) throw new BadRequestError('Invalid Organization');

    if (!body.contentEncryptionKey?.trim()) throw new BadRequestError('Content Encryption Key is required');
    if (!body.reportData?.trim()) throw new BadRequestError('Report Data is required');
    if (!body.summaryData?.trim()) throw new BadRequestError('Summary Data is required');
    if (!body.applicationData?.trim()) throw new BadRequestError('Application Data is required');

    const now = new Date().toISOString();
    const id = generateUuid();
    const metrics = body.metrics ?? {};

    const row: typeof organizationReports.$inferInsert = {
        id,
        organizationId: orgId,
        reportData: body.reportData ?? '',
        contentEncryptionKey: body.contentEncryptionKey ?? '',
        summaryData: body.summaryData ?? null,
        applicationData: body.applicationData ?? null,
        applicationCount: metrics.totalApplicationCount ?? null,
        applicationAtRiskCount: metrics.totalAtRiskApplicationCount ?? null,
        criticalApplicationCount: metrics.totalCriticalApplicationCount ?? null,
        criticalApplicationAtRiskCount: metrics.totalCriticalAtRiskApplicationCount ?? null,
        memberCount: metrics.totalMemberCount ?? null,
        memberAtRiskCount: metrics.totalAtRiskMemberCount ?? null,
        criticalMemberCount: metrics.totalCriticalMemberCount ?? null,
        criticalMemberAtRiskCount: metrics.totalCriticalAtRiskMemberCount ?? null,
        passwordCount: metrics.totalPasswordCount ?? null,
        passwordAtRiskCount: metrics.totalAtRiskPasswordCount ?? null,
        criticalPasswordCount: metrics.totalCriticalPasswordCount ?? null,
        criticalPasswordAtRiskCount: metrics.totalCriticalAtRiskPasswordCount ?? null,
        creationDate: now,
        revisionDate: now,
    };

    await db.insert(organizationReports).values(row);
    const created = await db.select().from(organizationReports).where(eq(organizationReports.id, id)).get();

    return c.json(created ? toOrganizationReportResponse(created) : null);
});

// ==================== GET /member-cipher-details/:orgId ====================
// 对应 ReportsController.GetMemberCipherDetails
// 复刻官方 RiskInsightsReportQuery + MemberAccessReport_GetMemberAccessCipherDetails SP
reports.get('/member-cipher-details/:orgId', async (c) => {
    const orgId = c.req.param('orgId');
    const userId = c.get('userId');
    const db = drizzle(c.env.DB);

    await requireReportsAccess(db, orgId, userId);

    const org = await db.select().from(organizations)
        .where(and(eq(organizations.id, orgId), eq(organizations.enabled, true)))
        .get();
    if (!org) throw new NotFoundError('Organization not found.');

    // 1) 直接通过 CollectionUser 关联的 Cipher
    const directRows = await db
        .select({
            userGuid: organizationUsers.id,
            userName: users.name,
            email: sql<string>`coalesce(${users.email}, ${organizationUsers.email})`,
            usesKeyConnector: users.usesKeyConnector,
            cipherId: ciphers.id,
        })
        .from(organizationUsers)
        .leftJoin(users, eq(users.id, organizationUsers.userId))
        .innerJoin(collectionUsers, eq(collectionUsers.organizationUserId, organizationUsers.id))
        .innerJoin(collections, and(eq(collections.id, collectionUsers.collectionId), eq(collections.organizationId, orgId)))
        .innerJoin(collectionCiphers, eq(collectionCiphers.collectionId, collections.id))
        .innerJoin(ciphers, and(eq(ciphers.id, collectionCiphers.cipherId), eq(ciphers.organizationId, orgId), isNull(ciphers.deletedDate)))
        .where(and(
            eq(organizationUsers.organizationId, orgId),
            inArray(organizationUsers.status, [0, 1, 2]),
        ))
        .all();

    // 2) 通过 Group -> CollectionGroup 关联的 Cipher
    const groupRows = await db
        .select({
            userGuid: organizationUsers.id,
            userName: users.name,
            email: sql<string>`coalesce(${users.email}, ${organizationUsers.email})`,
            usesKeyConnector: users.usesKeyConnector,
            cipherId: ciphers.id,
        })
        .from(organizationUsers)
        .leftJoin(users, eq(users.id, organizationUsers.userId))
        .innerJoin(groupUsers, eq(groupUsers.organizationUserId, organizationUsers.id))
        .innerJoin(groups, eq(groups.id, groupUsers.groupId))
        .innerJoin(collectionGroups, eq(collectionGroups.groupId, groups.id))
        .innerJoin(collections, and(eq(collections.id, collectionGroups.collectionId), eq(collections.organizationId, orgId)))
        .innerJoin(collectionCiphers, eq(collectionCiphers.collectionId, collections.id))
        .innerJoin(ciphers, and(eq(ciphers.id, collectionCiphers.cipherId), eq(ciphers.organizationId, orgId), isNull(ciphers.deletedDate)))
        .where(and(
            eq(organizationUsers.organizationId, orgId),
            inArray(organizationUsers.status, [0, 1, 2]),
        ))
        .all();

    // 3) 没有任何集合关联的成员（通常是受邀但未确认、也未分配集合的用户）
    const allOrgUsers = await db
        .select({
            userGuid: organizationUsers.id,
            userName: users.name,
            email: sql<string>`coalesce(${users.email}, ${organizationUsers.email})`,
            usesKeyConnector: users.usesKeyConnector,
        })
        .from(organizationUsers)
        .leftJoin(users, eq(users.id, organizationUsers.userId))
        .where(and(
            eq(organizationUsers.organizationId, orgId),
            inArray(organizationUsers.status, [0, 1, 2]),
        ))
        .all();

    const usersWithCollections = new Set([
        ...directRows.map(r => r.userGuid),
        ...groupRows.map(r => r.userGuid),
    ]);

    const noCollectionUsers = allOrgUsers.filter(u => !usersWithCollections.has(u.userGuid));

    // 合并并按用户分组（对应 RiskInsightsReportQuery 的 GroupBy 逻辑）
    type RawRow = { userGuid: string; userName: string | null; email: string; usesKeyConnector: boolean | null; cipherId?: string | null };
    const allRows: RawRow[] = [
        ...directRows,
        ...groupRows,
        ...noCollectionUsers.map(u => ({ ...u, cipherId: null as string | null })),
    ];

    const grouped = new Map<string, {
        userGuid: string;
        userName: string | null;
        email: string;
        usesKeyConnector: boolean;
        cipherIds: Set<string>;
    }>();

    for (const row of allRows) {
        let entry = grouped.get(row.userGuid);
        if (!entry) {
            entry = {
                userGuid: row.userGuid,
                userName: row.userName,
                email: row.email,
                usesKeyConnector: row.usesKeyConnector ?? false,
                cipherIds: new Set(),
            };
            grouped.set(row.userGuid, entry);
        }
        if (row.cipherId) {
            entry.cipherIds.add(row.cipherId);
        }
    }

    const result = Array.from(grouped.values()).map(entry => ({
        userGuid: entry.userGuid,
        userName: entry.userName,
        email: entry.email,
        usesKeyConnector: entry.usesKeyConnector,
        cipherIds: Array.from(entry.cipherIds),
    }));

    return c.json(result);
});

// ==================== 响应转换 ====================

function toOrganizationReportResponse(row: OrganizationReportRow) {
    return {
        id: row.id,
        organizationId: row.organizationId,
        reportData: row.reportData,
        contentEncryptionKey: row.contentEncryptionKey,
        summaryData: row.summaryData ?? null,
        applicationData: row.applicationData ?? null,
        passwordCount: row.passwordCount ?? null,
        passwordAtRiskCount: row.passwordAtRiskCount ?? null,
        memberCount: row.memberCount ?? null,
        creationDate: row.creationDate,
        revisionDate: row.revisionDate,
    };
}

export default reports;
