package com.asterbank.banking.customer.wealth.application;

import static com.asterbank.banking.customer.wealth.domain.WealthFailure.Code.*;

import com.asterbank.banking.customer.account.application.*;
import com.asterbank.banking.customer.account.domain.*;
import com.asterbank.banking.customer.payment.application.*;
import com.asterbank.banking.customer.transaction.application.TransactionMutationPort;
import com.asterbank.banking.customer.transaction.domain.*;
import com.asterbank.banking.customer.wealth.domain.*;
import com.asterbank.banking.security.application.*;
import com.asterbank.banking.security.domain.*;
import com.asterbank.banking.security.domain.SecurityState.Binding;
import com.asterbank.banking.shared.domain.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

public final class WealthService implements PortfolioQuery {
  private ActionAuthorizationService grants;

  public WealthService withAuthorizations(ActionAuthorizationService grants) {
    this.grants = java.util.Objects.requireNonNull(grants);
    return this;
  }

  private void authorize(String id, Binding b, VerificationAction action) {
    if (grants == null) throw new SecurityFailure("STEP_UP_AUTH_REQUIRED", 403);
    grants.require(id, b, action);
  }

  private final WealthStore store;
  private final AccountRepository accounts;
  private final AccountMutationPort debits;
  private final TransactionMutationPort transactions;
  private final IdempotencyRepository keys;
  private final IdGenerator ids;
  private final Clock clock;
  private final WealthExecutionCheckpoint checkpoint;
  private final InvestmentIntentHasher hasher = new InvestmentIntentHasher();
  private final RedemptionIntentHasher redemptionHasher = new RedemptionIntentHasher();

  public WealthService(
      WealthStore store,
      AccountRepository accounts,
      AccountMutationPort debits,
      TransactionMutationPort transactions,
      IdempotencyRepository keys,
      IdGenerator ids,
      Clock clock,
      WealthExecutionCheckpoint checkpoint) {
    this.store = store;
    this.accounts = accounts;
    this.debits = debits;
    this.transactions = transactions;
    this.keys = keys;
    this.ids = ids;
    this.clock = clock;
    this.checkpoint = checkpoint;
  }

  private OffsetDateTime now() {
    return OffsetDateTime.now(clock).truncatedTo(ChronoUnit.MICROS);
  }

  public List<InvestmentProduct> products(InvestmentProduct.Type type, RiskLevel risk) {
    return store.products(type, risk);
  }

  public InvestmentProduct product(String id) {
    return store.product(id).orElseThrow(() -> new WealthFailure(INVESTMENT_PRODUCT_NOT_FOUND));
  }

  public RiskProfile risk(CustomerId owner) {
    return store.risk(owner).orElseThrow(() -> new WealthFailure(RISK_PROFILE_NOT_FOUND));
  }

  private RiskProfile validRisk(CustomerId owner) {
    var r = risk(owner);
    if (!clock.instant().isBefore(r.expiresAt().toInstant()))
      throw new WealthFailure(RISK_PROFILE_EXPIRED);
    return r;
  }

  private void available(InvestmentProduct p) {
    if (p.status() != InvestmentProduct.Status.AVAILABLE)
      throw new WealthFailure(INVESTMENT_PRODUCT_UNAVAILABLE);
  }

  public Portfolio portfolio(CustomerId owner) {
    return store.read(
        () -> {
          var p = store.positions(owner);
          return new Portfolio(
              p,
              p.stream()
                  .map(Position::asOf)
                  .max(Comparator.comparing(OffsetDateTime::toInstant))
                  .orElseGet(this::now));
        });
  }

  public Suitability check(CustomerId owner, String productId) {
    return store.write(
        owner,
        () -> {
          var p = product(productId);
          available(p);
          var r = validRisk(owner);
          var at = now();
          boolean suitable = r.riskLevel().permits(p.riskLevel());
          var s =
              new Suitability(
                  ids.next("suitability"),
                  owner,
                  p.id(),
                  r.riskLevel(),
                  p.riskLevel(),
                  p.version(),
                  r.version(),
                  suitable ? Suitability.Result.SUITABLE : Suitability.Result.NOT_SUITABLE,
                  List.of(
                      suitable
                          ? "Product risk is within the demo user's risk level. This is eligibility evidence, not an investment recommendation."
                          : "Product risk exceeds the demo user's risk level. Purchasing this product is unavailable."),
                  at,
                  at.plusMinutes(30));
          store.save(s);
          return s;
        });
  }

