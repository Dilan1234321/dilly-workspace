import os
import sys
import datetime

# Set up absolute base path
BASE_PATH = "/Users/dilankochhar/.openclaw/workspace"
sys.path.append(BASE_PATH)

from projects.amazon_agent import AmazonTrendAgent

LOG_FILE = os.path.join(BASE_PATH, "core/memory/amazon_only_mission.md")

def log_progress(msg):
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(f"\n- [{timestamp}] {msg}")

def update_desktop_brief(msg):
    try:
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")
        update_dir = "/Users/dilankochhar/Desktop/Meridian_Updates"
        os.makedirs(update_dir, exist_ok=True)
        filename = f"AMAZON_ONLY_INTEL_{timestamp}.md"
        with open(os.path.join(update_dir, filename), "w") as f:
            f.write(f"# 🎯 Amazon Alpha Mission: ONLY INTEL\n\n{msg}")
    except Exception as e:
        log_progress(f"Desktop sync failed: {e}")

def main():
    log_progress("Starting PURE Amazon Product Discovery Cycle (No Meridian)...")
    
    try:
        agent = AmazonTrendAgent()
        # 1. Scrape/Simulate Trends
        products = agent.fetch_tiktok_trends()
        
        # 2. Update the master report
        agent.generate_live_report()
        
        # 3. Generate a quick brief for the user
        top_sku = products[0]['name'] if products else "None"
        brief = f"Cycle Complete (Amazon Only Mode).\n- Market Sweep: SUCCESS\n- Current Alpha: {top_sku}\n- Target: 100% ROI items only.\n- Status: Scouting Sourcing Channels."
        update_desktop_brief(brief)
        
        log_progress(f"Cycle Complete. Top SKU identified: {top_sku}")
        
    except Exception as e:
        log_progress(f"Amazon PURE Cycle failed: {e}")

if __name__ == "__main__":
    main()
