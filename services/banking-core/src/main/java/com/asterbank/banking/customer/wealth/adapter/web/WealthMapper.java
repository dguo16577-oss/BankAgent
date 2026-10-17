package com.asterbank.banking.customer.wealth.adapter.web;

import static com.asterbank.banking.shared.web.ReadModelMapper.*;

import com.asterbank.banking.customer.wealth.domain.*;
import com.asterbank.contract.customer.model.*;

public final class WealthMapper {
  private WealthMapper() {}

  public static InvestmentProductSummary summary(InvestmentProduct p) {
    return new InvestmentProductSummary(
        p.id(),
        p.displayName(),
        InvestmentProductType.fromValue(p.type().name()),
        com.asterbank.contract.customer.model.RiskLevel.fromValue(p.riskLevel().name()),
        InvestmentProductSummary.CurrencyEnum.fromValue(p.currency()),
        money(p.minimumInvestment()),
        InvestmentProductSummary.StatusEnum.fromValue(p.status().name()),
        InvestmentProductSummary.DataSourceEnum.SIMULATED);
  }

  public static InvestmentProductDetail product(InvestmentProduct p) {
    return new InvestmentProductDetail(
        p.id(),
        p.displayName(),
        InvestmentProductType.fromValue(p.type().name()),
        com.asterbank.contract.customer.model.RiskLevel.fromValue(p.riskLevel().name()),
        InvestmentProductDetail.CurrencyEnum.fromValue(p.currency()),
        money(p.minimumInvestment()),
        InvestmentProductDetail.StatusEnum.fromValue(p.status().name()),
        InvestmentProductDetail.DataSourceEnum.SIMULATED,
        money(p.fees()),
        p.indicativeYield(),
        p.performanceSummary(),
        p.liquidity(),
        p.description(),
        p.disclaimer(),
        p.version());
  }

  public static UserRiskProfile risk(RiskProfile r) {
    return new UserRiskProfile(
        r.customerId().value(),
        r.displayName(),
        com.asterbank.contract.customer.model.RiskLevel.fromValue(r.riskLevel().name()),
        r.version(),
        time(r.assessedAt()),
        time(r.expiresAt()),
        UserRiskProfile.DataSourceEnum.SIMULATED);
  }

  public static SuitabilityCheck check(Suitability s) {
    return new SuitabilityCheck(
        s.id(),
        s.productId(),
        s.customerId().value(),
        com.asterbank.contract.customer.model.RiskLevel.fromValue(s.userRiskLevel().name()),
        com.asterbank.contract.customer.model.RiskLevel.fromValue(s.productRiskLevel().name()),
        s.productVersion(),
        s.riskProfileVersion(),
        SuitabilityResult.fromValue(s.result().name()),
        s.reasons(),
        time(s.createdAt()),
        time(s.expiresAt()));
  }

  public static PortfolioSummary portfolio(Portfolio p) {
    return new PortfolioSummary(
        PortfolioSummary.CurrencyEnum.CNY,
        money(p.totalValue()),
        money(p.investedAmount()),
        money(p.gainLoss()),
        money(p.monthlyChange()),
        p.monthlyChangePercent(),
        money(p.monthlyNetContributions()),
        "Fixed demo month-to-date valuation change; new purchases are capital contributions, not performance gains. New investments add cost value, without live NAV or market pricing.",
        PortfolioSummary.ValuationBasisEnum.SIMULATED_COST_ADDITION,
        PortfolioSummary.DataSourceEnum.SIMULATED,
        time(p.asOf()),
        p.positions().stream()
            .map(
                x ->
                    new PortfolioPosition(
                            x.id(),
                            x.displayName(),
                            InvestmentProductType.fromValue(x.type().name()),
                            money(x.currentValue()),
                            money(x.investedAmount()),
                            money(x.gainLoss()))
                        .productId(x.productId()))
            .toList(),
        p.version());
  }

  public static InvestmentOrderIntent intent(InvestmentIntent i) {
    var t = i.terms();
    return new InvestmentOrderIntent(
            t.id(),
            product(t.product()),
            account(t.sourceAccount()),
            money(t.amount()),
            money(t.fees()),
            money(t.totalDebit()),
            t.suitability().id(),
            check(t.suitability()),
            money(t.projectedAvailableBalance()),
            i.intentHash(),
            time(t.createdAt()),
            time(t.expiresAt()),
            InvestmentOrderIntentStatus.fromValue(i.status().name()),
            InvestmentOrderIntent.AuthorizationRequirementEnum.CONFIRMATION)
        .verificationRequirement(VerificationRequirement.PASSWORD_AND_SMS_OTP);
  }

  public static InvestmentOrderReceipt order(InvestmentOrder o) {
    var t = o.terms();
    return new InvestmentOrderReceipt(
        o.id(),
        t.id(),
        InvestmentOrderStatus.COMPLETED,
        summary(t.product()),
        account(t.sourceAccount()),
        money(t.amount()),
        money(t.fees()),
        money(t.totalDebit()),
        t.suitability().id(),
        o.reference(),
        time(o.completedAt()),
        o.transactionId(),
        o.positionId(),
        InvestmentOrderReceipt.DataSourceEnum.SIMULATED);
  }

  public static InvestmentRedemptionIntent redemptionIntent(RedemptionIntent i) {
    var t = i.terms();
    var h = t.holding();
    var holding =
        new PortfolioPosition(
                h.id(),
                h.displayName(),
                InvestmentProductType.fromValue(h.type().name()),
                money(h.currentValue()),
                money(h.investedAmount()),
                money(h.gainLoss()))
            .productId(h.productId());
    return new InvestmentRedemptionIntent(
            t.id(),
            holding,
            product(t.product()),
            account(t.destinationAccount()),
            money(t.amount()),
            money(t.fees()),
            money(t.estimatedProceeds()),
            i.intentHash(),
            time(t.createdAt()),
            time(t.expiresAt()),
            InvestmentOrderIntentStatus.fromValue(i.status().name()),
            VerificationRequirement.PASSWORD_AND_SMS_OTP)
        .valuationBasis(InvestmentRedemptionIntent.ValuationBasisEnum.SIMULATED_COST_ADDITION);
  }

  public static InvestmentRedemptionReceipt redemptionOrder(RedemptionOrder o) {
    var t = o.terms();
    return new InvestmentRedemptionReceipt(
        o.id(),
        t.id(),
        t.holding().id(),
        account(t.destinationAccount()),
        money(t.amount()),
        money(t.fees()),
        money(t.estimatedProceeds()),
        o.transactionId(),
        o.reference(),
        time(o.completedAt()),
        InvestmentRedemptionReceipt.ValuationBasisEnum.SIMULATED_COST_ADDITION);
  }
}
