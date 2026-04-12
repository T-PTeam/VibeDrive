English Vosk wake model (required for hands-free in dev builds)

Option A — automatic (Linux/macOS, bash, curl, unzip):
  From mobile-app: npm run vosk:model
  EAS runs the same script via eas-build-pre-install before native build.

Option B — manual:
  1. Download: https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip
  2. Unzip and move ALL contents of folder vosk-model-small-en-us-0.15 into this directory (am/, conf/, graph/, ivector/, …).
  3. npx expo prebuild or eas build

Folder name must stay model-wake-en (see app.json react-native-vosk plugin).
