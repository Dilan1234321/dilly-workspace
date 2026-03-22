import json
import os
import datetime

DB_PATH = "projects/meridian/meridian_database.json"

class MeridianDatabase:
    def __init__(self):
        self.data = self._load()

    def _load(self):
        if os.path.exists(DB_PATH):
            with open(DB_PATH, 'r') as f:
                return json.load(f)
        return {"candidates": []}

    def save_candidate(self, analysis_result):
        # Prevent duplicates by candidate name for now
        name = analysis_result['metadata']['candidate']
        self.data['candidates'] = [c for c in self.data['candidates'] if c['metadata']['candidate'] != name]
        
        # Add timestamp
        analysis_result['last_audit'] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self.data['candidates'].append(analysis_result)
        
        with open(DB_PATH, 'w') as f:
            json.dump(self.data, f, indent=4)
        return f"Saved {name} to database."

    def filter_candidates(self, major=None, grad_year=None, min_grit=0):
        results = self.data['candidates']
        if major:
            results = [c for c in results if major.lower() in c['metadata']['major'].lower()]
        if grad_year:
            results = [c for c in results if str(grad_year) == str(c['metadata']['grad_year'])]
        if min_grit:
            results = [c for c in results if c['metrics']['grit_score'] >= min_grit]
        return results

if __name__ == "__main__":
    # Test logic
    db = MeridianDatabase()
    print("Database initialized.")
