import type { components } from "@/generated/public-api";
import { provenance } from "./metadata";
export const articles: components["schemas"]["SupportArticleDetail"][] = (
  [
    {
      id: "recognise-phishing",
      slug: "recognise-phishing",
      title: "How to recognise a phishing attempt",
      summary: "Avoiding scams",
      category: "SECURITY",
      tags: ["avoiding scams", "insight"],
      heading: "How to recognise a phishing attempt",
      sections: [
        {
          heading: "What to know",
          paragraphs: [
            "Be cautious of urgency, unfamiliar links and requests for security codes.",
            "Open your bank through a known bookmark or its official app. Verify unexpected contact using a trusted channel.",
          ],
          callouts: [
            "Never disclose passwords, PINs or one-time security codes.",
          ],
        },
      ],
      relatedArticles: ["lost-card", "pending-card-payments"],
    },
    {
      id: "lost-card",
      slug: "lost-card",
      title: "What to do if your card is lost",
      summary: "Lost card help",
      category: "CARDS",
      tags: ["lost card help", "guide"],
      heading: "What to do if your card is lost",
      sections: [
        {
          heading: "What to know",
          paragraphs: [
            "Act promptly when a card is missing or you notice unfamiliar activity.",
            "Contact your card issuer through a trusted channel and follow its instructions for blocking the card. Review recent activity.",
          ],
          callouts: [
            "This public demo cannot freeze a real card or report a loss.",
          ],
        },
      ],
      relatedArticles: ["pending-card-payments", "bank-transfers"],
    },
    {
      id: "pending-card-payments",
      slug: "pending-card-payments",
      title: "Understanding pending card payments",
      summary: "Pending payments",
      category: "CARDS",
      tags: ["pending payments", "guide"],
      heading: "Understanding pending card payments",
      sections: [
        {
          heading: "What to know",
          paragraphs: [
            "A card authorisation may reserve funds before the merchant completes settlement.",
            "A pending debit can reduce available funds while the booked balance remains unchanged. Release and settlement timing depends on the issuer and merchant.",
          ],
          callouts: [
            "Do not assume a pending payment has failed or repeat it automatically.",
          ],
        },
      ],
      relatedArticles: ["bank-transfers", "failed-transfer"],
    },
    {
      id: "bank-transfers",
      slug: "bank-transfers",
      title: "How bank transfers work",
      summary: "Transfers explained",
      category: "PAYMENTS",
      tags: ["transfers explained", "guide"],
      heading: "How bank transfers work",
      sections: [
        {
          heading: "What to know",
          paragraphs: [
            "Transfers move funds using recipient and account details.",
            "Check the recipient, currency and amount before confirming. Settlement time depends on the payment route and processing schedule.",
          ],
          callouts: ["This article does not execute or guarantee a transfer."],
        },
      ],
      relatedArticles: ["failed-transfer", "balance-available"],
    },
    {
      id: "failed-transfer",
      slug: "failed-transfer",
      title: "Why a transfer may fail",
      summary: "Transfer troubleshooting",
      category: "PAYMENTS",
      tags: ["transfer troubleshooting", "guide"],
      heading: "Why a transfer may fail",
      sections: [
        {
          heading: "What to know",
          paragraphs: [
            "Incorrect recipient details, restrictions or insufficient available funds can prevent a transfer.",
            "Review the reported reason and payment status before attempting another transfer. Use a trusted support channel if the outcome is unclear.",
          ],
          callouts: [
            "Avoid duplicate payments when an earlier result is uncertain.",
          ],
        },
      ],
      relatedArticles: ["balance-available", "recurring-payments"],
    },
    {
      id: "balance-available",
      slug: "balance-available",
      title: "Balance and available balance",
      summary: "Understanding account balances",
      category: "ACCOUNTS",
      tags: ["understanding account balances", "guide"],
      heading: "Balance and available balance",
      sections: [
        {
          heading: "What to know",
          paragraphs: [
            "Balance records booked funds; available balance reflects funds currently usable.",
            "For the demo current account, pending debit holds reduce available balance. Other banking products may use different rules.",
          ],
          callouts: ["Pending amounts are not always booked transactions."],
        },
      ],
      relatedArticles: ["recurring-payments", "step-up-verification"],
    },
    {
      id: "recurring-payments",
      slug: "recurring-payments",
      title: "How recurring payments work",
      summary: "Recurring payments",
      category: "PAYMENTS",
      tags: ["recurring payments", "guide"],
      heading: "How recurring payments work",
      sections: [
        {
          heading: "What to know",
          paragraphs: [
            "A recurring arrangement describes future scheduled collections or payments.",
            "Review the schedule, amount and beneficiary. Stopping an arrangement may not cancel a payment already in progress.",
          ],
          callouts: [
            "Contact the service provider about any separate contract.",
          ],
        },
      ],
      relatedArticles: ["step-up-verification", "investment-risk"],
    },
    {
      id: "step-up-verification",
      slug: "step-up-verification",
      title: "What step-up verification means",
      summary: "Extra verification",
      category: "SECURITY",
      tags: ["extra verification", "guide"],
      heading: "What step-up verification means",
      sections: [
        {
          heading: "What to know",
          paragraphs: [
            "Some sensitive actions require stronger verification than the initial sign-in.",
            "An authorisation should be tied to the particular action and expire after a short period. Verify the action details before approving it.",
          ],
          callouts: [
            "Never share a verification code with someone who contacts you.",
          ],
        },
      ],
      relatedArticles: ["investment-risk", "budgeting-basics"],
    },
    {
      id: "investment-risk",
      slug: "investment-risk",
      title: "Understanding investment risk levels",
      summary: "Investment risk",
      category: "INVESTMENTS",
      tags: ["investment risk", "guide"],
      heading: "Understanding investment risk levels",
      sections: [
        {
          heading: "What to know",
          paragraphs: [
            "Risk depends on market exposure, liquidity, credit quality and your investment horizon.",
            "A risk label summarises selected characteristics. It cannot predict losses or guarantee that a product is suitable for you.",
          ],
          callouts: [
            "Investments can lose value. This is general education, not personal advice.",
          ],
        },
      ],
      relatedArticles: ["budgeting-basics", "bond-risk"],
    },
    {
      id: "budgeting-basics",
      slug: "budgeting-basics",
      title: "Budgeting basics",
      summary: "Building a spending plan",
      category: "ACCOUNTS",
      tags: ["building a spending plan", "insight"],
      heading: "Budgeting basics",
      sections: [
        {
          heading: "What to know",
          paragraphs: [
            "Start with income, essential costs and a manageable savings target.",
            "Review spending categories regularly and leave room for irregular costs. Use estimates as a starting point and adjust them as circumstances change.",
          ],
          callouts: [
            "A budget is a planning aid, not a promise about future finances.",
          ],
        },
      ],
      relatedArticles: ["bond-risk", "exchange-rates"],
    },
    {
      id: "bond-risk",
      slug: "bond-risk",
      title: "Understanding bond risk",
      summary: "Bond investing",
      category: "INVESTMENTS",
      tags: ["bond investing", "insight"],
      heading: "Understanding bond risk",
      sections: [
        {
          heading: "What to know",
          paragraphs: [
            "Bond values respond to interest rates, issuer credit quality and liquidity.",
            "A longer maturity can increase interest-rate sensitivity. A higher quoted yield may reflect greater risk.",
          ],
          callouts: ["Bonds and bond funds can lose capital."],
        },
      ],
      relatedArticles: ["exchange-rates", "online-banking"],
    },
    {
      id: "exchange-rates",
      slug: "exchange-rates",
      title: "How exchange rates work",
      summary: "Foreign exchange rates",
      category: "ACCOUNTS",
      tags: ["foreign exchange rates", "insight"],
      heading: "How exchange rates work",
      sections: [
        {
          heading: "What to know",
          paragraphs: [
            "An exchange rate expresses one currency in units of another.",
            "Compare the quoted rate, markup and any fixed fee. An indicative rate may differ from the final executable quote.",
          ],
          callouts: ["All rates on this website are illustrative demo values."],
        },
      ],
      relatedArticles: ["online-banking", "account-statements"],
    },
    {
      id: "online-banking",
      slug: "online-banking",
      title: "Using online banking safely",
      summary: "Digital banking access",
      category: "DIGITAL_BANKING",
      tags: ["digital banking access", "guide"],
      heading: "Using online banking safely",
      sections: [
        {
          heading: "What to know",
          paragraphs: [
            "Use trusted devices and keep browser and operating system updates current.",
            "Sign out on shared devices and verify the site address before entering credentials. Avoid entering real credentials into a demo.",
          ],
          callouts: [
            "A public product guide never needs your banking password.",
          ],
        },
      ],
      relatedArticles: ["account-statements", "contact-support"],
    },
    {
      id: "account-statements",
      slug: "account-statements",
      title: "Reading an account statement",
      summary: "Statements guide",
      category: "ACCOUNTS",
      tags: ["statements guide", "guide"],
      heading: "Reading an account statement",
      sections: [
        {
          heading: "What to know",
          paragraphs: [
            "A statement summarises booked activity during a stated period.",
            "Check opening and closing balances, transaction dates and fees. Report unfamiliar entries through a trusted support channel.",
          ],
          callouts: [
            "Pending authorisations may not appear as booked statement entries.",
          ],
        },
      ],
      relatedArticles: ["contact-support", "recognise-phishing"],
    },
    {
      id: "contact-support",
      slug: "contact-support",
      title: "Finding a trusted support channel",
      summary: "Contact and accessibility",
      category: "DIGITAL_BANKING",
      tags: ["contact and accessibility", "guide"],
      heading: "Finding a trusted support channel",
      sections: [
        {
          heading: "What to know",
          paragraphs: [
            "Use contact details from your verified bank app or official documentation.",
            "Avoid numbers provided in suspicious messages. Ask your provider about accessible formats and communication options.",
          ],
          callouts: [
            "Aster is a demo and has no real customer contact centre.",
          ],
        },
      ],
      relatedArticles: ["recognise-phishing", "lost-card"],
    },
  ] satisfies Omit<
    components["schemas"]["SupportArticleDetail"],
    "environment" | "lastUpdatedAt"
  >[]
).map((item) => ({ ...item, ...provenance }));
