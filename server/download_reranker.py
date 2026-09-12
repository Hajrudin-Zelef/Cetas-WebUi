"""Download cross-encoder model files at build time."""
from huggingface_hub import hf_hub_download

model_id = "cross-encoder/ms-marco-MiniLM-L6-v2"
local_dir = "/app/reranker_model"

hf_hub_download(repo_id=model_id, filename="onnx/model.onnx", local_dir=local_dir)
hf_hub_download(repo_id=model_id, filename="tokenizer.json", local_dir=local_dir)
print("Cross-encoder model downloaded to", local_dir)
