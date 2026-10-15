import asyncio
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

# In-memory async fallback queue for development / test
_TASK_REGISTRY = {}


def register_task(task_name: str, func):
    _TASK_REGISTRY[task_name] = func


async def enqueue_job(task_name: str, **kwargs):
    func = _TASK_REGISTRY.get(task_name)
    if func:
        # Schedule in background asyncio task
        asyncio.create_task(func(**kwargs))
    else:
        logger.warning(f"Task {task_name} not found in in-memory registry")
