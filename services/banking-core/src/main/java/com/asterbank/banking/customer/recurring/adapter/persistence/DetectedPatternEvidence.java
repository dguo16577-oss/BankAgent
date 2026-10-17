package com.asterbank.banking.customer.recurring.adapter.persistence;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.text.Normalizer;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * Revalidates customer-owned debit evidence in PostgreSQL; model labels are never authoritative.
 */
final class DetectedPatternEvidence {
  private static final JsonMapper JSON = JsonMapper.builder().build();
  private static final ZoneId BANK_ZONE = ZoneId.of("Asia/Hong_Kong");
  private final JdbcTemplate db;
  private final Clock clock;

  record Pattern(
      String id,
      String owner,
      String display,
      String cadence,
      String status,
      OffsetDateTime next,
      OffsetDateTime last,
      int version) {}

  private record Charge(
      String id,
      String account,
      String merchant,
      String normalized,
      String currency,
      BigDecimal amount,
      OffsetDateTime at) {}

  DetectedPatternEvidence(JdbcTemplate db, Clock clock) {
    this.db = db;
    this.clock = clock;
  }

  private static RenewalReminderService.Failure bad() {
    return new RenewalReminderService.Failure(HttpStatus.BAD_REQUEST, "INVALID_PATTERN_EVIDENCE");
  }

