import asyncio
import logging
from app.tasks.ai_tasks import evaluate_essay_answer_task

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("worker")


async def main():
    logger.info("CK3G Background AI Worker started. Ready for tasks...")
    while True:
        await asyncio.sleep(3600)


if __name__ == "__main__":
    asyncio.run(main())
