// Temporary auth for demo purposes until Supabase keys are provided
export const tempAuth = {
  user: null,
  loading: false,
  signInWithGoogle: async () => {
    // Simulate successful sign-in
    console.log('Demo sign-in - Supabase keys needed for real auth')
    window.location.href = '/app'
  },
  signOut: async () => {
    console.log('Demo sign-out')
    window.location.href = '/'
  }
}