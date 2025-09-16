import { useState } from 'react';
import { Settings, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DeveloperSettingsProps {
  onApiKeyChange: (key: string) => void;
}

export function DeveloperSettings({ onApiKeyChange }: DeveloperSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');

  const handleSave = () => {
    const trimmedKey = keyInput.trim();
    localStorage.setItem('google-maps-api-key-override', trimmedKey);
    onApiKeyChange(trimmedKey);
    setIsOpen(false);
  };

  const handleClear = () => {
    setKeyInput('');
    localStorage.removeItem('google-maps-api-key-override');
    onApiKeyChange('');
    setIsOpen(false);
  };

  return (
    <TooltipProvider>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-4 right-4 z-20 bg-white/90 backdrop-blur-sm border border-gray-200 hover:bg-gray-50"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Developer Settings</p>
          </TooltipContent>
        </Tooltip>
        
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Developer Settings
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="api-key" className="text-sm font-medium">
                Google Maps API Key Override
              </Label>
              <div className="mt-1 flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="api-key"
                    type={showKey ? 'text' : 'password'}
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="Enter your API key..."
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-600">
                💡 Remember to restrict your API key by HTTP referrer in Google Cloud Console for security.
              </p>
            </div>
            
            <div className="flex gap-2">
              <Button onClick={handleSave} className="flex-1">
                Save Override
              </Button>
              <Button onClick={handleClear} variant="outline">
                Clear
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}