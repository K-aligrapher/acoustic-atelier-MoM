// Human messages for every error code (PRD 7.3). Calm, specific, actionable.

export class AppError extends Error {
  code: string;
  detail?: string;
  constructor(code: string, detail?: string) {
    super(detail ?? code);
    this.code = code;
    this.detail = detail;
  }
}

interface ErrorCopy {
  title: string;
  message: string;
}

const COPY: Record<string, ErrorCopy> = {
  UNSUPPORTED_FORMAT: {
    title: "That format isn't supported",
    message: "Please choose a WAV, MP3, FLAC or OGG file. If it already is one, try re-exporting it as a 16-bit WAV.",
  },
  DECODE_FAILED: {
    title: "We couldn't read that recording",
    message: "Your browser couldn't decode the file. Try exporting it again as WAV or FLAC.",
  },
  FILE_TOO_LARGE: {
    title: "That file is too large",
    message: "The limit is 20 MB. Trim the recording to a single note or strike and try again.",
  },
  FILE_TOO_LONG: {
    title: "That recording is too long",
    message: "Please use a sample under 60 seconds. A single note or strike usually gives the clearest result.",
  },
  FILE_TOO_SHORT: {
    title: "That sound is too short",
    message: "There's less than 150 ms of usable sound. Try a recording that lets the note ring a little longer.",
  },
  SIGNAL_TOO_QUIET: {
    title: "That recording is very quiet",
    message: "It's very quiet or mostly silent. Try a louder recording of a single note or strike.",
  },
  NO_PARTIALS_FOUND: {
    title: "No clear overtones found",
    message:
      "Noisy, reverberant or polyphonic recordings rarely give useful results. A clean, isolated single note or strike works best.",
  },
  INVALID_PARAMETER: {
    title: "A parameter is out of range",
    message: "Check the analysis parameters and try again.",
  },
  ANALYSIS_TIMEOUT: {
    title: "The analysis took too long",
    message: "Try a shorter sample, a smaller analysis window or fewer partials.",
  },
  RATE_LIMITED: {
    title: "Too many analyses at once",
    message: "Please wait a minute before analysing again.",
  },
  ANALYSIS_FAILED: {
    title: "The analysis didn't complete",
    message: "Something went wrong on the analysis server. Please try again or use a different recording.",
  },
  NETWORK: {
    title: "The analysis server couldn't be reached",
    message: "Check your connection and try again. If you're running locally, make sure the API server is started.",
  },
  EXPORT_FAILED: {
    title: "Export failed",
    message: "The tuning file couldn't be generated. Nothing was downloaded — please try again.",
  },
};

export function describeError(err: unknown): ErrorCopy & { code: string } {
  const code = err instanceof AppError ? err.code : "ANALYSIS_FAILED";
  const copy = COPY[code] ?? COPY.ANALYSIS_FAILED;
  // Server-provided messages are already human-written; prefer them for
  // parameter errors where the exact field matters.
  const detail = err instanceof AppError ? err.detail : undefined;
  const message = code === "INVALID_PARAMETER" && detail ? detail : copy.message;
  return { code, title: copy.title, message };
}
