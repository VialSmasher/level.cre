import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  return {
    user: user as User | undefined,
    isLoading,
    isAuthenticated: !!user,
  };
}

export function useDemoAuth() {
  const queryClient = useQueryClient();

  const { data: demoUser, isLoading } = useQuery({
    queryKey: ["/api/auth/demo/user"],
    retry: false,
  });

  const loginDemo = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/auth/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to login as demo user');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/demo/user"] });
    },
  });

  return {
    demoUser: demoUser as User | undefined,
    isLoading,
    isDemoAuthenticated: !!demoUser,
    loginDemo: loginDemo.mutate,
    isLoggingIn: loginDemo.isPending,
  };
}