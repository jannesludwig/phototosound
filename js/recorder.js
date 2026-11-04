// ─────────────────────────────────────────────────────────────
//  recorder.js — WebM export of the canvas + the master audio bus.
// ─────────────────────────────────────────────────────────────
export class Recorder {
  constructor() { this.rec = null; this.chunks = []; }

  static supported() { return typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream; }

  start(canvas, audioStream) {
    const stream = canvas.captureStream(60);
    if (audioStream) for (const t of audioStream.getAudioTracks()) stream.addTrack(t);
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
    this.mime = mimeType || 'video/webm';
    this.chunks = [];
    this.rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12e6, audioBitsPerSecond: 192e3 });
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.rec.start(250);
    this.t0 = performance.now();
  }

  get active() { return !!this.rec && this.rec.state === 'recording'; }
  get seconds() { return this.active ? (performance.now() - this.t0) / 1000 : 0; }

  /** Stops and downloads the file. */
  stop(name = 'photo-to-sound') {
    return new Promise((resolve) => {
      if (!this.rec) return resolve();
      this.rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mime });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${name}.${this.mime.includes('mp4') ? 'mp4' : 'webm'}`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        this.rec = null; resolve();
      };
      this.rec.stop();
    });
  }
}
