-- Enable pg_cron and pg_net for scheduled notifications
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule daily reminder at 9 AM UTC
SELECT cron.schedule(
  'daily-play-reminder',
  '0 9 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://hazwgypingwpnaqblgiu.supabase.co/functions/v1/send-play-reminder',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhendneXBpbmd3cG5hcWJsZ2l1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MDExMjQsImV4cCI6MjA4ODI3NzEyNH0.VkjLcMuNGQCmlAKFtS2Spkr86DkFN1njk1twG4ao55k"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);