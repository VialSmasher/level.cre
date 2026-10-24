# Public municipal fixtures

Retrieved October 23, 2026 through read-only public source queries. These contain municipal records only, with no Level CRE dossier, broker, client, or private Atlas data.

- `edmonton-150367.public.json`: City of Edmonton title parcel query at longitude -113.572, latitude 53.578, with `outSR=4326`, `outFields=ID,BESTADDRESS,SHORT_LEGAL_LABEL`, `returnGeometry=true`, `resultRecordCount=20`, and `f=geojson`. Source: https://gis.edmonton.ca/site1/rest/services/VertiGIS/ZoningMap/FeatureServer/1/query
- `edmonton-286695-zoning.public.json`: City of Edmonton zoning point query at the same coordinate using `intersects(geometry_multipolygon,'POINT(-113.572 53.578)')`. Source: https://data.edmonton.ca/resource/fixa-tstc.json

The parcel's source geometry date is unknown. Zoning `date_ext` is the municipal dataset extraction date, not a bylaw effective date. The source geometry and zoning payload values are preserved exactly; JSON formatting may differ.
