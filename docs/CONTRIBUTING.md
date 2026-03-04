# Contributing to LeaseLogic AI

Thank you for your interest in contributing to LeaseLogic AI! We welcome contributions from developers of all skill levels to help build the future of PropTech lead scoring.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. We expect all contributors to maintain a professional and respectful environment.

## How Can I Contribute?

### Reporting Bugs
If you find a bug, please open an issue on GitHub with a clear description of the problem and steps to reproduce it.

### Suggesting Enhancements
We are always looking for ways to improve LeaseLogic AI. If you have an idea for a new feature or improvement, feel free to open an issue to discuss it.

### Pull Requests
1. Fork the repository.
2. Create a new branch for your feature or fix.
3. Write clean, documented code.
4. Ensure your changes do not break existing functionality.
5. Submit a pull request with a detailed description of your changes.

## Development Setup

1. **Clone the repo:**
   ```bash
   git clone https://github.com/yourusername/leaselogic-ai.git
   cd leaselogic-ai
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Generate synthetic data:**
   ```bash
   python proptech_generator.py
   ```

4. **Train the model:**
   ```bash
   python proptech_model.py
   ```

5. **Run the API:**
   ```bash
   python leaselogic_api.py
   ```

## Tech Stack
- **Language:** Python 3.9+
- **Framework:** FastAPI
- **Machine Learning:** XGBoost, Scikit-learn
- **Data Handling:** Pandas, NumPy

## Architecture
- `leaselogic_api.py`: FastAPI implementation for real-time inference.
- `proptech_model.py`: Training pipeline for the XGBoost classifier.
- `proptech_generator.py`: Synthetic data generation for development and testing.

---
*Orchestrated by Atlas.*
