package com.asterbank.banking.customer.applicationrequest.domain;

import static com.asterbank.banking.customer.applicationrequest.domain.ApplicationFailure.Code.*;

import com.asterbank.banking.shared.domain.Money;
import java.math.BigDecimal;
import java.util.Set;

public record ApplicationRequest(
    String productId,
    String accountId,
    String contactEmail,
    boolean consent,
    Money monthlyIncome,
    Money requestedAmount,
    Integer termMonths,
    String purpose,
    ApplicationDetails applicationDetails) {
  public void validate(String type) {
    if (!consent
        || productId == null
        || productId.isBlank()
        || accountId == null
        || accountId.isBlank()
        || contactEmail == null
        || contactEmail.length() > 254
        || !contactEmail.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")) invalid();
    if (!Set.of(
            "DEBIT_CARD",
            "CREDIT_CARD",
            "PERSONAL_LOAN",
            "MORTGAGE",
            "OVERDRAFT",
            "SAVINGS_ACCOUNT",
            "INSURANCE_PRODUCT")
        .contains(type)) throw new ApplicationFailure(PRODUCT_NOT_APPLICABLE);
    if (!Set.of("CREDIT_CARD", "PERSONAL_LOAN", "MORTGAGE", "OVERDRAFT").contains(type)) {
      if (monthlyIncome != null) invalid();
    } else money(monthlyIncome, "1", "10000000");
    if (type.equals("PERSONAL_LOAN")) {
      money(requestedAmount, "1000", "200000");
      if (termMonths == null
          || !Set.of(6, 12, 24, 36).contains(termMonths)
          || purpose == null
          || !Set.of("EDUCATION", "HOME_IMPROVEMENT", "PERSONAL").contains(purpose)) invalid();
    } else if (type.equals("MORTGAGE")) {
      money(requestedAmount, "100000", "5000000");
      if (termMonths == null
          || !Set.of(120, 240, 360).contains(termMonths)
          || !"HOME_PURCHASE".equals(purpose)) invalid();
    } else if (type.equals("OVERDRAFT")) {
      money(requestedAmount, "1000", "100000");
      if (termMonths != null || purpose != null) invalid();
    } else if (requestedAmount != null || termMonths != null || purpose != null) invalid();
    if (applicationDetails == null) invalid();
    applicationDetails.validate(productId, type);
  }

  private static void money(Money m, String min, String max) {
    if (m == null
        || !m.currency().getCurrencyCode().equals("CNY")
        || m.amount().compareTo(new BigDecimal(min)) < 0
        || m.amount().compareTo(new BigDecimal(max)) > 0) invalid();
  }

  private static void invalid() {
    throw new ApplicationFailure(INVALID_REQUEST);
  }
}
