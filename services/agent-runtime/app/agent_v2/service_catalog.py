"""Public service identifiers for model suggestions; URLs live in trusted Web code."""

SERVICE_IDS = frozenset({
    "accounts", "transfer", "transactions", "cards", "wealth",
    "subscriptions", "security", "spending",
})


def allowed_service_ids(values: object) -> list[str]:
    if not isinstance(values, list):
        return []
    return list(dict.fromkeys(value for value in values[:8]
                              if isinstance(value, str) and value in SERVICE_IDS))
