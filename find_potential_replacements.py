import sqlite3
import pandas as pd
import math

db_path = r"C:\ANJUN\Banco de Dados\torre_anjun.db"
conn = sqlite3.connect(db_path)

# 1. Load coordinates and divisions
df_coords = pd.read_sql_query("""
    SELECT md_codigo as md, latitude, longitude, divisao, endereco, cidade, regional
    FROM malha_coordenadas
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
""", conn)
df_coords['md'] = df_coords['md'].astype(str).str.strip().str.upper()

# 2. Load volumes for June 2026
df_vol = pd.read_sql_query("""
    SELECT md, SUM(total) as volume_june, SUM(backlog) as backlog_june
    FROM detalhe_md_historico
    WHERE dia_base LIKE '%/06/2026' OR dia_base LIKE '2026-06-%'
    GROUP BY md;
""", conn)
df_vol['md'] = df_vol['md'].astype(str).str.strip().str.upper()

# Merge coordinates and volumes
df_merged = df_coords.merge(df_vol, on='md', how='left')
df_merged['volume_june'] = df_merged['volume_june'].fillna(0).astype(int)
df_merged['backlog_june'] = df_merged['backlog_june'].fillna(0).astype(int)

print(f"Loaded {len(df_merged)} geolocalized MDs.")

# Center of SP coordinate: lat -23.5505, lon -46.6333
def distance_km(lat1, lon1, lat2, lon2):
    # Haversine formula
    R = 6371.0 # Earth radius
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

# Filter out downtown SP points (within 3km of Sé)
# Also filter out where division is 'Centro' or regional is not SP-like
# We only analyze regionals starting with SP (SP, SP JAU, SP FRANCA)
df_sp = df_merged[df_merged['regional'].astype(str).str.startswith('SP')].copy()

# Mark downtown points
downtown_lat, downtown_lon = -23.5505, -46.6333
df_sp['dist_to_center'] = df_sp.apply(lambda r: distance_km(r['latitude'], r['longitude'], downtown_lat, downtown_lon), axis=1)

# Filter out within 3.5km of center
df_filtered = df_sp[
    (df_sp['dist_to_center'] > 3.5) &
    (~df_sp['divisao'].astype(str).str.lower().str.contains('centro'))
].copy()

print(f"Filtered to {len(df_filtered)} SP MDs outside downtown.")

# Find pairs within 3km where MD_A has low volume and MD_B has high volume
recommendations = []

mds_list = df_filtered.to_dict(orient='records')
for i in range(len(mds_list)):
    md_a = mds_list[i]
    # Check if MD_A has low volume
    # Let's say MD_A has volume < 800 in June 2026
    if md_a['volume_june'] > 800:
        continue
        
    for j in range(len(mds_list)):
        if i == j: continue
        md_b = mds_list[j]
        # Check if MD_B has high volume
        # Let's say MD_B has volume > 3000 in June 2026
        if md_b['volume_june'] < 3000:
            continue
            
        dist = distance_km(md_a['latitude'], md_a['longitude'], md_b['latitude'], md_b['longitude'])
        if dist <= 3.0:
            recommendations.append({
                'md_low': md_a['md'],
                'endereco_low': md_a['endereco'],
                'vol_low': md_a['volume_june'],
                'md_high': md_b['md'],
                'endereco_high': md_b['endereco'],
                'vol_high': md_b['volume_june'],
                'dist_km': round(dist, 2),
                'regional': md_a['regional'],
                'divisao': md_a['divisao']
            })

df_rec = pd.DataFrame(recommendations)
if not df_rec.empty:
    # Sort by low volume ascending, then by high volume descending
    df_rec = df_rec.sort_values(by=['vol_low', 'vol_high'], ascending=[True, False])
    print(f"\nFound {len(df_rec)} potential replacement/consolidation opportunities.")
    # Show top 25 recommendations
    print(df_rec.head(30).to_string(index=False))
else:
    print("\nNo potential replacements found with current thresholds.")

conn.close()
