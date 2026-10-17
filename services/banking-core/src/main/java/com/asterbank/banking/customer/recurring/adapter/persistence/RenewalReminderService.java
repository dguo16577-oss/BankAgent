package com.asterbank.banking.customer.recurring.adapter.persistence;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * PostgreSQL-owned reminder actions. The model can prepare but cannot execute or run the worker.
 */
@Service
@Profile("!unit")
public final class RenewalReminderService {
  private static final JsonMapper JSON = JsonMapper.builder().build();

  public static final class Failure extends RuntimeException {
    private final HttpStatus status;

    public Failure(HttpStatus status, String code) {
      super(code);
      this.status = status;
    }

    public HttpStatus status() {
      return status;
    }
  }

  private record Reminder(
      String id,
      String owner,
      String recurringId,
      String patternId,
      String targetType,
      String displayName,
      OffsetDateTime due,
      String zone,
      String basis,
      String status,
      int version,
      OffsetDateTime created,
      OffsetDateTime updated,
      OffsetDateTime triggered) {}

  private record Intent(
      String id,
      String owner,
      String recurringId,
      String patternId,
      String targetType,
      String reminderId,
      String type,
      String status,
      String hash,
      Integer version,
      Integer patternVersion,
      OffsetDateTime due,
      String zone,
      String basis,
      OffsetDateTime created,
      OffsetDateTime expires) {}

  private final JdbcTemplate db;
  private final TransactionTemplate tx;
  private final Clock clock;
  private final DetectedPatternEvidence patterns;

  public RenewalReminderService(JdbcTemplate db, PlatformTransactionManager manager, Clock clock) {
    this.db = db;
    this.tx = new TransactionTemplate(manager);
    this.clock = clock;
    this.patterns = new DetectedPatternEvidence(db, clock);
  }

  private OffsetDateTime now() {
    return OffsetDateTime.now(clock).truncatedTo(ChronoUnit.MICROS);
  }

  private static Failure bad() {
    return new Failure(HttpStatus.BAD_REQUEST, "INVALID_REQUEST");
  }

