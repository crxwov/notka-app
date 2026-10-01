import logging


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def log_provider_result(
    operation: str,
    provider: str,
    duration_ms: int,
    success: bool,
    fallback_used: bool,
    **fields,
) -> None:
    extras = " ".join(f"{key}={value}" for key, value in fields.items() if value is not None)
    message = (
        f"{operation} provider={provider} duration={duration_ms}ms "
        f"success={str(success).lower()} fallback_used={str(fallback_used).lower()}"
    )
    if extras:
        message = f"{message} {extras}"
    logging.getLogger("music_resolver.providers").info(message)
