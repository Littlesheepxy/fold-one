#include "sherpa-onnx-c-api.h"

#include <stddef.h>
#include <stdio.h>
#include <string.h>

int main(int argc, char **argv) {
  if (argc != 5) {
    fprintf(stderr, "usage: %s tokens encoder decoder joiner\n", argv[0]);
    return 2;
  }

  printf("model_config_size=%zu recognizer_config_size=%zu\n",
         sizeof(SherpaOnnxOnlineModelConfig),
         sizeof(SherpaOnnxOnlineRecognizerConfig));
  printf("tokens_offset=%zu num_threads_offset=%zu provider_offset=%zu\n",
         offsetof(SherpaOnnxOnlineModelConfig, tokens),
         offsetof(SherpaOnnxOnlineModelConfig, num_threads),
         offsetof(SherpaOnnxOnlineModelConfig, provider));

  SherpaOnnxOnlineRecognizerConfig config;
  memset(&config, 0, sizeof(config));
  config.feat_config.sample_rate = 16000;
  config.feat_config.feature_dim = 80;
  config.model_config.tokens = argv[1];
  config.model_config.transducer.encoder = argv[2];
  config.model_config.transducer.decoder = argv[3];
  config.model_config.transducer.joiner = argv[4];
  config.model_config.num_threads = 2;
  config.model_config.provider = "cpu";
  config.decoding_method = "greedy_search";

  const SherpaOnnxOnlineRecognizer *recognizer =
      SherpaOnnxCreateOnlineRecognizer(&config);
  if (!recognizer) {
    fprintf(stderr, "recognizer creation failed\n");
    return 3;
  }

  const SherpaOnnxOnlineStream *stream =
      SherpaOnnxCreateOnlineStream(recognizer);
  if (!stream) {
    fprintf(stderr, "stream creation failed\n");
    SherpaOnnxDestroyOnlineRecognizer(recognizer);
    return 4;
  }

  puts("recognizer and stream created");
  SherpaOnnxDestroyOnlineStream(stream);
  SherpaOnnxDestroyOnlineRecognizer(recognizer);
  return 0;
}
