import { Audio } from 'expo-av';

class AudioDuckingService {
  private currentMusicSound: Audio.Sound | null = null;
  private ducking = false;

  setMusicSound(sound: Audio.Sound | null): void {
    this.currentMusicSound = sound;
  }

  async duck(): Promise<void> {
    const sound = this.currentMusicSound;
    if (!sound) {
      return;
    }
    this.ducking = true;
    try {
      const steps = 6;
      const target = 0.15;
      for (let i = 1; i <= steps; i++) {
        if (!this.ducking) {
          return;
        }
        const v = 1 - (i / steps) * (1 - target);
        await sound.setVolumeAsync(v);
        await new Promise((r) => setTimeout(r, 50));
      }
      await sound.setVolumeAsync(target);
    } catch {
      this.ducking = false;
    }
  }

  async restore(): Promise<void> {
    const sound = this.currentMusicSound;
    this.ducking = false;
    if (!sound) {
      return;
    }
    try {
      const steps = 10;
      const status = await sound.getStatusAsync();
      const start =
        status.isLoaded &&
        'volume' in status &&
        typeof status.volume === 'number'
          ? status.volume
          : 0.15;
      for (let i = 1; i <= steps; i++) {
        const v = start + (i / steps) * (1 - start);
        await sound.setVolumeAsync(Math.min(1, v));
        await new Promise((r) => setTimeout(r, 50));
      }
      await sound.setVolumeAsync(1);
    } catch {}
  }
}

export const audioDuckingService = new AudioDuckingService();
