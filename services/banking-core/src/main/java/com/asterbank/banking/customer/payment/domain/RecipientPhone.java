package com.asterbank.banking.customer.payment.domain;

/** Exact mainland-China demo phone canonicalization; no guessing or fuzzy matching. */
public final class RecipientPhone {
  private RecipientPhone() {}

  public static String canonical(String input) {
    if (input == null || !input.matches("[+0-9\\s()\\-]+")) return null;
    var compact = input.replaceAll("[\\s()\\-]", "");
    if (compact.startsWith("0086")) compact = "+86" + compact.substring(4);
    else if (compact.matches("1[3-9][0-9]{9}")) compact = "+86" + compact;
    return compact.matches("\\+861[3-9][0-9]{9}") ? compact : null;
  }

  public static String masked(String canonical) {
    if (canonical == null) return null;
    if (!canonical.matches("\\+861[3-9][0-9]{9}"))
      throw new IllegalArgumentException("Invalid stored recipient phone");
    var national = canonical.substring(3);
    return national.substring(0, 3) + "****" + national.substring(7);
  }
}
