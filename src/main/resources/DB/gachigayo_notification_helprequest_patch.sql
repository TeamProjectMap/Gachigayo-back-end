-- Link a guardian notification to the help request that caused it.
--
-- The notification detail screen shows where the user asked for help and
-- where they were heading. That information lives in HELP_REQUEST, so the
-- notification needs a way to point at it.
--
-- NOTIFICATIONS.tripEventId already covers events from navigation; this adds
-- the same for help requests. Both stay nullable.

ALTER TABLE NOTIFICATIONS
    ADD COLUMN IF NOT EXISTS helpRequestId BIGINT NULL COMMENT 'Related help request' AFTER tripEventId,
    ADD CONSTRAINT FK_NOTIFICATIONS_helpRequest
        FOREIGN KEY (helpRequestId) REFERENCES HELP_REQUEST (helpRequestId) ON DELETE SET NULL;
