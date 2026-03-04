import pandas as pd
import numpy as np

def generate_proptech_data(samples=5000):
    np.random.seed(42)
    
    # 1. Generate realistic features
    credit_scores = np.random.randint(500, 850, samples)
    monthly_income = np.random.randint(2500, 18000, samples)
    max_rent = np.random.randint(1200, 6000, samples)
    employment_years = np.random.randint(0, 15, samples)
    prior_evictions = np.random.choice([0, 1], samples, p=[0.92, 0.08])
    
    df = pd.DataFrame({
        'credit_score': credit_scores,
        'monthly_income': monthly_income,
        'max_rent': max_rent,
        'employment_years': employment_years,
        'prior_evictions': prior_evictions
    })
    
    # 2. Logic: Real Estate agents usually want 3x rent coverage
    income_rent_ratio = df['monthly_income'] / df['max_rent']
    
    # 3. Create a probability-based Target
    # Start with a base probability
    # If ratio > 3 and credit > 650, very likely.
    # If evictions > 0, almost zero.
    
    prob = 0.1 # base
    prob += (income_rent_ratio > 3).astype(float) * 0.4
    prob += (df['credit_score'] > 700).astype(float) * 0.3
    prob += (df['employment_years'] > 2).astype(float) * 0.1
    prob -= (df['prior_evictions'] == 1).astype(float) * 0.8
    
    # Clip probabilities between 0 and 1
    prob = np.clip(prob, 0, 1)
    
    # Generate labels based on probability
    df['signed_lease'] = np.random.binomial(1, prob)
    
    return df

if __name__ == "__main__":
    df = generate_proptech_data()
    df.to_csv('synthetic_leads.csv', index=False)
    print(f"Generated synthetic_leads.csv with {len(df)} samples.")
    print(f"Target distribution: \n{df['signed_lease'].value_counts(normalize=True)}")
