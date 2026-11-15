"""Pure project knowledge store selection."""

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class ConfigInput:
    project: str
    explicit_root: str | None
    configured_root: str | None
    review_root: str | None


@dataclass(frozen=True)
class StoreSelection:
    root: str
    origin: Literal['explicit', 'project', 'review']


@dataclass(frozen=True)
class ConfigError:
    code: Literal['missing_root', 'conflicting_roots']
    message: str


def select_store(value: ConfigInput) -> StoreSelection | ConfigError:
    """Select one supplied store root without reading or changing configuration."""
    match value:
        case ConfigInput(explicit_root=root) if root is not None:
            return StoreSelection(root, 'explicit')
        case ConfigInput(configured_root=project_root, review_root=review_root) \
                if project_root is not None and review_root is not None \
                and project_root != review_root:
            return ConfigError(
                'conflicting_roots',
                'Project knowledge and legacy review settings point to different roots.',
            )
        case ConfigInput(configured_root=root) if root is not None:
            return StoreSelection(root, 'project')
        case ConfigInput(review_root=root) if root is not None:
            return StoreSelection(root, 'review')
        case _:
            return ConfigError(
                'missing_root',
                'No project knowledge root is configured; choose a shared project store.',
            )
