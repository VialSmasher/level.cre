import { useEffect, useRef, useState } from "react";
import { GoogleMap, useJsApiLoader } from "@react-google-maps/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TerraDraw,
  TerraDrawSelectMode,
  TerraDrawPolygonMode,
  TerraDrawRectangleMode,
  type GeoJSONStoreFeatures,
} from "terra-draw";
import { TerraDrawGoogleMapsAdapter } from "terra-draw-google-maps-adapter";

const containerStyle = { width: "100%", height: "100%" } as const;
const defaultCenter = { lat: 39.8283, lng: -98.5795 };

export default function MapToolsTestPage() {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "") as string,
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const [mode, setMode] = useState<"select" | "polygon" | "rectangle">("select");
  const [features, setFeatures] = useState<GeoJSONStoreFeatures[]>([]);

  useEffect(() => {
    return () => {
      try { drawRef.current?.stop(); } catch {}
      drawRef.current = null;
      mapRef.current = null;
    };
  }, []);

  const onMapLoad = (map: google.maps.Map) => {
    mapRef.current = map;
    const adapter = new TerraDrawGoogleMapsAdapter({ lib: google.maps, map });
    // Bind to a stable element for events to avoid theme-specific panes
    try {
      const root = map.getDiv() as HTMLDivElement;
      // @ts-ignore override event source
      (adapter as any).getMapEventElement = () => root;
    } catch {}

    const draw = new TerraDraw({
      adapter,
      modes: [new TerraDrawSelectMode(), new TerraDrawPolygonMode(), new TerraDrawRectangleMode()],
    });

    draw.on("finish", () => setFeatures(draw.getSnapshot()));
    draw.on("change", () => setFeatures(draw.getSnapshot()));

    draw.start();
    draw.setMode("select");
    drawRef.current = draw;
    setMode("select");
  };

  const setTerraMode = (m: "select" | "polygon" | "rectangle") => {
    const draw = drawRef.current;
    const map = mapRef.current;
    if (!draw || !map) return;
    try {
      draw.setMode(m);
      setMode(m);
      map.setOptions({ draggable: m === "select", disableDoubleClickZoom: m !== "select" });
    } catch (e) {
      console.error("setTerraMode failed", e);
    }
  };

  const clearAll = () => {
    try { drawRef.current?.clear(); } catch {}
    setFeatures([]);
    setTerraMode("select");
  };

  if (loadError) {
    return (
      <div className="p-4">
        <Card>
          <CardHeader><CardTitle>Google Maps failed to load</CardTitle></CardHeader>
          <CardContent>{String(loadError)}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <Card>
        <CardHeader><CardTitle>Terra Draw Minimal Test</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="w-full" style={{ height: 480 }}>
            {isLoaded ? (
              <GoogleMap
                onLoad={onMapLoad}
                mapContainerStyle={containerStyle}
                center={defaultCenter}
                zoom={4}
                options={{ streetViewControl: false, mapTypeControl: true, fullscreenControl: false, gestureHandling: "greedy" }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">Loading map…</div>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant={mode === "select" ? "default" : "outline"} onClick={() => setTerraMode("select")}>Select</Button>
            <Button variant={mode === "polygon" ? "default" : "outline"} onClick={() => setTerraMode("polygon")}>Polygon</Button>
            <Button variant={mode === "rectangle" ? "default" : "outline"} onClick={() => setTerraMode("rectangle")}>Rectangle</Button>
            <div className="ml-auto flex gap-2"><Button variant="outline" onClick={clearAll}>Clear</Button></div>
          </div>

          <div className="text-xs text-gray-500">Features: {features.length}</div>
        </CardContent>
      </Card>
    </div>
  );
}

