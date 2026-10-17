package com.asterbank.banking.customer.payment.adapter.persistence;

import com.asterbank.banking.customer.account.domain.AccountId;
import com.asterbank.banking.customer.payment.application.SplitStore;
import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.shared.adapter.persistence.DatabaseScope;
import com.asterbank.banking.shared.domain.CustomerId;
import jakarta.persistence.EntityManager;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

/** Relational ownership and uniqueness plus versioned immutable JSON review snapshots. */
public final class PostgreSqlSplitStore implements SplitStore {
  private final DatabaseScope db;
  private final TransactionTemplate writes;
  private final ObjectMapper mapper;

  public PostgreSqlSplitStore(
      DatabaseScope db, PlatformTransactionManager tx, ObjectMapper mapper) {
    this.db = db;
    this.writes = new TransactionTemplate(tx);
    this.mapper = mapper;
  }

  private EntityManager em() {
    return db.entityManager();
  }

  public <T> T write(CustomerId owner, Supplier<T> operation) {
    return writes.execute(
        status -> {
          db.lockOwnerForWrite(owner);
          return operation.get();
        });
  }

  public Optional<Target> verifiedTarget(CustomerId owner, RecipientId recipient) {
    return db.read(
        () -> {
          @SuppressWarnings("unchecked")
          var rows =
              (List<Object[]>)
                  em().createNativeQuery(
                          "select d.target_customer_id,d.target_account_id from recipients r "
                              + "join demo_internal_destinations d on d.destination_ref=r.destination_ref "
                              + "join accounts a on a.customer_id=d.target_customer_id and a.account_id=d.target_account_id "
                              + "where r.customer_id=:owner and r.recipient_id=:recipient and r.status='ACTIVE' and a.status='ACTIVE'")
                      .setParameter("owner", owner.value())
                      .setParameter("recipient", recipient.value())
                      .getResultList();
          return rows.stream()
              .findFirst()
              .map(
                  row ->
                      new Target(new CustomerId((String) row[0]), new AccountId((String) row[1])));
        });
  }

  private SplitBill decodeBill(Object snapshot) {
    return mapper.readValue(snapshot.toString(), SplitBill.class);
  }

  public Optional<SplitBill> bill(CustomerId owner, String id) {
    return db.read(
        () ->
            em()
                .createNativeQuery(
                    "select snapshot from split_bills where owner_customer_id=:owner and split_id=:id")
                .setParameter("owner", owner.value())
                .setParameter("id", id)
                .getResultList()
                .stream()
                .findFirst()
                .map(this::decodeBill));
  }

  public Optional<SplitBill> participantBill(CustomerId participant, String id) {
    return db.read(
        () ->
            em()
                .createNativeQuery(
                    "select b.snapshot from split_bills b join split_participants p on p.split_id=b.split_id "
                        + "where p.target_customer_id=:customer and b.split_id=:id")
                .setParameter("customer", participant.value())
                .setParameter("id", id)
                .getResultList()
                .stream()
                .findFirst()
                .map(this::decodeBill));
  }

  public List<SplitBill> ownerBills(CustomerId owner) {
    return db.read(
        () ->
            em()
                .createNativeQuery(
                    "select snapshot from split_bills where owner_customer_id=:owner order by created_at desc,split_id desc")
                .setParameter("owner", owner.value())
                .getResultList()
                .stream()
                .map(this::decodeBill)
                .toList());
  }

  public List<SplitBill> participantBills(CustomerId participant) {
    return db.read(
        () ->
            em()
                .createNativeQuery(
                    "select b.snapshot from split_bills b join split_participants p on p.split_id=b.split_id "
                        + "where p.target_customer_id=:customer order by b.created_at desc,b.split_id desc")
                .setParameter("customer", participant.value())
                .getResultList()
                .stream()
                .map(this::decodeBill)
                .toList());
  }

