import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Welcome to level.cre</CardTitle>
          <CardDescription>
            Sign in to access your account and start managing your data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            className="w-full" 
            onClick={() => window.location.href = '/api/login'}
            data-testid="button-login"
          >
            Sign In with Google
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            Secure authentication powered by Google
          </p>
        </CardContent>
      </Card>
    </div>
  );
}