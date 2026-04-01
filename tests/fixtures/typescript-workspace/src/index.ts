type User = {
  profile: {
    id: string;
    tags: string[];
  };
  preferences: Record<string, { enabled: boolean; label: string }>;
};

export type ExpandedUser = User;

type AuditTrail = {
  summary: {
    createdBy: string;
    createdAt: string;
    environment: 'production' | 'staging';
    releaseChannel: 'stable' | 'preview';
  };
  events: Array<{
    id: string;
    actor: {
      id: string;
      role: 'admin' | 'member';
    };
    metadata: {
      source: 'web' | 'api';
      tags: string[];
      region: 'us' | 'eu' | 'apac';
      requestId: string;
    };
    latencyMs: number;
  }>;
  checkpoints: Array<{
    name: string;
    status: 'pending' | 'completed';
    owner: {
      id: string;
      team: 'platform' | 'product';
    };
  }>;
  notifications: Array<{
    channel: 'email' | 'slack';
    deliveredAt: string;
    recipient: {
      id: string;
      locale: 'en' | 'zh';
    };
  }>;
  retentionPolicy: {
    days: number;
    archiveBucket: string;
    legalHold: boolean;
  };
  integrations: Record<
    string,
    {
      enabled: boolean;
      endpoint: string;
      retries: number;
    }
  >;
};

export type ExpandedAuditTrail = AuditTrail;

export const user: ExpandedUser = {
  profile: {
    id: 'user-1',
    tags: ['owner', 'beta'],
  },
  preferences: {
    dashboard: {
      enabled: true,
      label: 'Dashboard',
    },
  },
};

export const auditTrail: ExpandedAuditTrail = {
  summary: {
    createdBy: 'system',
    createdAt: '2026-04-01T00:00:00.000Z',
    environment: 'production',
    releaseChannel: 'stable',
  },
  events: [
    {
      id: 'evt-1',
      actor: {
        id: 'user-1',
        role: 'admin',
      },
      metadata: {
        source: 'web',
        tags: ['login', 'security'],
        region: 'us',
        requestId: 'req-1',
      },
      latencyMs: 32,
    },
  ],
  checkpoints: [
    {
      name: 'review',
      status: 'completed',
      owner: {
        id: 'user-2',
        team: 'platform',
      },
    },
  ],
  notifications: [
    {
      channel: 'email',
      deliveredAt: '2026-04-01T00:05:00.000Z',
      recipient: {
        id: 'user-3',
        locale: 'en',
      },
    },
  ],
  retentionPolicy: {
    days: 30,
    archiveBucket: 'audit-archive',
    legalHold: false,
  },
  integrations: {
    pagerduty: {
      enabled: true,
      endpoint: 'https://example.test/pagerduty',
      retries: 2,
    },
  },
};