  public void saveBill(SplitBill bill) {
    var existing = bill(bill.ownerCustomerId(), bill.id());
    if (existing.isEmpty()) {
      em().createNativeQuery(
              "insert into split_bills(split_id,owner_customer_id,receiving_account_id,total_amount,payer_share,currency,note,status,version,created_at,expires_at,cancelled_at,snapshot) "
                  + "values(:id,:owner,:account,:total,:payer,'CNY',:note,:status,:version,:created,:expires,:cancelled,cast(:snapshot as jsonb))")
          .setParameter("id", bill.id())
          .setParameter("owner", bill.ownerCustomerId().value())
          .setParameter("account", bill.receivingAccountId().value())
          .setParameter("total", bill.total().amount())
          .setParameter("payer", bill.payerShare().amount())
          .setParameter("note", bill.note())
          .setParameter("status", bill.status().name())
          .setParameter("version", bill.version())
          .setParameter("created", bill.createdAt())
          .setParameter("expires", bill.expiresAt())
          .setParameter("cancelled", bill.cancelledAt())
          .setParameter("snapshot", mapper.writeValueAsString(bill))
          .executeUpdate();
      for (var part : bill.participants()) {
        em().createNativeQuery(
                "insert into split_participants(participant_id,split_id,owner_customer_id,recipient_id,target_customer_id,target_account_id,amount_due,status) "
                    + "values(:id,:split,:owner,:recipient,:target,:account,:amount,:status)")
            .setParameter("id", part.id())
            .setParameter("split", bill.id())
            .setParameter("owner", bill.ownerCustomerId().value())
            .setParameter("recipient", part.recipientId().value())
            .setParameter("target", part.targetCustomerId().value())
            .setParameter("account", part.targetAccountId().value())
            .setParameter("amount", part.amountDue().amount())
            .setParameter("status", part.status().name())
            .executeUpdate();
      }
    } else {
      if (existing.get().version() + 1 != bill.version()
          || bill.status() != SplitBill.Status.CANCELLED)
        throw new IllegalStateException("Invalid split transition");
      int changed =
          em().createNativeQuery(
                  "update split_bills set status=:status,version=:version,cancelled_at=:cancelled,snapshot=cast(:snapshot as jsonb) "
                      + "where split_id=:id and owner_customer_id=:owner and status='ACTIVE' and version=:oldVersion")
              .setParameter("status", bill.status().name())
              .setParameter("version", bill.version())
              .setParameter("cancelled", bill.cancelledAt())
              .setParameter("snapshot", mapper.writeValueAsString(bill))
              .setParameter("id", bill.id())
              .setParameter("owner", bill.ownerCustomerId().value())
              .setParameter("oldVersion", existing.get().version())
              .executeUpdate();
      if (changed != 1) throw new IllegalStateException("Split transition race");
      em().createNativeQuery(
              "update split_participants set status='CANCELLED' where split_id=:id and status='PENDING'")
          .setParameter("id", bill.id())
          .executeUpdate();
    }
  }

  public Optional<SplitActionIntent> intent(CustomerId owner, String id) {
    return db.read(
        () ->
            em()
                .createNativeQuery(
                    "select snapshot from split_action_intents where owner_customer_id=:owner and intent_id=:id")
                .setParameter("owner", owner.value())
                .setParameter("id", id)
                .getResultList()
                .stream()
                .findFirst()
                .map(snapshot -> mapper.readValue(snapshot.toString(), SplitActionIntent.class)));
  }

  public void saveIntent(SplitActionIntent intent) {
    var existing = intent(intent.customerId(), intent.id());
    if (existing.isEmpty()) {
      em().createNativeQuery(
              "insert into split_action_intents(intent_id,owner_customer_id,session_id,action_type,split_id,expected_version,intent_hash,status,created_at,expires_at,terminal_at,snapshot,result_split_id) "
                  + "values(:id,:owner,:session,:type,:split,:version,:hash,:status,:created,:expires,null,cast(:snapshot as jsonb),null)")
          .setParameter("id", intent.id())
          .setParameter("owner", intent.customerId().value())
          .setParameter("session", intent.sessionId())
          .setParameter("type", intent.actionType().name())
          .setParameter("split", intent.splitId())
          .setParameter("version", intent.expectedVersion())
          .setParameter("hash", intent.intentHash())
          .setParameter("status", intent.status().name())
          .setParameter("created", intent.createdAt())
          .setParameter("expires", intent.expiresAt())
          .setParameter("snapshot", mapper.writeValueAsString(intent))
          .executeUpdate();
    } else {
      if (existing.get().status() != SplitActionIntent.Status.PREPARED
          || !existing.get().intentHash().equals(intent.intentHash()))
        throw new IllegalStateException("Invalid split intent transition");
      int changed =
          em().createNativeQuery(
                  "update split_action_intents set status=:status,terminal_at=:terminal,snapshot=cast(:snapshot as jsonb),result_split_id=:result "
                      + "where intent_id=:id and owner_customer_id=:owner and status='PREPARED'")
              .setParameter("status", intent.status().name())
              .setParameter("terminal", intent.terminalAt())
              .setParameter("snapshot", mapper.writeValueAsString(intent))
              .setParameter(
                  "result",
                  intent.status() == SplitActionIntent.Status.EXECUTED ? intent.splitId() : null)
              .setParameter("id", intent.id())
              .setParameter("owner", intent.customerId().value())
              .executeUpdate();
      if (changed != 1) throw new IllegalStateException("Split intent transition race");
    }
  }

  public Optional<String> result(CustomerId owner, String intentId) {
    return db.read(
        () ->
            em()
                .createNativeQuery(
                    "select result_split_id from split_action_intents where owner_customer_id=:owner and intent_id=:id")
                .setParameter("owner", owner.value())
                .setParameter("id", intentId)
                .getResultList()
                .stream()
                .filter(Objects::nonNull)
                .findFirst()
                .map(Object::toString));
  }
}
