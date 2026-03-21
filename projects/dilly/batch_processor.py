import pandas as pd
import re
import json
import os

class DillyBatchAuditor:
    def __init__(self, csv_path):
        self.csv_path = csv_path
        self.df = None
        self.results = []

    def load_data(self):
        # The Kaggle dataset usually has 'Category' and 'Resume_str' or 'Resume_html'
        try:
            self.df = pd.read_csv(self.csv_path)
            print(f"Loaded {len(self.df)} resumes.")
            return True
        except Exception as e:
            print(f"Error loading CSV: {e}")
            return False

    def score_resume(self, text):
        text = str(text).lower()
        
        # 1. Impact Density (%, $, numbers)
        impact_count = len(re.findall(r'\d+%', text)) + len(re.findall(r'\$\d+', text))
        
        # 2. Leadership Presence
        roles = ['president', 'vp', 'vice president', 'chairman', 'director', 'secretary', 'founder', 'representative', 'lead', 'manager']
        leadership_count = sum(1 for role in roles if role in text)

        # 3. Technical Breadth
        tech_keywords = ['python', 'sql', 'javascript', 'aws', 'machine learning', 'tableau', 'excel', 'react', 'docker']
        tech_count = sum(1 for tech in tech_keywords if tech in text)

        # Basic Grit Score Calculation
        score = (impact_count * 5) + (leadership_count * 10) + (tech_count * 5)
        return min(100, score)

    def process_all(self):
        # Assuming the column name is 'Resume_str' or 'Resume'
        col_name = 'Resume_str' if 'Resume_str' in self.df.columns else 'Resume'
        
        self.df['dilly_score'] = self.df[col_name].apply(self.score_resume)
        
        # Get stats
        top_performers = self.df.nlargest(10, 'dilly_score')
        avg_score = self.df['dilly_score'].mean()
        
        summary = {
            "total_processed": len(self.df),
            "average_grit_score": round(avg_score, 2),
            "top_categories": self.df.groupby('Category')['dilly_score'].mean().nlargest(5).to_dict()
        }
        
        print(json.dumps(summary, indent=4))
        return summary

if __name__ == "__main__":
    auditor = DillyBatchAuditor("assets/Resume.csv")
    if auditor.load_data():
        auditor.process_all()