  private static String hash(String value) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  private static String normalized(String text) {
    String value = Normalizer.normalize(text, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
    value =
        value.replaceAll("(?i)\\b(?:invoice|order|payment|ref)\\s*[#:\\-]?\\s*[a-z0-9]{4,}\\b", "");
    value = value.replaceAll("[^\\p{L}\\p{N}]+", " ").trim().replaceAll("\\s+", " ");
    return value.length() > 160 ? value.substring(0, 160) : value;
  }

  private static Charge charge(ResultSet r, int ignored) throws SQLException {
    String merchant = r.getString("merchant_name");
    return new Charge(
        r.getString("transaction_id"),
        r.getString("account_id"),
        merchant,
        normalized(merchant),
        r.getString("currency"),
        r.getBigDecimal("amount"),
        r.getObject("occurred_at", OffsetDateTime.class));
  }

  private Pattern map(ResultSet r, int ignored) throws SQLException {
    return new Pattern(
        r.getString("pattern_id"),
        r.getString("customer_id"),
        r.getString("merchant_display"),
        r.getString("cadence"),
        r.getString("status"),
        r.getObject("estimated_next_at", OffsetDateTime.class),
        r.getObject("last_observed_at", OffsetDateTime.class),
        r.getInt("version"));
  }

  Pattern owned(String owner, String patternId, boolean lock) {
    if (patternId == null || !patternId.matches("pat_[a-f0-9]{32}")) throw bad();
    return db
        .query(
            "SELECT * FROM detected_recurring_patterns WHERE customer_id=? AND pattern_id=?"
                + (lock ? " FOR UPDATE" : ""),
            this::map,
            owner,
            patternId)
        .stream()
        .findFirst()
        .orElseThrow(
            () -> new RenewalReminderService.Failure(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND"));
  }

  Pattern establish(String owner, List<String> evidenceIds, String cadence) {
    int minimum = "YEARLY".equals(cadence) ? 2 : 3;
    if (!Set.of("MONTHLY", "YEARLY").contains(cadence)
        || evidenceIds == null
        || evidenceIds.size() < minimum
        || evidenceIds.size() > 12
        || evidenceIds.stream().anyMatch(id -> id == null || !id.matches("[A-Za-z0-9_-]{1,128}"))
        || new HashSet<>(evidenceIds).size() != evidenceIds.size()) throw bad();
    String marks = String.join(",", Collections.nCopies(evidenceIds.size(), "?"));
    Object[] params = new Object[evidenceIds.size() + 1];
    params[0] = owner;
    for (int i = 0; i < evidenceIds.size(); i++) params[i + 1] = evidenceIds.get(i);
    List<Charge> charges =
        db.query(
            "SELECT transaction_id,account_id,merchant_name,currency,amount,occurred_at"
                + " FROM transactions WHERE customer_id=? AND transaction_id IN ("
                + marks
                + ") AND status='COMPLETED' AND direction='DEBIT'"
                + " AND type IN ('CARD_PAYMENT','DIRECT_DEBIT')"
                + " AND category<>'TRANSFER' AND merchant_name IS NOT NULL AND amount>0"
                + " ORDER BY occurred_at,transaction_id",
            DetectedPatternEvidence::charge,
            params);
    if (charges.size() != evidenceIds.size()) throw bad();
    Charge first = charges.getFirst();
    if (first.normalized().isBlank()
        || charges.stream()
            .anyMatch(
                item ->
                    !item.account().equals(first.account())
                        || !item.normalized().equals(first.normalized())
                        || !item.currency().equals(first.currency()))) throw bad();
    List<BigDecimal> amounts = charges.stream().map(Charge::amount).sorted().toList();
    BigDecimal median = amounts.get(amounts.size() / 2);
    BigDecimal tolerance = median.multiply(new BigDecimal("0.15")).max(new BigDecimal("1.00"));
    if (charges.stream().anyMatch(c -> c.amount().subtract(median).abs().compareTo(tolerance) > 0))
      throw bad();
    int months = cadence.equals("MONTHLY") ? 1 : 12;
    for (int i = 1; i < charges.size(); i++) {
      ZonedDateTime before = charges.get(i - 1).at().atZoneSameInstant(BANK_ZONE);
      ZonedDateTime after = charges.get(i).at().atZoneSameInstant(BANK_ZONE);
      int gap =
          (after.getYear() - before.getYear()) * 12
              + after.getMonthValue()
              - before.getMonthValue();
      if (gap != months && gap != months * 2) throw bad();
      if (cadence.equals("MONTHLY")
          && Math.abs(before.getDayOfMonth() - after.getDayOfMonth()) > 5
          && !(before.getDayOfMonth() >= 28 && after.getDayOfMonth() >= 28)) throw bad();
      if (cadence.equals("YEARLY") && Math.abs(before.getDayOfYear() - after.getDayOfYear()) > 7)
        throw bad();
    }
    Charge last = charges.getLast();
    ZonedDateTime next = last.at().atZoneSameInstant(BANK_ZONE).plusMonths(months);
    while (!next.toInstant().isAfter(clock.instant())) next = next.plusMonths(months);
    String patternId =
        "pat_"
            + hash(String.join(
                    "|", owner, first.account(), first.normalized(), first.currency(), cadence))
                .substring(0, 32);
    List<String> orderedIds = charges.stream().map(Charge::id).toList();
    String evidenceHash = hash(String.join("|", orderedIds));
    OffsetDateTime now = OffsetDateTime.now(clock).truncatedTo(ChronoUnit.MICROS);
    db.update(
        "INSERT INTO detected_recurring_patterns(pattern_id,customer_id,account_id,merchant_normalized,"
            + "merchant_display,currency,cadence,estimated_amount,estimated_next_at,last_observed_at,"
            + "evidence_transaction_ids,evidence_hash,status,version,created_at,updated_at)"
            + " VALUES(?,?,?,?,?,?,?,?,?,?,cast(? as jsonb),?,'ACTIVE',0,?,?)"
            + " ON CONFLICT(pattern_id) DO UPDATE SET merchant_display=excluded.merchant_display,"
            + "estimated_amount=excluded.estimated_amount,estimated_next_at=excluded.estimated_next_at,"
            + "last_observed_at=excluded.last_observed_at,evidence_transaction_ids=excluded.evidence_transaction_ids,"
            + "evidence_hash=excluded.evidence_hash,status='ACTIVE',"
            + "version=detected_recurring_patterns.version+1,updated_at=excluded.updated_at"
            + " WHERE detected_recurring_patterns.customer_id=excluded.customer_id"
            + " AND (detected_recurring_patterns.evidence_hash IS DISTINCT FROM excluded.evidence_hash"
            + " OR detected_recurring_patterns.estimated_next_at IS DISTINCT FROM excluded.estimated_next_at"
            + " OR detected_recurring_patterns.status<>'ACTIVE')",
        patternId,
        owner,
        first.account(),
        first.normalized(),
        last.merchant(),
        first.currency(),
        cadence,
        median,
        next.toOffsetDateTime(),
        last.at(),
        JSON.writeValueAsString(orderedIds),
        evidenceHash,
        now,
        now);
    return owned(owner, patternId, true);
  }
}
