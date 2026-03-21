import json
import os
import argparse

DB_PATH = "/Users/dilankochhar/.openclaw/workspace/projects/dilly/dilly_database.json"

def load_db():
    if not os.path.exists(DB_PATH):
        print("Database not found.")
        return None
    with open(DB_PATH, 'r') as f:
        return json.load(f)

def query(major=None, grad_year=None, min_grit=0, visa=None):
    db = load_db()
    if not db: return
    
    candidates = db.get('candidates', [])
    filtered = []
    
    for c in candidates:
        meta = c['metadata']
        metrics = c['metrics']
        
        match = True
        if major and major.lower() not in meta.get('major', '').lower():
            match = False
        if grad_year and str(grad_year) != str(meta.get('grad_year', '')):
            match = False
        if visa and visa.lower() not in meta.get('visa_status', '').lower():
            match = False
        if metrics.get('grit_score', 0) < min_grit:
            match = False
            
        if match:
            filtered.append(c)
            
    # Rank by Grit Score
    filtered.sort(key=lambda x: x['metrics'].get('grit_score', 0), reverse=True)
    
    print(f"\n--- Dilly Search Results ({len(filtered)} found) ---")
    for c in filtered:
        m = c['metadata']
        met = c['metrics']
        print(f"[{met['grit_score']}] {m['candidate']} | {m['major']} | {m['college']} | {m['grad_year']}")
    print("-" * 40)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Query the Dilly Talent Database")
    parser.add_argument("--major", help="Filter by major")
    parser.add_argument("--grad", help="Filter by graduation year")
    parser.add_argument("--grit", type=int, default=0, help="Minimum grit score")
    parser.add_argument("--visa", help="Filter by visa status")
    
    args = parser.parse_args()
    query(major=args.major, grad_year=args.grad, min_grit=args.grit, visa=args.visa)
