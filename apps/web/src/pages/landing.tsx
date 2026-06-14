import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getOAuthCallbackPath } from '@/lib/authUtils';
import {
  clearStoredPostAuthRedirect,
  getStoredPostAuthRedirect,
  setStoredPostAuthRedirect,
} from '@/lib/postAuthRedirect';
import { supabase } from '@/lib/supabase';
import {
  ArrowRight,
  Bell,
  Building2,
  CalendarClock,
  Camera,
  Gift,
  Home,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Sparkles,
  WalletCards,
  Wrench,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';

export default function Landing() {
  const { user, loading, signInWithGoogle, signInWithEmail } = useAuth();
  const [, setLocation] = useLocation();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [email, setEmail] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isOpeningDemo, setIsOpeningDemo] = useState(false);
  const { toast } = useToast();
  const hasPrefetched = useRef(false);
  const ENABLE_GOOGLE = (import.meta.env.VITE_ENABLE_GOOGLE_AUTH === '1' || import.meta.env.VITE_ENABLE_GOOGLE_AUTH === 'true');

  const redirectAuthenticatedUser = () => {
    const nextPath = getStoredPostAuthRedirect() || '/launcher';
    clearStoredPostAuthRedirect();
    setLocation(nextPath);
  };

  const prefetchApp = () => {
    if (hasPrefetched.current) return;
    hasPrefetched.current = true;
    import('./resident-loyalty');
    import('./resident-loyalty-resident-demo');
    import('./home');
    import('../components/AppLayout');
  };

  useEffect(() => {
    const t = setTimeout(prefetchApp, 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || loading || user) return;

    const oauthCallbackPath = getOAuthCallbackPath({ includeHashTokens: false });
    if (!oauthCallbackPath) return;

    if (import.meta?.env?.DEV) console.log('[auth] Landing forwarding OAuth code ->', oauthCallbackPath);
    window.location.replace(oauthCallbackPath);
  }, [loading, user]);

  useEffect(() => {
    if (typeof window === 'undefined' || loading || user || !supabase) return;

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    if (!accessToken || !refreshToken) return;

    let cancelled = false;

    async function restoreImplicitSession() {
      setIsSigningIn(true);
      try {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) throw error;
        if (cancelled) return;
        window.location.replace('/');
      } catch (err: any) {
        console.error('Implicit OAuth session restore failed:', err);
        if (cancelled) return;

        const params = new URLSearchParams({ error: 'oauth_callback_failed' });
        if (err?.message) {
          params.set('error_description', err.message);
        }
        const nextLocation = `/?${params.toString()}`;
        window.location.replace(nextLocation);
      } finally {
        if (!cancelled) {
          setIsSigningIn(false);
        }
      }
    }

    restoreImplicitSession();
    return () => { cancelled = true; };
  }, [loading, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    const authError = url.searchParams.get('error');
    if (!authError) return;

    if (user && user.id !== 'demo-user') {
      url.searchParams.delete('error');
      url.searchParams.delete('error_description');
      const cleanedUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(window.history.state, '', cleanedUrl);
      redirectAuthenticatedUser();
      return;
    }

    const authErrorDescription = url.searchParams.get('error_description');
    const fallbackDescription =
      authError === 'auth_not_configured'
        ? 'Supabase auth is not configured for this environment.'
        : authError === 'missing_auth_code'
          ? 'Google returned to the app without an authorization code.'
          : 'Please try Google sign-in again.';

    toast({
      title: 'Google sign-in failed',
      description: authErrorDescription || fallbackDescription,
      variant: 'destructive',
    });

    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    const cleanedUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, '', cleanedUrl);
  }, [toast, user, setLocation]);

  useEffect(() => {
    if (!loading && user && user.id !== 'demo-user') {
      redirectAuthenticatedUser();
    }
  }, [loading, user, setLocation]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (loading || !user || user.id === 'demo-user') return;
    const hash = window.location.hash || '';
    const returnedFromImplicitOAuth =
      hash.includes('access_token=') || hash.includes('refresh_token=');
    if (!returnedFromImplicitOAuth) return;

    const nextPath = getStoredPostAuthRedirect() || '/launcher';
    clearStoredPostAuthRedirect();
    window.history.replaceState({}, '', nextPath);
    setLocation(nextPath);
  }, [loading, user, setLocation]);

  const handleGoogle = async () => {
    if (!ENABLE_GOOGLE) return;
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      await signInWithGoogle(getStoredPostAuthRedirect() || '/launcher');
    } catch (err: any) {
      console.error('Google sign-in error:', err);
      toast({ title: 'Sign-in unavailable', description: err?.message || 'Please try again later', variant: 'destructive' });
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleEmailSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSendingEmail || isSigningIn || isOpeningDemo) return;
    setIsSendingEmail(true);
    try {
      setStoredPostAuthRedirect(getStoredPostAuthRedirect() || '/launcher');
      await signInWithEmail(email);
      toast({
        title: 'Check your email',
        description: 'We sent a sign-in link. Open it in this browser to continue.',
      });
    } catch (err: any) {
      toast({
        title: 'Email sign-in unavailable',
        description: err?.message || 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const openResidentPrototype = () => {
    if (isOpeningDemo) return;
    setIsOpeningDemo(true);
    prefetchApp();
    setLocation('/resident-loyalty');
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#111412]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-[#f6c451]"></div>
          <p className="text-white/65">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111412] text-white">
      <header className="border-b border-white/10 px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f6c451] text-stone-950">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-black">Living Rewards</p>
              <p className="text-xs text-white/55">Resident loyalty for multifamily operations</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white" asChild>
              <Link href="/resident-loyalty/resident-demo">Resident app</Link>
            </Button>
            <Button className="bg-[#f6c451] text-stone-950 hover:bg-[#ffd76a]" onClick={openResidentPrototype}>
              Open prototype
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
        <section className="grid min-h-[calc(100vh-9rem)] gap-8 lg:grid-cols-[1fr_430px] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-[#f6c451]">
              <Sparkles className="h-4 w-4" />
              Resident rewards prototype, without payments or card rails
            </div>
            <h1 className="mt-6 max-w-4xl text-5xl font-black leading-none md:text-7xl">
              A rewards app residents have a reason to open.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/68 md:text-lg">
              Reward residents for useful behavior: on-time rent habits, acknowledged notices, better maintenance
              requests, confirmed access, early renewal interest, and move-in checklists. The landlord gets fewer
              follow-ups. The resident gets points, local perks, and flexible mock rewards.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-white/[0.07] p-4">
                <WalletCards className="h-5 w-5 text-[#f6c451]" />
                <p className="mt-3 font-black">Points wallet</p>
                <p className="mt-1 text-sm text-white/60">Rent streaks and home missions</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.07] p-4">
                <MapPin className="h-5 w-5 text-rose-300" />
                <p className="mt-3 font-black">Neighborhood perks</p>
                <p className="mt-1 text-sm text-white/60">Local benefits as an amenity</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.07] p-4">
                <Building2 className="h-5 w-5 text-emerald-300" />
                <p className="mt-3 font-black">Operator ROI</p>
                <p className="mt-1 text-sm text-white/60">Fewer manager chases</p>
              </div>
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <Button className="bg-[#f6c451] text-stone-950 hover:bg-[#ffd76a]" onMouseEnter={prefetchApp} onClick={openResidentPrototype}>
                Launch product demo
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white" asChild>
                <Link href="/resident-loyalty/resident-demo">Open resident wallet</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.07] p-3 shadow-2xl">
            <div className="overflow-hidden rounded-lg bg-[#fbf7ee] text-stone-950">
              <div className="relative h-40">
                <img
                  src="https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=900&q=80"
                  alt="Modern apartment living space"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-stone-950/75 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 text-white">
                  <p className="text-xs font-semibold uppercase text-[#f6c451]">Connected home</p>
                  <p className="mt-1 text-2xl font-black">Maclaren House</p>
                </div>
              </div>
              <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-stone-500">Demo resident</p>
                  <p className="mt-1 text-2xl font-black">Amelia Wong</p>
                  <p className="mt-1 text-sm text-stone-600">Maclaren House, Unit 101</p>
                </div>
                <div className="rounded-lg bg-stone-950 p-2 text-[#f6c451]">
                  <WalletCards className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-5 rounded-lg bg-stone-950 p-5 text-white">
                <p className="text-xs text-white/55">Available points</p>
                <p className="mt-2 text-5xl font-black">375</p>
                <p className="mt-2 text-sm text-white/65">875 lifetime points, 7 month rent streak</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-stone-200 p-3">
                  <Camera className="h-4 w-4 text-emerald-700" />
                  <p className="mt-2 text-sm font-black">Add repair photos</p>
                  <p className="mt-1 text-xs text-stone-600">+100 points</p>
                </div>
                <div className="rounded-lg border border-stone-200 p-3">
                  <KeyRound className="h-4 w-4 text-sky-700" />
                  <p className="mt-2 text-sm font-black">Confirm access</p>
                  <p className="mt-1 text-xs text-stone-600">+150 points</p>
                </div>
                <div className="rounded-lg border border-stone-200 p-3">
                  <Bell className="h-4 w-4 text-rose-700" />
                  <p className="mt-2 text-sm font-black">Acknowledge notice</p>
                  <p className="mt-1 text-xs text-stone-600">+25 points</p>
                </div>
                <div className="rounded-lg border border-stone-200 p-3">
                  <CalendarClock className="h-4 w-4 text-amber-700" />
                  <p className="mt-2 text-sm font-black">Renewal interest</p>
                  <p className="mt-1 text-xs text-stone-600">+500 points</p>
                </div>
              </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 py-8 md:grid-cols-[1fr_1fr]">
          <div className="rounded-lg border border-white/10 bg-white/[0.07] p-5">
            <h2 className="text-2xl font-black">Sign in for the existing workspace</h2>
            <p className="mt-2 text-sm leading-6 text-white/65">
              Auth still routes to the current Level CRE workspace so existing functionality remains intact.
            </p>
            {!loading && user && user.id !== 'demo-user' ? (
              <div className="mt-4">
                <Button onClick={() => setLocation('/launcher')} className="bg-[#f6c451] text-stone-950 hover:bg-[#ffd76a]">
                  Continue to workspace
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <p className="mt-2 text-xs text-white/55">Signed in as {user.email}</p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <form onSubmit={handleEmailSignIn} className="flex w-full flex-col gap-2 sm:flex-row">
                  <Input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    autoComplete="email"
                    disabled={isSendingEmail || isSigningIn || isOpeningDemo}
                    className="h-11 border-white/15 bg-white text-stone-950"
                  />
                  <Button
                    type="submit"
                    onMouseEnter={prefetchApp}
                    disabled={isSendingEmail || isSigningIn || isOpeningDemo || !email.trim()}
                    className="h-11 bg-[#f6c451] px-5 text-sm font-medium text-stone-950 hover:bg-[#ffd76a] disabled:opacity-50"
                  >
                    {isSendingEmail ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending
                      </>
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        Email link
                      </>
                    )}
                  </Button>
                </form>
                {ENABLE_GOOGLE && (
                  <Button
                    onMouseEnter={prefetchApp}
                    onClick={handleGoogle}
                    disabled={isSigningIn || isOpeningDemo}
                    variant="outline"
                    className="h-11 w-full border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white sm:w-auto"
                    aria-label="Continue with Google"
                  >
                    {isSigningIn ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in
                      </>
                    ) : (
                      <>
                        Continue with Google
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.07] p-5">
            <h2 className="text-2xl font-black">What this prototype is testing</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                [Wrench, 'Better maintenance requests', 'Photos and access details up front'],
                [Bell, 'Notice records', 'Positive acknowledgement loop'],
                [MapPin, 'Neighborhood as amenity', 'Local perks around the building'],
                [Gift, 'Flexible mock rewards', 'Rent, lifestyle, travel, and building perks'],
              ].map(([Icon, title, detail]) => {
                const TypedIcon = Icon as typeof Wrench;
                return (
                  <div key={title as string} className="rounded-lg bg-white/10 p-3">
                    <TypedIcon className="h-4 w-4 text-[#f6c451]" />
                    <p className="mt-2 font-semibold">{title as string}</p>
                    <p className="mt-1 text-xs leading-5 text-white/55">{detail as string}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <footer className="flex flex-wrap items-center gap-3 border-t border-white/10 py-5 text-xs text-white/45">
          <a href="/privacy" className="hover:text-white underline underline-offset-2">Privacy</a>
          <span>/</span>
          <a href="/terms" className="hover:text-white underline underline-offset-2">Terms</a>
          <span>/</span>
          <a href="mailto:support@example.com" className="hover:text-white underline underline-offset-2">Contact</a>
        </footer>
      </main>
    </div>
  );
}
