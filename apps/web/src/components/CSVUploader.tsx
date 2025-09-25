import { useState, useRef } from 'react';
import { Upload, FileText, X, AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UpdatedProspect as Prospect } from '@level-cre/shared/schema';
import Papa from 'papaparse';

interface CSVUploaderProps {
  onProspectsImport: (prospects: Prospect[]) => void;
}

export function CSVUploader({ onProspectsImport }: CSVUploaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showMapping, setShowMapping] = useState(false);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [columnMapping, setColumnMapping] = useState({
    name: '',
    coordinates: '', // Single column with lat,lng
    latitude: '',   // Separate lat column
    longitude: '',  // Separate lng column  
    notes: '',
    submarketId: '' // Submarket field
  });
  const [coordinateFormat, setCoordinateFormat] = useState<'single' | 'separate'>('single');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
      setError('');
    } else {
      setError('Please select a valid CSV file');
      setFile(null);
    }
  };

  const parseCSV = (csvText: string): any[] => {
    console.log('Starting CSV parse with Papa Parse...');
    
    // Use Papa Parse to handle complex CSV with quoted polygons
    const result = Papa.parse(csvText, { 
      header: true, 
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim().toLowerCase(),
      quoteChar: '"',
      escapeChar: '"',
      delimiter: ','
    });
    
    console.log('Papa Parse result:', result);
    console.log('Papa Parse errors:', result.errors);
    console.log('Papa Parse data length:', result.data.length);
    
    if (result.errors.length > 0) {
      console.warn('CSV parsing warnings:', result.errors);
    }
    
    // Filter out empty rows
    const validData = result.data.filter((row: any) => {
      return row && Object.keys(row).some(key => row[key] && row[key].trim());
    });
    
    console.log('Valid data after filtering:', validData.length, 'rows');
    
    return validData;
  };

  const processCSV = async () => {
    if (!file) return;
    
    setIsProcessing(true);
    setError('');
    
    try {
      const csvText = await file.text();
      console.log('Raw CSV content (first 500 chars):', csvText.substring(0, 500));
      
      const data = parseCSV(csvText);
      console.log('Parsed CSV data:', data);
      console.log('Number of rows:', data.length);
      console.log('Available columns:', Object.keys(data[0] || {}));
      
      if (data.length === 0) {
        setError('No valid data found in CSV file');
        return;
      }
      
      setCsvData(data);
      setShowMapping(true);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process CSV file');
    } finally {
      setIsProcessing(false);
    }
  };

  const importWithMapping = () => {
    const requiredFields = coordinateFormat === 'single' 
      ? ['name', 'coordinates']
      : ['name', 'latitude', 'longitude'];
    
    const missingFields = requiredFields.filter(field => !columnMapping[field as keyof typeof columnMapping]);
    if (missingFields.length > 0) {
      setError(`Please map the required columns: ${missingFields.join(', ')}`);
      return;
    }

    try {
      console.log('CSV columns available:', Object.keys(csvData[0] || {}));
      console.log('Column mapping:', columnMapping);
      console.log('Processing', csvData.length, 'rows');

      const prospects: Prospect[] = csvData.map((row, index) => {
        let lat: number, lng: number;
        
        if (coordinateFormat === 'single') {
          // Parse coordinates from single column
          const coordString = row[columnMapping.coordinates] || '';

          // Handle different coordinate formats - POLYGON first since it's more complex
          if (coordString.includes('POLYGON')) {
            // Skip individual lat/lng parsing for polygons - handle this in geometry section below
            lat = 0; lng = 0; // Dummy values, will be overridden by polygon geometry
          } else if (coordString.includes('POINT')) {
            // Remove quotes from WKT string if present  
            const cleanCoordString = coordString.replace(/^"(.*)"$/, '$1');
            
            // WKT format: "POINT (-113.3520105 53.6698217)" or "POINT(-113.3520105 53.6698217)"
            const match = cleanCoordString.match(/POINT\s*\(\s*([^\s]+)\s+([^\s)]+)\s*\)/i);
            if (match) {
              lng = parseFloat(match[1]); // longitude first in WKT
              lat = parseFloat(match[2]); // latitude second in WKT

            } else {
              throw new Error(`Invalid POINT format in row ${index + 2}: "${cleanCoordString}". Expected: "POINT(lng lat)"`);
            }
          } else if (coordString.includes(',')) {
            // Comma-separated format: "40.7128,-74.0060" or "40.7128, -74.0060"
            const coords = coordString.split(',').map((s: string) => parseFloat(s.trim()));
            if (coords.length !== 2 || coords.some(isNaN)) {
              throw new Error(`Invalid coordinates in row ${index + 2}: "${coordString}". Expected format: "lat,lng"`);
            }
            [lat, lng] = coords;
          } else {
            // Space-separated format: "40.7128 -74.0060"
            const coords = coordString.trim().split(/\s+/).map((s: string) => parseFloat(s));
            if (coords.length !== 2 || coords.some(isNaN)) {
              throw new Error(`Invalid coordinates in row ${index + 2}: "${coordString}". Expected format: "lat lng" or "lat,lng" or "POINT(lng lat)"`);
            }
            [lat, lng] = coords;
          }
          
          if (isNaN(lat) || isNaN(lng)) {
            // Only throw error if this isn't a POLYGON (which doesn't use lat/lng directly)
            if (!coordString.includes('POLYGON')) {
              throw new Error(`Invalid coordinates in row ${index + 2}: "${coordString}"`);
            }
          }
        } else {
          // Parse from separate columns
          lat = parseFloat(row[columnMapping.latitude] || '0');
          lng = parseFloat(row[columnMapping.longitude] || '0');
          
          if (isNaN(lat) || isNaN(lng)) {
            throw new Error(`Invalid coordinates in row ${index + 2}. lat=${lat}, lng=${lng}`);
          }
        }
        
        // Check if this is a polygon (has WKT POLYGON format)
        let geometry: any;
        
        if (coordinateFormat === 'single') {
          const coordString = row[columnMapping.coordinates] || '';
          console.log(`Row ${index + 1} coordinate string:`, coordString);
          
          if (coordString.includes('POLYGON')) {
            // Remove quotes from WKT string if present
            const cleanCoordString = coordString.replace(/^"(.*)"$/, '$1');
            
            // Parse polygon coordinates from WKT format: POLYGON ((lng lat, lng lat, ...))
            const polygonMatch = cleanCoordString.match(/POLYGON\s*\(\s*\(\s*([^)]+)\s*\)\s*\)/i);
            if (polygonMatch) {
              try {
                const coordPairs = polygonMatch[1].split(',').map((pair: string) => {
                  const coords = pair.trim().split(/\s+/);
                  if (coords.length !== 2) {
                    throw new Error(`Invalid coordinate pair: "${pair.trim()}"`);
                  }
                  const lng = parseFloat(coords[0]);
                  const lat = parseFloat(coords[1]);
                  if (isNaN(lng) || isNaN(lat)) {
                    throw new Error(`Invalid numbers in coordinate pair: "${pair.trim()}"`);
                  }
                  return [lng, lat] as [number, number];
                });
                
                // Ensure the polygon is closed by adding the first point at the end if needed
                if (coordPairs.length > 0 && 
                    (coordPairs[0][0] !== coordPairs[coordPairs.length - 1][0] || 
                     coordPairs[0][1] !== coordPairs[coordPairs.length - 1][1])) {
                  coordPairs.push(coordPairs[0]);
                }
                
                geometry = {
                  type: 'Polygon' as const,
                  coordinates: [coordPairs]  // Polygons need nested array structure
                };
                console.log(`Created polygon with ${coordPairs.length} points`);
                console.log('First few points:', coordPairs.slice(0, 3));
              } catch (polygonError) {
                console.error('Failed to parse polygon:', polygonError);
                const errorMessage = polygonError instanceof Error ? polygonError.message : String(polygonError);
                throw new Error(`Invalid POLYGON coordinates in row ${index + 2}: ${errorMessage}. Expected format: "POLYGON ((lng lat, lng lat, ...))"`);
              }
            } else {
              throw new Error(`Invalid POLYGON format in row ${index + 2}: "${cleanCoordString}". Expected format: "POLYGON ((lng lat, lng lat, ...))"`);
            }
          } else {
            geometry = {
              type: 'Point' as const,
              coordinates: [lng, lat] as [number, number]
            };
          }
        } else {
          geometry = {
            type: 'Point' as const,
            coordinates: [lng, lat] as [number, number]
          };
        }

        return {
          id: `csv-${Date.now()}-${index}`,
          name: row[columnMapping.name] || `Imported Prospect ${index + 1}`,
          status: 'prospect' as const,
          notes: (columnMapping.notes && columnMapping.notes !== 'none') ? (row[columnMapping.notes] || '') : '',
          submarketId: (columnMapping.submarketId && columnMapping.submarketId !== 'none') ? (row[columnMapping.submarketId] || undefined) : undefined,
          lastContactDate: undefined,
          createdDate: new Date().toISOString(),
          geometry
        };
      });
      

      onProspectsImport(prospects);
      setIsOpen(false);
      resetState();
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import prospects');
    }
  };

  const resetState = () => {
    setFile(null);
    setShowMapping(false);
    setCsvData([]);
    setColumnMapping({ name: '', coordinates: '', latitude: '', longitude: '', notes: '', submarketId: '' });
    setCoordinateFormat('single');
    setError('');
  };

  const clearFile = () => {
    resetState();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getAvailableColumns = () => {
    if (csvData.length === 0) return [];
    return Object.keys(csvData[0]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <div className="flex items-center w-full p-0 h-auto">
          <Upload className="mr-2 h-4 w-4" />
          Import CSV
        </div>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {showMapping ? 'Map CSV Columns' : 'Import Prospects from CSV'}
          </DialogTitle>
        </DialogHeader>
        
        {!showMapping ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="csv-file" className="text-sm font-medium">
                CSV File
              </Label>
              <input
                ref={fileInputRef}
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              
              {file && (
                <div className="mt-2 flex items-center justify-between p-2 bg-gray-50 rounded">
                  <span className="text-sm text-gray-700">{file.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFile}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Upload your CSV file and we'll help you map the columns to prospect data.
              </AlertDescription>
            </Alert>
            
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="flex gap-2">
              <Button 
                onClick={processCSV} 
                disabled={!file || isProcessing}
                className="flex-1"
              >
                {isProcessing ? 'Processing...' : 'Continue'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-md">
              <p className="text-sm text-blue-800">
                Map your CSV columns to prospect fields. Choose your coordinate format first.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium">Coordinate Format</Label>
                <Select value={coordinateFormat} onValueChange={(value: 'single' | 'separate') => setCoordinateFormat(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single Column (lat,lng or POINT format)</SelectItem>
                    <SelectItem value="separate">Separate Columns (lat/lng)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium text-red-600">Name * (Required)</Label>
                <Select value={columnMapping.name} onValueChange={(value) => setColumnMapping(prev => ({ ...prev, name: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select name column" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableColumns().map(col => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {coordinateFormat === 'single' ? (
                <div>
                  <Label className="text-sm font-medium text-red-600">Coordinates * (Required)</Label>
                  <Select value={columnMapping.coordinates} onValueChange={(value) => setColumnMapping(prev => ({ ...prev, coordinates: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select WKT/coordinates column" />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableColumns().map(col => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <>
                  <div>
                    <Label className="text-sm font-medium text-red-600">Latitude * (Required)</Label>
                    <Select value={columnMapping.latitude} onValueChange={(value) => setColumnMapping(prev => ({ ...prev, latitude: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select latitude column" />
                      </SelectTrigger>
                      <SelectContent>
                        {getAvailableColumns().map(col => (
                          <SelectItem key={col} value={col}>{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-red-600">Longitude * (Required)</Label>
                    <Select value={columnMapping.longitude} onValueChange={(value) => setColumnMapping(prev => ({ ...prev, longitude: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select longitude column" />
                      </SelectTrigger>
                      <SelectContent>
                        {getAvailableColumns().map(col => (
                          <SelectItem key={col} value={col}>{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div>
                <Label className="text-sm font-medium text-gray-600">Notes (Optional)</Label>
                <Select value={columnMapping.notes} onValueChange={(value) => setColumnMapping(prev => ({ ...prev, notes: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select notes column (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {getAvailableColumns().map(col => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-600">Submarket (Optional)</Label>
                <Select value={columnMapping.submarketId} onValueChange={(value) => setColumnMapping(prev => ({ ...prev, submarketId: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select submarket column (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {getAvailableColumns().map(col => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="flex gap-2">
              <Button 
                onClick={() => setShowMapping(false)}
                variant="outline"
              >
                Back
              </Button>
              <Button 
                onClick={importWithMapping}
                className="flex-1"
                disabled={!columnMapping.name || (coordinateFormat === 'single' ? !columnMapping.coordinates : (!columnMapping.latitude || !columnMapping.longitude))}
              >
                Import {csvData.length} Prospects
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
