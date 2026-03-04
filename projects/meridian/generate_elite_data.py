import pandas as pd
import random
import os

def generate_elite_baseline(count=100):
    backgrounds = [
        "Founder of a VC-backed SaaS startup with $500k ARR. Scaled to 10k users.",
        "Ex-FAANG Software Engineer. Architected microservices serving 1M+ requests/sec.",
        "YC Alum. Built a FinTech platform with 99.9% uptime and $2M in processed transactions.",
        "Quantitative Researcher. Developed trading algorithms with 15% Sharpe ratio.",
        "Product Lead. Managed a team of 15 engineers to launch a global AI platform.",
        "Cloud Solutions Architect with 5x AWS Certifications. Migrated enterprise legacy to cloud.",
        "Senior Data Engineer. Optimized Petabyte-scale pipelines reducing latency by 40%."
    ]
    stacks = [
        ['Rust', 'Go', 'Kubernetes', 'AWS'],
        ['Python', 'PyTorch', 'TensorFlow', 'CUDA'],
        ['React', 'Node.js', 'PostgreSQL', 'Docker'],
        ['C++', 'Low-Latency', 'Kernel Programming'],
        ['Solidity', 'Web3', 'Ethereum']
    ]
    
    data = []
    for i in range(count):
        bg = random.choice(backgrounds)
        stack = random.choice(stacks)
        
        # High density of impact metrics and elite technical depth
        resume_text = f"Accomplished builder and {bg} "
        resume_text += f"Deep expertise in {', '.join(stack)}. "
        resume_text += "Proven track record of delivering high-scale systems and managing cross-functional teams. "
        resume_text += "Spearheaded technical vision and infrastructure overhaul leading to 40% efficiency gains."
        
        data.append({
            "Category": "ELITE-FOUNDER",
            "Resume_str": resume_text
        })
        
    df = pd.DataFrame(data)
    os.makedirs("assets/datasets", exist_ok=True)
    df.to_csv("assets/datasets/elite_baseline_synthetic.csv", index=False)
    print(f"Generated {count} elite 'adversarial' profiles for calibration.")

if __name__ == "__main__":
    generate_elite_baseline()
