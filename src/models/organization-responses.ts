/**
 * Organization Response Models
 * 对应官方：
 * - OrganizationResponseModel
 * - ProfileOrganizationResponseModel (BaseProfileOrganizationResponseModel)
 * - OrganizationUserDetailsResponseModel
 */

/**
 * OrganizationResponseModel - GET/POST/PUT /organizations/{id}
 * 对应官方 Api/AdminConsole/Models/Response/Organizations/OrganizationResponseModel.cs
 */
export function toOrganizationResponse(org: any) {
    return {
        id: org.id,
        identifier: org.identifier ?? null,
        name: org.name,
        businessName: org.businessName ?? null,
        businessAddress1: org.businessAddress1 ?? null,
        businessAddress2: org.businessAddress2 ?? null,
        businessAddress3: org.businessAddress3 ?? null,
        businessCountry: org.businessCountry ?? null,
        businessTaxNumber: org.businessTaxNumber ?? null,
        billingEmail: org.billingEmail,
        plan: buildPlanResponse(org),
        planType: org.planType ?? 0,
        seats: org.seats ?? null,
        maxAutoscaleSeats: org.maxAutoscaleSeats ?? null,
        maxCollections: org.maxCollections ?? null,
        maxStorageGb: org.maxStorageGb ?? null,
        usePolicies: org.usePolicies ?? false,
        useSso: org.useSso ?? false,
        useKeyConnector: org.useKeyConnector ?? false,
        useScim: org.useScim ?? false,
        useGroups: org.useGroups ?? false,
        useDirectory: org.useDirectory ?? false,
        useEvents: org.useEvents ?? true,
        useTotp: org.useTotp ?? true,
        use2fa: org.use2fa ?? true,
        useApi: org.useApi ?? true,
        useResetPassword: org.useResetPassword ?? false,
        useSecretsManager: org.useSecretsManager ?? false,
        usersGetPremium: org.usersGetPremium ?? true,
        useCustomPermissions: org.useCustomPermissions ?? false,
        selfHost: org.selfHost ?? true,
        hasPublicAndPrivateKeys: !!(org.publicKey && org.privateKey),
        usePasswordManager: org.usePasswordManager ?? true,
        smSeats: org.smSeats ?? null,
        smServiceAccounts: org.smServiceAccounts ?? null,
        maxAutoscaleSmSeats: org.maxAutoscaleSmSeats ?? null,
        maxAutoscaleSmServiceAccounts: org.maxAutoscaleSmServiceAccounts ?? null,
        limitCollectionCreation: org.limitCollectionCreation ?? false,
        limitCollectionDeletion: org.limitCollectionDeletion ?? false,
        limitItemDeletion: org.limitItemDeletion ?? false,
        allowAdminAccessToAllCollectionItems: org.allowAdminAccessToAllCollectionItems ?? true,
        useRiskInsights: org.useRiskInsights ?? false,
        useOrganizationDomains: org.useOrganizationDomains ?? false,
        useAdminSponsoredFamilies: org.useAdminSponsoredFamilies ?? false,
        useAutomaticUserConfirmation: org.useAutomaticUserConfirmation ?? false,
        useDisableSmAdsForUsers: org.useDisableSmAdsForUsers ?? false,
        usePhishingBlocker: org.usePhishingBlocker ?? false,
        useMyItems: org.useMyItems ?? true,
        object: 'organization',
    };
}

/**
 * ProfileOrganizationResponseModel - 用于 Sync
 * 对应官方 Api/AdminConsole/Models/Response/ProfileOrganizationResponseModel.cs
 */
export function toProfileOrganizationResponse(org: any, orgUser: any) {
    const planType = org.planType ?? 0;
    return {
        id: org.id,
        userId: orgUser.userId ?? null,
        name: org.name,
        identifier: org.identifier ?? null,
        key: orgUser.key ?? null,
        status: orgUser.status,
        type: orgUser.type,
        enabled: org.enabled ?? true,
        // productTierType: 对应 PlanType.GetProductTier()
        // 0=Free->0, 1=PersonalAnnual->0, ...
        // 简化映射: Free=0, Families=1, Teams=2, Enterprise=3
        productTierType: getProductTierType(planType),
        planProductType: planType,
        usePolicies: org.usePolicies ?? false,
        useSso: org.useSso ?? false,
        useKeyConnector: org.useKeyConnector ?? false,
        useScim: org.useScim ?? false,
        useGroups: org.useGroups ?? false,
        useDirectory: org.useDirectory ?? false,
        useEvents: org.useEvents ?? true,
        useTotp: org.useTotp ?? true,
        use2fa: org.use2fa ?? true,
        useApi: org.useApi ?? true,
        useResetPassword: org.useResetPassword ?? false,
        useSecretsManager: org.useSecretsManager ?? false,
        usePasswordManager: org.usePasswordManager ?? true,
        usersGetPremium: org.usersGetPremium ?? true,
        useCustomPermissions: org.useCustomPermissions ?? false,
        useActivateAutofillPolicy: getProductTierType(planType) === 3, // Enterprise only
        useRiskInsights: org.useRiskInsights ?? false,
        useOrganizationDomains: org.useOrganizationDomains ?? false,
        useAdminSponsoredFamilies: org.useAdminSponsoredFamilies ?? false,
        useAutomaticUserConfirmation: org.useAutomaticUserConfirmation ?? false,
        useDisableSMAdsForUsers: org.useDisableSmAdsForUsers ?? false,
        usePhishingBlocker: org.usePhishingBlocker ?? false,
        useMyItems: org.useMyItems ?? true,
        selfHost: org.selfHost ?? true,
        seats: org.seats ?? null,
        maxCollections: org.maxCollections ?? null,
        maxStorageGb: org.maxStorageGb ?? null,
        hasPublicAndPrivateKeys: !!(org.publicKey && org.privateKey),
        ssoBound: false,
        ssoEnabled: false,
        keyConnectorEnabled: false,
        keyConnectorUrl: null,
        ssoMemberDecryptionType: null,
        resetPasswordEnrolled: !!(orgUser.resetPasswordKey),
        organizationUserId: orgUser.id,
        providerId: null,
        providerName: null,
        providerType: null,
        familySponsorshipFriendlyName: null,
        familySponsorshipAvailable: false,
        familySponsorshipLastSyncDate: null,
        familySponsorshipValidUntil: null,
        familySponsorshipToDelete: null,
        userIsClaimedByOrganization: false,
        userIsManagedByOrganization: false,
        isAdminInitiated: false,
        accessSecretsManager: orgUser.accessSecretsManager ?? false,
        limitCollectionCreation: org.limitCollectionCreation ?? false,
        limitCollectionDeletion: org.limitCollectionDeletion ?? false,
        limitItemDeletion: org.limitItemDeletion ?? false,
        allowAdminAccessToAllCollectionItems: org.allowAdminAccessToAllCollectionItems ?? true,
        permissions: orgUser.permissions ? JSON.parse(orgUser.permissions) : null,
        object: 'profileOrganization',
    };
}