  public Suitability suitability(CustomerId owner, String id) {
    return store
        .suitability(owner, id)
        .orElseThrow(() -> new WealthFailure(SUITABILITY_CHECK_NOT_FOUND));
  }

  private void evidence(CustomerId owner, InvestmentProduct p, Suitability s) {
    var r = validRisk(owner);
    if (!s.productId().equals(p.id())) throw new WealthFailure(SUITABILITY_CHECK_MISMATCH);
    if (!clock.instant().isBefore(s.expiresAt().toInstant()))
      throw new WealthFailure(SUITABILITY_CHECK_EXPIRED);
    if (s.productVersion() != p.version()
        || s.riskProfileVersion() != r.version()
        || s.productRiskLevel() != p.riskLevel()
        || s.userRiskLevel() != r.riskLevel()) throw new WealthFailure(INVESTMENT_STATE_CHANGED);
    if (s.result() != Suitability.Result.SUITABLE || !r.riskLevel().permits(p.riskLevel()))
      throw new WealthFailure(PRODUCT_NOT_SUITABLE);
  }

  private Account account(CustomerId owner, String id) {
    return accounts
        .find(owner, new AccountId(id))
        .orElseThrow(() -> new WealthFailure(ACCOUNT_NOT_FOUND));
  }

  private Money validate(InvestmentProduct p, Account a, Money amount) {
    if (amount.amount().signum() <= 0 || amount.amount().precision() - amount.amount().scale() > 12)
      throw new WealthFailure(INVALID_AMOUNT);
    if (a.status() != AccountStatus.ACTIVE) throw new WealthFailure(ACCOUNT_NOT_ELIGIBLE);
    if (a.type() == com.asterbank.banking.customer.account.domain.AccountType.TIME_DEPOSIT)
      throw new WealthFailure(ACCOUNT_NOT_ELIGIBLE);
    if (!p.currency().equals("CNY")
        || !amount.currency().equals(p.minimumInvestment().currency())
        || !amount.currency().equals(a.balance().currency())
        || !amount.currency().equals(p.fees().currency()))
      throw new WealthFailure(CURRENCY_MISMATCH);
    if (p.fees().amount().signum() < 0) throw new WealthFailure(INVESTMENT_STATE_CHANGED);
    if (amount.amount().compareTo(p.minimumInvestment().amount()) < 0)
      throw new WealthFailure(INVESTMENT_AMOUNT_BELOW_MINIMUM);
    var total = amount.add(p.fees());
    if (a.availableBalance().amount().compareTo(total.amount()) < 0)
      throw new WealthFailure(INSUFFICIENT_FUNDS);
    return total;
  }

  public InvestmentIntent prepare(
      CustomerId owner, String productId, String accountId, Money amount, String checkId) {
    return store.write(
        owner,
        () -> {
          var p = product(productId);
          available(p);
          var a = account(owner, accountId);
          var s = suitability(owner, checkId);
          evidence(owner, p, s);
          var total = validate(p, a, amount);
          var at = now();
          var t =
              new InvestmentIntent.Terms(
                  ids.next("investment_intent"),
                  p,
                  a,
                  s,
                  amount,
                  p.fees(),
                  total,
                  a.availableBalance().subtract(total),
                  at,
                  at.plusMinutes(15));
          var i = new InvestmentIntent(t, hasher.hash(t), InvestmentIntent.Status.PREPARED);
          store.save(i);
          return i;
        });
  }

  private InvestmentIntent stored(CustomerId owner, String id) {
    return store
        .intent(owner, id)
        .orElseThrow(() -> new WealthFailure(INVESTMENT_INTENT_NOT_FOUND));
  }

  public InvestmentIntent intent(CustomerId owner, String id) {
    var i = stored(owner, id);
    return new InvestmentIntent(i.terms(), i.intentHash(), i.statusAt(clock.instant()));
  }

