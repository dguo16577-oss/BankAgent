package com.asterbank.banking.customer.card.adapter.web;

import com.asterbank.contract.customer.model.*;
import org.springframework.context.annotation.*;
import tools.jackson.core.JsonParser;
import tools.jackson.databind.*;
import tools.jackson.databind.module.SimpleModule;

/** Bind the frozen oneOf interface to its generated variants without editing generated sources. */
@Configuration(proxyBeanMethods = false)
@Profile("!unit")
public class CardWireConfiguration {
  @Bean
  JacksonModule cardPrepareModule() {
    var module = new SimpleModule("card-prepare-one-of");
    module.addDeserializer(
        CreateCardActionIntentRequest.class,
        new ValueDeserializer<CreateCardActionIntentRequest>() {
          public CreateCardActionIntentRequest deserialize(
              JsonParser p, DeserializationContext context) {
            var n = context.readTree(p);
            String action = n.path("actionType").asText();
            String id = n.path("cardId").asText();
            if (action.equals("UPDATE_CONTROLS")) {
              var c = n.path("controls");
              return new CreateCardActionIntentRequestOneOf1(
                  id,
                  CreateCardActionIntentRequestOneOf1.ActionTypeEnum.UPDATE_CONTROLS,
                  new CardControls(
                      c.path("onlinePayments").asBoolean(),
                      c.path("internationalPayments").asBoolean(),
                      c.path("atmWithdrawals").asBoolean(),
                      c.path("contactless").asBoolean()));
            }
            if (action.equals("UPDATE_LIMITS")) {
              var l = n.path("limits");
              return new CreateCardActionIntentRequestOneOf2(
                  id,
                  CreateCardActionIntentRequestOneOf2.ActionTypeEnum.UPDATE_LIMITS,
                  new CardCustomerLimits(
                      l.path("perTransaction").asText(), l.path("daily").asText()));
            }
            return new CreateCardActionIntentRequestOneOf(
                id, CreateCardActionIntentRequestOneOf.ActionTypeEnum.fromValue(action));
          }
        });
    return module;
  }
}
