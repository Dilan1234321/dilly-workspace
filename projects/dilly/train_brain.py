import pandas as pd
import numpy as np
import pickle
import os
import argparse
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split

class DillyBrainTrainer:
    def __init__(self, csv_path, model_name):
        self.csv_path = csv_path
        self.model_name = model_name
        self.model_dir = f"projects/dilly/models/{model_name}"
        os.makedirs(self.model_dir, exist_ok=True)
        self.vectorizer = TfidfVectorizer(max_features=1000, stop_words='english')
        self.model = RandomForestRegressor(n_estimators=100, random_state=42)

    def prepare_data(self):
        print(f"Loading data from {self.csv_path}...")
        self.df = pd.read_csv(self.csv_path)
        col_name = 'Resume_str' if 'Resume_str' in self.df.columns else 'Resume'
        
        def calculate_label(text):
            text = str(text).lower()
            import re
            impact = len(re.findall(r'\d+%', text)) + len(re.findall(r'\$\d+', text))
            leadership = sum(1 for r in ['founder', 'vp', 'lead', 'manager', 'director', 'president', 'chair', 'secretary', 'single-handedly', 'orchestrated', 'spearheaded', 'launched'] if r in text)
            tech = sum(1 for t in ['python', 'sql', 'aws', 'javascript', 'api', 'docker', 'ml', 'html', 'css', 'tableau', 'excel', 'hostinger', 'netlify', 'deployment', 'pipeline', 'cicd'] if t in text)
            manual_grit = sum(1 for w in ['traveled', 'donated', 'purchased', 'distributed', 'personally', 'field', 'initiative'] if w in text)
            
            # Specialized School Metrics (Research, Clinical, Legal, Service)
            clinical_research = sum(1 for w in ['clinical', 'shadowed', 'laboratory', 'pi', 'pubmed', 'irb', 'wet lab', 'patient', 'hospital', 'emt', 'scribe'] if w in text)
            legal_advocacy = sum(1 for w in ['clerk', 'litigation', 'legal', 'policy', 'advocacy', 'moot court', 'debate', 'pro bono', 'docket', 'compliance'] if w in text)
            service_dedication = sum(1 for w in ['volunteer', 'non-profit', 'community', 'mission', 'outreach', 'service', 'teach', 'mentor'] if w in text)

            # Dilly Truth Standard: Integrated Specialized Valuation
            if self.model_name == "campus":
                # Campus favors Leadership, Tech, and Research output
                return (impact * 10) + (leadership * 20) + (tech * 10) + (manual_grit * 15) + (clinical_research * 12) + (legal_advocacy * 8)
            else:
                # Pro (Career/Professional) favors Impact, Grit, and specialized Professional Dedication
                return (impact * 8) + (leadership * 15) + (tech * 8) + (manual_grit * 20) + (clinical_research * 10) + (legal_advocacy * 12) + (service_dedication * 10)

        self.df['label'] = self.df[col_name].apply(calculate_label)
        return col_name

    def train(self):
        col_name = self.prepare_data()
        X = self.vectorizer.fit_transform(self.df[col_name].astype(str))
        y = self.df['label']

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        
        print(f"Training Dilly {self.model_name} Brain on {X_train.shape[0]} samples...")
        self.model.fit(X_train, y_train)
        
        with open(os.path.join(self.model_dir, "dilly_brain.pkl"), "wb") as f:
            pickle.dump(self.model, f)
        with open(os.path.join(self.model_dir, "vectorizer.pkl"), "wb") as f:
            pickle.dump(self.vectorizer, f)
        print(f"Brain serialized to {self.model_dir}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", default="assets/Resume.csv")
    parser.add_argument("--model_name", default="pro")
    args = parser.parse_args()
    
    trainer = DillyBrainTrainer(args.csv, args.model_name)
    trainer.train()
