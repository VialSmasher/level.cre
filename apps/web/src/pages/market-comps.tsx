import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { Edit, Plus, Trash2, Banknote, Building2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MarketComp, InsertMarketComp, Submarket, MarketCompDealType, MarketCompAssetType } from "@level-cre/shared/schema";
import { useProfile } from "@/hooks/useProfile";

export default function MarketCompsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingComp, setEditingComp] = useState<MarketComp | null>(null);

  const [dealTypeFilter, setDealTypeFilter] = useState<'all' | 'lease' | 'sale'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [termUnit, setTermUnit] = useState<'months' | 'years'>('months');
  const [termValue, setTermValue] = useState<number | ''>('');

  const [showDetails, setShowDetails] = useState(false);

  const [formData, setFormData] = useState<InsertMarketComp>({
    address: '',
    submarket: undefined,
    assetType: 'Building',
    buildingSize: undefined,
    landSize: undefined,
    sourceLink: undefined,
    notes: undefined,
    dealType: 'sale',
    // lease
    tenant: undefined,
    termMonths: undefined,
    rate: '10.00',
    rateType: undefined,
    commencement: undefined,
    concessions: undefined,
    // sale
    saleDate: undefined,
    buyer: undefined,
    seller: undefined,
    price: undefined,
    pricePerSf: undefined,
    pricePerAcre: undefined,
  });

  // Data
  const { data: comps = [], isLoading } = useQuery<MarketComp[]>({ queryKey: ['/api/market-comps'] });
  const { data: submarkets = [] } = useQuery<Submarket[]>({ queryKey: ['/api/submarkets'] });
  const { profile } = useProfile();
  const submarketOptions = useMemo(() => {
    // Prefer profile submarkets if present
    const profileList = (profile?.submarkets || []).map(s => (s || '').trim()).filter(Boolean);
    if (profileList.length > 0) {
      const seen = new Set<string>();
      const names: string[] = [];
      for (const name of profileList) {
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        names.push(name);
      }
      return names.sort((a, b) => a.localeCompare(b));
    }
    const seen = new Set<string>();
    const names: string[] = [];
    for (const s of submarkets || []) {
      const name = (s?.name || '').trim();
      if (!name) continue;
      // Only include active (default to true if missing)
      const isActive = (s as any).isActive !== false;
      if (!isActive) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
    return names.sort((a, b) => a.localeCompare(b));
  }, [submarkets, profile]);

  // Auto-compute price per metrics unless manually edited
  useEffect(() => {
    if (formData.dealType !== 'sale') return;
    const priceNum = formData.price ? Number(formData.price) : NaN;
    const bldgNum = formData.buildingSize ? Number(formData.buildingSize) : NaN;
    const landNum = formData.landSize ? Number(formData.landSize) : NaN;

    if (!Number.isNaN(priceNum) && !Number.isNaN(bldgNum) && bldgNum > 0) {
      const ppsf = Math.round(priceNum / bldgNum);
      setFormData(prev => ({ ...prev, pricePerSf: String(ppsf) }));
    }
    if (!Number.isNaN(priceNum) && !Number.isNaN(landNum) && landNum > 0) {
      const ppa = Math.round(priceNum / landNum);
      setFormData(prev => ({ ...prev, pricePerAcre: String(ppa) }));
    }
  }, [formData.price, formData.buildingSize, formData.landSize, formData.dealType]);

  const resetForm = () => {
    setFormData({
      address: '',
      submarket: undefined,
      assetType: 'Building',
      buildingSize: undefined,
      landSize: undefined,
      sourceLink: undefined,
      notes: undefined,
      dealType: 'sale',
      tenant: undefined,
      termMonths: undefined,
      rate: '10.00',
      rateType: undefined,
      commencement: undefined,
      concessions: undefined,
      saleDate: undefined,
      buyer: undefined,
      seller: undefined,
      price: undefined,
      pricePerSf: undefined,
      pricePerAcre: undefined,
    });
    setEditingComp(null);
    setIsDialogOpen(false);
    setTermUnit('months');
    setTermValue('');
    setShowDetails(false);
  };

  const createMutation = useMutation({
    mutationFn: async (payload: InsertMarketComp) => {
      const res = await apiRequest('POST', '/api/market-comps', payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/market-comps'] });
      toast({ title: 'Market comp added' });
      resetForm();
    },
    onError: (e: any) => toast({ title: 'Failed to add comp', description: e.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<MarketComp> }) => {
      const res = await apiRequest('PATCH', `/api/market-comps/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/market-comps'] });
      toast({ title: 'Market comp updated' });
      resetForm();
    },
    onError: (e: any) => toast({ title: 'Failed to update comp', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest('DELETE', `/api/market-comps/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/market-comps'] });
      toast({ title: 'Market comp deleted' });
    },
    onError: (e: any) => toast({ title: 'Failed to delete comp', description: e.message, variant: 'destructive' }),
  });

  const onEdit = (comp: MarketComp) => {
    setEditingComp(comp);
    setIsDialogOpen(true);
    setFormData({
      address: comp.address,
      submarket: comp.submarket,
      assetType: comp.assetType as any,
      buildingSize: comp.buildingSize,
      landSize: comp.landSize,
      sourceLink: comp.sourceLink,
      notes: comp.notes,
      dealType: comp.dealType as any,
      tenant: comp.tenant,
      termMonths: comp.termMonths,
      rate: comp.rate,
      rateType: comp.rateType as any,
      commencement: comp.commencement,
      concessions: comp.concessions,
      saleDate: comp.saleDate,
      buyer: comp.buyer,
      seller: comp.seller,
      price: comp.price,
      pricePerSf: comp.pricePerSf,
      pricePerAcre: comp.pricePerAcre,
    });
    if (comp.termMonths) {
      setTermUnit('months');
      setTermValue(comp.termMonths);
    } else {
      setTermValue('');
    }
    setShowDetails(false);
  };

  const onDelete = (id: string) => {
    if (confirm('Delete this comp?')) deleteMutation.mutate(id);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.address.trim()) {
      toast({ title: 'Validation error', description: 'Address is required', variant: 'destructive' });
      return;
    }
    const payload: InsertMarketComp = {
      ...formData,
      termMonths: termValue === '' ? undefined : (termUnit === 'years' ? Number(termValue) * 12 : Number(termValue)),
    };
    if (editingComp?.id) {
      updateMutation.mutate({ id: editingComp.id, patch: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const filtered = useMemo(() => {
    return comps.filter(c => {
      const matchesType = dealTypeFilter === 'all' || c.dealType === dealTypeFilter;
      const q = searchQuery.toLowerCase();
      const matchesSearch = [c.address, c.tenant, c.buyer, c.seller, c.submarket].filter(Boolean).some(v => (v as string).toLowerCase().includes(q));
      return matchesType && matchesSearch;
    });
  }, [comps, dealTypeFilter, searchQuery]);

  const assetBadge = (asset: string) => {
    const map: Record<string, string> = {
      Building: 'bg-blue-100 text-blue-800',
      Land: 'bg-green-100 text-green-800',
      Other: 'bg-gray-100 text-gray-800',
    };
    return map[asset] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Market Comps</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-2">Track comparable leases and sales to build market knowledge</p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <Button size="icon" aria-label="Create Market Comp" onClick={() => { resetForm(); setIsDialogOpen(true); }}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Create Market Comp</p>
              </TooltipContent>
            </Tooltip>
            <DialogContent className="max-w-[420px]">
              <DialogHeader>
                <DialogTitle>{editingComp ? 'Edit Comp' : 'Add Market Comp'}</DialogTitle>
                <DialogDescription className="text-xs">Quickly log a lease or sale comp</DialogDescription>
              </DialogHeader>

              <form onSubmit={submit} className="space-y-3">
                {/* Deal type segmented */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">Deal Type</Label>
                    <ToggleGroup type="single" value={formData.dealType} onValueChange={(v) => v && setFormData(p => ({ ...p, dealType: v as any }))} className="mt-1">
                      <ToggleGroupItem value="sale" className="h-8 px-3 text-xs">Sale</ToggleGroupItem>
                      <ToggleGroupItem value="lease" className="h-8 px-3 text-xs">Lease</ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Asset Type</Label>
                    <ToggleGroup type="single" value={formData.assetType} onValueChange={(v) => v && setFormData(p => ({ ...p, assetType: v as any }))} className="mt-1">
                      <ToggleGroupItem value="Building" className="h-8 px-3 text-xs">Building</ToggleGroupItem>
                      <ToggleGroupItem value="Land" className="h-8 px-3 text-xs">Land</ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                </div>

                {/* Essentials grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <Label htmlFor="address" className="text-xs">Address *</Label>
                    <Input id="address" className="h-10" value={formData.address} onChange={(e) => setFormData(p => ({ ...p, address: e.target.value }))} placeholder="123 Main St" required />
                  </div>

                  {formData.dealType === 'sale' ? (
                    <>
                      <div>
                        <Label className="text-xs">Price</Label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                          <Input type="number" className="h-10 pl-6" min="0" value={formData.price || ''} onChange={(e) => setFormData(p => ({ ...p, price: e.target.value || undefined }))} placeholder="e.g. 2500000" />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Date</Label>
                        <Input type="date" className="h-10" value={formData.saleDate || ''} onChange={(e) => setFormData(p => ({ ...p, saleDate: e.target.value || undefined }))} />
                      </div>
                      {formData.assetType === 'Building' ? (
                        <div>
                          <Label className="text-xs">Size (SF)</Label>
                          <Input type="number" className="h-10" min="0" value={formData.buildingSize || ''} onChange={(e) => setFormData(p => ({ ...p, buildingSize: e.target.value || undefined }))} placeholder="e.g. 15000" />
                        </div>
                      ) : (
                        <div>
                          <Label className="text-xs">Acres</Label>
                          <Input type="number" className="h-10" min="0" step="0.01" value={formData.landSize || ''} onChange={(e) => setFormData(p => ({ ...p, landSize: e.target.value || undefined }))} placeholder="e.g. 2.5" />
                        </div>
                      )}

                      {/* Auto chips */}
                      <div className="md:col-span-2 flex flex-wrap gap-2 pt-1">
                        {formData.assetType === 'Building' && formData.pricePerSf && (
                          <Badge variant="secondary" className="text-[11px]">Price/SF: ${Number(formData.pricePerSf).toLocaleString()}</Badge>
                        )}
                        {formData.assetType === 'Land' && formData.pricePerAcre && (
                          <Badge variant="secondary" className="text-[11px]">Price/Acre: ${Number(formData.pricePerAcre).toLocaleString()}</Badge>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <Label className="text-xs">Tenant</Label>
                        <Input className="h-10" value={formData.tenant || ''} onChange={(e) => setFormData(p => ({ ...p, tenant: e.target.value || undefined }))} placeholder="Tenant name" />
                      </div>
                      <div>
                        <Label className="text-xs">Rate</Label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                          <Input type="number" className="h-10 pl-6" min="0" step="0.5" value={formData.rate || ''} onChange={(e) => setFormData(p => ({ ...p, rate: e.target.value || undefined }))} placeholder="10.00" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Label className="text-xs">Term</Label>
                          <Input type="number" className="h-10" min="0" value={termValue} onChange={(e) => setTermValue(e.target.value === '' ? '' : Number(e.target.value))} placeholder="e.g. 5" />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs">Unit</Label>
                          <ToggleGroup type="single" value={termUnit} onValueChange={(v) => v && setTermUnit(v as 'months' | 'years')} className="mt-1">
                            <ToggleGroupItem value="months" className="h-8 px-3 text-xs">mo</ToggleGroupItem>
                            <ToggleGroupItem value="years" className="h-8 px-3 text-xs">yr</ToggleGroupItem>
                          </ToggleGroup>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Commencement</Label>
                        <Input type="date" className="h-10" value={formData.commencement || ''} onChange={(e) => setFormData(p => ({ ...p, commencement: e.target.value || undefined }))} />
                      </div>
                    </>
                  )}
                </div>

                {/* More details */}
                <div>
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowDetails(s => !s)}>
                    {showDetails ? 'Hide details' : 'More details'}
                  </Button>
                </div>

                {showDetails && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {formData.dealType === 'sale' ? (
                      <>
                        <div>
                          <Label className="text-xs">Buyer</Label>
                          <Input className="h-10" value={formData.buyer || ''} onChange={(e) => setFormData(p => ({ ...p, buyer: e.target.value || undefined }))} />
                        </div>
                        <div>
                          <Label className="text-xs">Seller</Label>
                          <Input className="h-10" value={formData.seller || ''} onChange={(e) => setFormData(p => ({ ...p, seller: e.target.value || undefined }))} />
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-xs">Notes</Label>
                          <Textarea rows={3} className="text-sm" value={formData.notes || ''} onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value || undefined }))} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="md:col-span-2">
                          <Label className="text-xs">Notes (TI/Free rent)</Label>
                          <Textarea rows={3} className="text-sm" value={formData.concessions || ''} onChange={(e) => setFormData(p => ({ ...p, concessions: e.target.value || undefined }))} />
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-xs">Submarket</Label>
                          <Select value={formData.submarket || ''} onValueChange={(v) => setFormData(p => ({ ...p, submarket: v }))}>
                            <SelectTrigger className="h-10">
                              <SelectValue placeholder="Select submarket" />
                            </SelectTrigger>
                            <SelectContent>
                              {submarketOptions.map(name => (
                                <SelectItem key={name} value={name}>{name}</SelectItem>
                              ))}
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button type="submit" className="h-9 text-sm" disabled={createMutation.isPending || updateMutation.isPending}>{editingComp ? 'Update' : 'Create'} Comp</Button>
                  <Button type="button" className="h-9 text-sm" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Input placeholder="Search (address, tenant, buyer, seller)" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          <Select value={dealTypeFilter} onValueChange={(v) => setDealTypeFilter(v as any)}>
            <SelectTrigger>
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="lease">Lease</SelectItem>
              <SelectItem value="sale">Sale</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {isLoading ? (
            <div className="col-span-full text-center py-8">Loading comps...</div>
          ) : filtered.length === 0 ? (
            <div className="col-span-full text-center py-8 text-gray-500 dark:text-gray-400">No comps yet. Add your first one.</div>
          ) : (
            filtered.map(comp => (
              <Card key={comp.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{comp.address}</CardTitle>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => onEdit(comp)}><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" className="text-red-600" onClick={() => onDelete(comp.id!)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{comp.submarket || '–'}</Badge>
                    <Badge className={assetBadge(comp.assetType)}>{comp.assetType}</Badge>
                    <Badge variant={comp.dealType === 'sale' ? 'secondary' : 'outline'} className={comp.dealType === 'sale' ? 'bg-amber-100 text-amber-800' : ''}>
                      {comp.dealType === 'sale' ? 'Sale' : 'Lease'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  {comp.dealType === 'lease' ? (
                    <div className="space-y-1">
                      {comp.tenant && <div className="flex items-center gap-2"><Building2 className="h-4 w-4" />Tenant: {comp.tenant}</div>}
                      {comp.termMonths && <div>Term: {comp.termMonths} mo</div>}
                      {comp.rate && <div>Rate: ${comp.rate}</div>}
                      {comp.commencement && <div>Commencement: {comp.commencement}</div>}
                      {comp.concessions && <div>TI/Free: {comp.concessions}</div>}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {comp.saleDate && <div>Date: {comp.saleDate}</div>}
                      {comp.price && <div className="flex items-center gap-2"><Banknote className="h-4 w-4" />Price: ${Number(comp.price).toLocaleString()}</div>}
                      {comp.pricePerSf && <div>$/SF: ${Number(comp.pricePerSf).toLocaleString()}</div>}
                      {comp.pricePerAcre && <div>$/Acre: ${Number(comp.pricePerAcre).toLocaleString()}</div>}
                      {(comp.buyer || comp.seller) && <div>Buyer/Seller: {[comp.buyer, comp.seller].filter(Boolean).join(' / ')}</div>}
                    </div>
                  )}
                  {comp.notes && <div className="pt-1">Notes: {comp.notes}</div>}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
