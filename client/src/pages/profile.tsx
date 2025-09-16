import { useState, useEffect } from "react";
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { User, Settings, Palette, Bell, Shield, Download, Upload, Plus, X } from "lucide-react";
import { Prospect, Submarket } from "@shared/schema";
import { nsKey, readJSON, writeJSON } from '@/lib/storage';
import { useToast } from "@/hooks/use-toast";

export default function ProfilePage() {
  const { user } = useAuth();
  const { profile, updateSubmarkets, isUpdating } = useProfile();
  const { toast } = useToast();

  // Fetch data from database
  const { data: prospects = [] } = useQuery<Prospect[]>({
    queryKey: ['/api/prospects'],
  });

  const { data: submarkets = [] } = useQuery<Submarket[]>({
    queryKey: ['/api/submarkets'],
  });

  // Control Panel State
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [isControlPanelCollapsed, setIsControlPanelCollapsed] = useState(false);

  // Settings State
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  
  // Submarket Management State
  const [newSubmarket, setNewSubmarket] = useState("");
  
  // Company Management State
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyName, setCompanyName] = useState("");
  

  useEffect(() => {
    // Load saved settings from localStorage
    const savedFilters = readJSON<any>(nsKey(user?.id, 'mapFilters'), null);
    const savedSettings = readJSON<any>(nsKey(user?.id, 'userSettings'), null);

    if (savedFilters) {
      setSelectedStatuses(savedFilters.selectedStatuses || []);
    }
    if (savedSettings) {
      setEmailNotifications(savedSettings.emailNotifications ?? true);
      setDarkMode(savedSettings.darkMode ?? false);
      setAutoSave(savedSettings.autoSave ?? true);
    }
    
    // Load company name from profile
    if (profile?.company) {
      setCompanyName(profile.company);
    }
  }, [user?.id, profile]);

  const saveSettings = () => {
    const settings = {
      emailNotifications,
      darkMode,
      autoSave,
    };
    writeJSON(nsKey(user?.id, 'userSettings'), settings);
  };

  const exportData = () => {
    const data = {
      prospects,
      submarkets,
      filters: { selectedStatuses },
      timestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prospect-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  const handleUpdateCompany = async () => {
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ company: companyName.trim() })
      });

      if (response.ok) {
        setEditingCompany(false);
        toast({
          title: "Company updated",
          description: "Your company name has been updated successfully.",
        });
        // Refresh profile data
        window.location.reload();
      } else {
        throw new Error('Failed to update company');
      }
    } catch (error) {
      toast({
        title: "Update failed",
        description: "Failed to update company name. Please try again.",
        variant: "destructive",
      });
    }
  };

  const statusOptions = [
    { value: 'prospect', label: 'Prospect', color: 'bg-gray-500' },
    { value: 'contacted', label: 'Contacted', color: 'bg-blue-500' },
    { value: 'followup', label: 'Follow-up', color: 'bg-yellow-500' },
    { value: 'listing', label: 'Listing', color: 'bg-purple-500' },
    { value: 'client', label: 'Client', color: 'bg-green-500' },
    { value: 'no_go', label: 'No Go', color: 'bg-red-500' }
  ];

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

        {/* Company Management */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <User className="h-6 w-6 text-blue-600" />
              <div>
                <CardTitle>Company Information</CardTitle>
                <CardDescription>Manage your company details</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-base font-medium">Company Name</Label>
              {editingCompany ? (
                <div className="flex gap-2 mt-2">
                  <Input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Enter company name..."
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleUpdateCompany();
                      }
                    }}
                  />
                  <Button onClick={handleUpdateCompany} size="sm">
                    Save
                  </Button>
                  <Button 
                    onClick={() => {
                      setEditingCompany(false);
                      setCompanyName(profile?.company || '');
                    }} 
                    variant="outline" 
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-gray-600">
                    {profile?.company || 'No company name set'}
                  </span>
                  <Button 
                    onClick={() => setEditingCompany(true)} 
                    variant="outline" 
                    size="sm"
                  >
                    Edit
                  </Button>
                </div>
              )}
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
                  {statusOptions.map((status) => (
                    <div key={status.value} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={status.value}
                        checked={selectedStatuses.includes(status.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedStatuses([...selectedStatuses, status.value]);
                          } else {
                            setSelectedStatuses(selectedStatuses.filter(s => s !== status.value));
                          }
                        }}
                        className="rounded"
                      />
                      <label htmlFor={status.value} className="flex items-center gap-2 text-sm">
                        <div className={`w-3 h-3 rounded-full ${status.color}`}></div>
                        {status.label}
                      </label>
                    </div>
                  ))}
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
                    <Button onClick={exportData} variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Export Data
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