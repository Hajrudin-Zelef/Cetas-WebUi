"""Cross-encoder reranker for memory search (ONNX Runtime).

Lazy singleton pattern: model loaded on first call, cached for subsequent uses.
Falls back to None if import or model loading fails (caller should use TF-IDF).

Uses onnxruntime + tokenizers + numpy (no torch dependency).
"""

import logging

_log = logging.getLogger("reranker")

_model = None
_tokenizer = None
_input_names = None
_load_attempted = False


def _load():
    global _model, _tokenizer, _input_names, _load_attempted
    if _load_attempted:
        return _model, _tokenizer
    _load_attempted = True
    try:
        from tokenizers import Tokenizer
        import onnxruntime as ort

        model_path = "/app/reranker_model/onnx/model.onnx"
        tokenizer_path = "/app/reranker_model/tokenizer.json"

        _model = ort.InferenceSession(model_path)
        _tokenizer = Tokenizer.from_file(tokenizer_path)
        _input_names = [inp.name for inp in _model.get_inputs()]
        _log.info("Cross-encoder reranker loaded (ONNX)")
    except Exception as e:
        _log.warning("Cross-encoder unavailable, falling back to TF-IDF: %s", e)
        _model = None
        _tokenizer = None
    return _model, _tokenizer


def rerank(query, docs, limit=8):
    """Rerank docs by semantic similarity.

    Args:
        query: Search query string.
        docs: List of dicts with keys: fn, title, content.
        limit: Max results to return.

    Returns:
        List of dicts {file, title, snippet} sorted by score, or None if reranker unavailable.
    """
    model, tokenizer = _load()
    if model is None or not docs:
        return None

    try:
        import numpy as np

        pairs = [(query, d["content"]) for d in docs]

        tokenizer.enable_padding(pad_id=0, pad_token="[PAD]")
        tokenizer.enable_truncation(max_length=512)
        encodings = tokenizer.encode_batch(pairs)

        max_len = max(len(e.ids) for e in encodings)
        input_ids = np.zeros((len(encodings), max_len), dtype=np.int64)
        attention_mask = np.zeros((len(encodings), max_len), dtype=np.int64)
        for i, e in enumerate(encodings):
            input_ids[i, :len(e.ids)] = e.ids
            attention_mask[i, :len(e.attention_mask)] = e.attention_mask

        feed = {}
        for name in _input_names:
            if "input_ids" in name:
                feed[name] = input_ids
            elif "attention_mask" in name:
                feed[name] = attention_mask
            elif "token_type" in name:
                feed[name] = np.zeros_like(input_ids, dtype=np.int64)

        outputs = model.run(None, feed)
        scores = outputs[0].squeeze(-1).tolist()
        if not isinstance(scores, list):
            scores = [float(scores)]
    except Exception as e:
        _log.warning("Rerank prediction failed: %s", e)
        return None

    scored = []
    for i, doc in enumerate(docs):
        flat = " ".join(doc["content"].split())
        if len(flat) > 200:
            snippet = flat[:200] + "..."
        else:
            snippet = flat
        scored.append({
            "file": doc["fn"],
            "title": doc["title"],
            "snippet": snippet,
            "score": float(scores[i]),
        })

    scored.sort(key=lambda r: -r["score"])
    return [{"file": r["file"], "title": r["title"], "snippet": r["snippet"]} for r in scored[:limit]]