  public InvestmentIntent cancel(CustomerId owner, String id) {
    return store.write(
        owner,
        () -> {
          var intent = stored(owner, id);
          if (intent.status() == InvestmentIntent.Status.EXECUTED)
            throw new WealthFailure(INVESTMENT_INTENT_ALREADY_EXECUTED);
          if (intent.status() == InvestmentIntent.Status.CANCELLED) return intent;
          if (intent.statusAt(clock.instant()) == InvestmentIntent.Status.EXPIRED)
            return new InvestmentIntent(
                intent.terms(), intent.intentHash(), InvestmentIntent.Status.EXPIRED);
          var cancelled = intent.cancelled();
          store.save(cancelled);
          return cancelled;
        });
  }

  public InvestmentOrder order(CustomerId owner, String id) {
    return store.order(owner, id).orElseThrow(() -> new WealthFailure(INVESTMENT_ORDER_NOT_FOUND));
  }

  public InvestmentOrder execute(CustomerId owner, String id, String hash, String key) {
    return execute(owner, id, hash, key, null, null, null);
  }

  public InvestmentOrder execute(
      CustomerId owner,
      String id,
      String hash,
      String key,
      String session,
      String grant,
      String correlation) {
    if (id == null || hash == null || key == null || !key.matches("[A-Za-z0-9_-]{1,128}"))
      throw new WealthFailure(INVALID_REQUEST);
    return store.write(
        owner,
        () -> {
          var scope = new IdempotencyRepository.Scope(owner, "EXECUTE_INVESTMENT_ORDER", key);
          var fingerprint =
              com.asterbank.banking.customer.payment.domain.RecipientAction.digest(
                  hasher.fingerprint(id, hash), session, grant);
          var old = keys.find(scope);
          if (old.isPresent()) {
            if (!old.get().fingerprint().equals(fingerprint))
              throw new WealthFailure(IDEMPOTENCY_KEY_REUSED);
            return order(owner, old.get().resourceId());
          }
          var binding = new Binding(owner.value(), session, "INVESTMENT_ORDER_INTENT", id, hash);
          var i = stored(owner, id);
          var t = i.terms();
          if (!i.intentHash().equals(hash) || !hasher.hash(t).equals(hash))
            throw new WealthFailure(INVESTMENT_INTENT_HASH_MISMATCH);
          if (i.status() == InvestmentIntent.Status.EXECUTED)
            throw new WealthFailure(INVESTMENT_INTENT_ALREADY_EXECUTED);
          if (i.status() == InvestmentIntent.Status.CANCELLED)
            throw new WealthFailure(INVESTMENT_INTENT_CANCELLED);
          if (i.statusAt(clock.instant()) == InvestmentIntent.Status.EXPIRED)
            throw new WealthFailure(INVESTMENT_INTENT_EXPIRED);
          var p = product(t.product().id());
          available(p);
          var a = account(owner, t.sourceAccount().id().value());
          var s = suitability(owner, t.suitability().id());
          evidence(owner, p, s);
          if (!p.equals(t.product()) || !a.equals(t.sourceAccount()) || !s.equals(t.suitability()))
            throw new WealthFailure(INVESTMENT_STATE_CHANGED);
          var total = validate(p, a, t.amount());
          if (!total.equals(t.totalDebit())
              || !p.fees().equals(t.fees())
              || !a.availableBalance().subtract(total).equals(t.projectedAvailableBalance()))
            throw new WealthFailure(INVESTMENT_STATE_CHANGED);
          authorize(grant, binding, VerificationAction.INVESTMENT_ORDER_EXECUTE);
          var at = now();
          debits.save(a.debit(total), at);
          checkpoint.reached(WealthExecutionCheckpoint.Stage.AFTER_ACCOUNT_DEBIT);
          var position =
              store.positions(owner).stream()
                  .filter(x -> p.id().equals(x.productId()))
                  .findFirst()
                  .orElseGet(
                      () ->
                          new Position(
                              ids.next("position"),
                              owner,
                              p.id(),
                              p.displayName(),
                              p.type(),
                              Money.of("0", "CNY"),
                              Money.of("0", "CNY"),
                              Money.of("0", "CNY"),
                              Money.of("0", "CNY"),
                              0,
                              at));
          var changed = position.purchase(t.amount(), at);
          store.save(changed);
          checkpoint.reached(WealthExecutionCheckpoint.Stage.AFTER_POSITION_UPDATE);
          var orderId = ids.next("investment_order");
          var txId = ids.next("txn_investment");
          var reference = "ASTER-INVESTMENT-" + orderId;
          transactions.append(
              new Transaction(
                  new TransactionId(txId),
                  owner,
                  a.id(),
                  p.displayName(),
                  total,
                  TransactionDirection.DEBIT,
                  TransactionStatus.COMPLETED,
                  TransactionType.INVESTMENT_PURCHASE,
                  TransactionCategory.INVESTMENT,
                  at,
                  at,
                  null,
                  null,
                  null,
                  null,
                  reference));
          checkpoint.reached(WealthExecutionCheckpoint.Stage.AFTER_TRANSACTION_APPEND);
          var order = new InvestmentOrder(orderId, t, txId, changed.id(), reference, at);
          store.save(order);
          checkpoint.reached(WealthExecutionCheckpoint.Stage.AFTER_ORDER_INSERT);
          store.save(i.executed());
          checkpoint.reached(WealthExecutionCheckpoint.Stage.BEFORE_IDEMPOTENCY_COMPLETION);
          grants.consume(grant, binding, correlation);
          keys.save(new IdempotencyRepository.Completed(scope, fingerprint, orderId));
          return order;
        });
  }

