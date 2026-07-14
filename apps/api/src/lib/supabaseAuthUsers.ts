type SupabaseAuthUser = {
  id: string;
  email?: string | null;
};

type SupabaseAdminClient = {
  auth: {
    admin: {
      listUsers: (options: { page: number; perPage: number }) => Promise<{
        data?: { users?: SupabaseAuthUser[] } | null;
        error?: { message?: string } | null;
      }>;
    };
  };
};

export async function findSupabaseAuthUserByEmail(
  admin: SupabaseAdminClient,
  email: string,
  options: { perPage?: number; maxPages?: number } = {},
): Promise<SupabaseAuthUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const perPage = options.perPage ?? 1000;
  const maxPages = options.maxPages ?? 100;

  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message || 'Failed to list Supabase auth users');

    const authUsers = Array.isArray(data?.users) ? data.users : [];
    const match = authUsers.find((user) => user.email?.trim().toLowerCase() === normalizedEmail);
    if (match) return match;
    if (authUsers.length < perPage) return null;
  }

  throw new Error(`Supabase auth user lookup exceeded ${maxPages} pages`);
}
