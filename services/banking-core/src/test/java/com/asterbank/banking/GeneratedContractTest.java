package com.asterbank.banking;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Modifier;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.web.bind.annotation.RequestMapping;
import org.yaml.snakeyaml.Yaml;

class GeneratedContractTest {
  @ParameterizedTest
  @CsvSource({"customer,customer", "public,publicapi"})
  void everyFrozenOperationCompilesAsAbstractInterfaceMethod(String surface, String javaSurface)
      throws Exception {
    Path contracts = Path.of("../../contracts/openapi");
    Map<String, Object> spec = readMap(contracts.resolve(surface + ".yaml"));
    Map<String, Object> freeze = readMap(contracts.resolve("freeze.json"));
    Set<String> expected = new HashSet<>();
    for (var path : map(spec.get("paths")).entrySet()) {
      for (var operation : map(path.getValue()).entrySet()) {
        if (Set.of("get", "post", "put", "patch", "delete", "options", "head")
            .contains(operation.getKey())) {
          expected.add(
              operation.getKey().toUpperCase()
                  + " "
                  + path.getKey()
                  + " "
                  + map(operation.getValue()).get("operationId"));
        }
      }
    }
    assertThat(expected).hasSize(((Number) map(freeze.get(surface)).get("operations")).intValue());
    Path api =
        Path.of(System.getProperty("aster.build.directory", "target"))
            .resolve("classes/com/asterbank/contract")
            .resolve(javaSurface)
            .resolve("api");
    Set<String> actual = new HashSet<>();
    int count = 0;
    try (var files = Files.list(api)) {
      for (Path file : files.filter(p -> p.toString().endsWith(".class")).toList()) {
        Class<?> type =
            Class.forName(
                "com.asterbank.contract."
                    + javaSurface
                    + ".api."
                    + file.getFileName().toString().replace(".class", ""));
        assertThat(type.isInterface()).isTrue();
        for (var method : type.getDeclaredMethods()) {
          RequestMapping mapping = method.getAnnotation(RequestMapping.class);
          if (mapping == null) continue;
          assertThat(Modifier.isAbstract(method.getModifiers())).isTrue();
          assertThat(method.isDefault()).isFalse();
          for (var verb : mapping.method()) {
            for (var route : mapping.value()) {
              actual.add(verb.name() + " " + route + " " + method.getName());
              count++;
            }
          }
        }
      }
    }
    assertThat(actual).containsExactlyInAnyOrderElementsOf(expected);
    assertThat(count).isEqualTo(expected.size());
  }

  private Map<String, Object> readMap(Path file) throws Exception {
    try (var reader = Files.newBufferedReader(file)) {
      return new Yaml().load(reader);
    }
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> map(Object value) {
    return (Map<String, Object>) value;
  }
}
