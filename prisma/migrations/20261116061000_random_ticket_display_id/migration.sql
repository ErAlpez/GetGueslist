BEGIN;

LOCK TABLE "Ticket" IN ACCESS EXCLUSIVE MODE;

CREATE TABLE "TicketDisplayIdReservation" (
  "id" TEXT NOT NULL,
  CONSTRAINT "TicketDisplayIdReservation_pkey" PRIMARY KEY ("id")
);

INSERT INTO "TicketDisplayIdReservation" ("id")
SELECT "displayId" FROM "Ticket";

CREATE OR REPLACE FUNCTION next_ticket_display_id() RETURNS TEXT
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  candidate TEXT;
BEGIN
  FOR attempt IN 1..1000 LOOP
    candidate := lpad(floor(random() * 100000000)::bigint::text, 8, '0');
    INSERT INTO "TicketDisplayIdReservation" ("id") VALUES (candidate)
      ON CONFLICT DO NOTHING;
    IF FOUND THEN
      RETURN candidate;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'Unable to allocate a unique ticket display ID';
END;
$$;

UPDATE "Ticket" SET "displayId" = next_ticket_display_id();

ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_displayId_format";
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_displayId_format" CHECK ("displayId" ~ '^[0-9]{8}$');
DROP SEQUENCE "Ticket_displayId_seq";

COMMIT;
