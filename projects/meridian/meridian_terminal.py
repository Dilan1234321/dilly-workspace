#!/usr/bin/env python3
import json
import os
import sys

# Paths
DB_PATH = "/Users/dilankochhar/.openclaw/workspace/projects/meridian/meridian_database.json"
BETA_DB_PATH = "/Users/dilankochhar/.openclaw/workspace/projects/meridian/beta_cohort_db.json"

def clear_screen():
    os.system('clear')

def load_data():
    real_data = []
    if os.path.exists(DB_PATH):
        with open(DB_PATH, 'r') as f:
            real_data = json.load(f).get('candidates', [])
            
    beta_data = []
    if os.path.exists(BETA_DB_PATH):
        with open(BETA_DB_PATH, 'r') as f:
            beta_data = json.load(f).get('candidates', [])
            
    return real_data + beta_data

def display_dashboard(candidates):
    print("\n" + "="*60)
    print("      MERIDIAN TALENT TERMINAL v1.0 - [ORCHESTRATOR MODE]")
    print("="*60)
    print(f"{'SCORE':<8} {'CANDIDATE':<15} {'MAJOR':<15} {'COLLEGE':<20}")
    print("-" * 60)
    
    # Sort by Grit Score
    sorted_candidates = sorted(candidates, key=lambda x: x['metrics']['grit_score'], reverse=True)
    
    for c in sorted_candidates[:15]: # Show top 15
        m = c['metadata']
        met = c['metrics']
        print(f"[{met['grit_score']:>3}/100] {m['candidate']:<15} {m['major']:<15} {m['college'][:20]:<20}")
    
    print("-" * 60)
    print(f"Total Database Size: {len(candidates)} candidates")
    print("Commands: (1) Filter Major (2) Filter Grit (3) Export Report (Q) Quit")
    print("="*60)

def main():
    data = load_data()
    while True:
        display_dashboard(data)
        choice = input("\nSelect an action: ").strip().lower()
        
        if choice == 'q':
            break
        elif choice == '1':
            major = input("Enter major to filter: ").strip()
            filtered = [c for c in data if major.lower() in c['metadata']['major'].lower()]
            display_dashboard(filtered)
            input("\nPress Enter to return to main...")
        elif choice == '2':
            grit = int(input("Enter minimum Grit Score: "))
            filtered = [c for c in data if c['metrics']['grit_score'] >= grit]
            display_dashboard(filtered)
            input("\nPress Enter to return to main...")
        else:
            input("\nInvalid command. Press Enter...")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nTerminal Offline.")