/**
 * OrganizationUserUserDetailsResponseModel - GET /organizations/{orgId}/users
 * 对应官方 Api/AdminConsole/Models/Response/Organizations/OrganizationUserUserDetailsResponseModel.cs
 */
export function toOrganizationUserResponse(orgUser: any, user?: any) {
    return {
        id: orgUser.id,
        userId: orgUser.userId ?? null,
        type: orgUser.type,
        status: orgUser.status,
        externalId: orgUser.externalId ?? null,
        accessSecretsManager: orgUser.accessSecretsManager ?? false,
        permissions: orgUser.permissions ? JSON.parse(orgUser.permissions) : null,
        resetPasswordEnrolled: !!(orgUser.resetPasswordKey),
        usesKeyConnector: false,
        hasMasterPassword: true,
        // user info (when joined with user table)
        name: user?.name ?? null,
        email: orgUser.email ?? user?.email ?? null,
        avatarColor: user?.avatarColor ?? null,
        twoFactorEnabled: user?.twoFactorProviders ? true : false,
        ssoBound: false,
        claimedByOrganization: false,
        managedByOrganization: false,
        // collections/groups (populated separately if needed)
        collections: [] as any[],
        groups: [] as any[],
        object: 'organizationUserUserDetails',
    };
}

/**
 * 简单的 PlanResponseModel
 * 对应官方的 PlanResponseModel，自建版简化处理
 */
function buildPlanResponse(org: any) {
    const planType = org.planType ?? 0;
    const planName = org.plan || getPlanName(planType);
    return {
        type: planType,
        product: getProductTierType(planType),
        name: planName,
        isAnnual: true,
        nameLocalizationKey: `plan${planName}`,
        descriptionLocalizationKey: `plan${planName}Desc`,
        canBeUsedByBusiness: planType >= 3,
        trialPeriodDays: null,
        hasSelfHost: true,
        hasPolicies: org.usePolicies ?? false,
        hasGroups: org.useGroups ?? false,
        hasDirectory: org.useDirectory ?? false,
        hasEvents: org.useEvents ?? true,
        hasTotp: org.useTotp ?? true,
        has2fa: org.use2fa ?? true,
        hasApi: org.useApi ?? true,
        hasSso: org.useSso ?? false,
        hasResetPassword: org.useResetPassword ?? false,
        usersGetPremium: org.usersGetPremium ?? true,
        hasCustomPermissions: org.useCustomPermissions ?? false,
        hasScim: org.useScim ?? false,
        maxStorageGb: org.maxStorageGb ?? 1,
        maxCollections: org.maxCollections ?? null,
        baseSeats: org.seats ?? 0,
        maxSeats: null,
        basePrice: 0,
        seatPrice: 0,
        additionalStoragePricePerGb: 0,
        premiumAccessOptionPrice: 0,
        object: 'plan',
    };
}

/**
 * PlanType -> ProductTierType 映射
 * 对应官方 PlanTypeExtensions.GetProductTier()
 */
function getProductTierType(planType: number): number {
    // 0=Free, 1=FamiliesAnnually2019, 2=TeamsMonthly2019, 3=TeamsAnnually2019,
    // 4=EnterpriseMonthly2019, 5=EnterpriseAnnually2019,
    // 6=Custom, 7=FamiliesAnnually, 8=TeamsMonthly2020, 9=TeamsAnnually2020,
    // 10=EnterpriseMonthly2020, 11=EnterpriseAnnually2020,
    // 12=TeamsStarter2023, 13=TeamsMonthly2023, 14=TeamsAnnually2023,
    // 15=EnterpriseMonthly2023, 16=EnterpriseAnnually2023
    if (planType === 0) return 0; // Free
    if (planType === 1 || planType === 7) return 1; // Families
    if ([2, 3, 8, 9, 12, 13, 14].includes(planType)) return 2; // Teams
    if ([4, 5, 10, 11, 15, 16].includes(planType)) return 3; // Enterprise
    if (planType === 6) return 3; // Custom -> Enterprise tier
    return 0;
}

function getPlanName(planType: number): string {
    if (planType === 0) return 'Free';
    if (planType === 1 || planType === 7) return 'Families';
    if ([2, 3, 8, 9, 12, 13, 14].includes(planType)) return 'Teams';
    if ([4, 5, 10, 11, 15, 16].includes(planType)) return 'Enterprise';
    return 'Free';
}
