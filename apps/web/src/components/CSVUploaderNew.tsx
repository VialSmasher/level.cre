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
    coordinates: '', // Single column with coordinates/WKT
    latitude: '',   // Separate lat column
    longitude: '',  // Separate lng column  
    notes: ''
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

  const processCSV = async () => {
    if (!file) return;
    
    setIsProcessing(true);
    setError('');
    
    try {
      const csvText = await file.text();
      console.log('Raw CSV content (first 500 chars):', csvText.substring(0, 500));
      
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
      console.log('Parsed CSV data:', validData);
      console.log('Available columns:', Object.keys(validData[0] || {}));
      
      if (validData.length === 0) {
        setError('No valid data found in CSV file');
        return;
      }
      
      setCsvData(validData);
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
        let geometry: any;
        
        if (coordinateFormat === 'single') {
          const coordString = row[columnMapping.coordinates] || '';
          console.log(`Row ${index + 1} coordinate string:`, coordString);

          // Handle POLYGON format first
          if (coordString.includes('POLYGON')) {
            // Remove quotes from WKT string if present
            const cleanCoordString = coordString.replace(/^"(.*)"$/, '$1');
            
            // Parse polygon coordinates from WKT format: POLYGON ((lng lat, lng lat, ...))
            const polygonMatch = cleanCoordString.match(/POLYGON\s*\(\s*\(\s*([^)]+)\s*\)\s*\)/i);
            if (polygonMatch) {
              const coordPairs = polygonMatch[1].split(',').map((pair: string) => {
                const [lng, lat] = pair.trim().split(/\s+/).map(parseFloat);
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
              
              // For polygons, use the center point as lat/lng for the prospect
              const centerLng = coordPairs.reduce((sum, coord) => sum + coord[0], 0) / coordPairs.length;
              const centerLat = coordPairs.reduce((sum, coord) => sum + coord[1], 0) / coordPairs.length;
              lat = centerLat;
              lng = centerLng;
              
            } else {
              throw new Error(`Invalid POLYGON format in row ${index + 1}: "${coordString}". Expected WKT POLYGON format.`);
            }
          }
          // Handle POINT format
          else if (coordString.includes('POINT')) {
            // Remove quotes from WKT string if present  
            const cleanCoordString = coordString.replace(/^"(.*)"$/, '$1');
            
            // WKT format: "POINT (-113.3520105 53.6698217)" or "POINT(-113.3520105 53.6698217)"
            const match = cleanCoordString.match(/POINT\s*\(\s*([^\s]+)\s+([^\s)]+)\s*\)/i);
            if (match) {
              lng = parseFloat(match[1]); // longitude first in WKT
              lat = parseFloat(match[2]); // latitude second in WKT
              
              geometry = {
                type: 'Point' as const,
                coordinates: [lng, lat] as [number, number]
              };
            } else {
              throw new Error(`Invalid coordinates in row ${index + 1}: "${coordString}". Expected format: "POINT(lng lat)"`);
            }
          } 
          // Handle simple coordinate formats
          else if (coordString.includes(',')) {
            // Comma-separated format: "40.7128,-74.0060"
            const coords = coordString.split(',').map((s: string) => parseFloat(s.trim()));
            if (coords.length !== 2 || coords.some(isNaN)) {
              throw new Error(`Invalid coordinates in row ${index + 1}: "${coordString}". Expected format: "lat,lng"`);
            }
            [lat, lng] = coords;
            
            geometry = {
              type: 'Point' as const,
              coordinates: [lng, lat] as [number, number]
            };
          } else {
            // Space-separated format: "40.7128 -74.0060"
            const coords = coordString.trim().split(/\s+/).map((s: string) => parseFloat(s));
            if (coords.length !== 2 || coords.some(isNaN)) {
              throw new Error(`Invalid coordinates in row ${index + 1}: "${coordString}". Expected format: "lat lng" or "lat,lng" or "POINT(lng lat)"`);
            }
            [lat, lng] = coords;
            
            geometry = {
              type: 'Point' as const,
              coordinates: [lng, lat] as [number, number]
            };
          }
          
          if (isNaN(lat) || isNaN(lng)) {
            throw new Error(`Invalid coordinates in row ${index + 1}: "${coordString}"`);
          }
        } else {
          // Parse from separate columns
          lat = parseFloat(row[columnMapping.latitude] || '0');
          lng = parseFloat(row[columnMapping.longitude] || '0');
          
          if (isNaN(lat) || isNaN(lng)) {
            throw new Error(`Invalid coordinates in row ${index + 1}. lat=${lat}, lng=${lng}`);
          }
          
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
          submarketId: undefined,
          lastContactDate: undefined,
          createdDate: new Date().toISOString(),
          geometry
        };
      });
      
      console.log('Successfully parsed', prospects.length, 'prospects');
      onProspectsImport(prospects);
      setIsOpen(false);
      resetState();
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import prospects');
    }
  };

  const resetState = () => {
    setFile(null);
    setError('');
    setShowMapping(false);
    setCsvData([]);
    setColumnMapping({
      name: '',
      coordinates: '',
      latitude: '',
      longitude: '',
      notes: ''
    });
    setCoordinateFormat('single');
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
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Import Prospects from CSV
          </DialogTitle>
        </DialogHeader>

        {!showMapping ? (
          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="csv-file" className="text-sm font-medium">
                  Select CSV File
                </Label>
                <div className="mt-2">
                  <input
                    ref={fileInputRef}
                    id="csv-file"
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Supported formats:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• WKT POLYGON: "POLYGON ((-113.342 53.670, ...))"</li>
                  <li>• WKT POINT: "POINT (-113.352 53.669)"</li>
                  <li>• Lat,Lng: "53.669, -113.352"</li>
                  <li>• Separate latitude and longitude columns</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={processCSV}
                disabled={!file || isProcessing}
                className="flex-1"
              >
                {isProcessing ? 'Processing...' : 'Process CSV'}
              </Button>
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm">
                Found {csvData.length} rows. Map your CSV columns to prospect fields:
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Coordinate Format</Label>
                <Select value={coordinateFormat} onValueChange={(value) => setCoordinateFormat(value as 'single' | 'separate')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single column (WKT/coordinates)</SelectItem>
                    <SelectItem value="separate">Separate latitude/longitude columns</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4">
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
                  <div className="grid grid-cols-2 gap-3">
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
                  </div>
                )}

                <div>
                  <Label className="text-sm font-medium">Notes (Optional)</Label>
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
              </div>
            </div>

            <div className="flex gap-3">
              <Button onClick={importWithMapping} className="flex-1 gap-2">
                <ArrowRight className="h-4 w-4" />
                Import {csvData.length} Prospects
              </Button>
              <Button variant="outline" onClick={() => setShowMapping(false)}>
                Back
              </Button>
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
