import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Plus, Edit, Trash2, Tag, Building, Users, Clock, MapPin } from "lucide-react";
import { Requirement, InsertRequirement, Submarket } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

// Standardized size options for consistent use across Prospects and Requirements
const STANDARD_SIZE_OPTIONS = [
  '< 5,000 SF',
  '5,000 - 10,000 SF',
  '10,000 - 25,000 SF',
  '25,000 - 50,000 SF',
  '50,000 - 100,000 SF',
  '100,000+ SF'
] as const;

// Utility function to format space size for display
const formatSpaceSize = (size: string | undefined): string => {
  if (!size) return '';
  
  // If it's already in the new format (contains commas or >/<), return as-is
  if (size.includes(',') || size.includes('<') || size.includes('>') || size.includes('+')) {
    return size;
  }
  
  // Map old machine-readable values to human-readable format
  const sizeMapping: Record<string, string> = {
    'none': 'None',
    'lt_5k': '< 5,000 SF',
    '5k_to_10k': '5,000 - 10,000 SF',
    '10k_to_25k': '10,000 - 25,000 SF',
    '25k_to_50k': '25,000 - 50,000 SF',
    '50k_to_100k': '50,000 - 100,000 SF',
    'gt_100k': '100,000+ SF',
    // Handle legacy values that might exist
    'less_than_5k': '< 5,000 SF',
    '5k_to_25k': '5,000 - 25,000 SF',
    '25k_to_100k': '25,000 - 100,000 SF',
    '100k_plus': '100,000+ SF'
  };
  
  return sizeMapping[size] || size; // Return original if no mapping found
};

const statusColors = {
  active: "bg-green-100 text-green-800 border-green-200",
  fulfilled: "bg-purple-100 text-purple-800 border-purple-200",
  expired: "bg-gray-100 text-gray-800 border-gray-200"
};

const timelineLabels = {
  "asap": "ASAP",
  "1_3_months": "1-3 months",
  "3_6_months": "3-6 months", 
  "6_12_months": "6-12 months",
  "12_plus_months": "12+ months"
};

