package com.asterbank.banking.customer.payment.application;

import static com.asterbank.banking.customer.payment.application.PaymentFailure.Code.*;

import com.asterbank.banking.customer.account.application.AccountMutationPort;
import com.asterbank.banking.customer.payment.domain.*;
import com.asterbank.banking.customer.transaction.application.TransactionMutationPort;
import com.asterbank.banking.customer.transaction.domain.*;
import com.asterbank.banking.shared.domain.CustomerId;
import java.time.*;

public final class TransferExecutionService {
  private final TransferValidation validation;
  private final TransferIntentRepository intents;
  private final TransferRepository transfers;
  private final IdempotencyRepository idempotency;
  private final AccountMutationPort accounts;
  private final TransactionMutationPort transactions;
  private final TransferExecutionBoundary boundary;
  private final IdGenerator ids;
  private final Clock clock;
  private final IntentHasher hasher = new IntentHasher();
  private com.asterbank.banking.security.application.ActionAuthorizationService authorizations;
  private InternalTransferPosting internalPosting;

  public TransferExecutionService withAuthorizations(
      com.asterbank.banking.security.application.ActionAuthorizationService service) {
    this.authorizations = service;
    return this;
  }

  public TransferExecutionService withInternalPosting(InternalTransferPosting posting) {
    this.internalPosting = java.util.Objects.requireNonNull(posting);
    return this;
  }

  public TransferExecutionService(
      TransferValidation validation,
      TransferIntentRepository intents,
      TransferRepository transfers,
      IdempotencyRepository idempotency,
      AccountMutationPort accounts,
      TransactionMutationPort transactions,
      TransferExecutionBoundary boundary,
      IdGenerator ids,
      Clock clock) {
    this.validation = validation;
    this.intents = intents;
    this.transfers = transfers;
    this.idempotency = idempotency;
    this.accounts = accounts;
    this.transactions = transactions;
    this.boundary = boundary;
    this.ids = ids;
    this.clock = clock;
  }

  public Transfer execute(CustomerId customer, String intentId, String hash, String key) {
    return execute(customer, intentId, hash, key, null, null, null);
  }

  public Transfer execute(
      CustomerId customer,
      String intentId,
      String hash,
      String key,
      String session,
      String authorization,
      String correlation) {
    if (intentId == null || hash == null || key == null || !key.matches("[A-Za-z0-9_-]{1,128}"))
      throw new PaymentFailure(INVALID_REQUEST);
    return boundary.execute(
        () -> {
          if (internalPosting != null) internalPosting.lockParticipants(customer, intentId);
          var intent =
              intents
                  .find(customer, intentId)
                  .orElseThrow(() -> new PaymentFailure(TRANSFER_INTENT_NOT_FOUND));
          if (!java.util.Objects.equals(intent.terms().sessionId(), session))
            throw new PaymentFailure(TRANSFER_SESSION_MISMATCH);
          var scope = new IdempotencyRepository.Scope(customer, "EXECUTE_TRANSFER", key);
          var fingerprint =
              session == null
                  ? hasher.requestFingerprint(intentId, hash)
                  : RecipientAction.digest(
                      hasher.requestFingerprint(intentId, hash), session, authorization);
          var previous = idempotency.find(scope);
          if (previous.isPresent()) {
            var record = previous.get();
            if (!record.fingerprint().equals(fingerprint))
              throw new PaymentFailure(IDEMPOTENCY_KEY_REUSED);
            return transfers
                .find(customer, record.resourceId())
                .orElseThrow(() -> new IllegalStateException("Missing idempotent receipt"));
          }
          if (!intent.intentHash().equals(hash))
            throw new PaymentFailure(TRANSFER_INTENT_HASH_MISMATCH);
          if (intent.status() == TransferIntent.Status.EXECUTED)
            throw new PaymentFailure(TRANSFER_INTENT_ALREADY_EXECUTED);
          if (intent.statusAt(clock.instant()) == TransferIntent.Status.EXPIRED)
            throw new PaymentFailure(TRANSFER_INTENT_EXPIRED);
          if (intent.status() != TransferIntent.Status.PREPARED)
            throw new PaymentFailure(TRANSFER_INTENT_CANCELLED);
          var terms = intent.terms();
          var binding =
              new com.asterbank.banking.security.domain.SecurityState.Binding(
                  customer.value(), session, "TRANSFER_INTENT", intentId, hash);
          if (authorizations == null)
            throw new com.asterbank.banking.security.application.SecurityFailure(
                "STEP_UP_AUTH_REQUIRED", 403);
          authorizations.require(
              authorization,
              binding,
              com.asterbank.banking.security.domain.VerificationAction.TRANSFER_EXECUTE);
          var transfer = settle(customer, terms);
          intents.save(intent.executed());
          if (authorization != null) authorizations.consume(authorization, binding, correlation);
          idempotency.save(new IdempotencyRepository.Completed(scope, fingerprint, transfer.id()));
          return transfer;
        });
  }

  /**
   * Called only inside the caller's financial transaction with an approved immutable instruction.
   */
  public Transfer settle(CustomerId customer, IntentTerms terms) {
    var checked =
        validation.validate(
            customer,
            new PrepareTransfer(
                terms.sourceAccount().id(), terms.recipient().id(), terms.amount(), terms.note()));
    if (!checked.recipient().sameTransferIdentityAs(terms.recipient())
        || !checked
            .source()
            .maskedAccountNumber()
            .equals(terms.sourceAccount().maskedAccountNumber()))
      throw new PaymentFailure(TRANSFER_INTENT_HASH_MISMATCH);
    if (checked.source().availableBalance().amount().compareTo(terms.totalDebit().amount()) < 0)
      throw new PaymentFailure(INSUFFICIENT_FUNDS);
    var debited = checked.source().debit(terms.totalDebit());
    var now = OffsetDateTime.now(clock).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
    var id = ids.next("transfer");
    var txId = new TransactionId(ids.next("txn"));
    var reference = "ASTER-" + id;
    var transfer =
        new Transfer(
            id, customer, terms, checked.source(), checked.recipient(), txId, reference, now);
    var transaction =
        new Transaction(
            txId,
            customer,
            debited.id(),
            "To " + checked.recipient().displayName(),
            terms.amount(),
            TransactionDirection.DEBIT,
            TransactionStatus.COMPLETED,
            TransactionType.BANK_TRANSFER,
            TransactionCategory.TRANSFER,
            now,
            now,
            null,
            new Counterparty(
                checked.recipient().displayName(), checked.recipient().maskedAccountNumber()),
            null,
            null,
            reference,
            terms.note().isBlank() ? null : terms.note());
    accounts.save(debited, now);
    transactions.append(transaction);
    if (internalPosting != null) internalPosting.creditRecipient(transfer);
    transfers.save(transfer);
    return transfer;
  }

  public Transfer get(CustomerId customer, String id) {
    return transfers.find(customer, id).orElseThrow(() -> new PaymentFailure(TRANSFER_NOT_FOUND));
  }
}
