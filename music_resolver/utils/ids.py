def parse_public_id(value: str) -> tuple[str, str] | None:
    if not value or ":" not in value:
        return None
    source, source_id = value.split(":", 1)
    source = source.strip()
    source_id = source_id.strip()
    if not source or not source_id:
        return None
    return source, source_id
