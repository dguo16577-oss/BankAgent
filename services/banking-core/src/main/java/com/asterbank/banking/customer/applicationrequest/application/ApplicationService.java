package com.asterbank.banking.customer.applicationrequest.application;

import static com.asterbank.banking.customer.applicationrequest.domain.ApplicationFailure.Code.*;

import com.asterbank.banking.customer.account.application.AccountRepository;
import com.asterbank.banking.customer.account.domain.*;
import com.asterbank.banking.customer.applicationrequest.domain.*;
import com.asterbank.banking.customer.payment.application.IdGenerator;
import com.asterbank.banking.security.application.*;
import com.asterbank.banking.security.domain.*;
import com.asterbank.banking.security.domain.SecurityState.Binding;
import com.asterbank.banking.shared.domain.CustomerId;
import java.time.*;
import java.util.*;

public final class ApplicationService {
  private final ApplicationStore store;
  private ActionAuthorizationService grants;

  public ApplicationService withAuthorizations(ActionAuthorizationService grants) {
    this.grants = grants;
    return this;
  }

  public ApplicationIntent prepare(CustomerId owner, String session, ApplicationRequest request) {
    return store.write(
        owner,
        () -> {
          var product =
              store
                  .product(request.productId())
                  .orElseThrow(() -> new ApplicationFailure(PRODUCT_NOT_APPLICABLE));
          request.validate(product.type());
          var account =
              accounts
                  .find(owner, new AccountId(request.accountId()))
                  .orElseThrow(() -> new ApplicationFailure(ACCOUNT_NOT_FOUND));
          if (account.status() != AccountStatus.ACTIVE
              || !account.balance().currency().getCurrencyCode().equals("CNY"))
            throw new ApplicationFailure(INVALID_REQUEST);
          if (product.type().equals("OVERDRAFT") && account.type() != AccountType.CURRENT)
            throw new ApplicationFailure(INVALID_REQUEST);
          var action =
              switch (product.type()) {
                case "PERSONAL_LOAN", "MORTGAGE", "OVERDRAFT" ->
                    VerificationAction.LOAN_APPLICATION_SUBMIT;
                case "SAVINGS_ACCOUNT", "INSURANCE_PRODUCT" ->
                    VerificationAction.PRODUCT_APPLICATION_SUBMIT;
                default -> VerificationAction.CARD_APPLICATION_SUBMIT;
              };
          var id = ids.next("application_intent");
          var now = clock.instant().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
          var intent =
              new ApplicationIntent(
                  id,
                  owner,
                  session,
                  request,
                  action,
                  ApplicationIntent.hash(id, owner, session, request, action),
                  now,
                  now.plusSeconds(900),
                  null,
                  null);
          store.save(intent);
          return intent;
        });
  }

  private final AccountRepository accounts;
  private final IdGenerator ids;
  private final Clock clock;

  public ApplicationService(
      ApplicationStore store, AccountRepository accounts, IdGenerator ids, Clock clock) {
    this.store = store;
    this.accounts = accounts;
    this.ids = ids;
    this.clock = clock;
  }

  public List<ProductApplication> list(CustomerId owner) {
    return store.list(owner);
  }

  public ApplicationIntent cancel(CustomerId owner, String session, String intentId) {
    return store.write(
        owner,
        () -> {
          var intent =
              store
                  .intent(owner, intentId)
                  .orElseThrow(() -> new ApplicationFailure(APPLICATION_NOT_FOUND));
          if (!Objects.equals(intent.session(), session)
              || intent.status() != ApplicationIntent.Status.PREPARED
              || !clock.instant().isBefore(intent.expiresAt()))
            throw new ApplicationFailure(APPLICATION_INTENT_CANCELLED);
          store.cancelIntent(owner, intentId);
          return new ApplicationIntent(
              intent.id(),
              intent.owner(),
              intent.session(),
              intent.request(),
              intent.action(),
              intent.hash(),
              intent.createdAt(),
              intent.expiresAt(),
              null,
              null,
              ApplicationIntent.Status.CANCELLED);
        });
  }

  public ProductApplication detail(CustomerId owner, String id) {
    return store.find(owner, id).orElseThrow(() -> new ApplicationFailure(APPLICATION_NOT_FOUND));
  }

  public ProductApplication submit(CustomerId owner, ApplicationRequest request, String key) {
    return submit(owner, request, key, null, null, null, null, null);
  }

  public ProductApplication submit(
      CustomerId owner,
      ApplicationRequest request,
      String key,
      String session,
      String intentId,
      String hash,
      String grant,
      String correlation) {
    if (key == null || !key.matches("[A-Za-z0-9_-]{1,128}"))
      throw new ApplicationFailure(INVALID_REQUEST);
    return store.write(
        owner,
        () -> {
          var prior = store.replay(owner, key);
          if (prior.isPresent() && !prior.get().request().equals(request))
            throw new ApplicationFailure(IDEMPOTENCY_KEY_REUSED);
          var intent =
              store
                  .intent(owner, intentId)
                  .orElseThrow(() -> new SecurityFailure("ACTION_AUTHORIZATION_MISMATCH", 403));
          if (!Objects.equals(intent.session(), session)
              || !intent.request().equals(request)
              || !Objects.equals(intent.hash(), hash)
              || !intent
                  .hash()
                  .equals(
                      ApplicationIntent.hash(
                          intent.id(), owner, session, request, intent.action())))
            throw new SecurityFailure("ACTION_AUTHORIZATION_MISMATCH", 403);
          if (prior.isPresent()) {
            if (!prior.get().request().equals(request)
                || !prior.get().id().equals(intent.applicationId())
                || !Objects.equals(grant, intent.authorizationId()))
              throw new ApplicationFailure(IDEMPOTENCY_KEY_REUSED);
            return prior.get();
          }
          if (intent.status() != ApplicationIntent.Status.PREPARED
              || intent.applicationId() != null
              || !clock.instant().isBefore(intent.expiresAt()))
            throw new SecurityFailure("ACTION_AUTHORIZATION_EXPIRED", 403);
          var binding = new Binding(owner.value(), session, "APPLICATION_INTENT", intentId, hash);
          if (grants == null) throw new SecurityFailure("STEP_UP_AUTH_REQUIRED", 403);
          grants.require(grant, binding, intent.action());
          var product =
              store
                  .product(request.productId())
                  .orElseThrow(() -> new ApplicationFailure(PRODUCT_NOT_APPLICABLE));
          request.validate(product.type());
          var account =
              accounts
                  .find(owner, new AccountId(request.accountId()))
                  .orElseThrow(() -> new ApplicationFailure(ACCOUNT_NOT_FOUND));
          if (account.status() != AccountStatus.ACTIVE
              || !account.balance().currency().getCurrencyCode().equals("CNY"))
            throw new ApplicationFailure(INVALID_REQUEST);
          if (product.type().equals("OVERDRAFT") && account.type() != AccountType.CURRENT)
            throw new ApplicationFailure(INVALID_REQUEST);
          if (store.list(owner).stream()
              .anyMatch(a -> a.request().productId().equals(request.productId())))
            throw new ApplicationFailure(APPLICATION_ALREADY_SUBMITTED);
          var application =
              new ProductApplication(
                  ids.next("application"),
                  owner,
                  product.title(),
                  product.type(),
                  account.maskedAccountNumber(),
                  request,
                  OffsetDateTime.now(clock).truncatedTo(java.time.temporal.ChronoUnit.MICROS));
          store.save(application, key);
          grants.consume(grant, binding, correlation);
          store.completeIntent(intentId, application.id(), grant);
          return application;
        });
  }
}
