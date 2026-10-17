package com.asterbank.banking.customer.transaction.domain;

public record Merchant(String id, String name, String location, String maskedCardNumber) {}
