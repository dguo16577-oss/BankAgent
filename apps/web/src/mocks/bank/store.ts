import {
  initialProducts,
  initialPortfolio,
  initialRiskProfile,
  wealthOverview,
} from "../data/wealth-fixtures";
import {
  initialCards,
  summarizeCard,
  attributeCard,
} from "../data/card-fixtures";
import type { components } from "@/generated/customer-api";
import {
  demoTransactions,
  getDemoAccounts,
  getDemoOverview,
  demoProfile,
} from "../data/demo-profile";
import { compareTransactions } from "../data/transaction-fixtures";
import { DemoClock, INITIAL_TIME } from "./clock";
type Schema = components["schemas"];
import { minor, decimal } from "./amount";
export { minor, decimal } from "./amount";
import { initialRecurring } from "../data/recurring-fixtures";
import { overviewSpending } from "./spending-analytics";
function initialState() {
  const template = getDemoOverview();
  return {
    version: 8 as const,
    phoneBinding: { maskedPhone: "+86138****5678", phoneVerified: true },
    demoSms: {} as Record<
      string,
      Schema["DemoSmsMessage"] & { sessionId: string }
    >,
    verificationHashes: {} as Record<string, string>,
    sessionCredential: {} as Record<string, string>,
    applicationIntents: {} as Record<
      string,
      Schema["ApplicationIntent"] & { sessionId: string }
    >,
    applications: {} as Record<
      string,
      {
        owner: string;
        key: string;
        request: Schema["SubmitProductApplicationRequest"];
        application: Schema["ProductApplication"];
      }
    >,
    timeDeposits: {} as Record<string, Schema["TimeDeposit"]>,
    timeDepositKeys: {} as Record<string, string>,
    portfolio: initialPortfolio(),
    products: initialProducts(),
    riskProfile: initialRiskProfile() as Schema["UserRiskProfile"] | null,
    suitabilityChecks: {} as Record<string, Schema["SuitabilityCheck"]>,
    investmentOrderIntents: {} as Record<
      string,
      Schema["InvestmentOrderIntent"]
    >,
    investmentOrders: {} as Record<string, Schema["InvestmentOrderReceipt"]>,
    investmentIdempotency: {} as Record<
      string,
      { request: Schema["ExecuteInvestmentOrderRequest"]; orderId: string }
    >,
    investmentSequence: 0,
    revision: 0,
    sequence: 0,
    asOf: INITIAL_TIME,
    clockAt: INITIAL_TIME,
    cards: initialCards(),
    recurringPayments: initialRecurring(),
    recurringPaymentActionIntents: {} as Record<
      string,
      Schema["RecurringPaymentActionIntent"]
    >,
    recurringPaymentActions: {} as Record<
      string,
      Schema["RecurringPaymentActionReceipt"]
    >,
    recurringIdempotency: {} as Record<
      string,
      {
        request: Schema["ExecuteRecurringPaymentActionRequest"];
        actionId: string;
      }
    >,
    recurringSequence: 0,
    cardSequence: 0,
    cardIntents: {} as Record<string, Schema["CardActionIntent"]>,
    cardActions: {} as Record<string, Schema["CardActionReceipt"]>,
    cardIdempotency: {} as Record<
      string,
      { request: Schema["ExecuteCardActionRequest"]; actionId: string }
    >,
    currentSessionId: null as string | null,
    sessions: {} as Record<string, Schema["Session"]>,
    stepUpChallenges: {} as Record<
      string,
      Schema["StepUpChallenge"] & { sessionId: string }
    >,
    actionAuthorizations: {} as Record<
      string,
      Schema["ActionAuthorization"] & { sessionId: string }
    >,
    securityEvents: [] as Schema["SecurityEvent"][],
    accounts: getDemoAccounts().accounts,
    // Only unchanged dashboard sections live here. Account balances and recent
    // transactions always come from the authoritative state below.
    overview: {
      user: template.user,
      baseCurrency: template.baseCurrency,
      balanceNote: template.balanceNote,
      spending: template.spending,
      upcomingPayments: template.upcomingPayments,
      wealth: template.wealth,
    },
    transactions: structuredClone(demoTransactions),
    recipients: [
      {
        id: "recipient_zhang",
        displayName: "Zhang San",
        bankName: "Demo Harbour Bank",
        maskedAccountNumber: "•••• 6018",
        phoneMasked: "138****8000",
        currency: "CNY",
      },
      {
        id: "recipient_li",
        displayName: "Li Si",
        bankName: "Demo Maple Bank",
        maskedAccountNumber: "•••• 2046",
        currency: "CNY",
      },
      {
        id: "recipient_mom",
        displayName: "Mom",
        bankName: "Demo Harbour Bank",
        maskedAccountNumber: "•••• 7732",
        currency: "CNY",
      },
    ] as Schema["RecipientSummary"][],
    invalidRecipientIds: [] as string[],
    recipientIntents: {} as Record<
      string,
      Schema["RecipientActionIntent"] & { sessionId: string | null }
    >,
    recipientResults: {} as Record<string, Schema["RecipientSummary"]>,
    recipientKeys: {} as Record<
      string,
      { intentId: string; hash: string; authorizationId?: string }
    >,
    schedules: {} as Record<string, Schema["ScheduledPayment"]>,
    scheduleIntents: {} as Record<
      string,
      Schema["ScheduleActionIntent"] & {
        sessionId: string;
        expectedVersion: number;
        mandateHash: string;
      }
    >,
    scheduleResults: {} as Record<string, Schema["ScheduledPayment"]>,
    scheduleKeys: {} as Record<
      string,
      { fingerprint: string; intentId: string }
    >,
    scheduleMandates: {} as Record<string, string>,
    transferSessions: {} as Record<string, string | null>,
    intents: {} as Record<string, Schema["TransferIntent"]>,
    transfers: {} as Record<string, Schema["TransferReceipt"]>,
    idempotency: {} as Record<
      string,
      { request: Schema["ExecuteTransferRequest"]; transferId: string }
    >,
  };
}
export type BankingState = ReturnType<typeof initialState>;
export class MockBankingStore {
  private state = initialState();
  private persist?: (state: BankingState) => void;
  constructor(readonly clock = new DemoClock()) {}
  read(): BankingState {
    return structuredClone(this.state);
  }
  // Persist first: storage failure must leave in-memory state untouched.
  commit(next: BankingState) {
    const copy = structuredClone(next);
    this.persist?.(copy);
    this.state = copy;
  }
  reset() {
    this.clock.reset();
    this.commit(initialState());
  }
  enablePersistence(storage: Pick<Storage, "getItem" | "setItem">) {
    const key = "aster-banking-state-v1";
    const raw =
      storage.getItem(key) ?? storage.getItem("aster-m4-banking-state-v1");
    if (raw) {
      let saved = JSON.parse(raw) as BankingState;
      const savedVersion = Number(saved.version);
      const migrateHistory = [4, 5].includes(Number(saved.version));
      if (Number(saved.version) === 4) {
        saved = {
          ...saved,
          version: 8,
          recurringPayments: initialRecurring(),
          recurringPaymentActionIntents: {},
          recurringPaymentActions: {},
          recurringIdempotency: {},
          recurringSequence: 0,
          clockAt: saved.asOf,
          cards: initialCards(),
          cardIntents: {},
          cardActions: {},
          cardSequence: 0,
          cardIdempotency: {},
          transactions: saved.transactions.map(attributeCard),
        };
        Reflect.deleteProperty(saved.overview, "cards");
      }
      if (Number(saved.version) === 5) {
        saved = {
          ...saved,
          version: 8,
          recurringPayments: initialRecurring(),
          recurringPaymentActionIntents: {},
          recurringPaymentActions: {},
          recurringIdempotency: {},
          recurringSequence: 0,
        };
      }
      // Reconcile additional pre-opening history without reposting balances or
      // replacing transfer/card mutations. Existing IDs remain authoritative.
      if (migrateHistory) {
        const known = new Set(saved.transactions.map((t) => t.id));
        saved.transactions.push(
          ...structuredClone(demoTransactions.filter((t) => !known.has(t.id))),
        );
        saved.transactions = saved.transactions.map((t) => {
          const canonical = demoTransactions.find((seed) => seed.id === t.id);
          return canonical && t.id.startsWith("txn_rec_")
            ? {
                ...t,
                type: canonical.type,
                merchant: canonical.merchant,
                cardId: canonical.cardId,
                cardMaskedNumber: canonical.cardMaskedNumber,
              }
            : t;
        });
      }
      if ([4, 5, 6].includes(savedVersion)) {
        saved = {
          ...saved,
          version: 8,
          portfolio: initialPortfolio(),
          products: initialProducts(),
          riskProfile: initialRiskProfile(),
          suitabilityChecks: {},
          investmentOrderIntents: {},
          investmentOrders: {},
          investmentIdempotency: {},
          investmentSequence: 0,
        };
      }
      if ([4, 5, 6, 7].includes(savedVersion)) {
        saved = {
          ...saved,
          version: 8,
          currentSessionId: null,
          sessions: {},
          stepUpChallenges: {},
          actionAuthorizations: {},
          securityEvents: [],
        };
        Reflect.deleteProperty(saved, "session");
      }
      if (
        saved.version !== 8 ||
        !Array.isArray(saved.accounts) ||
        !Array.isArray(saved.transactions)
      )
        throw new Error("Incompatible demo state");
      saved.applications ??= {};
      saved.timeDeposits ??= {};
      saved.timeDepositKeys ??= {};
      saved.recipientIntents ??= {};
      saved.recipientResults ??= {};
      saved.recipientKeys ??= {};
      saved.transferSessions ??= {};
      saved.schedules ??= {};
      saved.scheduleIntents ??= {};
      saved.scheduleResults ??= {};
      saved.scheduleKeys ??= {};
      saved.scheduleMandates ??= {};
      saved.phoneBinding ??= {
        maskedPhone: "+86138****5678",
        phoneVerified: true,
      };
      saved.demoSms ??= {};
      saved.verificationHashes ??= {};
      saved.sessionCredential ??= {};
      saved.applicationIntents ??= {};
      // Old fixed-code authorizations cannot satisfy B4.
      for (const c of Object.values(saved.stepUpChallenges))
        if (!c.actionType && c.status === "PENDING") c.status = "CANCELLED";
      for (const a of Object.values(saved.actionAuthorizations))
        if (!a.actionType && a.status === "ACTIVE") a.status = "REVOKED";
      this.state = saved;
      this.clock.reset(saved.clockAt);
    }
    this.persist = (next) => storage.setItem(key, JSON.stringify(next));
  }
  accounts(): Schema["AccountsResponse"] {
    const { accounts, asOf, overview } = this.read();
    return {
      accounts,
      asOf,
      baseCurrency: overview.baseCurrency,
      totalBalance: {
        currency: "CNY",
        amount: decimal(
          accounts.reduce(
            (sum, account) =>
              sum +
              minor(
                (account.baseCurrencyEquivalent?.value ?? account.balance)
                  .amount,
              ),
            BigInt(0),
          ),
        ),
      },
      exchangeEquivalents: accounts.flatMap((account) =>
        account.baseCurrencyEquivalent ? [account.baseCurrencyEquivalent] : [],
      ),
    };
  }
  account(id: string): Schema["AccountDetail"] | undefined {
    const account = this.accounts().accounts.find((item) => item.id === id);
    if (!account) return undefined;
    return {
      ...account,
      asOf: this.state.asOf,
      openedAt: demoProfile.accountMetadata.find((item) => item.id === id)
        ?.openedAt,
      recentTransactions: this.read()
        .transactions.filter((item) => item.accountId === id)
        .sort(compareTransactions)
        .slice(0, 5),
    };
  }
  overview(): Schema["Overview"] {
    const state = this.read();
    const accounts = this.accounts();
    // M4 only adds ordinary transfers: these never contribute to spending.
    return {
      ...state.overview,
      ...accounts,
      asOf: state.asOf,
      cards: state.cards.map(summarizeCard),
      spending: overviewSpending(state),
      wealth: wealthOverview(state.portfolio),
      upcomingPayments: [
        ...(state.overview.upcomingPayments ?? []).filter(
          (p) => p.type !== "RECURRING",
        ),
        ...state.recurringPayments
          .filter(
            (p) =>
              p.status === "ACTIVE" &&
              p.source === "BANK_MANAGED" &&
              p.nextExpectedAt &&
              Date.parse(p.nextExpectedAt) > Date.parse(state.clockAt),
          )
          .map((p) => ({
            id: p.id,
            title: p.displayName,
            amount: p.usualAmount,
            dueAt: p.nextExpectedAt!,
            type: "RECURRING" as const,
          })),
      ]
        .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
        .slice(0, 4),
      recentTransactions: state.transactions
        .sort(compareTransactions)
        .slice(0, 5),
    };
  }
}
export const bankingStore = new MockBankingStore();
