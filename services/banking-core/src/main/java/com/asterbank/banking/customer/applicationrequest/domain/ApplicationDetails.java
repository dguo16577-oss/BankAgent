package com.asterbank.banking.customer.applicationrequest.domain;

import com.asterbank.banking.shared.domain.Money;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Set;

/** Minimal, non-binding intake details. No identity documents, PAN or underwriting decision. */
public record ApplicationDetails(
    String cardUsage,
    String employmentStatus,
    String savingsGoal,
    Money plannedMonthlyContribution,
    Money coverageAmount,
    String beneficiaryRelationship,
    Integer householdSize,
    LocalDate tripStartDate,
    LocalDate tripEndDate,
    String propertyType) {
  public void validate(String productId, String type) {
    boolean card = type.equals("DEBIT_CARD") || type.equals("CREDIT_CARD");
    require(card, cardUsage, Set.of("EVERYDAY", "TRAVEL", "ONLINE"));
    require(
        Set.of("CREDIT_CARD", "PERSONAL_LOAN", "MORTGAGE", "OVERDRAFT").contains(type),
        employmentStatus,
        Set.of("EMPLOYED", "SELF_EMPLOYED", "STUDENT", "RETIRED", "OTHER"));
    boolean savings = type.equals("SAVINGS_ACCOUNT");
    require(savings, savingsGoal, Set.of("EMERGENCY", "PLANNED_PURCHASE", "GENERAL"));
    amount(savings, plannedMonthlyContribution, "1", "1000000");
    boolean life = productId.equals("life-insurance");
    boolean health = productId.equals("health-insurance");
    boolean travel = productId.equals("travel-insurance");
    boolean home = productId.equals("home-insurance");
    if (type.equals("INSURANCE_PRODUCT") && !(life || health || travel || home)) invalid();
    amount(life || health || home, coverageAmount, "10000", "10000000");
    require(life, beneficiaryRelationship, Set.of("SPOUSE", "CHILD", "PARENT", "OTHER"));
    if (health != (householdSize != null) || (health && (householdSize < 1 || householdSize > 10)))
      invalid();
    if (travel) {
      if (tripStartDate == null
          || tripEndDate == null
          || !tripEndDate.isAfter(tripStartDate)
          || tripEndDate.isAfter(tripStartDate.plusDays(365))) invalid();
    } else if (tripStartDate != null || tripEndDate != null) invalid();
    require(home || type.equals("MORTGAGE"), propertyType, Set.of("APARTMENT", "HOUSE", "OTHER"));
  }

  private static void require(boolean needed, String value, Set<String> allowed) {
    if (needed != (value != null) || (needed && !allowed.contains(value))) invalid();
  }

  private static void amount(boolean needed, Money value, String min, String max) {
    if (needed != (value != null)) invalid();
    if (needed
        && (!value.currency().getCurrencyCode().equals("CNY")
            || value.amount().compareTo(new BigDecimal(min)) < 0
            || value.amount().compareTo(new BigDecimal(max)) > 0)) invalid();
  }

  private static void invalid() {
    throw new ApplicationFailure(ApplicationFailure.Code.INVALID_REQUEST);
  }
}