  private Position holding(CustomerId owner, String id) {
    return store.positions(owner).stream()
        .filter(p -> p.id().equals(id))
        .findFirst()
        .orElseThrow(() -> new WealthFailure(HOLDING_NOT_FOUND));
  }

  public RedemptionIntent prepareRedemption(
      CustomerId owner, String holdingId, String destinationAccountId, Money amount) {
    return store.write(
        owner,
        () -> {
          var h = holding(owner, holdingId);
          if (h.productId() == null) throw new WealthFailure(INVESTMENT_PRODUCT_UNAVAILABLE);
          var p = product(h.productId());
          available(p);
          var risk = validRisk(owner);
          if (!risk.riskLevel().permits(p.riskLevel()))
            throw new WealthFailure(PRODUCT_NOT_SUITABLE);
          var account = account(owner, destinationAccountId);
          if (account.status() != AccountStatus.ACTIVE
              || account.type() == AccountType.TIME_DEPOSIT)
            throw new WealthFailure(ACCOUNT_NOT_ELIGIBLE);
          if (!"CNY".equals(p.currency())
              || !"CNY".equals(amount.currency().getCurrencyCode())
              || !"CNY".equals(account.balance().currency().getCurrencyCode()))
            throw new WealthFailure(CURRENCY_MISMATCH);
          if (amount.amount().signum() <= 0
              || amount.amount().compareTo(h.currentValue().amount()) > 0)
            throw new WealthFailure(REDEMPTION_EXCEEDS_HOLDING);
          var at = now();
          var fees = Money.of("0.00", "CNY");
          var terms =
              new RedemptionIntent.Terms(
                  ids.next("redemption_intent"),
                  p,
                  h,
                  account,
                  risk,
                  amount,
                  fees,
                  amount.subtract(fees),
                  at,
                  at.plusMinutes(15));
          var intent =
              new RedemptionIntent(
                  terms, redemptionHasher.hash(terms), RedemptionIntent.Status.PREPARED);
          store.save(intent);
          return intent;
        });
  }

  private RedemptionIntent storedRedemption(CustomerId owner, String id) {
    return store
        .redemptionIntent(owner, id)
        .orElseThrow(() -> new WealthFailure(REDEMPTION_INTENT_NOT_FOUND));
  }

  public RedemptionIntent redemptionIntent(CustomerId owner, String id) {
    var intent = storedRedemption(owner, id);
    return new RedemptionIntent(
        intent.terms(), intent.intentHash(), intent.statusAt(clock.instant()));
  }

  public RedemptionIntent cancelRedemption(CustomerId owner, String id) {
    return store.write(
        owner,
        () -> {
          var intent = storedRedemption(owner, id);
          if (intent.status() == RedemptionIntent.Status.EXECUTED)
            throw new WealthFailure(REDEMPTION_INTENT_ALREADY_EXECUTED);
          if (intent.status() == RedemptionIntent.Status.CANCELLED) return intent;
          if (intent.statusAt(clock.instant()) == RedemptionIntent.Status.EXPIRED)
            return new RedemptionIntent(
                intent.terms(), intent.intentHash(), RedemptionIntent.Status.EXPIRED);
          var cancelled = intent.cancelled();
          store.save(cancelled);
          return cancelled;
        });
  }

