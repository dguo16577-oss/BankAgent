package com.asterbank.banking.shared.adapter.persistence;

import com.asterbank.banking.customer.account.adapter.persistence.AccountPersistenceMapper;
import com.asterbank.banking.customer.account.domain.*;
import com.asterbank.banking.customer.payment.adapter.persistence.PostgreSqlRecipientRepositoryAdapter;
import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.customer.transaction.adapter.persistence.TransactionPersistenceMapper;
import com.asterbank.banking.shared.config.DemoSeed;
import com.asterbank.banking.shared.domain.CustomerId;
import com.asterbank.banking.shared.domain.Money;
import java.util.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Local-only caller supplies deterministic seed; entire initialization is rerun-safe and atomic.
 */
public final class DemoDataInitializer {
  private final DatabaseScope db;
  private final TransactionTemplate tx;

  public DemoDataInitializer(DatabaseScope db, PlatformTransactionManager manager) {
    this.db = db;
    tx = new TransactionTemplate(manager);
  }

  public static List<Recipient> alexRecipients() {
    var c = new CustomerId("usr_aster_alex");
    var currency = Currency.getInstance("CNY");
    return List.of(
        new Recipient(
            new RecipientId("recipient_zhang"),
            c,
            "Zhang San",
            "Demo Harbour Bank",
            "•••• 6018",
            currency),
        new Recipient(
            new RecipientId("recipient_li"), c, "Li Si", "Demo Maple Bank", "•••• 2046", currency),
        new Recipient(
            new RecipientId("recipient_mom"),
            c,
            "Mom",
            "Demo Harbour Bank",
            "•••• 7732",
            currency));
  }

  public static DemoSeed withLin(DemoSeed original) {
    var accounts = new ArrayList<>(original.accounts());
    accounts.add(
        new Account(
            new AccountId("acc_lin_current"),
            new CustomerId("usr_aster_lin"),
            "CNY Current",
            AccountType.CURRENT,
            AccountStatus.ACTIVE,
            Money.of("1000.00", "CNY"),
            Money.of("0.00", "CNY"),
            "•••• 6201",
            original.asOf(),
            null));
    for (String[] person :
        List.of(
            new String[] {"zhang", "6018"}, new String[] {"li", "2046"},
            new String[] {"wang_chen", "8000"}, new String[] {"wang_qiang", "6018"})) {
      accounts.add(
          new Account(
              new AccountId("acc_" + person[0] + "_current"),
              new CustomerId("usr_aster_" + person[0]),
              "CNY Current",
              AccountType.CURRENT,
              AccountStatus.ACTIVE,
              Money.of("1000.00", "CNY"),
              Money.of("0.00", "CNY"),
              "•••• " + person[1],
              original.asOf(),
              null));
    }
    return new DemoSeed(accounts, original.transactions(), original.asOf());
  }

  public static List<Recipient> demoRecipients() {
    var recipients = new ArrayList<>(alexRecipients());
    recipients.add(
        new Recipient(
            new RecipientId("recipient_lin"),
            new CustomerId("usr_aster_alex"),
            "Lin Wei",
            "Aster Demo Bank",
            "•••• 6201",
            Currency.getInstance("CNY"),
            "demo-lin",
            Recipient.Status.ACTIVE,
            null,
            0));
    return recipients;
  }

