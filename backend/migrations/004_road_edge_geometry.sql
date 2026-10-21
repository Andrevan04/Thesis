ALTER TABLE road_edge
ADD COLUMN IF NOT EXISTS geometry_geojson JSONB;
