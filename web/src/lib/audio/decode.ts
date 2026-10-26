import { AppError } from "../errors";
import type { SoundSource } from "../types";

export const ANALYSIS_SR = 44100;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_DURATION_S = 60;
export const MAX_ANALYSIS_S = 30;
export const ACCEPTED_EXT = [".wav", ".mp3", ".flac", ".ogg", ".oga"];
export const ACCEPT_ATTR = ".wav,.mp3,.flac,.ogg,.oga,audio/wav,audio/x-wav,audio/mpeg,audio/flac,audio/ogg";

/** Identify the container from its first bytes (validation by content). */
export function sniffFormat(b: Uint8Array): "wav" | "flac" | "ogg" | "mp3" | null {
  const s = (o: number, t: string) => t.split("").every((c, i) => b[o + i] === c.charCodeAt(0));
  if (s(0, "RIFF") || s(0, "RF64") || s(0, "RIFX")) return "wav";
  if (s(0, "fLaC")) return "flac";
  if (s(0, "OggS")) return "ogg";
  if (s(0, "ID3")) return "mp3";
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return "mp3";
  return null;
}

/** Read the original sample rate from the file header where it is easy to find. */
export function probeSampleRate(b: Uint8Array, fmt: string | null): number | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  try {
    if (fmt === "wav") {
      // Walk RIFF chunks to find "fmt ".
      let o = 12;
      while (o + 8 <= b.length) {
        const id = String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
        const size = dv.getUint32(o + 4, true);
        if (id === "fmt ") return dv.getUint32(o + 12, true);
        o += 8 + size + (size % 2);
      }
    }
    if (fmt === "flac") {
      // STREAMINFO: 20-bit sample rate at byte 18 of the stream (after 4-byte magic + 4-byte block header).
      const x = 8 + 10;
      return (b[x] << 12) | (b[x + 1] << 4) | (b[x + 2] >> 4);
    }
    if (fmt === "ogg") {
      // Vorbis identification header: "\x01vorbis" then version(4) channels(1) rate(4).
      for (let i = 0; i < Math.min(b.length - 16, 512); i++) {
        if (b[i] === 1 && String.fromCharCode(...b.slice(i + 1, i + 7)) === "vorbis") return dv.getUint32(i + 12, true);
        if (String.fromCharCode(...b.slice(i, i + 8)) === "OpusHead") return 48000; // Opus always decodes at 48 kHz
      }
    }
    if (fmt === "mp3") {
      let o = 0;
      if (String.fromCharCode(b[0], b[1], b[2]) === "ID3") {
        const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
        o = 10 + size;
      }
      for (let i = o; i < Math.min(b.length - 4, o + 8192); i++) {
        if (b[i] === 0xff && (b[i + 1] & 0xe0) === 0xe0) {
          const ver = (b[i + 1] >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
          const idx = (b[i + 2] >> 2) & 3;
          if (idx === 3 || ver === 1) continue;
          const base = [44100, 48000, 32000][idx];
          return ver === 3 ? base : ver === 2 ? base / 2 : base / 4;
        }
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}

function offlineContext(length: number): OfflineAudioContext {
  const Ctor: typeof OfflineAudioContext =
    window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  return new Ctor(1, Math.max(1, length), ANALYSIS_SR);
}

export async function loadFile(file: File): Promise<SoundSource> {
  const lower = file.name.toLowerCase();
  if (file.size > MAX_FILE_BYTES) throw new AppError("FILE_TOO_LARGE");
  if (file.size === 0) throw new AppError("UNSUPPORTED_FORMAT");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fmt = sniffFormat(bytes);
  const extOk = ACCEPTED_EXT.some((e) => lower.endsWith(e));
  if (!fmt || (!extOk && !file.type.startsWith("audio/"))) throw new AppError("UNSUPPORTED_FORMAT");

  let buffer: AudioBuffer;
  try {
    // decodeAudioData detaches the buffer, so give it a copy.
    buffer = await offlineContext(1).decodeAudioData(bytes.slice().buffer);
  } catch {
    throw new AppError("DECODE_FAILED");
  }
  if (buffer.duration > MAX_DURATION_S) throw new AppError("FILE_TOO_LONG");
  if (buffer.duration < 0.15) throw new AppError("FILE_TOO_SHORT");

  return {
    kind: "upload",
    name: file.name,
    sizeBytes: file.size,
    buffer,
    durationS: buffer.duration,
    sourceSampleRate: probeSampleRate(bytes, fmt),
    channels: buffer.numberOfChannels,
  };
}

/** Mono mix of an AudioBuffer between two sample indices. */
export function monoMix(buffer: AudioBuffer, start = 0, end = buffer.length): Float32Array {
  const n = Math.max(0, end - start);
  const out = new Float32Array(n);
  const chs = buffer.numberOfChannels;
  for (let c = 0; c < chs; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[start + i] / chs;
  }
  return out;
}

/** 16-bit PCM mono WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => s.split("").forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

/**
 * Prepare the upload: at most 30 s of mono 16-bit audio at 44.1 kHz (keeps the
 * request small enough for serverless limits). Returns the region relative to
 * the uploaded segment.
 */
export function prepareUpload(
  src: SoundSource,
  region: { start_ms: number; end_ms: number } | null,
): { audio: Blob; segmentOffsetMs: number; region: { start_ms: number; end_ms: number } | null } {
  const sr = src.buffer.sampleRate;
  const total = src.buffer.length;
  const maxLen = Math.floor(MAX_ANALYSIS_S * sr);
  let start = 0;
  if (total > maxLen && region) start = Math.max(0, Math.min(total - maxLen, Math.floor((region.start_ms / 1000) * sr)));
  const end = Math.min(total, start + maxLen);
  const segmentOffsetMs = (start / sr) * 1000;
  const audio = encodeWav(monoMix(src.buffer, start, end), sr);
  const rel = region
    ? { start_ms: region.start_ms - segmentOffsetMs, end_ms: Math.min(region.end_ms - segmentOffsetMs, ((end - start) / sr) * 1000) }
    : null;
  return { audio, segmentOffsetMs, region: rel };
}