  public void initializeDemo(DemoSeed original) {
    tx.executeWithoutResult(
        status -> {
          initialize(withLin(original), demoRecipients());
          var session = db.entityManager().unwrap(org.hibernate.Session.class);
          // Existing local databases already have Alex's seed_version=1. Add this recipient
          // without replacing any customer balance, transaction, or recipient state.
          session
              .createNativeMutationQuery(
                  "insert into recipients(recipient_id,customer_id,display_name,bank_name,masked_identifier,currency,destination_ref,status,created_at,version) select 'recipient_lin','usr_aster_alex','Lin Wei','Aster Demo Bank','•••• 6201','CNY','demo-lin','ACTIVE',:at,0 where exists(select 1 from customers where customer_id='usr_aster_alex') on conflict do nothing")
              .setParameter("at", original.asOf())
              .executeUpdate();
          session
              .createNativeMutationQuery(
                  "insert into demo_internal_destinations(destination_ref,target_customer_id,target_account_id) select 'demo-lin',customer_id,account_id from accounts where customer_id='usr_aster_lin' and account_id='acc_lin_current' on conflict(destination_ref) do update set target_customer_id=excluded.target_customer_id,target_account_id=excluded.target_account_id")
              .executeUpdate();
          for (String[] route :
              List.of(
                  new String[] {"recipient_zhang", "zhang"},
                  new String[] {"recipient_li", "li"},
                  new String[] {"demo-wang-chen", "wang_chen"},
                  new String[] {"demo-wang-qiang", "wang_qiang"})) {
            session
                .createNativeMutationQuery(
                    "insert into demo_internal_destinations(destination_ref,target_customer_id,target_account_id) "
                        + "select :ref,customer_id,account_id from accounts where customer_id=:customer and account_id=:account "
                        + "on conflict(destination_ref) do update set target_customer_id=excluded.target_customer_id,target_account_id=excluded.target_account_id")
                .setParameter("ref", route[0])
                .setParameter("customer", "usr_aster_" + route[1])
                .setParameter("account", "acc_" + route[1] + "_current")
                .executeUpdate();
          }
          // Earlier local demo seeds used placeholder suffixes for these accounts.
          // Align only those exact placeholder rows with the saved recipient identity;
          // execution checks the masked destination again before any credit.
          for (String[] suffix :
              List.of(
                  new String[] {"zhang", "6301", "6018"},
                  new String[] {"li", "6302", "2046"},
                  new String[] {"wang_chen", "6303", "8000"},
                  new String[] {"wang_qiang", "6304", "6018"})) {
            session
                .createNativeMutationQuery(
                    "update accounts set masked_identifier=:new_mask where customer_id=:customer "
                        + "and account_id=:account and masked_identifier=:old_mask")
                .setParameter("customer", "usr_aster_" + suffix[0])
                .setParameter("account", "acc_" + suffix[0] + "_current")
                .setParameter("old_mask", "•••• " + suffix[1])
                .setParameter("new_mask", "•••• " + suffix[2])
                .executeUpdate();
          }
          // Local demo recipient phones are independent of customer security bindings.
          // Existing saved recipients retain their balances and identity; only known demo
          // identities receive explicit, deterministic phone fixtures.
          session
              .createNativeMutationQuery(
                  "insert into recipients(recipient_id,customer_id,display_name,bank_name,masked_identifier,currency,destination_ref,status,created_at,version,phone_e164) select 'recipient_wang_chen','usr_aster_alex','王晨','Aster Demo Bank','•••• 8000','CNY','demo-wang-chen','ACTIVE',:at,0,'+8613900008000' where exists(select 1 from customers where customer_id='usr_aster_alex') on conflict(recipient_id) do nothing")
              .setParameter("at", original.asOf())
              .executeUpdate();
          session
              .createNativeMutationQuery(
                  "insert into recipients(recipient_id,customer_id,display_name,bank_name,masked_identifier,currency,destination_ref,status,created_at,version,phone_e164) select 'recipient_wang_qiang','usr_aster_alex','王强','Aster Demo Bank','•••• 6018','CNY','demo-wang-qiang','ACTIVE',:at,0,'+8613800006018' where exists(select 1 from customers where customer_id='usr_aster_alex') on conflict(recipient_id) do nothing")
              .setParameter("at", original.asOf())
              .executeUpdate();
          session
              .createNativeMutationQuery(
                  "update recipients set phone_e164='+8613800138000' where recipient_id='recipient_zhang' and customer_id='usr_aster_alex' and phone_e164 is null")
              .executeUpdate();
          session
              .createNativeMutationQuery(
                  "update recipients set phone_e164='+8613700006201' where recipient_id='recipient_lin' and customer_id='usr_aster_alex' and phone_e164 is null")
              .executeUpdate();
        });
  }

  public void initialize(DemoSeed seed, List<Recipient> recipients) {
    tx.executeWithoutResult(
        status -> {
          var em = db.entityManager();
          var owners = new LinkedHashSet<CustomerId>();
          seed.accounts().forEach(a -> owners.add(a.customerId()));
          for (var owner : owners) {
            em.unwrap(org.hibernate.Session.class)
                .createNativeQuery(
                    "insert into customers(customer_id,display_name,created_at,account_as_of,transaction_revision,seed_version) values(:c,:name,:time,:time,0,0) on conflict(customer_id) do nothing")
                .setParameter("c", owner.value())
                .setParameter(
                    "name",
                    owner.value().equals("usr_aster_alex")
                        ? "Alex Chen"
                        : owner.value().equals("usr_aster_lin") ? "Lin Wei" : "Other test customer")
                .setParameter("time", seed.asOf())
                .executeUpdate();
            db.lockOwnerForWrite(owner);
            Number version =
                (Number)
                    em.unwrap(org.hibernate.Session.class)
                        .createNativeQuery(
                            "select seed_version from customers where customer_id=:c",
                            Integer.class)
                        .setParameter("c", owner.value())
                        .getSingleResult();
            if (version.intValue() > 0) continue;
            for (var a : seed.accounts())
              if (a.customerId().equals(owner)) em.persist(AccountPersistenceMapper.entity(a));
            em.flush();
            for (var r : recipients)
              if (r.customerId().equals(owner))
                em.persist(PostgreSqlRecipientRepositoryAdapter.entity(r));
            em.flush();
            for (var t : seed.transactions())
              if (t.customerId().equals(owner)) em.persist(TransactionPersistenceMapper.entity(t));
            em.flush();
            em.unwrap(org.hibernate.Session.class)
                .createNativeQuery("update customers set seed_version=1 where customer_id=:c")
                .setParameter("c", owner.value())
                .executeUpdate();
          }
        });
  }
}
