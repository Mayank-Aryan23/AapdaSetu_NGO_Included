FROM python:3.11-slim

WORKDIR /api

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# model.pkl is mounted at runtime, not baked into image
# docker run -v $(pwd)/model.pkl:/api/model.pkl ...

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
