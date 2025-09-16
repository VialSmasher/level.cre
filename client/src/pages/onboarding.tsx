import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { useLocation } from 'wouter'
import { useAuth } from '@/contexts/AuthContext'
import { useMutation } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { ChevronRight, ChevronLeft, User, Building, Target } from 'lucide-react'

interface ProfileData {
  name: string
  company: string
  email: string
  marketCity: string
  submarkets: string[]
  assetClasses: string[]
}

export default function Onboarding() {
  const [, setLocation] = useLocation()
  const { user, setNeedsOnboarding } = useAuth()
  const [currentStep, setCurrentStep] = useState(1)
  
  const [profile, setProfile] = useState<ProfileData>({
    name: user?.user_metadata?.full_name || '',
    company: '',
    email: user?.email || '',
    marketCity: 'Edmonton',
    submarkets: ['NW', 'NE', 'SW', 'SE'],
    assetClasses: []
  })

  const [customSubmarket, setCustomSubmarket] = useState('')

  const createProfileMutation = useMutation({
    mutationFn: async (data: ProfileData) => {
      const response = await apiRequest('POST', '/api/profile', data)
      return response.json()
    },
    onSuccess: () => {
      setNeedsOnboarding(false)
      setLocation('/app')
    },
    onError: (error) => {
      console.error('Error creating profile:', error)
    }
  })

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1)
    } else {
      // Submit profile
      createProfileMutation.mutate(profile)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSubmarketToggle = (submarket: string) => {
    setProfile(prev => ({
      ...prev,
      submarkets: prev.submarkets.includes(submarket)
        ? prev.submarkets.filter(s => s !== submarket)
        : [...prev.submarkets, submarket]
    }))
  }

  const handleAddCustomSubmarket = () => {
    if (customSubmarket && !profile.submarkets.includes(customSubmarket)) {
      setProfile(prev => ({
        ...prev,
        submarkets: [...prev.submarkets, customSubmarket]
      }))
      setCustomSubmarket('')
    }
  }

  const handleAssetClassToggle = (assetClass: string) => {
    setProfile(prev => ({
      ...prev,
      assetClasses: prev.assetClasses.includes(assetClass)
        ? prev.assetClasses.filter(a => a !== assetClass)
        : [...prev.assetClasses, assetClass]
    }))
  }

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <User className="h-12 w-12 text-blue-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold">Tell us about yourself</h2>
        <p className="text-gray-600">Let's get your profile set up</p>
      </div>
      
      <div className="space-y-4">
        <div>
          <Label htmlFor="name">Full Name</Label>
          <Input
            id="name"
            value={profile.name}
            onChange={(e) => setProfile(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Your full name"
          />
        </div>
        
        <div>
          <Label htmlFor="company">Company</Label>
          <Input
            id="company"
            value={profile.company}
            onChange={(e) => setProfile(prev => ({ ...prev, company: e.target.value }))}
            placeholder="Your company name"
          />
        </div>
        
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            value={profile.email}
            onChange={(e) => setProfile(prev => ({ ...prev, email: e.target.value }))}
            placeholder="your.email@company.com"
            disabled
          />
        </div>
        
        <div>
          <Label htmlFor="marketCity">Market City</Label>
          <Input
            id="marketCity"
            value={profile.marketCity}
            onChange={(e) => setProfile(prev => ({ ...prev, marketCity: e.target.value }))}
            placeholder="Edmonton"
          />
        </div>
      </div>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <Building className="h-12 w-12 text-blue-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold">Choose your submarkets</h2>
        <p className="text-gray-600">Select areas you want to focus on</p>
      </div>
      
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {['NW', 'NE', 'SW', 'SE', 'Downtown', 'Airport', 'Industrial'].map((submarket) => (
            <div key={submarket} className="flex items-center space-x-2">
              <Checkbox
                id={submarket}
                checked={profile.submarkets.includes(submarket)}
                onCheckedChange={() => handleSubmarketToggle(submarket)}
              />
              <Label htmlFor={submarket} className="text-sm font-medium">
                {submarket}
              </Label>
            </div>
          ))}
        </div>
        
        <div className="flex space-x-2">
          <Input
            value={customSubmarket}
            onChange={(e) => setCustomSubmarket(e.target.value)}
            placeholder="Add custom submarket"
            onKeyPress={(e) => e.key === 'Enter' && handleAddCustomSubmarket()}
          />
          <Button onClick={handleAddCustomSubmarket} variant="outline">
            Add
          </Button>
        </div>

        {profile.submarkets.length > 0 && (
          <div className="mt-4">
            <Label className="text-sm font-medium">Selected submarkets:</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {profile.submarkets.map((submarket) => (
                <span
                  key={submarket}
                  className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium"
                >
                  {submarket}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <Target className="h-12 w-12 text-blue-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold">Asset Classes</h2>
        <p className="text-gray-600">What type of properties do you work with?</p>
      </div>
      
      <div className="space-y-6">
        <div>
          <Label className="text-base font-medium">Select Asset Classes (optional)</Label>
          <div className="grid grid-cols-2 gap-3 mt-3">
            {['industrial', 'investment', 'retail', 'office'].map((assetClass) => (
              <div key={assetClass} className="flex items-center space-x-2">
                <Checkbox
                  id={assetClass}
                  checked={profile.assetClasses.includes(assetClass)}
                  onCheckedChange={() => handleAssetClassToggle(assetClass)}
                />
                <Label htmlFor={assetClass} className="text-sm font-medium capitalize">
                  {assetClass}
                </Label>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">You can skip this and set it up later</p>
        </div>
      </div>
    </div>
  )

  const canContinue = () => {
    switch (currentStep) {
      case 1:
        return profile.name && profile.company && profile.marketCity
      case 2:
        return profile.submarkets.length > 0
      case 3:
        return true // Asset classes are now optional
      default:
        return false
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex justify-between items-center mb-4">
            <div className="flex space-x-2">
              {[1, 2, 3].map((step) => (
                <div
                  key={step}
                  className={`w-3 h-3 rounded-full ${
                    step <= currentStep ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
            <span className="text-sm text-gray-600">
              Step {currentStep} of 3
            </span>
          </div>
        </CardHeader>
        
        <CardContent>
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          
          <div className="flex justify-between mt-8">
            <Button
              onClick={handleBack}
              variant="outline"
              disabled={currentStep === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            
            <Button
              onClick={handleNext}
              disabled={!canContinue() || createProfileMutation.isPending}
              className="ml-auto"
            >
              {currentStep === 3 ? (
                createProfileMutation.isPending ? 'Creating...' : 'Complete Setup'
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}