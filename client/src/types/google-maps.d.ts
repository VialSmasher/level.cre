declare global {
  interface Window {
    google: typeof google;
  }
}

declare namespace google {
  namespace maps {
    class Map {
      constructor(mapDiv: Element | null, opts?: MapOptions);
    }

    interface MapOptions {
      center?: LatLng | LatLngLiteral;
      zoom?: number;
      mapTypeId?: MapTypeId;
    }

    class LatLng {
      constructor(lat: number, lng: number);
      lat(): number;
      lng(): number;
    }

    interface LatLngLiteral {
      lat: number;
      lng: number;
    }

    enum MapTypeId {
      HYBRID = 'hybrid',
      ROADMAP = 'roadmap',
      SATELLITE = 'satellite',
      TERRAIN = 'terrain'
    }

    class Marker {
      constructor(opts?: MarkerOptions);
      getPosition(): LatLng | null;
      setMap(map: Map | null): void;
    }

    interface MarkerOptions {
      position?: LatLng | LatLngLiteral;
      map?: Map;
      title?: string;
    }

    class Polygon {
      constructor(opts?: PolygonOptions);
      getPath(): MVCArray<LatLng>;
      setEditable(editable: boolean): void;
      setDraggable(draggable: boolean): void;
      setMap(map: Map | null): void;
    }

    interface PolygonOptions {
      paths?: LatLng[] | LatLngLiteral[] | MVCArray<LatLng> | MVCArray<MVCArray<LatLng>>;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeWeight?: number;
      fillColor?: string;
      fillOpacity?: number;
      editable?: boolean;
      draggable?: boolean;
    }

    class MVCArray<T> {
      getLength(): number;
      getAt(i: number): T;
      push(elem: T): number;
    }

    namespace drawing {
      class DrawingManager {
        constructor(opts?: DrawingManagerOptions);
        setDrawingMode(drawingMode: OverlayType | null): void;
        setMap(map: Map | null): void;
      }

      interface DrawingManagerOptions {
        drawingMode?: OverlayType;
        drawingControl?: boolean;
        drawingControlOptions?: DrawingControlOptions;
        map?: Map;
      }

      interface DrawingControlOptions {
        position?: ControlPosition;
        drawingModes?: OverlayType[];
      }

      enum OverlayType {
        CIRCLE = 'circle',
        MARKER = 'marker',
        POLYGON = 'polygon',
        POLYLINE = 'polyline',
        RECTANGLE = 'rectangle'
      }

      interface OverlayCompleteEvent {
        type: OverlayType;
        overlay: Marker | Polygon | any;
      }

      enum ControlPosition {
        BOTTOM_CENTER = 0,
        BOTTOM_LEFT = 1,
        BOTTOM_RIGHT = 2,
        LEFT_BOTTOM = 3,
        LEFT_CENTER = 4,
        LEFT_TOP = 5,
        RIGHT_BOTTOM = 6,
        RIGHT_CENTER = 7,
        RIGHT_TOP = 8,
        TOP_CENTER = 9,
        TOP_LEFT = 10,
        TOP_RIGHT = 11
      }
    }

    namespace geometry {
      namespace spherical {
        function computeArea(path: LatLng[] | LatLngLiteral[]): number;
      }
    }
  }
}

export {};