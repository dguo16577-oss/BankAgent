package com.asterbank.banking.customer.payment.adapter.persistence;

import com.asterbank.banking.customer.account.application.AccountMutationPort;
import com.asterbank.banking.customer.account.application.AccountRepository;
import com.asterbank.banking.customer.account.domain.AccountId;
import com.asterbank.banking.customer.account.domain.AccountStatus;
import com.asterbank.banking.customer.payment.application.IdGenerator;
import com.asterbank.banking.customer.payment.application.InternalTransferPosting;
import com.asterbank.banking.customer.payment.application.PaymentFailure;
import com.asterbank.banking.customer.payment.domain.Transfer;
import com.asterbank.banking.customer.transaction.application.TransactionMutationPort;
import com.asterbank.banking.customer.transaction.domain.*;
import com.asterbank.banking.shared.adapter.persistence.DatabaseScope;
import com.asterbank.banking.shared.domain.CustomerId;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;

/** Resolves only explicitly seeded demo destinations; no external payment rail is implied. */
public final class PostgreSqlInternalTransferPosting implements InternalTransferPosting {
  private record Destination(CustomerId customer, AccountId account) {}

  private final DatabaseScope scope;
  private final JdbcTemplate jdbc;
  private final AccountRepository accounts;
  private final AccountMutationPort accountWrites;
  private final TransactionMutationPort transactions;
  private final IdGenerator ids;

  public PostgreSqlInternalTransferPosting(
      DatabaseScope scope,
      JdbcTemplate jdbc,
      AccountRepository accounts,
      AccountMutationPort accountWrites,
      TransactionMutationPort transactions,
      IdGenerator ids) {
    this.scope = scope;
    this.jdbc = jdbc;
    this.accounts = accounts;
    this.accountWrites = accountWrites;
    this.transactions = transactions;
    this.ids = ids;
  }

  public void lockParticipants(CustomerId sender, String intentId) {
    var rows =
        jdbc.query(
            "select d.target_customer_id,d.target_account_id from transfer_intents i join recipients r on r.customer_id=i.customer_id and r.recipient_id=i.recipient_id join demo_internal_destinations d on d.destination_ref=r.destination_ref where i.customer_id=? and i.intent_id=?",
            (row, n) ->
                new Destination(new CustomerId(row.getString(1)), new AccountId(row.getString(2))),
            sender.value(),
            intentId);
    var owners = new TreeSet<String>();
    owners.add(sender.value());
    if (!rows.isEmpty()) owners.add(rows.getFirst().customer().value());
    for (String owner : owners) scope.lockOwnerForWrite(new CustomerId(owner));
  }

  public void creditRecipient(Transfer transfer) {
    var route = destination(transfer.recipient().destinationRef());
    if (route.isEmpty()) return;
    var destination = route.get();
    var account =
        accounts
            .find(destination.customer(), destination.account())
            .orElseThrow(() -> new PaymentFailure(PaymentFailure.Code.RECIPIENT_NOT_ELIGIBLE));
    if (account.status() != AccountStatus.ACTIVE
        || !account.balance().currency().equals(transfer.terms().amount().currency())
        || !account.maskedAccountNumber().equals(transfer.recipient().maskedAccountNumber()))
      throw new PaymentFailure(PaymentFailure.Code.RECIPIENT_NOT_ELIGIBLE);
    var credited = account.credit(transfer.terms().amount());
    accountWrites.save(credited, transfer.completedAt());
    var senderName =
        jdbc.queryForObject(
            "select display_name from customers where customer_id=?",
            String.class,
            transfer.customerId().value());
    transactions.append(
        new Transaction(
            new TransactionId(ids.next("txn")),
            destination.customer(),
            destination.account(),
            "From " + senderName,
            transfer.terms().amount(),
            TransactionDirection.CREDIT,
            TransactionStatus.COMPLETED,
            TransactionType.BANK_TRANSFER,
            TransactionCategory.TRANSFER,
            transfer.completedAt(),
            transfer.completedAt(),
            null,
            new Counterparty(senderName, transfer.sourceAccount().maskedAccountNumber()),
            null,
            null,
            transfer.reference()));
  }

  private Optional<Destination> destination(String reference) {
    return jdbc
        .query(
            "select target_customer_id,target_account_id from demo_internal_destinations where destination_ref=?",
            (row, n) ->
                new Destination(new CustomerId(row.getString(1)), new AccountId(row.getString(2))),
            reference)
        .stream()
        .findFirst();
  }
}
