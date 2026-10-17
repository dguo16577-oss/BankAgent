package com.asterbank.banking.customer.payment.application;

import com.asterbank.banking.customer.payment.domain.*;
import java.util.function.Supplier;

/** Serializes preparation and atomic execution; adapter rolls back failed execution. */
public interface TransferExecutionBoundary {
  TransferIntent prepare(Supplier<TransferIntent> operation);

  TransferIntent cancel(Supplier<TransferIntent> operation);

  Transfer execute(Supplier<Transfer> operation);
}
