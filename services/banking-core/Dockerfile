FROM eclipse-temurin:21.0.12.1_1-jdk-noble AS build
RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY contracts/openapi contracts/openapi
COPY services/banking-core services/banking-core
WORKDIR /workspace/services/banking-core
RUN --mount=type=cache,target=/root/.m2 chmod +x mvnw && ./mvnw -B clean package -DskipTests

FROM eclipse-temurin:21.0.12.1_1-jre-noble AS runtime
RUN groupadd --gid 10001 banking && useradd --uid 10001 --gid banking --no-create-home banking
WORKDIR /app
COPY --from=build --chown=banking:banking /workspace/services/banking-core/target/banking-core-0.1.0-SNAPSHOT.jar app.jar
ENV JAVA_TOOL_OPTIONS="-Xms64m -Xmx384m -XX:ActiveProcessorCount=2"
USER banking
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
