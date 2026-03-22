#!/usr/bin/env python3
import json
import os
import sys

# Paths (no beta cohort; Meridian uses only few-shot from training_data.json)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(SCRIPT_DIR, "meridian_database.json")

def clear_screen():
    os.system("cls" if os.name == "nt" else "clear")

def load_data():
    data = []
    if os.path.exists(DB_PATH):
        with open(DB_PATH, "r") as f:
            data = json.load(f).get("candidates", [])
    return data

def grit(c):
    """Grit score from either metrics.grit_score or scores.grit."""
    m = c.get("metrics") or c.get("scores") or {}
    return m.get("grit_score", m.get("grit", 0))

def display_dashboard(candidates):
    print("\n" + "="*60)
    print("      MERIDIAN TALENT TERMINAL v1.0 - [ORCHESTRATOR MODE]")
    print("="*60)
    print(f"{'SCORE':<8} {'CANDIDATE':<15} {'MAJOR':<15} {'COLLEGE':<20}")
    print("-" * 60)
    sorted_candidates = sorted(candidates, key=grit, reverse=True)
    for c in sorted_candidates[:15]:
        m = c.get("metadata", {})
        met = c.get("metrics", c.get("scores", {}))
        name = m.get("candidate") or m.get("name", "?")[:15]
        major = (m.get("major") or "?")[:15]
        college = (m.get("college") or "?")[:20]
        g = met.get("grit_score", met.get("grit", 0))
        print(f"[{g:>3}/100] {name:<15} {major:<15} {college:<20}")
    
    print("-" * 60)
    print(f"Total Database Size: {len(candidates)} candidates")
    print("Commands: (1) Filter Major (2) Filter Grit (3) Export Report (Q) Quit")
    print("="*60)

def main():
    data = load_data()
    while True:
        display_dashboard(data)
        choice = input("\nSelect an action: ").strip().lower()
        
        if choice == "q":
            break
        elif choice == "1":
            major = input("Enter major to filter: ").strip()
            filtered = [c for c in data if major.lower() in (c.get("metadata", {}).get("major") or "?").lower()]
            display_dashboard(filtered)
            input("\nPress Enter to return to main...")
        elif choice == "2":
            min_grit = int(input("Enter minimum Grit Score: "))
            filtered = [c for c in data if grit(c) >= min_grit]
            display_dashboard(filtered)
            input("\nPress Enter to return to main...")
        else:
            input("\nInvalid command. Press Enter...")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nTerminal Offline.")
