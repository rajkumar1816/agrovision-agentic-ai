import { Request } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAnon } from './supabaseClient';

export interface AuthenticatedRequestUser {
  id: string;
  email?: string;
}

export interface AuthContext {
  user: AuthenticatedRequestUser;
  accessToken: string;
  client: SupabaseClient;
}

function getUserScopedClient(accessToken: string): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function getAuthContext(request: Request): Promise<AuthContext | null> {
  const authorization = request.header('authorization');
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const client = getSupabaseAnon();
  if (!accessToken || !client) return null;

  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return null;
  const userScopedClient = getUserScopedClient(accessToken);
  if (!userScopedClient) return null;

  return {
    user: { id: data.user.id, email: data.user.email },
    accessToken,
    client: userScopedClient,
  };
}