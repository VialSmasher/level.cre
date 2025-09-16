import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Building2, DollarSign, Calendar, Users, Tag, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Comp } from "@shared/schema";

const STANDARD_SIZE_OPTIONS = [
  '< 5,000 SF',
  '5,000 - 10,000 SF',
  '10,000 - 25,000 SF',
  '25,000 - 50,000 SF',
  '50,000 - 100,000 SF',
  '100,000+ SF'
] as const;

export default function CompsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for form and UI
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingComp, setEditingComp] = useState<Comp | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSource, setFilterSource] = useState("all");
  const [filterTransactionType, setFilterTransactionType] = useState("all");
  const [tagInput, setTagInput] = useState("");
  
  // Form data state
  const [formData, setFormData] = useState({
    tenantPurchaserName: "",
    source: undefined as string | undefined,
    tags: [] as string[],
    transactionType: undefined as "Sale" | "Lease" | undefined,
    spaceSize: undefined as string | undefined,
    leaseRate: "",
    term: "",
    salePrice: "",
    notes: ""
  });

  // Fetch comps
  const { data: comps = [], isLoading } = useQuery({
    queryKey: ['/api/comps'],
    queryFn: () => apiRequest('GET', '/api/comps'),
  });

  // Debug logging
  console.log('Raw comps data:', comps);
  console.log('Comps array check:', Array.isArray(comps));
  console.log('Comps length:', Array.isArray(comps) ? comps.length : 'Not an array');

  // Create comp mutation
  const createMutation = useMutation({
    mutationFn: async (comp: any) => {
      return apiRequest('POST', '/api/comps', comp);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/comps'] });
      toast({ title: "Comp created successfully" });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error) => {
      toast({ 
        title: "Error creating comp", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // Update comp mutation  
  const updateMutation = useMutation({
    mutationFn: async ({ id, comp }: { id: string; comp: any }) => {
      return apiRequest('PATCH', `/api/comps/${id}`, comp);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/comps'] });
      toast({ title: "Comp updated successfully" });
      resetForm();
      setEditingComp(null);
      setIsDialogOpen(false);
    },
    onError: (error) => {
      toast({ 
        title: "Error updating comp", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // Delete comp mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/comps/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/comps'] });
      toast({ title: "Comp deleted successfully" });
    },
    onError: (error) => {
      toast({ 
        title: "Error deleting comp", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const resetForm = () => {
    setFormData({
      tenantPurchaserName: "",
      source: undefined,
      tags: [],
      transactionType: undefined,
      spaceSize: undefined,
      leaseRate: "",
      term: "",
      salePrice: "",
      notes: ""
    });
    setTagInput("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.tenantPurchaserName.trim()) {
      toast({
        title: "Validation Error",
        description: "Tenant/Purchaser Name is required",
        variant: "destructive"
      });
      return;
    }
    
    if (!formData.transactionType) {
      toast({
        title: "Validation Error",
        description: "Transaction Type is required",
        variant: "destructive"
      });
      return;
    }
    
    console.log('Submitting comp:', formData);
    console.log('Editing mode:', !!editingComp);
    
    if (editingComp) {
      updateMutation.mutate({ id: editingComp.id!, comp: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (comp: Comp) => {
    setEditingComp(comp);
    setFormData({
      tenantPurchaserName: comp.tenantPurchaserName,
      source: comp.source || undefined,
      tags: comp.tags || [],
      transactionType: comp.transactionType,
      spaceSize: comp.spaceSize || undefined,
      leaseRate: comp.leaseRate || "",
      term: comp.term || "",
      salePrice: comp.salePrice || "",
      notes: comp.notes || ""
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this comp?")) {
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

  // Filter comps including tags search
  const filteredComps = Array.isArray(comps) ? comps.filter((comp: Comp) => {
    const matchesSearch = searchQuery === "" || 
                         comp.tenantPurchaserName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (comp.notes?.toLowerCase().includes(searchQuery.toLowerCase())) ||
                         (comp.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())));
    const matchesSource = filterSource === "all" || comp.source === filterSource;
    const matchesTransactionType = filterTransactionType === "all" || comp.transactionType === filterTransactionType;
    
    console.log('Filtering comp:', comp.tenantPurchaserName, {
      matchesSearch,
      matchesSource,
      matchesTransactionType,
      searchQuery,
      filterSource,
      filterTransactionType
    });
    
    return matchesSearch && matchesSource && matchesTransactionType;
  }) : [];

  console.log('Filtered comps:', filteredComps.length);

  const uniqueSources = Array.from(new Set((Array.isArray(comps) ? comps : []).map((comp: Comp) => comp.source).filter(Boolean)));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Comps</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-2">
              Track sale and lease comparables for market analysis
            </p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add New Comp
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingComp ? "Edit Comp" : "Add New Comp"}
                </DialogTitle>
                <DialogDescription>
                  Track sale and lease comparables
                </DialogDescription>
              </DialogHeader>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="tenantPurchaserName">Tenant/Purchaser Name *</Label>
                  <Input
                    id="tenantPurchaserName"
                    value={formData.tenantPurchaserName}
                    onChange={(e) => setFormData(prev => ({ ...prev, tenantPurchaserName: e.target.value }))}
                    placeholder="e.g., Tech Company Inc."
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
                      <SelectItem value="LoopNet">LoopNet</SelectItem>
                      <SelectItem value="Direct">Direct</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="transactionType">Transaction Type *</Label>
                  <Select
                    value={formData.transactionType || ""}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, transactionType: value as any }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select transaction type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Sale">Sale</SelectItem>
                      <SelectItem value="Lease">Lease</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="spaceSize">Space Size</Label>
                  <Select
                    value={formData.spaceSize || ""}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, spaceSize: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select space size" />
                    </SelectTrigger>
                    <SelectContent>
                      {STANDARD_SIZE_OPTIONS.map(size => (
                        <SelectItem key={size} value={size}>{size}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Conditional fields based on transaction type */}
                {formData.transactionType === "Lease" && (
                  <>
                    <div>
                      <Label htmlFor="leaseRate">Lease Rate ($/SF)</Label>
                      <Input
                        id="leaseRate"
                        value={formData.leaseRate}
                        onChange={(e) => setFormData(prev => ({ ...prev, leaseRate: e.target.value }))}
                        placeholder="e.g., 25.00"
                      />
                    </div>
                    <div>
                      <Label htmlFor="term">Term (Years)</Label>
                      <Input
                        id="term"
                        value={formData.term}
                        onChange={(e) => setFormData(prev => ({ ...prev, term: e.target.value }))}
                        placeholder="e.g., 5"
                      />
                    </div>
                  </>
                )}

                {formData.transactionType === "Sale" && (
                  <div>
                    <Label htmlFor="salePrice">Sale Price ($)</Label>
                    <Input
                      id="salePrice"
                      value={formData.salePrice}
                      onChange={(e) => setFormData(prev => ({ ...prev, salePrice: e.target.value }))}
                      placeholder="e.g., 2,500,000"
                    />
                  </div>
                )}

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

                <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingComp ? "Update Comp" : "Create Comp"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search and Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Input
            placeholder="Search comps..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          
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

          <Select value={filterTransactionType} onValueChange={setFilterTransactionType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Sale">Sale</SelectItem>
              <SelectItem value="Lease">Lease</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Comps List */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {isLoading ? (
            <div className="col-span-full text-center py-8">Loading comps...</div>
          ) : filteredComps.length === 0 ? (
            <div className="col-span-full text-center py-8 text-gray-500 dark:text-gray-400">
              No comps found. Add your first comp to get started.
            </div>
          ) : (
            filteredComps.map((comp: Comp) => (
              <Card key={comp.id!} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{comp.tenantPurchaserName}</CardTitle>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(comp)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(comp.id!)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    <Badge className={comp.transactionType === 'Sale' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}>
                      {comp.transactionType}
                    </Badge>
                    {comp.source && (
                      <Badge variant="outline">{comp.source}</Badge>
                    )}
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-3">
                  {comp.spaceSize && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Square className="h-4 w-4" />
                      {comp.spaceSize}
                    </div>
                  )}
                  
                  {comp.transactionType === 'Sale' && comp.salePrice && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <DollarSign className="h-4 w-4" />
                      ${comp.salePrice}
                    </div>
                  )}
                  
                  {comp.transactionType === 'Lease' && (
                    <>
                      {comp.leaseRate && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <DollarSign className="h-4 w-4" />
                          ${comp.leaseRate}/SF
                        </div>
                      )}
                      {comp.term && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <Calendar className="h-4 w-4" />
                          {comp.term} years
                        </div>
                      )}
                    </>
                  )}
                  
                  {comp.notes && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                      {comp.notes}
                    </p>
                  )}
                  
                  {comp.tags && comp.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {comp.tags.map((tag, index) => (
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