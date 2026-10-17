package com.asterbank.banking;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;

class ArchitectureTest {
  @Test
  void scheduledDomainUsesOnlyApplicationPorts() {
    var classes =
        new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.asterbank.banking");
    noClasses()
        .that()
        .resideInAnyPackage("..payment.domain..", "..payment.application..")
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage(
            "..adapter..",
            "jakarta.persistence..",
            "org.springframework..",
            "com.asterbank.contract..")
        .check(classes);
  }

  @Test
  void overviewIsAnApplicationReadModelWithOneWayDependencies() {
    var classes =
        new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.asterbank.banking");
    noClasses()
        .that()
        .resideInAPackage("..overview.application..")
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage(
            "..adapter..",
            "jakarta.persistence..",
            "org.springframework..",
            "com.asterbank.contract..")
        .check(classes);
    noClasses()
        .that()
        .resideInAnyPackage(
            "..customer.account..",
            "..customer.transaction..",
            "..customer.payment..",
            "..customer.card..",
            "..customer.recurring..",
            "..customer.spending..",
            "..customer.wealth..")
        .should()
        .dependOnClassesThat()
        .resideInAPackage("..overview..")
        .check(classes);
    noClasses()
        .that()
        .resideInAPackage("..overview..")
        .should()
        .beAnnotatedWith(jakarta.persistence.Entity.class)
        .check(classes);
  }

  @Test
  void wealthUsesExistingAccountAndTransactionPortsInsteadOfAdapters() {
    var classes =
        new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.asterbank.banking");
    noClasses()
        .that()
        .resideInAnyPackage("..wealth.domain..", "..wealth.application..")
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage(
            "..account.adapter..",
            "..transaction.adapter..",
            "org.springframework..",
            "jakarta.persistence..",
            "com.asterbank.contract..")
        .check(classes);
  }

  @Test
  void spendingCannotFetchTransactionEntitiesForJavaAggregation() {
    var classes =
        new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.asterbank.banking");
    noClasses()
        .that()
        .resideInAnyPackage("..spending..")
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage("..transaction.adapter..")
        .check(classes);
    noClasses()
        .that()
        .resideInAnyPackage("..spending..")
        .should()
        .dependOnClassesThat()
        .haveFullyQualifiedName(
            "com.asterbank.banking.customer.transaction.application.TransactionRepository")
        .check(classes);
    noClasses()
        .that()
        .resideInAnyPackage("..recurring.application..")
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage("..transaction.adapter..")
        .check(classes);
  }

  @Test
  void domainAndApplicationAreIndependentOfWebSecurityAndAdapters() {
    var classes =
        new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.asterbank.banking");
    noClasses()
        .that()
        .resideInAnyPackage("..domain..", "..application..")
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage(
            "..adapter..",
            "org.springframework.web..",
            "jakarta.servlet..",
            "org.springframework.session..",
            "org.springframework.security..",
            "jakarta.persistence..",
            "org.springframework.data.jpa..",
            "org.hibernate..",
            "com.asterbank.contract..")
        .check(classes);
    noClasses()
        .that()
        .resideInAnyPackage("..domain..")
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage("..application..", "org.springframework..")
        .check(classes);
    noClasses()
        .that()
        .resideInAnyPackage("..transaction.application..")
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage("..account.application..")
        .check(classes);
  }

  @Test
  void domainAndApplicationCannotDependOnGeneratedHttpContracts() {
    var classes =
        new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.asterbank.banking");
    noClasses()
        .that()
        .resideInAnyPackage("..domain..", "..application..")
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage("com.asterbank.contract..")
        .allowEmptyShould(true)
        .check(classes);
  }

  @Test
  void applicationCodeMustUseInjectedClock() {
    var classes =
        new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.asterbank.banking");
    noClasses().should().callMethod(Instant.class, "now").check(classes);
    noClasses().should().callMethod(OffsetDateTime.class, "now").check(classes);
    noClasses().should().callMethod(LocalDateTime.class, "now").check(classes);
  }

  @Test
  void publicContentHasNoCustomerOrIdentityDependencies() {
    var classes =
        new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.asterbank.banking");
    noClasses()
        .that()
        .resideInAnyPackage("..publiccontent..")
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage(
            "..customer..", "com.asterbank.banking.security..", "com.asterbank.contract.customer..")
        .check(classes);
    noClasses()
        .that()
        .resideInAnyPackage(
            "..publiccontent.domain..",
            "..publiccontent.application..",
            "..publiccontent.adapter.persistence..")
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage("com.asterbank.contract..")
        .check(classes);
    noClasses()
        .that()
        .resideInAnyPackage("..publiccontent.domain..", "..publiccontent.application..")
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage("org.springframework..", "jakarta.persistence..", "..adapter..")
        .check(classes);
    noClasses()
        .that()
        .resideInAnyPackage("..customer..")
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage("..publiccontent..")
        .check(classes);
  }
}
