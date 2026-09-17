Drop the Colab-trained classifier here as `hey_bernise.onnx`.

Shared Apache-licensed frontends (already vendored):

- `melspectrogram.onnx`
- `embedding_model.onnx`

Train: [openWakeWord Colab](https://colab.research.google.com/drive/1q1oe2zOyZp7UsB3jJiQ1IFn8z5YfjwEb) on a T4. Set `target_phrase` to `hey bernise` and `model_name` to `hey_bernise`. Listen starts without the keyword file but never wakes.
