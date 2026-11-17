BEGIN;

CREATE SEQUENCE "Ticket_displayId_seq" AS BIGINT
  START WITH 1
  MAXVALUE 2821109907455;

CREATE FUNCTION next_ticket_display_id() RETURNS TEXT
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  value BIGINT := nextval('"Ticket_displayId_seq"');
  alphabet CONSTANT TEXT := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  result TEXT := '';
BEGIN
  WHILE value > 0 LOOP
    result := substr(alphabet, (value % 36)::integer + 1, 1) || result;
    value := value / 36;
  END LOOP;
  RETURN lpad(result, 8, '0');
END;
$$;

ALTER TABLE "Ticket" ADD COLUMN "displayId" TEXT NOT NULL DEFAULT next_ticket_display_id();
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_displayId_format" CHECK ("displayId" ~ '^[A-Z0-9]{8}$');
CREATE UNIQUE INDEX "Ticket_displayId_key" ON "Ticket"("displayId");

COMMIT;
