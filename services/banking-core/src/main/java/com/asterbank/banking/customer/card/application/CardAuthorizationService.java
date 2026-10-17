package com.asterbank.banking.customer.card.application;

import com.asterbank.banking.customer.card.domain.*;
import com.asterbank.banking.customer.payment.application.IdGenerator;
import com.asterbank.banking.shared.domain.CanonicalHash;
import com.asterbank.banking.shared.domain.CustomerId;
import java.math.BigDecimal;
import java.time.*;

public final class CardAuthorizationService {
  private static final ZoneId DAY_ZONE = ZoneId.of("Asia/Shanghai");
  private final CardStore cards;
  private final CardAuthorizationStore decisions;
  private final IdGenerator ids;
  private final Clock clock;

  public CardAuthorizationService(
      CardStore cards, CardAuthorizationStore decisions, IdGenerator ids, Clock clock) {
    this.cards = cards;
    this.decisions = decisions;
    this.ids = ids;
    this.clock = clock;
  }

  public CardAuthorization authorize(
      CustomerId owner,
      String cardId,
      BigDecimal amount,
      CardAuthorization.Channel channel,
      boolean international,
      String requestKey) {
    if (cardId == null
        || channel == null
        || requestKey == null
        || !requestKey.matches("[A-Za-z0-9_-]{1,128}")
        || amount == null
        || amount.signum() <= 0
        || amount.scale() > 2) throw new CardFailure(CardFailure.Code.INVALID_REQUEST);
    var hash = new CanonicalHash();
    hash.add(cardId);
    hash.add(amount.setScale(2).toPlainString());
    hash.add(channel.name());
    hash.add(Boolean.toString(international));
    var fingerprint = hash.digest();
    return cards.write(
        () -> {
          var card =
              cards
                  .card(owner, cardId)
                  .orElseThrow(() -> new CardFailure(CardFailure.Code.CARD_NOT_FOUND));
          var previous = decisions.find(owner, requestKey);
          if (previous.isPresent()) {
            if (!previous.get().requestHash().equals(fingerprint))
              throw new CardFailure(CardFailure.Code.IDEMPOTENCY_KEY_REUSED);
            return previous.get();
          }
          var limits = card.state().limits();
          var day = LocalDate.ofInstant(clock.instant(), DAY_ZONE).atStartOfDay(DAY_ZONE);
          var spent =
              decisions.approvedAmount(owner, cardId, day.toInstant(), day.plusDays(1).toInstant());
          var reason =
              reason(
                  card,
                  amount,
                  channel,
                  international,
                  spent,
                  decisions.creditLimit(owner, cardId));
          var decision =
              new CardAuthorization(
                  ids.next("card_authorization"),
                  owner,
                  cardId,
                  amount.setScale(2),
                  channel,
                  international,
                  reason == CardAuthorization.Reason.APPROVED
                      ? CardAuthorization.Status.APPROVED
                      : CardAuthorization.Status.DECLINED,
                  reason,
                  OffsetDateTime.now(clock),
                  requestKey,
                  fingerprint);
          decisions.save(decision);
          return decision;
        });
  }

  static CardAuthorization.Reason reason(
      Card card,
      BigDecimal amount,
      CardAuthorization.Channel channel,
      boolean international,
      BigDecimal spent,
      BigDecimal creditLimit) {
    if (card.state().status() != Card.Status.ACTIVE) return CardAuthorization.Reason.CARD_INACTIVE;
    var controls = card.state().controls();
    if (channel == CardAuthorization.Channel.ONLINE && !controls.onlinePayments())
      return CardAuthorization.Reason.ONLINE_DISABLED;
    if (international && !controls.internationalPayments())
      return CardAuthorization.Reason.INTERNATIONAL_DISABLED;
    if (channel == CardAuthorization.Channel.ATM && !controls.atmWithdrawals())
      return CardAuthorization.Reason.ATM_DISABLED;
    if (channel == CardAuthorization.Channel.CONTACTLESS && !controls.contactless())
      return CardAuthorization.Reason.CONTACTLESS_DISABLED;
    var limits = card.state().limits();
    if (amount.compareTo(limits.perTransaction()) > 0
        || amount.compareTo(limits.bankMaxPerTransaction()) > 0)
      return CardAuthorization.Reason.PER_TRANSACTION_LIMIT;
    if (spent.add(amount).compareTo(limits.daily()) > 0
        || spent.add(amount).compareTo(limits.bankMaxDaily()) > 0)
      return CardAuthorization.Reason.DAILY_LIMIT;
    if (card.type() == Card.Type.CREDIT
        && creditLimit != null
        && spent.add(amount).compareTo(creditLimit) > 0)
      return CardAuthorization.Reason.CREDIT_LIMIT;
    return CardAuthorization.Reason.APPROVED;
  }
}
