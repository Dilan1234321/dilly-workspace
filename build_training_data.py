#!/usr/bin/env python3
"""
Build LLM training data from resumes in assets/resumes/.
Run from workspace root:  python build_training_data.py

Reads PDFs from assets/resumes/, runs the rule-based Meridian auditor on each,
and writes projects/meridian/prompts/training_data.json for few-shot.
"""

import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
RESUME_DIR = os.path.join(ROOT, "assets", "resumes")

# Force source to assets/resumes/ (override any env)
os.environ["RESUME_DIR"] = RESUME_DIR
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# Delegate to the full script
from projects.meridian.scripts.build_training_data import main

if __name__ == "__main__":
    main()
