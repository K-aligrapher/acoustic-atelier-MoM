"""Pydantic models for the HTTP API (PRD 6.5)."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    code: str
    message: str


class ExportRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(None, max_length=400)
    # Pitches after the unison, ending with the period (cents).
    cents: List[float] = Field(..., min_length=1, max_length=128)
    root_note: int = Field(60, ge=0, le=127)
    reference_freq: float = Field(261.6256, gt=1.0, lt=20000.0)


class ExportResponse(BaseModel):
    filename_base: str
    scl: str
    kbm: str


class HealthResponse(BaseModel):
    status: str
    version: str
