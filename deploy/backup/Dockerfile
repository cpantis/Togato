# Contextul de build: rădăcina repo-ului. Serviciul de backup (Railway cron): pg_dump → age → S3/R2. Fără cod Togato, doar unelte.
FROM alpine:3.20
RUN apk add --no-cache postgresql16-client age aws-cli curl coreutils
RUN adduser -D -u 10001 backup
COPY --chown=backup:backup deploy/backup/backup.sh deploy/backup/restore.sh /usr/local/bin/
USER backup
WORKDIR /tmp
CMD ["/bin/sh", "/usr/local/bin/backup.sh"]
