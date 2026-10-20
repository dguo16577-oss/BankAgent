FROM nginx:1.30.5-alpine3.24

# Apply distribution security fixes released after the upstream image was built.
RUN apk update && apk upgrade --no-cache