  public RedemptionOrder redemptionOrder(CustomerId owner, String id) {
    return store
        .redemptionOrder(owner, id)
        .orElseThrow(() -> new WealthFailure(INVESTMENT_ORDER_NOT_FOUND));
  }

  public RedemptionOrder executeRedemption(
      CustomerId owner,
      String id,
      String hash,
      String key,
      String session,
      String grant,
      String correlation) {
    if (id == null || hash == null || key == null || !key.matches("[A-Za-z0-9_-]{1,128}"))
      throw new WealthFailure(INVALID_REQUEST);
    return store.write(
        owner,
        () -> {
          var scope = new IdempotencyRepository.Scope(owner, "EXECUTE_INVESTMENT_REDEMPTION", key);
          var fingerprint =
              com.asterbank.banking.customer.payment.domain.RecipientAction.digest(
                  redemptionHasher.fingerprint(id, hash), session, grant);
          var old = keys.find(scope);
          if (old.isPresent()) {
            if (!old.get().fingerprint().equals(fingerprint))
              throw new WealthFailure(IDEMPOTENCY_KEY_REUSED);
            return redemptionOrder(owner, old.get().resourceId());
          }
          var intent = storedRedemption(owner, id);
          var terms = intent.terms();
          if (!intent.intentHash().equals(hash) || !redemptionHasher.hash(terms).equals(hash))
            throw new WealthFailure(REDEMPTION_INTENT_HASH_MISMATCH);
          if (intent.status() == RedemptionIntent.Status.EXECUTED)
            throw new WealthFailure(REDEMPTION_INTENT_ALREADY_EXECUTED);
          if (intent.status() == RedemptionIntent.Status.CANCELLED)
            throw new WealthFailure(REDEMPTION_INTENT_CANCELLED);
          if (intent.statusAt(clock.instant()) == RedemptionIntent.Status.EXPIRED)
            throw new WealthFailure(REDEMPTION_INTENT_EXPIRED);
          var product = product(terms.product().id());
          available(product);
          var position = holding(owner, terms.holding().id());
          var destination = account(owner, terms.destinationAccount().id().value());
          var risk = validRisk(owner);
          if (!risk.riskLevel().permits(product.riskLevel()))
            throw new WealthFailure(PRODUCT_NOT_SUITABLE);
          if (destination.status() != AccountStatus.ACTIVE
              || destination.type() == AccountType.TIME_DEPOSIT)
            throw new WealthFailure(ACCOUNT_NOT_ELIGIBLE);
          if (!product.equals(terms.product())
              || !position.equals(terms.holding())
              || !destination.equals(terms.destinationAccount())
              || !risk.equals(terms.riskProfile()))
            throw new WealthFailure(INVESTMENT_STATE_CHANGED);
          if (terms.amount().amount().compareTo(position.currentValue().amount()) > 0)
            throw new WealthFailure(REDEMPTION_EXCEEDS_HOLDING);
          var binding = new Binding(owner.value(), session, "INVESTMENT_ORDER_INTENT", id, hash);
          authorize(grant, binding, VerificationAction.INVESTMENT_ORDER_EXECUTE);
          var at = now();
          var changed = position.redeem(terms.amount(), at);
          store.save(changed);
          debits.save(destination.credit(terms.estimatedProceeds()), at);
          var orderId = ids.next("redemption_order");
          var transactionId = ids.next("txn_redemption");
          var reference = "ASTER-REDEMPTION-" + orderId;
          transactions.append(
              new Transaction(
                  new TransactionId(transactionId),
                  owner,
                  destination.id(),
                  product.displayName(),
                  terms.estimatedProceeds(),
                  TransactionDirection.CREDIT,
                  TransactionStatus.COMPLETED,
                  TransactionType.INVESTMENT_REDEMPTION,
                  TransactionCategory.INVESTMENT,
                  at,
                  at,
                  null,
                  null,
                  null,
                  null,
                  reference));
          var order = new RedemptionOrder(orderId, terms, transactionId, reference, at);
          store.save(order);
          store.save(intent.executed());
          grants.consume(grant, binding, correlation);
          keys.save(new IdempotencyRepository.Completed(scope, fingerprint, orderId));
          return order;
        });
  }
}
