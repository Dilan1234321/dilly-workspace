# 🏗️ LeaseLogic AI
**High-Fidelity Lead Scoring Engine for Real Estate Operations**

LeaseLogic AI is a production-grade machine learning service designed to predict tenant lease-signing probability. Built on an XGBoost architecture, it analyzes financial and behavioral indicators to provide instant, actionable confidence scores for leasing agents.

## 🚀 The Stack
- **Engine:** XGBoost (Gradient Boosted Decision Trees)
- **API:** FastAPI (Asynchronous Python)
- **Data Engineering:** Synthetic High-Fidelity Lead Data
- **Environment:** Container-ready with Uvicorn

## 🧠 Model Parameters
The engine evaluates five core vectors:
1. **Credit Score:** Financial reliability index.
2. **Monthly Income:** Liquidity and rent-to-income ratio analysis.
3. **Max Rent:** Market-fit thresholding.
4. **Employment Years:** Tenure and stability weighting.
5. **Prior Evictions:** Risk-mitigation penalty.

## 🛠️ Quick Start
```bash
# Clone the repository
git clone https://github.com/Dilan1234321/LeaseLogic-AI.git

# Install dependencies
pip install -r requirements.txt

# Run the API
python leaselogic_api.py
```

---
*Orchestrated by Atlas for Dilan Kochhar*
