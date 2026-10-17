"""Replaceable task-state boundary; the first adapter is process-local."""

from __future__ import annotations

from abc import ABC, abstractmethod

from .task_models import TaskState


class TaskStateStore(ABC):
    @abstractmethod
    async def get(self, task_id: str) -> TaskState | None: ...

    @abstractmethod
    async def save(self, task: TaskState) -> None: ...


class InMemoryTaskStateStore(TaskStateStore):
    def __init__(self) -> None:
        self._tasks: dict[str, TaskState] = {}

    async def get(self, task_id: str) -> TaskState | None:
        task = self._tasks.get(task_id)
        return task.model_copy(deep=True) if task else None

    async def save(self, task: TaskState) -> None:
        self._tasks[task.task_id] = task.model_copy(deep=True)
