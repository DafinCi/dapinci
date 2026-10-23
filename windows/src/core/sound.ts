// SoundEngine — port of SoundEngine.swift.
// The 29 WAVs are ours and live in windows/sounds/ (see SOUNDS_DIR in
// vite.config.ts); they are served at /sounds/<name>.wav. Default volume 0.12,
// slider range 0–0.2, exactly like the Mac player, and several sounds may overlap.
// A file of the user's own in the sounds folder (src-tauri/src/sounds.rs)
// replaces a sound; one that doesn't decode falls back to the built-in one.

import { Bridge } from "./bridge";
import { State } from "./state";

export const SOUND_NAMES = [
  "peek", "open", "close", "hover", "blip", "slap", "annoyed", "dizzy", "greet",
  "work", "finish", "error", "approval", "question", "approve", "gulp", "tick",
  "send", "love", "pop", "proud", "wink", "yawn", "attach", "think", "search",
  "rate", "sleep", "greeting",
] as const;

export const SOUND_VARIANTS = [
  "dizzy_a", "dizzy_b", "dizzy_c",
  "finish_a", "finish_b", "finish_c",
  "greeting_a", "greeting_b", "greeting_c",
  "work_a", "work_b", "work_c",
] as const;

export const CORE_SOUND_NAMES = [
  "peek", "open", "close", "hover", "blip", "slap", "pop", "love",
] as const;

export const ALL_SOUND_NAMES = [...SOUND_NAMES, ...SOUND_VARIANTS] as const;

export type SoundName = (typeof SOUND_NAMES)[number];

class SoundEngine {
  enabled = true;
  volume = 0.12;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private idleTimer: number | null = null;
  private ownCustomSounds = new Set<string>();
  private loadingSounds = new Map<string, Promise<AudioBuffer | null>>();
  /** The sounds a file of the user's own replaces, as last loaded. */
  customized = new Set<string>();
  /** Sounds still playing, by name, so one can be faded out (the greeting). */
  private playing = new Map<string, Set<{ src: AudioBufferSourceNode; gain: GainNode }>>();

  /** Creates the context and preloads essential core sounds. Safe to call more than once. */
  preload(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = this.volume;
      master.connect(ctx.destination);
      this.master = master;
      await this.preloadCore(ctx);
    })();
    return this.loading;
  }

  /** Reads the sounds folder again (Settings → Reload sounds). */
  async reload(): Promise<void> {
    await this.preload();
    if (this.ctx) {
      this.buffers.clear();
      this.customized.clear();
      await this.preloadCore(this.ctx);
    }
  }

  private async preloadCore(ctx: AudioContext) {
    this.ownCustomSounds = new Set((await Bridge.customSounds(SOUND_NAMES)) ?? []);
    this.customized.clear();

    const toPreload = new Set<string>(CORE_SOUND_NAMES);
    const variants = State.settings?.soundVariants;
    if (variants) {
      for (const [k, v] of Object.entries(variants)) {
        toPreload.add(`${k}_${v}`);
      }
    } else {
      toPreload.add("greeting_a");
      toPreload.add("finish_a");
      toPreload.add("work_a");
      toPreload.add("dizzy_a");
    }

    await Promise.all(Array.from(toPreload).map((name) => this.loadSound(ctx, name)));
  }

  /** Loads and decodes a sound on demand, caching it in memory. */
  private async loadSound(ctx: AudioContext, name: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(name);
    if (cached) return cached;
    const existing = this.loadingSounds.get(name);
    if (existing) return existing;

    const promise = (async () => {
      if (this.ownCustomSounds.has(name)) {
        try {
          const bytes = await Bridge.customSound(name);
          if (bytes && bytes.byteLength > 0) {
            const buf = await ctx.decodeAudioData(bytes);
            this.buffers.set(name, buf);
            this.customized.add(name);
            return buf;
          }
        } catch {
          /* not a format this webview decodes: fallback to built-in */
        }
      }
      try {
        const res = await fetch(`/sounds/${name}.wav`);
        if (!res.ok) return null;
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(name, buf);
        return buf;
      } catch {
        return null;
      }
    })();

    this.loadingSounds.set(name, promise);
    try {
      return await promise;
    } finally {
      this.loadingSounds.delete(name);
    }
  }

  /** WebView2 can hand us a suspended context; call after any user input. */
  resume() {
    if (this.idleTimer != null) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    void this.ctx?.resume();
  }

  /**
   * Called when the island goes quiet. A running AudioContext keeps an audio
   * thread and its render quantum alive even with nothing playing, which shows
   * up as a steady trickle of CPU on a machine that is supposed to be idle.
   *
   * The delay covers the tail of whatever just played — suspending mid-sound
   * would clip it — and `play()` resumes the context on its own.
   */
  idle() {
    if (!this.ctx || this.ctx.state !== "running" || this.idleTimer != null) return;
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = null;
      void this.ctx?.suspend();
    }, 1500);
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(0.2, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
  }

  /** Resolves variant choice for customizable sounds ("dizzy", "finish", "greeting", "work"). */
  resolveVariant(name: string): string {
    const v = State.settings?.soundVariants?.[name];
    if (v) {
      return `${name}_${v}`;
    }
    return name;
  }

  play(name: SoundName | string) {
    if (!this.enabled) return;
    const resolved = this.resolveVariant(name);
    const buf = this.buffers.get(resolved) ?? this.buffers.get(name);
    if (buf) {
      this.playBuffer(buf, resolved);
      return;
    }
    if (this.ctx) {
      void this.loadSound(this.ctx, resolved).then((loaded) => {
        if (loaded && this.enabled) {
          this.playBuffer(loaded, resolved);
        } else if (resolved !== name) {
          const fallback = this.buffers.get(name);
          if (fallback && this.enabled) {
            this.playBuffer(fallback, name);
          } else if (this.ctx) {
            void this.loadSound(this.ctx, name).then((b) => {
              if (b && this.enabled) this.playBuffer(b, name);
            });
          }
        }
      });
    }
  }

  /** Plays a preview of a specific sound variant (works even if sound is muted). */
  preview(name: SoundName | string, variant = "a") {
    this.resume();
    const variantName = `${name}_${variant}`;
    const buf = this.buffers.get(variantName) ?? this.buffers.get(name);
    if (buf) {
      this.playBuffer(buf, variantName);
      return;
    }
    if (this.ctx) {
      void this.loadSound(this.ctx, variantName).then((loaded) => {
        if (loaded) {
          this.playBuffer(loaded, variantName);
        } else if (this.ctx) {
          void this.loadSound(this.ctx, name).then((b) => {
            if (b) this.playBuffer(b, name);
          });
        }
      });
    }
  }

  private playBuffer(buf: AudioBuffer, name: string) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    if (this.idleTimer != null) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (ctx.state === "suspended") void ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    src.connect(gain);
    gain.connect(master);
    const voice = { src, gain };
    let voices = this.playing.get(name);
    if (!voices) this.playing.set(name, (voices = new Set()));
    voices.add(voice);
    src.onended = () => {
      voices.delete(voice);
      gain.disconnect();
    };
    src.start();
  }

  /** Fades every playing copy of `name` to silence over `seconds`, then stops it. */
  fadeOut(name: string, seconds: number) {
    const ctx = this.ctx;
    const voices = this.playing.get(name);
    if (!ctx || !voices) return;
    const t = ctx.currentTime;
    for (const { src, gain } of voices) {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + seconds);
      try {
        src.stop(t + seconds);
      } catch {
        /* already stopped */
      }
    }
  }
}

export const Sound = new SoundEngine();
