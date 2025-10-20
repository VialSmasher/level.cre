import { useState } from 'react';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalTrigger } from '@/components/primitives/Modal';
import { apiRequest } from '@/lib/queryClient';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DeveloperSettingsProps { onApiKeyChange?: (key: string) => void }

export function DeveloperSettings({ onApiKeyChange }: DeveloperSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleResetDemo = async () => {
    try {
      setResetting(true);
      await apiRequest('POST', '/api/demo/reset', {});
      window.location.reload();
    } catch (e) {
      console.error('Reset demo failed:', e);
      setResetting(false);
    }
  };

  return (
    <TooltipProvider>
      <Modal open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <ModalTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-4 right-4 z-20 bg-white/90 backdrop-blur-sm border border-gray-200 hover:bg-gray-50"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </ModalTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Developer Settings</p>
          </TooltipContent>
        </Tooltip>
        
        <ModalContent className="sm:max-w-md">
          <ModalHeader>
            <ModalTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Developer Settings
            </ModalTitle>
          </ModalHeader>
          
          <div className="space-y-4">
            <div className="pt-3">
              <Label className="text-sm font-medium">Demo Utilities</Label>
              <div className="mt-2 flex gap-2">
                <Button onClick={handleResetDemo} variant="destructive" disabled={resetting}>
                  {resetting ? 'Resetting…' : 'Reset Demo Data'}
                </Button>
              </div>
              <p className="mt-2 text-xs text-gray-600">
                Clears demo prospects, requirements, interactions, and profile.
              </p>
            </div>
          </div>
        </ModalContent>
      </Modal>
    </TooltipProvider>
  );
}
