import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
import pickle
import os

def train_model():
    if not os.path.exists('synthetic_leads.csv'):
        print("Data not found. Run proptech_generator.py first.")
        return

    df = pd.read_csv('synthetic_leads.csv')
    X = df.drop('signed_lease', axis=1)
    y = df['signed_lease']
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    print("Training XGBoost model...")
    # Simplified fit for compatibility
    model = xgb.XGBClassifier(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.05,
        random_state=42,
        eval_metric='logloss'
    )
    
    model.fit(X_train, y_train)
    
    y_pred = model.predict(X_test)
    print(f"Accuracy: {accuracy_score(y_test, y_pred):.2f}")
    
    with open('proptech_model.pkl', 'wb') as f:
        pickle.dump(model, f)
    print("Model saved to proptech_model.pkl")

if __name__ == "__main__":
    train_model()
