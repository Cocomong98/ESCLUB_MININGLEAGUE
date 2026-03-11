"""Nexon Open API manager-mode analytics scaffolding package."""

from .analytics import (
    OpenApiAnalyticsError,
    build_manager_mode_analysis,
    clamp01,
    compute_manager_mode_summary,
    goal_time_to_seconds,
)
from .cache import JsonFileCache
from .client import NexonOpenApiClient, NexonOpenApiError
from .sync import sync_manager_mode_analysis

__all__ = [
    "NexonOpenApiClient",
    "NexonOpenApiError",
    "OpenApiAnalyticsError",
    "JsonFileCache",
    "goal_time_to_seconds",
    "clamp01",
    "build_manager_mode_analysis",
    "compute_manager_mode_summary",
    "sync_manager_mode_analysis",
]
