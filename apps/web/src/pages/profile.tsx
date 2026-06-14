import { useState, useEffect } from "react";
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { User, Settings, Palette, Bell, Shield, Download, Upload, Plus, X, Mail, Copy, RefreshCcw } from "lucide-react";
import { nsKey, readJSON, writeJSON } from '@/lib/storage';
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { STATUS_META, type ProspectStatusType } from "@level-cre/shared/schema";
import { MAP_STATUS_KEYS, createStatusFilterSet } from "@/features/map/statusFilters";

type OutlookConfig = {
  configured: boolean;
  connected: boolean;
  redirectUri?: string;
  connection: null | {
    emailAddress: string | null;
    displayName: string | null;
    status: string;
    lastSyncedAt: string | null;
    errorMessage: string | null;
  };
};

type InboundEmailConfig = {
  configured: boolean;
  intakeAddress: string | null;
  webhookUrl: string;
};

export default function ProfilePage() {
  const { user } = useAuth();
  const { profile, updateSubmarkets, isUpdating } = useProfile();
  const { toast } = useToast();

  const { data: outlookConfig } = useQuery<OutlookConfig>({
    queryKey: ['/api/email/outlook/config'],
  });

  const { data: inboundConfig } = useQuery<InboundEmailConfig>({
    queryKey: ['/api/email/inbound/config'],
  });

  const connectOutlookMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('GET', '/api/ms365/auth-url?returnTo=/app/profile');
      return response.json() as Promise<{ url: string }>;
    },
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });

  const syncOutlookMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/email/outlook/sync', { days: 30 });
      return response.json();
    },
  });

  // Control Panel State
  const [selectedStatuses, setSelectedStatuses] = useState<ProspectStatusType[]>([]);
  const [isControlPanelCollapsed, setIsControlPanelCollapsed] = useState(false);

  // Settings State
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [soundEffects, setSoundEffects] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  
  // Submarket Management State
  const [newSubmarket, setNewSubmarket] = useState("");
  

  useEffect(() => {
    // Load saved settings from localStorage
    const savedFilters = readJSON<any>(nsKey(user?.id, 'mapFilters'), null);
    const savedMapStatuses = readJSON<unknown>(nsKey(user?.id, 'mapStatusFilters'), null);
    const savedSettings = readJSON<any>(nsKey(user?.id, 'userSettings'), null);

    setSelectedStatuses(Array.from(createStatusFilterSet(savedMapStatuses ?? savedFilters?.selectedStatuses)));
    if (savedSettings) {
      setEmailNotifications(savedSettings.emailNotifications ?? true);
      setDarkMode(savedSettings.darkMode ?? false);
      setAutoSave(savedSettings.autoSave ?? true);
      setSoundEffects(savedSettings.soundEffects ?? true);
    } else {
      const legacySound = readJSON<boolean | null>(nsKey(user?.id, 'gamificationSoundEnabled'), null);
      if (typeof legacySound === 'boolean') {
        setSoundEffects(legacySound);
      }
    }
  }, [user?.id]);

  const saveSettings = () => {
    const settings = {
      emailNotifications,
      darkMode,
      autoSave,
      soundEffects,
    };
    writeJSON(nsKey(user?.id, 'userSettings'), settings);
    writeJSON(nsKey(user?.id, 'mapStatusFilters'), selectedStatuses);
    writeJSON(nsKey(user?.id, 'mapFilters'), { selectedStatuses });
  };

  const exportData = async () => {
    setIsExporting(true);
    try {
      const response = await apiRequest('GET', '/api/account/export');
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
      const filename = filenameMatch?.[1] || `level-cre-account-export-${new Date().toISOString().split('T')[0]}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: "Export ready",
        description: "Your account data export has been downloaded.",
      });
    } catch (error) {
      console.error('Error exporting account data:', error);
      toast({
        title: "Export failed",
        description: "Could not generate your account data export.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const importData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        // Note: Import functionality needs to be updated to work with database
        // For now, just show success message
        toast({
          title: "Import functionality",
          description: "Data import will be updated to work with the database in a future update.",
          variant: "default",
        });
      } catch (error) {
        console.error('Error importing data:', error);
        toast({
          title: "Import error",
          description: "Failed to parse the import file.",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleAddSubmarket = () => {
    const trimmed = newSubmarket.trim();
    if (!trimmed) return;

    const current = profile?.submarkets || [];
    const exists = current.some(s => s.toLowerCase() === trimmed.toLowerCase());
    
    if (exists) {
      toast({
        title: "Duplicate submarket",
        description: `"${trimmed}" already exists in your submarkets.`,
        variant: "destructive",
      });
      return;
    }

    const updated = [...current, trimmed];
    updateSubmarkets(updated);
    setNewSubmarket("");
    toast({
      title: "Submarket added",
      description: `"${trimmed}" has been added to your submarkets.`,
    });
  };

  const toggleSelectedStatus = (status: ProspectStatusType) => {
    setSelectedStatuses((current) => (
      current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status]
    ));
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Please log in to access your profile.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-8">
      <div className="max-w-6xl mx-auto px-4 space-y-6">
        {/* Simple Sign-in Status */}
        <div className="text-sm text-gray-600 mb-4">
          {user?.email ? (
            <>Signed in with Google · {user.email}</>
          ) : (
            <>Not signed in.</>
          )}
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Mail className="h-6 w-6 text-blue-600" />
              <div>
                <CardTitle>Email Capture</CardTitle>
                <CardDescription>Configure the capture layer that feeds CRM Activity</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-950">BCC intake</div>
                  <p className="mt-1 text-sm text-slate-600">Use this address from Outlook to capture sent emails.</p>
                </div>
                <Badge variant="outline" className={inboundConfig?.configured ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'}>
                  {inboundConfig?.configured ? 'Ready' : 'Needs setup'}
                </Badge>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input readOnly value={inboundConfig?.intakeAddress || 'No BCC address configured'} className="bg-white" />
                <Button
                  variant="outline"
                  disabled={!inboundConfig?.intakeAddress}
                  onClick={() => inboundConfig?.intakeAddress && navigator.clipboard?.writeText(inboundConfig.intakeAddress)}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-950">Outlook sync</div>
                  <p className="mt-1 text-sm text-slate-600">
                    {outlookConfig?.connected
                      ? outlookConfig.connection?.emailAddress || outlookConfig.connection?.displayName || 'Microsoft 365 connected'
                      : outlookConfig?.configured
                        ? 'OAuth is configured, but not connected.'
                        : `Redirect URI: ${outlookConfig?.redirectUri || '/api/email/outlook/callback'}`}
                  </p>
                </div>
                <Badge variant="outline" className={outlookConfig?.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'}>
                  {outlookConfig?.connected ? 'Connected' : outlookConfig?.configured ? 'Ready' : 'Not configured'}
                </Badge>
              </div>
              {outlookConfig?.connection?.errorMessage ? (
                <p className="mt-2 text-sm text-red-600">{outlookConfig.connection.errorMessage}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {!outlookConfig?.connected ? (
                  <Button
                    variant="outline"
                    disabled={!outlookConfig?.configured || connectOutlookMutation.isPending}
                    onClick={() => connectOutlookMutation.mutate()}
                  >
                    {connectOutlookMutation.isPending ? 'Connecting...' : 'Connect Outlook'}
                  </Button>
                ) : (
                  <Button variant="outline" disabled={syncOutlookMutation.isPending} onClick={() => syncOutlookMutation.mutate()}>
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    {syncOutlookMutation.isPending ? 'Syncing...' : 'Sync 30 days'}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submarkets Management */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Settings className="h-6 w-6 text-blue-600" />
              <div>
                <CardTitle>Submarkets</CardTitle>
                <CardDescription>Manage your submarket categories</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current Submarkets */}
            <div>
              <Label className="text-base font-medium">Current Submarkets</Label>
              <div className="flex flex-wrap gap-2 mt-2 min-h-[2rem]">
                {(profile?.submarkets || []).length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No submarkets added yet</p>
                ) : (
                  (profile?.submarkets || []).map((submarket) => (
                    <Badge key={submarket} variant="secondary" className="flex items-center gap-1">
                      {submarket}
                      <button
                        onClick={() => {
                          const updated = (profile?.submarkets || []).filter(s => s !== submarket);
                          updateSubmarkets(updated);
                          toast({
                            title: "Submarket removed",
                            description: `"${submarket}" has been removed from your submarkets.`,
                          });
                        }}
                        className="ml-1 hover:bg-gray-300 rounded-full p-0.5"
                        disabled={isUpdating}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>
            </div>
            
            {/* Add New Submarket */}
            <div className="flex gap-2">
              <Input
                placeholder="Enter new submarket name..."
                value={newSubmarket}
                onChange={(e) => setNewSubmarket(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubmarket();
                  }
                }}
                disabled={isUpdating}
              />
              <Button
                onClick={handleAddSubmarket}
                disabled={!newSubmarket.trim() || isUpdating}
                size="sm"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Control Panel */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Settings className="h-6 w-6 text-blue-600" />
                <div>
                  <CardTitle>Map Control Panel</CardTitle>
                  <CardDescription>Configure map filters and display options</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Status Filters */}
              <div>
                <Label className="text-base font-medium">Status Filters</Label>
                <p className="text-sm text-gray-600 mb-3">Select which prospect statuses to display on the map</p>
                <div className="grid grid-cols-2 gap-2">
                  {MAP_STATUS_KEYS.map((status) => {
                    const meta = STATUS_META[status];
                    return (
                    <div key={status} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`map-status-${status}`}
                        checked={selectedStatuses.includes(status)}
                        onChange={() => toggleSelectedStatus(status)}
                        className="rounded"
                      />
                      <label htmlFor={`map-status-${status}`} className="flex items-center gap-2 text-sm">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: meta.color }}></div>
                        {meta.label}
                      </label>
                    </div>
                    );
                  })}
                </div>
              </div>


            </CardContent>
          </Card>

          {/* Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Settings className="h-6 w-6 text-blue-600" />
                <div>
                  <CardTitle>Application Settings</CardTitle>
                  <CardDescription>Customize your experience</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Notification Settings */}
              <div>
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-gray-600" />
                  <Label className="text-base font-medium">Notifications</Label>
                </div>
                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="email-notifications">Email Notifications</Label>
                    <Switch
                      id="email-notifications"
                      checked={emailNotifications}
                      onCheckedChange={setEmailNotifications}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="sound-effects">Sound Effects</Label>
                    <Switch
                      id="sound-effects"
                      checked={soundEffects}
                      onCheckedChange={setSoundEffects}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Data Settings */}
              <div>
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-gray-600" />
                  <Label className="text-base font-medium">Data & Privacy</Label>
                </div>
                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auto-save">Auto-save Data</Label>
                    <Switch
                      id="auto-save"
                      checked={autoSave}
                      onCheckedChange={setAutoSave}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={exportData} variant="outline" size="sm" disabled={isExporting}>
                      <Download className="h-4 w-4 mr-2" />
                      {isExporting ? "Exporting..." : "Export Data"}
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <label>
                        <Upload className="h-4 w-4 mr-2" />
                        Import Data
                        <input
                          type="file"
                          accept=".json"
                          onChange={importData}
                          className="hidden"
                        />
                      </label>
                    </Button>
                  </div>
                </div>
              </div>

              <Button onClick={saveSettings} className="w-full">
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