  private static Failure missing() {
    return new Failure(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND");
  }

  private static Failure conflict() {
    return new Failure(HttpStatus.CONFLICT, "REMINDER_STATE_CHANGED");
  }

  private static String id(String value) {
    if (value == null || !value.matches("[A-Za-z0-9_-]{1,128}")) throw bad();
    return value;
  }

  private static String requiredString(Map<String, Object> input, String field) {
    Object value = input.get(field);
    if (!(value instanceof String text) || text.isBlank()) throw bad();
    return text;
  }

  private static OffsetDateTime date(String text) {
    try {
      return OffsetDateTime.parse(text).truncatedTo(ChronoUnit.MICROS);
    } catch (RuntimeException e) {
      throw bad();
    }
  }

  private static String digest(String value) {
    try {
      byte[] bytes =
          MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(bytes);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  private void lockOwner(String owner) {
    if (db.query(
            "SELECT customer_id FROM customers WHERE customer_id=? FOR UPDATE",
            (r, n) -> r.getString(1),
            owner)
        .isEmpty()) throw missing();
  }

  private String recurringSource(String owner, String recurringId, boolean forUpdate) {
    return db
        .query(
            "SELECT source,status FROM recurring_payments WHERE customer_id=? AND recurring_payment_id=?"
                + (forUpdate ? " FOR UPDATE" : ""),
            (r, n) -> r.getString(1) + ":" + r.getString(2),
            owner,
            recurringId)
        .stream()
        .findFirst()
        .orElseThrow(RenewalReminderService::missing);
  }

  private Reminder reminder(ResultSet r, int n) throws SQLException {
    return new Reminder(
        r.getString("reminder_id"),
        r.getString("customer_id"),
        r.getString("recurring_payment_id"),
        r.getString("pattern_id"),
        r.getString("target_type"),
        r.getString("display_name"),
        r.getObject("due_at", OffsetDateTime.class),
        r.getString("time_zone"),
        r.getString("date_basis"),
        r.getString("status"),
        r.getInt("version"),
        r.getObject("created_at", OffsetDateTime.class),
        r.getObject("updated_at", OffsetDateTime.class),
        r.getObject("triggered_at", OffsetDateTime.class));
  }

  private Intent intent(ResultSet r, int n) throws SQLException {
    return new Intent(
        r.getString("intent_id"),
        r.getString("customer_id"),
        r.getString("recurring_payment_id"),
        r.getString("pattern_id"),
        r.getString("target_type"),
        r.getString("reminder_id"),
        r.getString("action_type"),
        r.getString("status"),
        r.getString("intent_hash"),
        (Integer) r.getObject("expected_version"),
        (Integer) r.getObject("pattern_version"),
        r.getObject("due_at", OffsetDateTime.class),
        r.getString("time_zone"),
        r.getString("date_basis"),
        r.getObject("created_at", OffsetDateTime.class),
        r.getObject("expires_at", OffsetDateTime.class));
  }

  private Reminder ownedReminder(String owner, String reminderId, boolean lock) {
    return db
        .query(
            "SELECT r.*,COALESCE(p.display_name,dp.merchant_display) AS display_name FROM renewal_reminders r"
                + " LEFT JOIN recurring_payments p ON p.customer_id=r.customer_id AND p.recurring_payment_id=r.recurring_payment_id"
                + " LEFT JOIN detected_recurring_patterns dp ON dp.customer_id=r.customer_id AND dp.pattern_id=r.pattern_id"
                + " WHERE r.customer_id=? AND r.reminder_id=?"
                + (lock ? " FOR UPDATE OF r" : ""),
            this::reminder,
            owner,
            id(reminderId))
        .stream()
        .findFirst()
        .orElseThrow(RenewalReminderService::missing);
  }

  private Intent ownedIntent(String owner, String intentId, boolean lock) {
    return db
        .query(
            "SELECT * FROM renewal_reminder_action_intents WHERE customer_id=? AND intent_id=?"
                + (lock ? " FOR UPDATE" : ""),
            this::intent,
            owner,
            id(intentId))
        .stream()
        .findFirst()
        .orElseThrow(RenewalReminderService::missing);
  }

  private static Map<String, Object> reminderMap(Reminder r) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", r.id());
    out.put("targetType", r.targetType());
    if (r.recurringId() != null) out.put("recurringPaymentId", r.recurringId());
    if (r.patternId() != null) out.put("patternReference", r.patternId());
    out.put("displayName", r.displayName());
    out.put("dueAt", r.due().toString());
    out.put("timeZone", r.zone());
    out.put("dateBasis", r.basis());
    out.put("status", r.status());
    out.put("version", r.version());
    out.put("createdAt", r.created().toString());
    out.put("updatedAt", r.updated().toString());
    out.put("triggeredAt", r.triggered() == null ? null : r.triggered().toString());
    return out;
  }

  private Map<String, Object> intentMap(Intent i) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", i.id());
    out.put("actionType", i.type());
    out.put("targetType", i.targetType());
    if (i.recurringId() != null) out.put("recurringPaymentId", i.recurringId());
    if (i.patternId() != null) out.put("patternReference", i.patternId());
    out.put("reminderId", i.reminderId());
    out.put("expectedVersion", i.version());
    out.put("dueAt", i.due() == null ? null : i.due().toString());
    out.put("timeZone", i.zone());
    out.put("dateBasis", i.basis());
    out.put("intentHash", i.hash());
    out.put(
        "status",
        i.status().equals("PREPARED") && !clock.instant().isBefore(i.expires().toInstant())
            ? "EXPIRED"
            : i.status());
    out.put("createdAt", i.created().toString());
    out.put("expiresAt", i.expires().toString());
    out.put("verificationRequirement", "NONE");
    return out;
  }

  public List<Map<String, Object>> list(String owner) {
    return db
        .query(
            "SELECT r.*,COALESCE(p.display_name,dp.merchant_display) AS display_name FROM renewal_reminders r"
                + " LEFT JOIN recurring_payments p ON p.customer_id=r.customer_id AND p.recurring_payment_id=r.recurring_payment_id"
                + " LEFT JOIN detected_recurring_patterns dp ON dp.customer_id=r.customer_id AND dp.pattern_id=r.pattern_id"
                + " WHERE r.customer_id=? ORDER BY r.created_at DESC,r.reminder_id LIMIT 100",
            this::reminder,
            owner)
        .stream()
        .map(RenewalReminderService::reminderMap)
        .toList();
  }

  public Map<String, Object> get(String owner, String reminderId) {
    return reminderMap(ownedReminder(owner, reminderId, false));
  }

  public Map<String, Object> getIntent(String owner, String intentId) {
    return intentMap(ownedIntent(owner, intentId, false));
  }

  public Map<String, Object> prepare(String owner, Map<String, Object> request) {
    if (!Set.of(
            "actionType",
            "recurringPaymentId",
            "reminderId",
            "expectedVersion",
            "dueAt",
            "timeZone",
            "patternEvidenceTransactionIds",
            "patternCadence")
        .containsAll(request.keySet())) throw bad();
    String type = requiredString(request, "actionType");
    if (!Set.of("CREATE", "CHANGE", "CANCEL").contains(type)) throw bad();
    String requestedRecurringId =
        request.get("recurringPaymentId") == null
            ? null
            : id(requiredString(request, "recurringPaymentId"));
    List<String> evidenceIds = null;
    if (request.get("patternEvidenceTransactionIds") instanceof List<?> rows) {
      if (rows.stream().anyMatch(row -> !(row instanceof String))) throw bad();
      evidenceIds = rows.stream().map(row -> (String) row).toList();
    } else if (request.containsKey("patternEvidenceTransactionIds")) throw bad();
    String cadence =
        request.get("patternCadence") == null ? null : requiredString(request, "patternCadence");
    if ((evidenceIds == null) != (cadence == null)) throw bad();
    if (requestedRecurringId != null && evidenceIds != null) throw bad();
    if (type.equals("CREATE") && requestedRecurringId == null && evidenceIds == null) throw bad();
    if (type.equals("CANCEL") && (evidenceIds != null || cadence != null)) throw bad();
    String reminderId =
        request.get("reminderId") == null ? null : id(requiredString(request, "reminderId"));
    Integer version = request.get("expectedVersion") instanceof Integer v && v >= 0 ? v : null;
    OffsetDateTime due =
        request.get("dueAt") == null ? null : date(requiredString(request, "dueAt"));
    String zone = request.get("timeZone") == null ? null : requiredString(request, "timeZone");
    if (zone != null) {
      try {
        var resolved = ZoneId.of(zone);
        if (due != null && !resolved.getRules().getOffset(due.toInstant()).equals(due.getOffset()))
          throw bad();
      } catch (RuntimeException e) {
        throw bad();
      }
    }
    if ((type.equals("CREATE") && (reminderId != null || version != null))
        || (!type.equals("CREATE") && (reminderId == null || version == null))
        || (!type.equals("CANCEL") && (due == null || zone == null))
        || (type.equals("CANCEL") && (due != null || zone != null))) throw bad();
    OffsetDateTime created = now();
    if (due != null && (due.isBefore(created.plusMinutes(1)) || due.isAfter(created.plusYears(1))))
      throw bad();
    final OffsetDateTime finalDue = due;
    final String finalZone = zone;
    final List<String> finalEvidenceIds = evidenceIds;
    final String finalCadence = cadence;
    return tx.execute(
        s -> {
          lockOwner(owner);
          String recurringId = requestedRecurringId;
          String patternId = null;
          String targetType;
          Integer patternVersion = null;
          String source = null;
          if (!type.equals("CREATE")) {
            Reminder current = ownedReminder(owner, reminderId, true);
            if (!current.status().equals("ACTIVE") || current.version() != version)
              throw conflict();
            if (type.equals("CANCEL")
                && requestedRecurringId != null
                && !requestedRecurringId.equals(current.recurringId())) throw conflict();
            if (type.equals("CANCEL")
                || (requestedRecurringId == null && finalEvidenceIds == null)) {
              recurringId = current.recurringId();
              patternId = current.patternId();
            }
          }
          if (recurringId != null) {
            source = recurringSource(owner, recurringId, true);
            targetType = source.startsWith("BANK_MANAGED:") ? "BANK_MANDATE" : "DETECTED_PATTERN";
          } else if (finalEvidenceIds != null) {
            DetectedPatternEvidence.Pattern pattern =
                patterns.establish(owner, finalEvidenceIds, finalCadence);
            patternId = pattern.id();
            patternVersion = pattern.version();
            targetType = "DETECTED_PATTERN";
          } else {
            DetectedPatternEvidence.Pattern pattern = patterns.owned(owner, patternId, true);
            patternVersion = pattern.version();
            targetType = "DETECTED_PATTERN";
          }
          if (source != null && !source.endsWith(":ACTIVE") && !type.equals("CANCEL"))
            throw conflict();
          if (patternId != null
              && !patterns.owned(owner, patternId, true).status().equals("ACTIVE")
              && !type.equals("CANCEL")) throw conflict();
          String basis =
              targetType.equals("BANK_MANDATE") ? "BANK_SCHEDULE" : "ESTIMATED_FROM_HISTORY";
          String intentId = "rmi_" + UUID.randomUUID().toString().replace("-", "");
          OffsetDateTime expiry = created.plusMinutes(15);
          String hash =
              digest(
                  String.join(
                      "|",
                      owner,
                      intentId,
                      type,
                      targetType,
                      recurringId == null ? "" : recurringId,
                      patternId == null ? "" : patternId,
                      patternVersion == null ? "" : patternVersion.toString(),
                      reminderId == null ? "" : reminderId,
                      version == null ? "" : version.toString(),
                      finalDue == null ? "" : finalDue.toInstant().toString(),
                      finalZone == null ? "" : finalZone,
                      basis,
                      created.toInstant().toString()));
          Map<String, Object> snapshot = new LinkedHashMap<>();
          snapshot.put("recurringPaymentId", recurringId);
          snapshot.put("patternReference", patternId);
          snapshot.put("targetType", targetType);
          snapshot.put("patternVersion", patternVersion);
          snapshot.put("reminderId", reminderId);
          snapshot.put("actionType", type);
          snapshot.put("dueAt", finalDue == null ? null : finalDue.toString());
          snapshot.put("timeZone", finalZone);
          snapshot.put("dateBasis", basis);
          snapshot.put("expectedVersion", version);
          db.update(
              "INSERT INTO renewal_reminder_action_intents(intent_id,customer_id,recurring_payment_id,pattern_id,target_type,pattern_version,reminder_id,action_type,status,intent_hash,expected_version,due_at,time_zone,date_basis,created_at,expires_at,snapshot) VALUES(?,?,?,?,?,?,?,?,'PREPARED',?,?,?,?,?,?,?,cast(? as jsonb))",
              intentId,
              owner,
              recurringId,
              patternId,
              targetType,
              patternVersion,
              reminderId,
              type,
              hash,
              version,
              finalDue,
              finalZone,
              basis,
              created,
              expiry,
              JSON.writeValueAsString(snapshot));
          return intentMap(ownedIntent(owner, intentId, false));
        });
  }

  public Map<String, Object> cancelIntent(String owner, String intentId) {
    return tx.execute(
        s -> {
          lockOwner(owner);
          Intent intent = ownedIntent(owner, intentId, true);
          if (intent.status().equals("PREPARED"))
            db.update(
                "UPDATE renewal_reminder_action_intents SET status=? WHERE customer_id=? AND intent_id=?",
                clock.instant().isBefore(intent.expires().toInstant()) ? "CANCELLED" : "EXPIRED",
                owner,
                intentId);
          return intentMap(ownedIntent(owner, intentId, false));
        });
  }

  public Map<String, Object> execute(String owner, String key, Map<String, Object> request) {
    if (!Set.of("intentId", "intentHash").equals(request.keySet())) throw bad();
    String intentId = id(requiredString(request, "intentId"));
    String hash = requiredString(request, "intentHash");
    if (hash.length() != 64 || !hash.matches("[a-f0-9]{64}")) throw bad();
    id(key);
    return tx.execute(
        s -> {
          lockOwner(owner);
          List<Map<String, Object>> previous =
              db.queryForList(
                  "SELECT action_id,intent_id,intent_hash FROM renewal_reminder_actions WHERE customer_id=? AND idempotency_key=?",
                  owner,
                  key);
          if (!previous.isEmpty()) {
            Map<String, Object> old = previous.getFirst();
            if (!intentId.equals(old.get("intent_id")) || !hash.equals(old.get("intent_hash")))
              throw conflict();
            return receipt(owner, (String) old.get("action_id"));
          }
          Intent intent = ownedIntent(owner, intentId, true);
          if (!intent.status().equals("PREPARED")
              || !hash.equals(intent.hash())
              || !clock.instant().isBefore(intent.expires().toInstant())) throw conflict();
          if (intent.patternId() != null) {
            DetectedPatternEvidence.Pattern pattern =
                patterns.owned(owner, intent.patternId(), true);
            if ((!pattern.status().equals("ACTIVE") || pattern.version() != intent.patternVersion())
                && !intent.type().equals("CANCEL")) throw conflict();
          } else {
            String source = recurringSource(owner, intent.recurringId(), true);
            if (!source.endsWith(":ACTIVE") && !intent.type().equals("CANCEL")) throw conflict();
          }
          String reminderId = intent.reminderId();
          OffsetDateTime at = now();
          if (intent.type().equals("CREATE")) {
            if (!db.queryForList(
                    "SELECT reminder_id FROM renewal_reminders WHERE customer_id=? AND "
                        + (intent.patternId() == null ? "recurring_payment_id=?" : "pattern_id=?")
                        + " AND due_at=? AND status='ACTIVE'",
                    owner,
                    intent.patternId() == null ? intent.recurringId() : intent.patternId(),
                    intent.due())
                .isEmpty()) throw conflict();
            reminderId = "rem_" + UUID.randomUUID().toString().replace("-", "");
            db.update(
                "INSERT INTO renewal_reminders(reminder_id,customer_id,recurring_payment_id,pattern_id,target_type,due_at,time_zone,date_basis,status,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'ACTIVE',0,?,?)",
                reminderId,
                owner,
                intent.recurringId(),
                intent.patternId(),
                intent.targetType(),
                intent.due(),
                intent.zone(),
                intent.basis(),
                at,
                at);
          } else {
            Reminder current = ownedReminder(owner, reminderId, true);
            if ((intent.type().equals("CANCEL")
                    && (!Objects.equals(current.recurringId(), intent.recurringId())
                        || !Objects.equals(current.patternId(), intent.patternId())))
                || !current.status().equals("ACTIVE")
                || current.version() != intent.version()) throw conflict();
            if (intent.type().equals("CHANGE"))
              db.update(
                  "UPDATE renewal_reminders SET recurring_payment_id=?,pattern_id=?,target_type=?,due_at=?,time_zone=?,date_basis=?,version=version+1,updated_at=? WHERE customer_id=? AND reminder_id=? AND version=?",
                  intent.recurringId(),
                  intent.patternId(),
                  intent.targetType(),
                  intent.due(),
                  intent.zone(),
                  intent.basis(),
                  at,
                  owner,
                  reminderId,
                  current.version());
            else
              db.update(
                  "UPDATE renewal_reminders SET status='CANCELLED',version=version+1,updated_at=? WHERE customer_id=? AND reminder_id=? AND version=?",
                  at,
                  owner,
                  reminderId,
                  current.version());
          }
          db.update(
              "UPDATE renewal_reminder_action_intents SET status='EXECUTED' WHERE customer_id=? AND intent_id=?",
              owner,
              intentId);
          String actionId = "rma_" + UUID.randomUUID().toString().replace("-", "");
          db.update(
              "INSERT INTO renewal_reminder_actions(action_id,customer_id,intent_id,reminder_id,idempotency_key,intent_hash,executed_at) VALUES(?,?,?,?,?,?,?)",
              actionId,
              owner,
              intentId,
              reminderId,
              key,
              hash,
              at);
          return receipt(owner, actionId);
        });
  }

  private Map<String, Object> receipt(String owner, String actionId) {
    Map<String, Object> row =
        db.queryForMap(
            "SELECT a.intent_id,a.reminder_id,a.executed_at,i.action_type FROM renewal_reminder_actions a JOIN renewal_reminder_action_intents i ON i.customer_id=a.customer_id AND i.intent_id=a.intent_id WHERE a.customer_id=? AND a.action_id=?",
            owner,
            actionId);
    Object executed = row.get("executed_at");
    String executedAt =
        executed instanceof Timestamp timestamp
            ? timestamp.toInstant().toString()
            : ((OffsetDateTime) executed).toInstant().toString();
    return Map.of(
        "id",
        actionId,
        "intentId",
        row.get("intent_id"),
        "actionType",
        row.get("action_type"),
        "reminder",
        get(owner, (String) row.get("reminder_id")),
        "executedAt",
        executedAt);
  }

  public List<Map<String, Object>> notifications(String owner) {
    return db.query(
        "SELECT notification_id,reminder_id,title,body,created_at,read_at FROM in_app_notifications WHERE customer_id=? ORDER BY created_at DESC,notification_id LIMIT 100",
        (r, n) -> {
          Map<String, Object> item = new LinkedHashMap<>();
          item.put("id", r.getString(1));
          item.put("reminderId", r.getString(2));
          item.put("title", r.getString(3));
          item.put("body", r.getString(4));
          item.put("createdAt", r.getObject(5, OffsetDateTime.class).toString());
          var read = r.getObject(6, OffsetDateTime.class);
          item.put("readAt", read == null ? null : read.toString());
          return item;
        },
        owner);
  }

  /**
   * Called by the opt-in Spring poller; row locks and unique reminder IDs prevent duplicate
   * notices.
   */
  public int processDue() {
    return tx.execute(
        s -> {
          var rows =
              db.queryForList(
                  "SELECT reminder_id,customer_id,recurring_payment_id,pattern_id,target_type FROM renewal_reminders WHERE status='ACTIVE' AND due_at<=? ORDER BY due_at,reminder_id FOR UPDATE SKIP LOCKED LIMIT 50",
                  now());
          int sent = 0;
          for (var row : rows) {
            String owner = (String) row.get("customer_id");
            String reminderId = (String) row.get("reminder_id");
            String recurringId = (String) row.get("recurring_payment_id");
            String patternId = (String) row.get("pattern_id");
            boolean valid;
            if (patternId != null) {
              DetectedPatternEvidence.Pattern pattern = patterns.owned(owner, patternId, true);
              int windowDays = pattern.cadence().equals("MONTHLY") ? 90 : 730;
              valid =
                  pattern.status().equals("ACTIVE")
                      && pattern
                          .last()
                          .toInstant()
                          .isAfter(clock.instant().minus(windowDays, ChronoUnit.DAYS));
              if (!valid)
                db.update(
                    "UPDATE detected_recurring_patterns SET status='STALE',updated_at=? WHERE customer_id=? AND pattern_id=?",
                    now(),
                    owner,
                    patternId);
            } else {
              var payment =
                  db.queryForMap(
                      "SELECT status FROM recurring_payments WHERE customer_id=? AND recurring_payment_id=?",
                      owner,
                      recurringId);
              valid = "ACTIVE".equals(payment.get("status"));
            }
            OffsetDateTime at = now();
            if (!valid) {
              db.update(
                  "UPDATE renewal_reminders SET status='CANCELLED',version=version+1,updated_at=? WHERE customer_id=? AND reminder_id=?",
                  at,
                  owner,
                  reminderId);
              continue;
            }
            db.update(
                "UPDATE renewal_reminders SET status='TRIGGERED',version=version+1,updated_at=?,triggered_at=? WHERE customer_id=? AND reminder_id=?",
                at,
                at,
                owner,
                reminderId);
            db.update(
                "INSERT INTO in_app_notifications(notification_id,customer_id,reminder_id,title,body,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(reminder_id) DO NOTHING",
                "note_" + UUID.randomUUID().toString().replace("-", ""),
                owner,
                reminderId,
                "Renewal reminder",
                patternId == null
                    ? "Review the upcoming bank-managed renewal in your banking workspace."
                    : "Review a predicted recurring charge in your banking workspace; the date is an estimate.",
                at);
            sent++;
          }
          return sent;
        });
  }
}