export default function RequirementsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRequirement, setEditingRequirement] = useState<Requirement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Form state - simplified
  const [formData, setFormData] = useState<InsertRequirement>({
    title: "",
    source: undefined,
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    spaceSize: undefined,
    timeline: undefined,
    status: "active",
    tags: [],
    notes: ""
  });

  const [tagInput, setTagInput] = useState("");

  // Fetch requirements
  const { data: requirements = [], isLoading } = useQuery<Requirement[]>({
    queryKey: ['/api/requirements'],
  });

  // Create requirement mutation
  const createMutation = useMutation({
    mutationFn: async (requirement: InsertRequirement) => {
      console.log('Creating requirement with data:', requirement);
      try {
        const response = await apiRequest('POST', '/api/requirements', requirement);
        const result = await response.json();
        console.log('Requirement created successfully:', result);
        return result;
      } catch (error) {
        console.error('Error in createMutation:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('Create mutation successful:', data);
      queryClient.invalidateQueries({ queryKey: ['/api/requirements'] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: "Requirement created successfully" });
    },
    onError: (error: any) => {
      console.error('Create mutation error:', error);
      toast({ 
        title: "Error creating requirement", 
        description: error.message || "Failed to create requirement", 
        variant: "destructive" 
      });
    },
  });

  // Update requirement mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, requirement }: { id: string; requirement: Partial<Requirement> }) => {
      const response = await apiRequest('PATCH', `/api/requirements/${id}`, requirement);
      return response.json();
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/requirements'] });
      setIsDialogOpen(false);
      setEditingRequirement(null);
      resetForm();
      toast({ title: "Requirement updated successfully" });
    },
    onError: (error) => {
      toast({ 
        title: "Error updating requirement", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // Delete requirement mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/requirements/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/requirements'] });
      toast({ title: "Requirement deleted successfully" });
    },
    onError: (error) => {
      toast({ 
        title: "Error deleting requirement", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      source: undefined,
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      spaceSize: undefined,
      timeline: undefined,
      status: "active",
      tags: [],
      notes: ""
    });
    setTagInput("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.title.trim()) {
      toast({
        title: "Validation Error",
        description: "Title is required",
        variant: "destructive"
      });
      return;
    }
    
    console.log('Submitting requirement:', formData);
    console.log('Editing mode:', !!editingRequirement);
    
    if (editingRequirement) {
      updateMutation.mutate({ id: editingRequirement.id!, requirement: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (requirement: Requirement) => {
    setEditingRequirement(requirement);
    setFormData({
      title: requirement.title,
      source: requirement.source as any,
      contactName: requirement.contactName || "",
      contactEmail: requirement.contactEmail || "",
      contactPhone: requirement.contactPhone || "",
      spaceSize: requirement.spaceSize as any,
      timeline: requirement.timeline as any,
      status: requirement.status,
      tags: requirement.tags || [],
      notes: requirement.notes || ""
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this requirement?")) {
      deleteMutation.mutate(id);
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()]
      }));
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  // Filter requirements including tags search
  const filteredRequirements = requirements.filter(req => {
    const matchesSearch = searchQuery === "" || 
                         req.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (req.contactName?.toLowerCase().includes(searchQuery.toLowerCase())) ||
                         (req.notes?.toLowerCase().includes(searchQuery.toLowerCase())) ||
                         (req.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())));
    const matchesStatus = filterStatus === "all" || req.status === filterStatus;
    const matchesSource = filterSource === "all" || req.source === filterSource;
    return matchesSearch && matchesStatus && matchesSource;
  });

  const uniqueSources = Array.from(new Set(requirements.map(req => req.source).filter(Boolean)));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Requirements</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-2">
              Track market intelligence from brokerages and direct clients
            </p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add Requirement
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingRequirement ? "Edit Requirement" : "Add New Requirement"}
                </DialogTitle>
                <DialogDescription>
                  Quick entry form for market requirements
                </DialogDescription>
              </DialogHeader>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="title">Requirement Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g., Tech company needs 15K SF"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="source">Source</Label>
                  <Select
                    value={formData.source || ""}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, source: value as any }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cushman">Cushman</SelectItem>
                      <SelectItem value="Avison">Avison</SelectItem>
                      <SelectItem value="JLL">JLL</SelectItem>
                      <SelectItem value="Cresa">Cresa</SelectItem>
                      <SelectItem value="Omada">Omada</SelectItem>
                      <SelectItem value="Remax">Remax</SelectItem>
                      <SelectItem value="CBRE">CBRE</SelectItem>
                      <SelectItem value="Colliers">Colliers</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>


                <div>
                  <Label htmlFor="spaceSize">Space Size</Label>
                  <Select
                    value={formData.spaceSize || ""}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, spaceSize: value as any }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select size range" />
                    </SelectTrigger>
                    <SelectContent>
                      {STANDARD_SIZE_OPTIONS.map((sizeOption) => (
                        <SelectItem key={sizeOption} value={sizeOption}>
                          {sizeOption}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>



                <div>
                  <Label htmlFor="contactName">Contact Name</Label>
                  <Input
                    id="contactName"
                    value={formData.contactName}
                    onChange={(e) => setFormData(prev => ({ ...prev, contactName: e.target.value }))}
                    placeholder="Broker or client name"
                  />
                </div>

                <div>
                  <Label htmlFor="tags">Tags</Label>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        id="tags"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        placeholder="Add a tag..."
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addTag();
                          }
                        }}
                      />
                      <Button type="button" onClick={addTag} size="sm">
                        Add
                      </Button>
                    </div>
                    
                    {/* Quick-add tag buttons */}
                    <div className="flex flex-wrap gap-1">
                      {['NW', 'SE', 'Nisku', 'Leduc', 'Dock', 'Grade', 'Cranes'].map((quickTag) => (
                        <Button
                          key={quickTag}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => {
                            if (!formData.tags.includes(quickTag)) {
                              setFormData(prev => ({
                                ...prev,
                                tags: [...prev.tags, quickTag]
                              }));
                            }
                          }}
                        >
                          {quickTag}
                        </Button>
                      ))}
                    </div>
                    
                    {/* Display current tags */}
                    {formData.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {formData.tags.map((tag, index) => (
                          <Badge key={index} variant="secondary" className="flex items-center gap-1">
                            {tag}
                            <button
                              type="button"
                              onClick={() => removeTag(tag)}
                              className="ml-1 text-xs hover:text-red-500"
                            >
                              ×
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Additional details..."
                    rows={3}
                  />
                </div>

                

                <div className="flex gap-2 pt-4">
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {editingRequirement ? "Update" : "Create"} Requirement
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Input
            placeholder="Search requirements..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="fulfilled">Fulfilled</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterSource} onValueChange={setFilterSource}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {uniqueSources.map(source => (
                <SelectItem key={source} value={source!}>{source}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Requirements List */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {isLoading ? (
            <div className="col-span-full text-center py-8">Loading requirements...</div>
          ) : filteredRequirements.length === 0 ? (
            <div className="col-span-full text-center py-8 text-gray-500 dark:text-gray-400">
              No requirements found. Add your first requirement to get started.
            </div>
          ) : (
            filteredRequirements.map((requirement) => (
              <Card key={requirement.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{requirement.title}</CardTitle>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(requirement)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(requirement.id!)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    <Badge className={statusColors[requirement.status]}>
                      {requirement.status}
                    </Badge>
                    {requirement.source && (
                      <Badge variant="outline">{requirement.source}</Badge>
                    )}
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-3">
                  {requirement.spaceSize && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Building className="h-4 w-4" />
                      {formatSpaceSize(requirement.spaceSize)}
                    </div>
                  )}
                  

                  
                  {requirement.contactName && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Users className="h-4 w-4" />
                      {requirement.contactName}
                    </div>
                  )}
                  
                  {requirement.notes && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                      {requirement.notes}
                    </p>
                  )}
                  
                  {requirement.tags && requirement.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {requirement.tags.map((tag, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}