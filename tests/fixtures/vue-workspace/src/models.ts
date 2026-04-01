export interface Account {
  id: string;
  roles: Array<'admin' | 'member'>;
}

export interface EmitPayload {
  accountId: string;
  source: 'manual' | 'auto';
}
