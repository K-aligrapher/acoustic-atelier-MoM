"""Engine error type with stable machine-readable codes (PRD 6.5)."""

from __future__ import annotations


class EngineError(Exception):
    """An expected, user-facing failure.

    `code` is one of:
        FILE_TOO_LARGE, FILE_TOO_LONG, FILE_TOO_SHORT, UNSUPPORTED_FORMAT,
        SIGNAL_TOO_QUIET, NO_PARTIALS_FOUND, INVALID_PARAMETER
    """

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message

    def to_dict(self) -> dict:
        return {"code": self.code, "message": self.message}
