from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import pickle
import pandas as pd
import uvicorn
import logging
import os

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_PATH = 'proptech_model.pkl'

# Singleton pattern for model loading
class ModelLoader:
    _model = None

    @classmethod
    def get_model(cls):
        if cls._model is None:
            if not os.path.exists(MODEL_PATH):
                logger.error(f"Model file {MODEL_PATH} not found.")
                raise RuntimeError("Model file not found")
            with open(MODEL_PATH, 'rb') as f:
                cls._model = pickle.load(f)
        return cls._model

app = FastAPI(
    title="LeaseLogic AI",
    description="Predictive Lead Scoring for PropTech",
    version="1.0.0"
)

class LeadData(BaseModel):
    credit_score: int = Field(..., ge=300, le=850, description="FICO Credit Score")
    monthly_income: int = Field(..., gt=0, description="Gross monthly income in USD")
    max_rent: int = Field(..., gt=0, description="Target monthly rent")
    employment_years: int = Field(..., ge=0, description="Years at current employer")
    prior_evictions: int = Field(..., ge=0, le=1, description="0 for none, 1 for yes")

@app.get("/health")
def health_check():
    try:
        ModelLoader.get_model()
        return {"status": "healthy", "model_loaded": True}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}

@app.post("/predict")
def predict_likelihood(data: LeadData):
    try:
        model = ModelLoader.get_model()
        
        # Convert input to DataFrame for model
        input_df = pd.DataFrame([data.dict()])
        
        # Predict
        prediction = model.predict(input_df)[0]
        probability = model.predict_proba(input_df)[0][1]
        
        return {
            "will_sign": bool(prediction),
            "confidence_score": round(float(probability), 4),
            "recommendation": "High Priority" if probability > 0.8 else "Medium Priority" if probability > 0.5 else "Low Priority"
        }
    except Exception as e:
        logger.exception("Prediction failed")
        raise HTTPException(status_code=500, detail="Internal Server Error")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
